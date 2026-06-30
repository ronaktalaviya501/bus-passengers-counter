document.addEventListener("DOMContentLoaded", () => {
    setupCounter(
        "entry-upload-zone",
        "entry-file-input",
        "entry-file-name",
        "entry-progress-container",
        "entry-progress",
        "entry-video-container",
        "entry-stream-img",
        "entry-actions",
        "entry-process-btn",
        "entry-download-btn",
        "/upload-entry-video",
        "/entry-stream",
        "/download-entry",
        "/preview"
    );
});

function setupCounter(
    zoneId, inputId, nameId, progContainerId, progBarId, 
    videoContainerId, streamImgId, actionsId, processBtnId, downloadBtnId,
    uploadUrl, streamUrl, downloadUrl, previewUrl
) {
    const zone = document.getElementById(zoneId);
    const input = document.getElementById(inputId);
    const nameEl = document.getElementById(nameId);
    const progContainer = document.getElementById(progContainerId);
    const progBar = document.getElementById(progBarId);
    const videoContainer = document.getElementById(videoContainerId);
    const streamImg = document.getElementById(streamImgId);
    const actions = document.getElementById(actionsId);
    const processBtn = document.getElementById(processBtnId);
    const downloadBtn = document.getElementById(downloadBtnId);

    const canvas = document.getElementById("line-canvas");
    const ctx = canvas.getContext("2d");
    const resetLineBtn = document.getElementById("reset-line-btn");

    let selectedFile = null;
    let videoId = "default"; // Start with default video on page load
    let isDrawing = false;
    let hasDrawnLine = false;

    // Default coordinates in 640x360 space
    let customLine = { x1: 0, y1: 310, x2: 640, y2: 130 };

    // Initialize with default video preview on load
    loadPreview("default");

    function loadPreview(vidId) {
        videoId = vidId;
        hasDrawnLine = false;
        
        // Show stream container and set preview frame
        videoContainer.style.display = "flex";
        streamImg.src = `${previewUrl}/${vidId}?t=${new Date().getTime()}`;
        
        // Prompt user to draw line
        processBtn.disabled = true;
        processBtn.textContent = "Draw Line First to Start";
        processBtn.style.background = "linear-gradient(135deg, #4b5563, #374151)"; // Greyed out
        
        // Clear canvas and draw handles
        setTimeout(resizeCanvas, 150);
    }

    // Resize canvas to match display size of stream image
    function resizeCanvas() {
        const rect = streamImg.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;
        drawCustomLine();
    }

    window.addEventListener("resize", resizeCanvas);
    streamImg.addEventListener("load", resizeCanvas);

    function drawCustomLine() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Convert customLine (640x360 scale) to current canvas display size
        const scaleX = canvas.width / 640;
        const scaleY = canvas.height / 360;

        ctx.strokeStyle = hasDrawnLine ? "rgba(0, 255, 255, 0.9)" : "rgba(239, 68, 68, 0.4)"; // Cyan if drawn, faint Red if default
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(customLine.x1 * scaleX, customLine.y1 * scaleY);
        ctx.lineTo(customLine.x2 * scaleX, customLine.y2 * scaleY);
        ctx.stroke();

        // Draw handles at endpoints
        ctx.fillStyle = hasDrawnLine ? "cyan" : "red";
        ctx.beginPath();
        ctx.arc(customLine.x1 * scaleX, customLine.y1 * scaleY, 6, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.beginPath();
        ctx.arc(customLine.x2 * scaleX, customLine.y2 * scaleY, 6, 0, Math.PI * 2);
        ctx.fill();

        // Draw prompt overlay text if line is not drawn yet
        if (!hasDrawnLine) {
            ctx.fillStyle = "rgba(239, 68, 68, 0.95)";
            ctx.font = "bold 14px Outfit, sans-serif";
            ctx.textAlign = "center";
            ctx.fillText("⚠️ CLICK & DRAG TO DRAW CROSSING THRESHOLD LINE FIRST", canvas.width / 2, canvas.height / 2);
        }
    }

    // Handle mouse events on canvas
    canvas.addEventListener("mousedown", (e) => {
        const rect = canvas.getBoundingClientRect();
        const scaleX = 640 / rect.width;
        const scaleY = 360 / rect.height;
        
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;
        
        isDrawing = true;
        hasDrawnLine = true;
        customLine = { x1: x, y1: y, x2: x, y2: y };
        drawCustomLine();
    });

    canvas.addEventListener("mousemove", (e) => {
        if (!isDrawing) return;
        const rect = canvas.getBoundingClientRect();
        const scaleX = 640 / rect.width;
        const scaleY = 360 / rect.height;
        
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;
        
        customLine.x2 = x;
        customLine.y2 = y;
        drawCustomLine();
    });

    canvas.addEventListener("mouseup", () => {
        if (!isDrawing) return;
        isDrawing = false;
        
        // Enable Start Processing button since they've drawn a line
        processBtn.disabled = false;
        processBtn.textContent = "Start Processing";
        processBtn.style.background = "linear-gradient(135deg, var(--accent-blue), #2563eb)";
    });

    resetLineBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        customLine = { x1: 0, y1: 310, x2: 640, y2: 130 };
        hasDrawnLine = false;
        drawCustomLine();
        
        // Re-prompt to draw
        processBtn.disabled = true;
        processBtn.textContent = "Draw Line First to Start";
        processBtn.style.background = "linear-gradient(135deg, #4b5563, #374151)";
        
        if (videoId) {
            // Revert image to preview
            streamImg.src = `${previewUrl}/${videoId}?t=${new Date().getTime()}`;
            downloadBtn.style.display = "none";
        }
    });

    function startStream() {
        const queryParams = `x1=${Math.round(customLine.x1)}&y1=${Math.round(customLine.y1)}&x2=${Math.round(customLine.x2)}&y2=${Math.round(customLine.y2)}`;
        streamImg.src = `${streamUrl}/${videoId}?${queryParams}&t=${new Date().getTime()}`;
        
        processBtn.textContent = "Processing Live Stream...";
        processBtn.disabled = true;
        downloadBtn.href = `${downloadUrl}/${videoId}`;
        downloadBtn.style.display = "inline-block";
    }

    // Handle clicks to trigger input
    zone.addEventListener("click", () => input.click());

    // Handle drag and drop
    zone.addEventListener("dragover", (e) => {
        e.preventDefault();
        zone.style.borderColor = "var(--accent-blue)";
    });

    zone.addEventListener("dragleave", () => {
        zone.style.borderColor = "rgba(255, 255, 255, 0.15)";
    });

    zone.addEventListener("drop", (e) => {
        e.preventDefault();
        zone.style.borderColor = "rgba(255, 255, 255, 0.15)";
        if (e.dataTransfer.files.length > 0) {
            handleFileSelect(e.dataTransfer.files[0]);
        }
    });

    input.addEventListener("change", (e) => {
        if (e.target.files.length > 0) {
            handleFileSelect(e.target.files[0]);
        }
    });

    function handleFileSelect(file) {
        selectedFile = file;
        nameEl.textContent = `Selected: ${file.name} (${(file.size / (1024 * 1024)).toFixed(2)} MB)`;
        downloadBtn.style.display = "none";
        
        // Trigger upload immediately to get the video ID and load preview
        uploadFile();
    }

    function uploadFile() {
        progContainer.style.display = "block";
        progBar.style.width = "0%";
        processBtn.disabled = true;
        processBtn.textContent = "Uploading video...";

        const formData = new FormData();
        formData.append("file", selectedFile);

        const xhr = new XMLHttpRequest();
        xhr.open("POST", uploadUrl, true);

        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
                const percent = (e.loaded / e.total) * 100;
                progBar.style.width = percent + "%";
            }
        };

        xhr.onload = () => {
            if (xhr.status === 200) {
                const response = JSON.parse(xhr.responseText);
                progContainer.style.display = "none";
                
                // Load preview of the uploaded video
                loadPreview(response.video_id);
            } else {
                alert("Upload failed. Please try again.");
                resetUI();
            }
        };

        xhr.onerror = () => {
            alert("An error occurred during upload.");
            resetUI();
        };

        xhr.send(formData);
    }

    processBtn.addEventListener("click", () => {
        if (hasDrawnLine) {
            startStream();
        }
    });

    function resetUI() {
        processBtn.disabled = false;
        processBtn.textContent = "Start Processing";
        progContainer.style.display = "none";
    }
}
