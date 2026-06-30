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
        "/download-entry"
    );
});

function setupCounter(
    zoneId, inputId, nameId, progContainerId, progBarId, 
    videoContainerId, streamImgId, actionsId, processBtnId, downloadBtnId,
    uploadUrl, streamUrl, downloadUrl
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
    let videoId = null;
    let isDrawing = false;

    // Default coordinates in 640x360 space
    let customLine = { x1: 0, y1: 310, x2: 640, y2: 130 };

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

        ctx.strokeStyle = "rgba(0, 255, 255, 0.75)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(customLine.x1 * scaleX, customLine.y1 * scaleY);
        ctx.lineTo(customLine.x2 * scaleX, customLine.y2 * scaleY);
        ctx.stroke();

        // Draw handles at endpoints
        ctx.fillStyle = "cyan";
        ctx.beginPath();
        ctx.arc(customLine.x1 * scaleX, customLine.y1 * scaleY, 6, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.beginPath();
        ctx.arc(customLine.x2 * scaleX, customLine.y2 * scaleY, 6, 0, Math.PI * 2);
        ctx.fill();
    }

    // Handle mouse events on canvas
    canvas.addEventListener("mousedown", (e) => {
        const rect = canvas.getBoundingClientRect();
        const scaleX = 640 / rect.width;
        const scaleY = 360 / rect.height;
        
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;
        
        isDrawing = true;
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
        
        // Restart the stream dynamically if already playing
        if (videoId) {
            updateStreamSrc();
        }
    });

    resetLineBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        customLine = { x1: 0, y1: 310, x2: 640, y2: 130 };
        drawCustomLine();
        if (videoId) {
            updateStreamSrc();
        }
    });

    function updateStreamSrc() {
        const queryParams = `x1=${Math.round(customLine.x1)}&y1=${Math.round(customLine.y1)}&x2=${Math.round(customLine.x2)}&y2=${Math.round(customLine.y2)}`;
        streamImg.src = `${streamUrl}/${videoId}?${queryParams}&t=${new Date().getTime()}`;
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
        actions.style.display = "flex";
        downloadBtn.style.display = "none";
        videoContainer.style.display = "none";
        streamImg.src = "";
    }

    processBtn.addEventListener("click", () => {
        if (!selectedFile) {
            videoId = "default";
            processBtn.textContent = "Processing Stream...";
            
            // Show stream
            videoContainer.style.display = "flex";
            setTimeout(resizeCanvas, 100); // Allow display layout to stabilize
            updateStreamSrc();

            // Set download link
            downloadBtn.href = `${downloadUrl}/${videoId}`;
            downloadBtn.style.display = "inline-block";
            return;
        }

        // Reset progress
        progContainer.style.display = "block";
        progBar.style.width = "0%";
        processBtn.disabled = true;
        processBtn.textContent = "Uploading...";

        const formData = new FormData();
        formData.append("file", selectedFile);

        const xhr = new XMLHttpRequest();
        xhr.open("POST", uploadUrl, true);

        // Track upload progress
        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
                const percent = (e.loaded / e.total) * 100;
                progBar.style.width = percent + "%";
            }
        };

        xhr.onload = () => {
            if (xhr.status === 200) {
                const response = JSON.parse(xhr.responseText);
                videoId = response.video_id;

                processBtn.textContent = "Processing Stream...";
                
                // Show stream
                videoContainer.style.display = "flex";
                setTimeout(resizeCanvas, 100);
                updateStreamSrc();

                // Set download link
                downloadBtn.href = `${downloadUrl}/${videoId}`;
                downloadBtn.style.display = "inline-block";
                
                progContainer.style.display = "none";
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
    });

    function resetUI() {
        processBtn.disabled = false;
        processBtn.textContent = "Start Processing";
        progContainer.style.display = "none";
    }
}
