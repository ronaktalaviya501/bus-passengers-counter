import cv2
import os
import uuid
import torch
import logging
import io
from fastapi import FastAPI, UploadFile, File
from fastapi.responses import StreamingResponse, FileResponse
from ultralytics import YOLO
import cvzone
from fastapi.middleware.cors import CORSMiddleware

# Silence standard Ultralytics / YOLO logging output
logging.getLogger("ultralytics").setLevel(logging.WARNING)

# Resolve PyTorch 2.6+ weights_only restriction globally for YOLO loading
try:
    import torch
    original_load = torch.load
    def patched_load(*args, **kwargs):
        if "weights_only" not in kwargs:
            kwargs["weights_only"] = False
        return original_load(*args, **kwargs)
    torch.load = patched_load
except Exception:
    pass

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


UPLOAD_DIR = "uploads"
OUTPUT_DIR = "outputs"
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)

model = YOLO("yolov8s.pt")

# =========================
# ENTRY MODEL CONFIG
# =========================
RESIZE = (640, 360)
FRAME_SKIP = 1
LINE_P1 = (0, 310)
LINE_P2 = (640, 130)

def point_side_of_line(p, a, b):
    return (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])



# ======================================================
# 2️⃣ ENTRY COUNT (SEPARATE VIDEO)
# ======================================================
@app.post("/upload-entry-video")
async def upload_entry_video(file: UploadFile = File(...)):
    vid = str(uuid.uuid4())
    in_path = os.path.join(UPLOAD_DIR, f"{vid}_entry.mp4")
    out_path = os.path.join(OUTPUT_DIR, f"{vid}_entry_out.mp4")

    with open(in_path, "wb") as f:
        f.write(await file.read())

    return {"video_id": vid}

def entry_stream(video_id: str, line_p1: tuple = (0, 310), line_p2: tuple = (640, 130)):
    if video_id == "default":
        in_path = "cam1.mp4"
        out_path = os.path.join(OUTPUT_DIR, "default_entry_out.mp4")
    else:
        in_path = os.path.join(UPLOAD_DIR, f"{video_id}_entry.mp4")
        out_path = os.path.join(OUTPUT_DIR, f"{video_id}_entry_out.mp4")

    cap = cv2.VideoCapture(in_path)
    out = cv2.VideoWriter(out_path,
                          cv2.VideoWriter_fourcc(*"mp4v"),
                          25, RESIZE)

    prev_side = {}
    last_positions = {}
    counted_ids_in = set()
    counted_ids_out = set()
    in_count = 0
    out_count = 0
    frame_count = 0

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break

        frame_count += 1
        if frame_count != 1 and frame_count % FRAME_SKIP != 0:
            continue

        frame = cv2.resize(frame, RESIZE)

        # Using botsort tracker for more stable track association
        results = model.track(frame, persist=True,
                              tracker="botsort.yaml",
                              classes=[0], conf=0.1, verbose=False)

        cv2.line(frame, line_p1, line_p2, (0,255,255), 2)

        current_frame_positions = {}
        if results[0].boxes.id is not None:
            for box, tid in zip(
                results[0].boxes.xyxy.cpu().numpy().astype(int),
                results[0].boxes.id.cpu().numpy().astype(int)
            ):
                x1,y1,x2,y2 = box
                # Define a small square centered on the head (width approx 35% of person width)
                head_size = int((x2 - x1) * 0.35)
                cx = (x1 + x2) // 2
                cy = y1 + head_size // 2
                current_frame_positions[tid] = (cx, cy)
                
                # Draw the small square around the head and the center dot attached to it
                cv2.rectangle(frame, (cx - head_size//2, cy - head_size//2), (cx + head_size//2, cy + head_size//2), (0, 0, 255), 2)
                cv2.circle(frame, (cx, cy), 5, (0, 255, 0), -1)
                
                side = point_side_of_line((cx,cy), line_p1, line_p2)

                # Fallback matching: If this track ID is new, check if it's close to a recently lost track
                if tid not in prev_side:
                    matched_old_tid = None
                    min_dist = 60.0  # Max distance in pixels to associate the track
                    for old_tid, old_pos in last_positions.items():
                        if old_tid not in current_frame_positions:
                            dist = ((cx - old_pos[0])**2 + (cy - old_pos[1])**2)**0.5
                            if dist < min_dist:
                                min_dist = dist
                                matched_old_tid = old_tid
                    
                    if matched_old_tid is not None:
                        # Inherit tracking history
                        prev_side[tid] = prev_side[matched_old_tid]
                        if matched_old_tid in counted_ids_in:
                            counted_ids_in.add(tid)
                        if matched_old_tid in counted_ids_out:
                            counted_ids_out.add(tid)
                    else:
                        prev_side[tid] = side
                        continue

                # Detect line crossing: entering (positive side to negative) or exiting (negative side to positive)
                if prev_side[tid] > 0 and side < 0:
                    if tid not in counted_ids_in and tid not in counted_ids_out:
                        counted_ids_in.add(tid)
                        in_count += 1
                        print(f"[DETECTION] Person ID {tid} crossed the line -> IN (Entered)")
                elif prev_side[tid] < 0 and side > 0:
                    if tid not in counted_ids_in and tid not in counted_ids_out:
                        counted_ids_out.add(tid)
                        out_count += 1
                        print(f"[DETECTION] Person ID {tid} crossed the line -> OUT (Exited)")

                prev_side[tid] = side

        # Fallback for tracks that disappeared right at the boundary line
        for lost_tid, lost_pos in last_positions.items():
            if lost_tid not in current_frame_positions and lost_tid in prev_side:
                last_side = prev_side[lost_tid]
                
                # Check if the track was very close to the line when lost
                x_ratio = (lost_pos[0] - line_p1[0]) / (line_p2[0] - line_p1[0])
                expected_line_y = line_p1[1] + x_ratio * (line_p2[1] - line_p1[1])
                dist_to_line = abs(lost_pos[1] - expected_line_y)
                
                if dist_to_line < 45:
                    if last_side > 0 and lost_tid not in counted_ids_in and lost_tid not in counted_ids_out:
                        counted_ids_in.add(lost_tid)
                        in_count += 1
                        print(f"[DETECTION] Person ID {lost_tid} crossed boundary -> IN (Disappeared Fallback)")
                    elif last_side < 0 and lost_tid not in counted_ids_in and lost_tid not in counted_ids_out:
                        counted_ids_out.add(lost_tid)
                        out_count += 1
                        print(f"[DETECTION] Person ID {lost_tid} crossed boundary -> OUT (Disappeared Fallback)")

        last_positions = current_frame_positions
        cvzone.putTextRect(frame, f"In: {in_count} | Out: {out_count}", (15,30), scale=1.5, thickness=2)
        out.write(frame)

        _, buf = cv2.imencode(".jpg", frame)
        yield b"--frame\r\nContent-Type:image/jpeg\r\n\r\n"+buf.tobytes()+b"\r\n"

    cap.release()
    out.release()

@app.get("/entry-stream/{video_id}")
def entry_video_stream(video_id: str, x1: int = 0, y1: int = 310, x2: int = 640, y2: int = 130):
    return StreamingResponse(entry_stream(video_id, (x1, y1), (x2, y2)),
        media_type="multipart/x-mixed-replace; boundary=frame")

@app.get("/download-entry/{video_id}")
def download_entry(video_id: str):
    path = os.path.join(OUTPUT_DIR, "default_entry_out.mp4") if video_id == "default" else os.path.join(OUTPUT_DIR, f"{video_id}_entry_out.mp4")
    return FileResponse(
        path,
        media_type="video/mp4",
        filename="entry_result.mp4"
    )

from fastapi.staticfiles import StaticFiles

app.mount("/", StaticFiles(directory="frontend", html=True), name="frontend")