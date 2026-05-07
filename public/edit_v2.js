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

/* パン用 */
let offsetX = 0;
let offsetY = 0;
let isPanning = false;
let panStartX = 0;
let panStartY = 0;

/* データ構造 */
let markers = [];
let arrows = [];
let texts = [];
let penPaths = [];
let markerComments = {};
let highlightedMarkerId = null;

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
        offsetY,
        markerComments: JSON.parse(JSON.stringify(markerComments))
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
    markerComments = state.markerComments || {};

    if (state.backgroundImageSrc) {
        const img = new Image();
        img.onload = () => {
            backgroundImage = img;
            drawCanvas();
            updateCommentList();
        };
        img.src = state.backgroundImageSrc;
    } else {
        backgroundImage = null;
        drawCanvas();
        updateCommentList();
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

/* Undo / Redo ボタン */
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
let currentMarkerSize = 10;

let currentArrowColor = "#ff7eb9";
let currentArrowOpacity = 1.0;
let currentArrowScale = 1.0;

let currentTextColor = "#ff7eb9";
let currentTextSize = 16;

let penMode = false;
let currentPenColor = "#ff7eb9";
let currentPenWidth = 3;
let currentPenOpacity = 1.0;

let textAddMode = false;

/* ペンのクリア */
document.getElementById("penClearBtn").onclick = () => {
    saveHistory();
    penPaths = [];
    drawCanvas();
    broadcastState();
};

/* ツール切替 */
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
   カラーピッカー（最新選択を優先）
============================================================ */
function activateColor(el, selector) {
    document.querySelectorAll(selector).forEach(btn => btn.classList.remove("selected"));
    el.classList.add("selected");
}

/* 砦マーカー色 */
document.querySelectorAll(".colorOption").forEach((el) => {
    el.addEventListener("click", () => {
        currentMarkerColor = getComputedStyle(el).backgroundColor;
        activateColor(el, ".colorOption");
        currentTool = "marker";
        penMode = false;
        textAddMode = false;
    });
});

/* 矢印色 */
document.querySelectorAll(".arrowColorOption").forEach((el) => {
    el.addEventListener("click", () => {
        currentArrowColor = getComputedStyle(el).backgroundColor;
        activateColor(el, ".arrowColorOption");
        currentTool = "arrow";
        penMode = false;
        textAddMode = false;
    });
});

/* テキスト色 */
document.querySelectorAll(".textColorOption").forEach((el) => {
    el.addEventListener("click", () => {
        currentTextColor = getComputedStyle(el).backgroundColor;
        activateColor(el, ".textColorOption");
        currentTool = "text";
        textAddMode = true;
        penMode = false;
    });
});

/* ペン色 */
document.querySelectorAll(".penColorOption").forEach((el) => {
    el.addEventListener("click", () => {
        currentPenColor = getComputedStyle(el).backgroundColor;
        activateColor(el, ".penColorOption");
        currentTool = "pen";
        penMode = true;
        textAddMode = false;
    });
});

/* ============================================================
   スライダー
============================================================ */
document.getElementById("markerSizeSlider").addEventListener("input", (e) => {
    currentMarkerSize = Number(e.target.value);
});

document.getElementById("arrowSizeSlider").addEventListener("input", (e) => {
    currentArrowScale = Number(e.target.value);
});

document.getElementById("markerOpacitySlider").addEventListener("input", (e) => {
    currentMarkerOpacity = Number(e.target.value);
    document.getElementById("markerOpacityValue").textContent = currentMarkerOpacity.toFixed(2);
});

document.getElementById("arrowOpacitySlider").addEventListener("input", (e) => {
    currentArrowOpacity = Number(e.target.value);
    document.getElementById("arrowOpacityValue").textContent = currentArrowOpacity.toFixed(2);
});

document.getElementById("penOpacitySlider").addEventListener("input", (e) => {
    currentPenOpacity = Number(e.target.value);
    document.getElementById("penOpacityValue").textContent = currentPenOpacity.toFixed(2);
});

document.getElementById("textSizeSlider").addEventListener("input", (e) => {
    currentTextSize = Number(e.target.value);
});

document.getElementById("penWidthSlider").addEventListener("input", (e) => {
    currentPenWidth = Number(e.target.value);
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
            opacity: currentMarkerOpacity,
            size: currentMarkerSize
        });
        drawCanvas();
        broadcastState();
        updateCommentList();
        return;
    }

    if (currentTool === "arrow") {
        saveHistory();
        arrows.push({
            id: "arrow_" + Date.now(),
            x,
            y,
            angle: 0,
            scale: currentArrowScale,
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
        return Math.sqrt(dx * dx + dy * dy) <= (m.size || 10);
    }) || null;
}

function hitTestArrow(x, y) {
    const r = 25 * (currentArrowScale || 1);
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
        updateCommentList();
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
document.getElementById("exportPngBtn")?.addEventListener("click", () => {
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
});

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

    /* ペン */
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

    /* マーカー */
    markers.forEach(m => {
        ctx.save();
        ctx.globalAlpha = m.opacity;

        ctx.beginPath();
        ctx.arc(m.x, m.y, m.size || 10, 0, Math.PI * 2);
        ctx.fillStyle = m.color;
        ctx.fill();

        ctx.fillStyle = "#000";
        ctx.font = `700 14px "Noto Sans JP", "Yu Gothic", sans-serif`;
        ctx.fillText(m.name, m.x + (m.size || 10) + 4, m.y + 4);

        ctx.restore();
    });

    /* 強調表示中のマーカー */
    if (highlightedMarkerId) {
        const m = markers.find(mm => mm.id === highlightedMarkerId);
        if (m) {
            ctx.save();
            ctx.globalAlpha = 0.4;
            ctx.beginPath();
            ctx.arc(m.x, m.y, (m.size || 10) + 12, 0, Math.PI * 2);
            ctx.fillStyle = m.color;
            ctx.fill();
            ctx.restore();
        }
    }

    /* 矢印（↑デザイン） */
    arrows.forEach(a => {
        ctx.save();
        ctx.translate(a.x, a.y);
        ctx.rotate(a.angle || 0);
        ctx.scale(a.scale || 1, a.scale || 1);
        ctx.globalAlpha = a.opacity || currentArrowOpacity;

        ctx.beginPath();
        ctx.moveTo(0, -25);
        ctx.lineTo(10, 0);
        ctx.lineTo(4, 0);
        ctx.lineTo(4, 25);
        ctx.lineTo(-4, 25);
        ctx.lineTo(-4, 0);
        ctx.lineTo(-10, 0);
        ctx.closePath();

        ctx.fillStyle = a.color || currentArrowColor;
        ctx.fill();

        ctx.restore();
    });

    /* テキスト（外側光彩＋ドロップシャドウ） */
    texts.forEach(t => {
        ctx.save();

        ctx.font = `700 ${t.size}px "Noto Sans JP", "Yu Gothic", sans-serif`;
        ctx.fillStyle = t.color;

        ctx.shadowColor = "rgba(255,255,255,0.9)";
        ctx.shadowBlur = 12;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;

        ctx.fillText(t.text, t.x, t.y);

        ctx.restore();
    });

    /* 入力中テキスト */
    if (typing) {
        ctx.save();

        ctx.font = `700 ${currentTextSize}px "Noto Sans JP", "Yu Gothic", sans-serif`;
        ctx.fillStyle = currentTextColor;

        ctx.shadowColor = "rgba(255,255,255,0.9)";
        ctx.shadowBlur = 12;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;

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
   ★ 右クリックメニュー
============================================================ */
canvas.addEventListener("contextmenu", (e) => {
    e.preventDefault();

    const { x, y } = getCanvasClickPosition(e);

    const hitMarker = hitTestMarker(x, y);
    const hitArrow = hitTestArrow(x, y);
    const hitText = texts.find(t => {
        const width = ctx.measureText(t.text).width;
        return (
            x >= t.x &&
            x <= t.x + width &&
            y <= t.y &&
            y >= t.y - t.size
        );
    });

    hideAllMenus();

    if (hitMarker) {
        window.selectedMarker = hitMarker;
        showMenu("markerMenu", e.clientX, e.clientY);
        return;
    }

    if (hitArrow) {
        window.selectedArrow = hitArrow;
        showMenu("arrowMenu", e.clientX, e.clientY);
        return;
    }

    if (hitText) {
        window.selectedText = hitText;
        showMenu("textMenu", e.clientX, e.clientY);
        return;
    }
});

function hideAllMenus() {
    document.getElementById("markerMenu").classList.add("hidden");
    document.getElementById("arrowMenu").classList.add("hidden");
    document.getElementById("textMenu").classList.add("hidden");
}

function showMenu(id, x, y) {
    const menu = document.getElementById(id);
    menu.style.left = x + "px";
    menu.style.top = y + "px";
    menu.classList.remove("hidden");
}

/* ============================================================
   メニューのボタン動作
============================================================ */
document.getElementById("deleteMarkerBtn").onclick = () => {
    if (!window.selectedMarker) return;
    saveHistory();
    markers = markers.filter(m => m !== window.selectedMarker);
    delete markerComments[window.selectedMarker.id];
    hideAllMenus();
    drawCanvas();
    updateCommentList();
    broadcastState();
};

document.getElementById("arrowRotateLeftBtn").onclick = () => {
    if (!window.selectedArrow) return;
    saveHistory();
    window.selectedArrow.angle -= Math.PI / 8;
    hideAllMenus();
    drawCanvas();
    broadcastState();
};

document.getElementById("arrowRotateRightBtn").onclick = () => {
    if (!window.selectedArrow) return;
    saveHistory();
    window.selectedArrow.angle += Math.PI / 8;
    hideAllMenus();
    drawCanvas();
    broadcastState();
};

document.getElementById("arrowDeleteBtn").onclick = () => {
    if (!window.selectedArrow) return;
    saveHistory();
    arrows = arrows.filter(a => a !== window.selectedArrow);
    hideAllMenus();
    drawCanvas();
    broadcastState();
};

document.getElementById("deleteTextBtn").onclick = () => {
    if (!window.selectedText) return;
    saveHistory();
    texts = texts.filter(t => t !== window.selectedText);
    hideAllMenus();
    drawCanvas();
    broadcastState();
};

/* コメント追加 */
document.getElementById("addCommentBtn").onclick = () => {
    if (!window.selectedMarker) return;

    const text = prompt("コメントを入力してください：");
    if (!text) return;

    const m = window.selectedMarker;

    if (!markerComments[m.id]) markerComments[m.id] = [];
    markerComments[m.id].push(text);

    updateCommentList();
    hideAllMenus();
};

/* コメント欄更新 */
function updateCommentList() {
    const list = document.getElementById("commentList");
    if (!list) return;

    list.innerHTML = "";

    markers.forEach(m => {
        const comments = markerComments[m.id];
        if (!comments) return;

        comments.forEach(c => {
            const div = document.createElement("div");
            div.className = "commentItem";

            const nameSpan = document.createElement("span");
            nameSpan.className = "markerName";
            nameSpan.textContent = m.name || "(無名)";
            nameSpan.style.color = m.color;

            const textSpan = document.createElement("span");
            textSpan.textContent = "：" + c;

            nameSpan.addEventListener("mouseenter", () => {
                highlightedMarkerId = m.id;
                drawCanvas();
            });

            nameSpan.addEventListener("mouseleave", () => {
                highlightedMarkerId = null;
                drawCanvas();
            });

            div.appendChild(nameSpan);
            div.appendChild(textSpan);
            list.appendChild(div);
        });
    });
}

/* ============================================================
   メニュー閉じる
============================================================ */
document.addEventListener("click", () => {
    hideAllMenus();
});

/* ============================================================
   折り畳み UI
============================================================ */
document.querySelectorAll(".fold-header").forEach(header => {
    header.addEventListener("click", (e) => {
        // ツールチャンネルのクリックで中身を開閉
        // tooltip クリックは無視
        if (e.target.classList.contains("tooltip")) return;

        const content = header.nextElementSibling;
        if (!content || !content.classList.contains("fold-content")) return;

        content.classList.toggle("hidden");

        const icon = header.querySelector(".fold-icon");
        if (icon) {
            icon.textContent = content.classList.contains("hidden") ? "▶" : "▼";
        }
    });
});

/* ============================================================
   初期状態
============================================================ */
updateUndoRedoButtons();
drawCanvas();
updateCommentList();

});
