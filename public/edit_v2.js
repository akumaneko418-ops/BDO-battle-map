document.addEventListener("DOMContentLoaded", () => {

/* ============================================================
   初期設定
============================================================ */
const socket = io();

let zoom = 1.0;
let zoomStep = 0.1;

const canvas = document.getElementById("mapCanvas");
const ctx = canvas.getContext("2d");

let backgroundImage = null;

/* ============================================================
   パン（ドラッグ移動）用
============================================================ */
let offsetX = 0;
let offsetY = 0;
let isPanning = false;
let panStartX = 0;
let panStartY = 0;

/* ============================================================
   データ構造
============================================================ */
let markers = [];
let arrows = [];
let texts = [];
let penPaths = [];
let markerComments = {};

/* ============================================================
   Undo / Redo
============================================================ */
let history = [];
let redoHistory = [];

function getCurrentState() {
    return {
        markers: JSON.parse(JSON.stringify(markers)),
        arrows: JSON.parse(JSON.stringify(arrows)),
        texts: JSON.parse(JSON.stringify(texts)),
        penPaths: JSON.parse(JSON.stringify(penPaths)),
        backgroundImageSrc: backgroundImage ? backgroundImage.src : null,
        zoom,
        offsetX,
        offsetY
    };
}

function restoreState(state) {
    markers = state.markers || [];
    arrows = state.arrows || [];
    texts = state.texts || [];
    penPaths = state.penPaths || [];
    zoom = state.zoom || 1;
    offsetX = state.offsetX || 0;
    offsetY = state.offsetY || 0;

    if (state.backgroundImageSrc) {
        const img = new Image();
        img.onload = () => {
            backgroundImage = img;
            drawCanvas();
        };
        img.src = state.backgroundImageSrc;
    } else {
        backgroundImage = null;
        drawCanvas();
    }
}

function saveHistory() {
    history.push(JSON.stringify(getCurrentState()));
    if (history.length > 100) history.shift();
    redoHistory = [];
    updateUndoRedoButtons();
}

function broadcastState() {
    socket.emit("edit_state", getCurrentState());
}

socket.on("edit_state", (state) => {
    restoreState(state);
});

/* ============================================================
   Undo / Redo ボタン
============================================================ */
document.getElementById("undoBtn").onclick = () => {
    if (history.length === 0) return;
    const current = JSON.stringify(getCurrentState());
    redoHistory.push(current);

    const last = history.pop();
    restoreState(JSON.parse(last));
    updateUndoRedoButtons();
    broadcastState();
};

document.getElementById("redoBtn").onclick = () => {
    if (redoHistory.length === 0) return;
    const current = JSON.stringify(getCurrentState());
    history.push(current);

    const next = redoHistory.pop();
    restoreState(JSON.parse(next));
    updateUndoRedoButtons();
    broadcastState();
};

function updateUndoRedoButtons() {
    document.getElementById("undoBtn").classList.toggle("disabled", history.length === 0);
    document.getElementById("redoBtn").classList.toggle("disabled", redoHistory.length === 0);
}

/* ============================================================
   現在のツール
============================================================ */
let currentTool = "none";

let currentMarkerColor = "#ff7eb9";
let currentMarkerOpacity = 1.0;

let currentArrowColor = "#ff7eb9";
let currentArrowOpacity = 1.0;

let currentTextColor = "#ff7eb9";
let currentTextSize = 16;

let penMode = false;
let currentPenColor = "#ff7eb9";
let currentPenWidth = 3;
let currentPenOpacity = 1.0;

let textAddMode = false;

/* ============================================================
   ペンのクリア
============================================================ */
document.getElementById("penClearBtn").onclick = () => {
    saveHistory();
    penPaths = [];
    drawCanvas();
    broadcastState();
};

/* ============================================================
   ツール切替
============================================================ */
document.getElementById("markerModeBtn").onclick = () => {
    currentTool = "marker";
    penMode = false;
    textAddMode = false;
};

document.getElementById("arrowModeBtn").onclick = () => {
    currentTool = "arrow";
    penMode = false;
    textAddMode = false;
};

document.getElementById("penModeBtn").onclick = () => {
    if (currentTool === "pen") {
        currentTool = "none";
        penMode = false;
    } else {
        currentTool = "pen";
        penMode = true;
        textAddMode = false;
    }
};

document.getElementById("addTextModeBtn").onclick = () => {
    currentTool = "text";
    textAddMode = true;
    penMode = false;
};

document.getElementById("panModeBtn").onclick = () => {
    currentTool = "pan";
    penMode = false;
    textAddMode = false;
};

/* ============================================================
   カラーピッカー
============================================================ */
document.querySelectorAll(".colorOption").forEach((el) => {
    el.addEventListener("click", () => {
        currentMarkerColor = getComputedStyle(el).backgroundColor;
        currentTool = "marker";
    });
});

document.querySelectorAll(".arrowColorOption").forEach((el) => {
    el.addEventListener("click", () => {
        currentArrowColor = getComputedStyle(el).backgroundColor;
        currentTool = "arrow";
    });
});

document.querySelectorAll(".textColorOption").forEach((el) => {
    el.addEventListener("click", () => {
        currentTextColor = getComputedStyle(el).backgroundColor;
    });
});

document.querySelectorAll(".penColorOption").forEach((el) => {
    el.addEventListener("click", () => {
        currentPenColor = getComputedStyle(el).backgroundColor;
    });
});

/* ============================================================
   クリック座標
============================================================ */
function getCanvasClickPosition(e) {
    const rect = canvas.getBoundingClientRect();

    const rawX = e.clientX - rect.left - offsetX;
    const rawY = e.clientY - rect.top - offsetY;

    const cx = canvas.width / 2;
    const cy = canvas.height / 2;

    const x = (rawX - cx) / zoom + cx;
    const y = (rawY - cy) / zoom + cy;

    return { x, y };
}

/* ============================================================
   テキスト入力
============================================================ */
let typing = false;
let typingText = "";
let typingX = 0;
let typingY = 0;

document.addEventListener("keydown", (e) => {
    if (!typing) return;

    if (e.key === "Enter") {
        if (typingText.trim() !== "") {
            saveHistory();
            texts.push({
                id: "text_" + Date.now(),
                x: typingX,
                y: typingY,
                text: typingText,
                color: currentTextColor,
                size: currentTextSize
            });
            typing = false;
            typingText = "";
            drawCanvas();
            broadcastState();
        } else {
            typing = false;
            typingText = "";
            drawCanvas();
        }
        e.preventDefault();
        return;
    }

    if (e.key === "Escape") {
        typing = false;
        typingText = "";
        drawCanvas();
        e.preventDefault();
        return;
    }

    if (e.key === "Backspace") {
        typingText = typingText.slice(0, -1);
        drawCanvas();
        e.preventDefault();
        return;
    }

    if (e.key.length === 1) {
        typingText += e.key;
        drawCanvas();
        e.preventDefault();
    }
});

/* ============================================================
   キャンバスクリック処理
============================================================ */
canvas.addEventListener("click", (e) => {
    const { x, y } = getCanvasClickPosition(e);

    if (currentTool === "text") {
        typing = true;
        typingText = "";
        typingX = x;
        typingY = y;
        drawCanvas();
        broadcastState();
        return;
    }

    if (currentTool === "marker") {
        saveHistory();
        markers.push({
            id: "marker_" + Date.now(),
            x,
            y,
            name: document.getElementById("markerName").value,
            color: currentMarkerColor,
            opacity: currentMarkerOpacity
        });
        drawCanvas();
        broadcastState();
        return;
    }

    if (currentTool === "arrow") {
        saveHistory();
        arrows.push({
            id: "arrow_" + Date.now(),
            x,
            y,
            angle: 0,
            scale: 1,
            color: currentArrowColor,
            opacity: currentArrowOpacity
        });
        drawCanvas();
        broadcastState();
        return;
    }
});

/* ============================================================
   マーカー／矢印ドラッグ
============================================================ */
let draggingMarker = null;
let draggingArrow = null;
let dragOffsetX = 0;
let dragOffsetY = 0;

function hitTestMarker(x, y) {
    return markers.find(m => {
        const dx = x - m.x;
        const dy = y - m.y;
        return Math.sqrt(dx * dx + dy * dy) <= 10;
    }) || null;
}

function hitTestArrow(x, y) {
    const r = 25;
    return arrows.find(a => {
        const dx = x - a.x;
        const dy = y - a.y;
        return Math.abs(dx) <= r && Math.abs(dy) <= r;
    }) || null;
}

/* ============================================================
   ペン描画・ドラッグ・パン
============================================================ */
let drawing = false;

canvas.addEventListener("mousedown", (e) => {
    const { x, y } = getCanvasClickPosition(e);

    if (currentTool === "marker") {
        const hit = hitTestMarker(x, y);
        if (hit) {
            saveHistory();
            draggingMarker = hit;
            dragOffsetX = x - hit.x;
            dragOffsetY = y - hit.y;
            return;
        }
    }

    if (currentTool === "arrow") {
        const hit = hitTestArrow(x, y);
        if (hit) {
            saveHistory();
            draggingArrow = hit;
            dragOffsetX = x - hit.x;
            dragOffsetY = y - hit.y;
            return;
        }
    }

    if (currentTool === "pen") {
        drawing = true;
        saveHistory();
        penPaths.push({
            points: [{ x, y }],
            color: currentPenColor,
            width: currentPenWidth,
            opacity: currentPenOpacity
        });
        return;
    }

    if (currentTool === "pan") {
        isPanning = true;
        panStartX = e.clientX - offsetX;
        panStartY = e.clientY - offsetY;
        return;
    }

    return;
});

canvas.addEventListener("mousemove", (e) => {
    const { x, y } = getCanvasClickPosition(e);

    if (draggingMarker) {
        draggingMarker.x = x - dragOffsetX;
        draggingMarker.y = y - dragOffsetY;
        drawCanvas();
        return;
    }

    if (draggingArrow) {
        draggingArrow.x = x - dragOffsetX;
        draggingArrow.y = y - dragOffsetY;
        drawCanvas();
        return;
    }

    if (currentTool === "pen" && drawing) {
        penPaths[penPaths.length - 1].points.push({ x, y });
        drawCanvas();
        return;
    }

    if (isPanning) {
        offsetX = e.clientX - panStartX;
        offsetY = e.clientY - panStartY;
        drawCanvas();
    }
});

canvas.addEventListener("mouseup", () => {
    let changed = false;

    if (drawing) changed = true;
    if (draggingMarker || draggingArrow) changed = true;

    drawing = false;
    isPanning = false;
    draggingMarker = null;
    draggingArrow = null;

    if (changed) {
        drawCanvas();
        broadcastState();
    }
});

/* ============================================================
   ズーム
============================================================ */
document.getElementById("zoomInBtn").onclick = () => {
    saveHistory();
    zoom += zoomStep;
    drawCanvas();
    broadcastState();
};

document.getElementById("zoomOutBtn").onclick = () => {
    saveHistory();
    zoom = Math.max(0.2, zoom - zoomStep);
    drawCanvas();
    broadcastState();
};

document.getElementById("zoomResetBtn").onclick = () => {
    saveHistory();
    zoom = 1.0;
    drawCanvas();
    broadcastState();
};

/* ============================================================
   PNG 書き出し
============================================================ */
document.getElementById("exportPngBtn").onclick = () => {
    canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "battle-map.png";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    });
};

/* ============================================================
   描画処理
============================================================ */
function drawCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();

    ctx.translate(offsetX, offsetY);

    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(-canvas.width / 2, -canvas.height / 2);

    if (backgroundImage) {
        ctx.drawImage(backgroundImage, 0, 0);
    }

    penPaths.forEach(path => {
        ctx.save();
        ctx.strokeStyle = path.color;
        ctx.lineWidth = path.width;
        ctx.globalAlpha = path.opacity;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";

        ctx.beginPath();
        path.points.forEach((p, i) => {
            if (i === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
        });
        ctx.stroke();
        ctx.restore();
    });

    markers.forEach(m => {
        ctx.save();
        ctx.globalAlpha = m.opacity;

        ctx.beginPath();
        ctx.arc(m.x, m.y, 10, 0, Math.PI * 2);
        ctx.fillStyle = m.color;
        ctx.fill();

        ctx.fillStyle = "#000";
        ctx.font = `700 14px "Noto Sans JP", "Yu Gothic", sans-serif`;
        ctx.fillText(m.name, m.x + 12, m.y + 4);

        ctx.restore();
    });

    arrows.forEach(a => {
        ctx.save();
        ctx.translate(a.x, a.y);
        ctx.rotate(a.angle || 0);
        ctx.scale(a.scale || 1, a.scale || 1);
        ctx.globalAlpha = a.opacity || currentArrowOpacity;

        ctx.beginPath();
        ctx.moveTo(0, -20);
        ctx.lineTo(15, 20);
        ctx.lineTo(-15, 20);
        ctx.closePath();

        ctx.fillStyle = a.color || currentArrowColor;
        ctx.fill();

        ctx.restore();
    });

    texts.forEach(t => {
        ctx.save();

        ctx.font = `700 ${t.size}px "Noto Sans JP", "Yu Gothic", sans-serif`;
        ctx.fillStyle = t.color;

        ctx.shadowColor = "rgba(255,255,255,0.8)";
        ctx.shadowBlur = 10;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;

        ctx.fillText(t.text, t.x, t.y);

        ctx.restore();
    });

    if (typing) {
        ctx.save();

        ctx.font = `700 ${currentTextSize}px "Noto Sans JP", "Yu Gothic", sans-serif`;
        ctx.fillStyle = currentTextColor;

        ctx.fillText(typingText, typingX, typingY);

        const width = ctx.measureText(typingText).width;
        const cursorX = typingX + width + 2;

        ctx.beginPath();
        ctx.moveTo(cursorX, typingY - currentTextSize);
        ctx.lineTo(cursorX, typingY + 4);
        ctx.lineWidth = 2;
        ctx.strokeStyle = currentTextColor;
        ctx.stroke();

        ctx.restore();
    }

    ctx.restore();
}

/* ============================================================
   画像ドラッグ＆ドロップ
============================================================ */
document.body.addEventListener("dragover", (e) => e.preventDefault());
document.body.addEventListener("drop", (e) => {
    e.preventDefault();

    const file = e.dataTransfer.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
        const img = new Image();
        img.onload = () => {
            saveHistory();
            canvas.width = img.width;
            canvas.height = img.height;

            backgroundImage = img;

            document.getElementById("dropHint").style.display = "none";
            drawCanvas();
            broadcastState();
        };
        img.src = reader.result;
    };
    reader.readAsDataURL(file);
});

/* ============================================================
   メニュー閉じる
============================================================ */
document.addEventListener("click", () => {
    document.getElementById("markerMenu").classList.add("hidden");
    document.getElementById("textMenu").classList.add("hidden");
    document.getElementById("arrowMenu").classList.add("hidden");
});

/* ============================================================
   初期状態
============================================================ */
updateUndoRedoButtons();
drawCanvas();

});
