// 右パネルの fold-content をデフォルトで閉じる
function initFoldUI() {
    document.querySelectorAll(".fold-content").forEach(fc => {
        fc.style.display = "none";
    });

    // fold-icon をデフォルトで ▼ に統一
    document.querySelectorAll(".fold-icon").forEach(icon => {
        icon.textContent = "▼";
    });

    // fold-header をクリックしたら fold-content を開閉
    document.querySelectorAll(".fold-header").forEach(header => {
        header.addEventListener("click", () => {
            const content = header.nextElementSibling;
            if (!content) return;

            const icon = header.querySelector(".fold-icon");

            // 開閉
            if (content.style.display === "none") {
                content.style.display = "block";
                if (icon) icon.textContent = "▲"; // 開いたとき
            } else {
                content.style.display = "none";
                if (icon) icon.textContent = "▼"; // 閉じたとき
            }
        });
    });
}

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

// 選択・変形用
let selectedObject = null;
let selectedType = null; // "arrow" | "text"
let transformMode = null; // "move" | "scale" | "rotate"
let transformStart = null;

// ★★★ これが絶対に必要 ★★★
initFoldUI();


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
    cancelTyping();
    if (history.length === 0) return;
    const current = JSON.stringify(getCurrentState());
    redoHistory.push(current);

    const last = history.pop();
    restoreState(JSON.parse(last));
    updateUndoRedoButtons();
    broadcastState();
};

document.getElementById("redoBtn").onclick = () => {
    cancelTyping();
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
    cancelTyping();
    saveHistory();
    penPaths = [];
    drawCanvas();
    broadcastState();
};
   
/* ============================================================
   カラーピッカー（最新選択を優先）
============================================================ */
function activateColor(el, selector) {
    // 全カテゴリの selected を解除
    document.querySelectorAll(".colorOption, .arrowColorOption, .textColorOption, .penColorOption")
        .forEach(btn => btn.classList.remove("selected"));

    // 今選んだカテゴリだけ選択状態にする
    el.classList.add("selected");
}

/* 砦マーカー色 */
document.querySelectorAll(".colorOption").forEach((el) => {
    el.addEventListener("click", () => {
        cancelTyping();
        selectedObject = null;
        selectedType = null;
        currentMarkerColor = getComputedStyle(el).backgroundColor;
        activateColor(el, ".colorOption");
        currentTool = "marker";
        penMode = false;
        textAddMode = false;
        drawCanvas();
    });
});

/* 矢印色 */
document.querySelectorAll(".arrowColorOption").forEach((el) => {
    el.addEventListener("click", () => {
        cancelTyping();
        selectedObject = null;
        selectedType = null;
        currentArrowColor = getComputedStyle(el).backgroundColor;
        activateColor(el, ".arrowColorOption");
        currentTool = "arrow";
        penMode = false;
        textAddMode = false;
        drawCanvas();
    });
});

/* テキスト色 */
document.querySelectorAll(".textColorOption").forEach((el) => {
    el.addEventListener("click", () => {
        cancelTyping();
        selectedObject = null;
        selectedType = null;
        currentTextColor = getComputedStyle(el).backgroundColor;
        activateColor(el, ".textColorOption");
        currentTool = "text";
        textAddMode = true;
        penMode = false;
        drawCanvas();
    });
});

/* ペン色 */
document.querySelectorAll(".penColorOption").forEach((el) => {
    el.addEventListener("click", () => {
        cancelTyping();
        selectedObject = null;
        selectedType = null;
        currentPenColor = getComputedStyle(el).backgroundColor;
        activateColor(el, ".penColorOption");
        currentTool = "pen";
        penMode = true;
        textAddMode = false;
        drawCanvas();
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

function cancelTyping() {
    if (typing) {
        typing = false;
        typingText = "";
        drawCanvas();
    }
}

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
                size: currentTextSize,
                angle: 0
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
   バウンディングボックス & ハンドル
============================================================ */
function getBoundingBox(obj, type) {
    if (type === "arrow") {
        const s = 25 * (obj.scale || 1);
        return {
            x: obj.x - s,
            y: obj.y - s,
            w: s * 2,
            h: s * 2
        };
    }

    if (type === "text") {
        ctx.save();
        ctx.font = `700 ${obj.size}px "Noto Sans JP", "Yu Gothic", sans-serif`;
        const width = ctx.measureText(obj.text).width;
        ctx.restore();
        return {
            x: obj.x,
            y: obj.y - obj.size,
            w: width,
            h: obj.size
        };
    }

    return { x: 0, y: 0, w: 0, h: 0 };
}

function drawTransformHandles(obj, type) {
    const box = getBoundingBox(obj, type);
    if (!box) return;

    ctx.save();
    ctx.strokeStyle = "#4da3ff";
    ctx.lineWidth = 2;

    // 枠線
    ctx.strokeRect(box.x, box.y, box.w, box.h);

    // 四隅ハンドル
    const size = 8;
    const handles = [
        [box.x, box.y],
        [box.x + box.w, box.y],
        [box.x, box.y + box.h],
        [box.x + box.w, box.y + box.h]
    ];

    ctx.fillStyle = "#4da3ff";
    handles.forEach(([hx, hy]) => {
        ctx.fillRect(hx - size / 2, hy - size / 2, size, size);
    });

    // 回転ハンドル（上中央）
    const rx = box.x + box.w / 2;
    const ry = box.y - 20;

    ctx.beginPath();
    ctx.arc(rx, ry, 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
}

function hitScaleHandle(px, py, box) {
    const size = 10;
    const handles = [
        [box.x, box.y],
        [box.x + box.w, box.y],
        [box.x, box.y + box.h],
        [box.x + box.w, box.y + box.h]
    ];
    return handles.some(([hx, hy]) => {
        return Math.abs(px - hx) <= size && Math.abs(py - hy) <= size;
    });
}

function hitRotateHandle(px, py, box) {
    const rx = box.x + box.w / 2;
    const ry = box.y - 20;
    const r = 10;
    const dx = px - rx;
    const dy = py - ry;
    return dx * dx + dy * dy <= r * r;
}

/* ============================================================
   キャンバスクリック処理
============================================================ */
canvas.addEventListener("click", (e) => {
    const { x, y } = getCanvasClickPosition(e);

    // テキストツール時の新規入力開始
    if (currentTool === "text") {
        typing = true;
        typingText = "";
        typingX = x;
        typingY = y;
        selectedObject = null;
        selectedType = null;
        drawCanvas();
        broadcastState();
        return;
    }

    // 既存オブジェクトの選択（矢印・テキスト）
    const hitArrow = hitTestArrow(x, y);
    const hitText = texts.find(t => {
        const box = getBoundingBox(t, "text");
        return (
            x >= box.x &&
            x <= box.x + box.w &&
            y >= box.y &&
            y <= box.y + box.h
        );
    });

    if (hitArrow) {
        selectedObject = hitArrow;
        selectedType = "arrow";
        drawCanvas();
        return;
    }

    if (hitText) {
        selectedObject = hitText;
        selectedType = "text";
        drawCanvas();
        return;
    }

    // マーカー追加
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
        selectedObject = null;
        selectedType = null;
        drawCanvas();
        broadcastState();
        updateCommentList();
        return;
    }

    // 矢印追加
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
        selectedObject = null;
        selectedType = null;
        drawCanvas();
        broadcastState();
        return;
    }

    // 何もヒットしなければ選択解除
    selectedObject = null;
    selectedType = null;
    drawCanvas();
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
    const rBase = 25;
    return arrows.find(a => {
        const r = rBase * (a.scale || 1);
        const dx = x - a.x;
        const dy = y - a.y;
        return Math.abs(dx) <= r && Math.abs(dy) <= r;
    }) || null;
}

/* ============================================================
   ペン描画・ドラッグ・パン・変形
============================================================ */
let drawing = false;

canvas.addEventListener("mousedown", (e) => {
    const { x, y } = getCanvasClickPosition(e);

    // 変形ハンドル優先（選択中オブジェクトがある場合）
    if (selectedObject && selectedType) {
        const box = getBoundingBox(selectedObject, selectedType);

        if (hitScaleHandle(x, y, box)) {
            transformMode = "scale";
            transformStart = {
                x,
                y,
                box,
                originalScale: selectedType === "arrow" ? (selectedObject.scale || 1) : null,
                originalSize: selectedType === "text" ? selectedObject.size : null
            };
            saveHistory();
            return;
        }

        if (hitRotateHandle(x, y, box)) {
            transformMode = "rotate";
            transformStart = {
                x,
                y,
                centerX: selectedType === "arrow" ? selectedObject.x : (box.x + box.w / 2),
                centerY: selectedType === "arrow" ? selectedObject.y : (box.y + box.h / 2),
                originalAngle: selectedObject.angle || 0
            };
            saveHistory();
            return;
        }

        // 枠内クリック → move として扱う（矢印のみ既存ドラッグ流用）
        if (selectedType === "arrow") {
            if (
                x >= box.x && x <= box.x + box.w &&
                y >= box.y && y <= box.y + box.h
            ) {
                saveHistory();
                draggingArrow = selectedObject;
                dragOffsetX = x - draggingArrow.x;
                dragOffsetY = y - draggingArrow.y;
                return;
            }
        }

        if (selectedType === "text") {
            if (
                x >= box.x && x <= box.x + box.w &&
                y >= box.y && y <= box.y + box.h
            ) {
                // テキストの移動
                transformMode = "move";
                transformStart = {
                    x,
                    y,
                    originalX: selectedObject.x,
                    originalY: selectedObject.y
                };
                saveHistory();
                return;
            }
        }
    }

    // マーカーのドラッグ
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

    // 矢印のドラッグ（選択状態でなくても）
    if (currentTool === "arrow") {
        const hit = hitTestArrow(x, y);
        if (hit) {
            saveHistory();
            draggingArrow = hit;
            dragOffsetX = x - hit.x;
            dragOffsetY = y - hit.y;
            selectedObject = hit;
            selectedType = "arrow";
            return;
        }
    }

    // ペン描画
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

    // パン
    if (currentTool === "pan") {
        isPanning = true;
        panStartX = e.clientX - offsetX;
        panStartY = e.clientY - offsetY;
        return;
    }
});

canvas.addEventListener("mousemove", (e) => {
    const { x, y } = getCanvasClickPosition(e);

    // 変形中
    if (transformMode === "scale" && selectedObject && selectedType && transformStart) {
        const dx = x - transformStart.x;
        const dy = y - transformStart.y;
        const delta = Math.max(dx, dy);

        if (selectedType === "arrow") {
            const base = transformStart.originalScale || 1;
            selectedObject.scale = Math.max(0.2, base + delta / 100);
        }

        if (selectedType === "text") {
            const base = transformStart.originalSize || selectedObject.size;
            selectedObject.size = Math.max(8, base + delta / 2);
        }

        drawCanvas();
        return;
    }

    if (transformMode === "rotate" && selectedObject && selectedType && transformStart) {
        const cx = transformStart.centerX;
        const cy = transformStart.centerY;
        const angle = Math.atan2(y - cy, x - cx);
        selectedObject.angle = angle;
        drawCanvas();
        return;
    }

    if (transformMode === "move" && selectedObject && selectedType === "text" && transformStart) {
        const dx = x - transformStart.x;
        const dy = y - transformStart.y;
        selectedObject.x = transformStart.originalX + dx;
        selectedObject.y = transformStart.originalY + dy;
        drawCanvas();
        return;
    }

    // マーカー移動
    if (draggingMarker) {
        draggingMarker.x = x - dragOffsetX;
        draggingMarker.y = y - dragOffsetY;
        drawCanvas();
        return;
    }

    // 矢印移動
    if (draggingArrow) {
        draggingArrow.x = x - dragOffsetX;
        draggingArrow.y = y - dragOffsetY;
        drawCanvas();
        return;
    }

    // ペン描画
    if (currentTool === "pen" && drawing) {
        penPaths[penPaths.length - 1].points.push({ x, y });
        drawCanvas();
        return;
    }

    // パン
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
    if (transformMode) changed = true;

    drawing = false;
    isPanning = false;
    draggingMarker = null;
    draggingArrow = null;
    transformMode = null;
    transformStart = null;

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
    cancelTyping();
    selectedObject = null;
    selectedType = null;
    saveHistory();
    zoom += zoomStep;
    drawCanvas();
    broadcastState();
};

document.getElementById("zoomOutBtn").onclick = () => {
    cancelTyping();
    selectedObject = null;
    selectedType = null;
    saveHistory();
    zoom = Math.max(0.2, zoom - zoomStep);
    drawCanvas();
    broadcastState();
};

document.getElementById("zoomResetBtn").onclick = () => {
    cancelTyping();
    selectedObject = null;
    selectedType = null;
    saveHistory();
    zoom = 1.0;
    drawCanvas();
    broadcastState();
};

/* ============================================================
   PNG 書き出し
============================================================ */
document.getElementById("exportPngBtn")?.addEventListener("click", () => {
    cancelTyping();
    selectedObject = null;
    selectedType = null;
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

    /* テキスト（外側光彩＋ドロップシャドウ＋回転対応） */
    texts.forEach(t => {
        ctx.save();

        ctx.translate(t.x, t.y);
        if (t.angle) ctx.rotate(t.angle);

        ctx.font = `700 ${t.size}px "Noto Sans JP", "Yu Gothic", sans-serif`;
        ctx.fillStyle = t.color;

        ctx.shadowColor = "rgba(255,255,255,0.9)";
        ctx.shadowBlur = 12;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;

        ctx.fillText(t.text, 0, 0);

        ctx.restore();
    });

    /* 入力中テキスト（回転なし） */
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

    // 選択中オブジェクトのハンドル描画
    if (selectedObject && selectedType) {
        drawTransformHandles(selectedObject, selectedType);
    }
   
    ctx.restore();
}

/* ============================================================
   画像ドラッグ＆ドロップ
============================================================ */

/* ブラウザのデフォルト動作（画像を開く）を完全に無効化 */
window.addEventListener("dragover", e => e.preventDefault(), false);
window.addEventListener("drop", e => e.preventDefault(), false);
document.body.addEventListener("dragover", e => e.preventDefault());
document.body.addEventListener("drop", e => e.preventDefault());

/* キャンバスへの画像ドロップ処理（元からある処理） */
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
        const box = getBoundingBox(t, "text");
        return (
            x >= box.x &&
            x <= box.x + box.w &&
            y >= box.y &&
            y <= box.y + box.h
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
    window.selectedArrow.angle = (window.selectedArrow.angle || 0) - Math.PI / 8;
    hideAllMenus();
    drawCanvas();
    broadcastState();
};

document.getElementById("arrowRotateRightBtn").onclick = () => {
    if (!window.selectedArrow) return;
    saveHistory();
    window.selectedArrow.angle = (window.selectedArrow.angle || 0) + Math.PI / 8;
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
   初期状態
============================================================ */
updateUndoRedoButtons();
drawCanvas();
updateCommentList();
