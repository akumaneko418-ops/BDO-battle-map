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
        zoom,
        backgroundImageSrc: backgroundImage ? backgroundImage.src : null
    };
}

function restoreState(state) {
    markers = state.markers;
    arrows = state.arrows;
    texts = state.texts;
    penPaths = state.penPaths;
    zoom = state.zoom;

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

function undo() {
    if (history.length === 0) return;

    const current = JSON.stringify(getCurrentState());
    redoHistory.push(current);

    const last = history.pop();
    restoreState(JSON.parse(last));

    updateUndoRedoButtons();
}

function redo() {
    if (redoHistory.length === 0) return;

    const current = JSON.stringify(getCurrentState());
    history.push(current);

    const next = redoHistory.pop();
    restoreState(JSON.parse(next));

    updateUndoRedoButtons();
}

function updateUndoRedoButtons() {
    document.getElementById("undoBtn").classList.toggle("disabled", history.length === 0);
    document.getElementById("redoBtn").classList.toggle("disabled", redoHistory.length === 0);
}

/* ============================================================
   現在の選択状態
============================================================ */
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
   テキスト入力（B方式）
============================================================ */
let typing = false;
let typingText = "";
let typingX = 0;
let typingY = 0;

document.getElementById("addTextModeBtn").onclick = () => {
    textAddMode = !textAddMode;
    penMode = false;
};

canvas.addEventListener("click", (e) => {
    if (!textAddMode) return;

    const rect = canvas.getBoundingClientRect();
    typingX = (e.clientX - rect.left) / zoom;
    typingY = (e.clientY - rect.top) / zoom;

    typing = true;
    typingText = "";

    drawCanvas();
});

document.addEventListener("keydown", (e) => {
    if (!typing) return;

    if (e.key === "Enter") {
        saveHistory();
        texts.push({
            id: "text_" + Date.now(),
            text: typingText,
            x: typingX,
            y: typingY,
            color: currentTextColor,
            size: currentTextSize
        });

        typing = false;
        textAddMode = false;
        typingText = "";
        drawCanvas();
        return;
    }

    if (e.key === "Escape") {
        typing = false;
        textAddMode = false;
        typingText = "";
        drawCanvas();
        return;
    }

    if (e.key === "Backspace") {
        typingText = typingText.slice(0, -1);
    } else if (e.key.length === 1) {
        typingText += e.key;
    }

    drawCanvas();
});

/* ============================================================
   UI：砦マーカー
============================================================ */
document.querySelectorAll(".colorOption").forEach(opt => {
    opt.onclick = () => {
        document.querySelectorAll(".colorOption").forEach(o => o.classList.remove("selected"));
        opt.classList.add("selected");
        currentMarkerColor = opt.style.background;
    };
});

document.getElementById("markerOpacity").oninput = (e) => {
    currentMarkerOpacity = parseFloat(e.target.value);
    document.getElementById("markerOpacityValue").textContent = currentMarkerOpacity.toFixed(2);
};

/* ============================================================
   UI：矢印スタンプ
============================================================ */
document.querySelectorAll(".arrowColorOption").forEach(opt => {
    opt.onclick = () => {
        document.querySelectorAll(".arrowColorOption").forEach(o => o.classList.remove("selected"));
        opt.classList.add("selected");
        currentArrowColor = opt.style.background;
    };
});

document.getElementById("arrowOpacity").oninput = (e) => {
    currentArrowOpacity = parseFloat(e.target.value);
    document.getElementById("arrowOpacityValue").textContent = currentArrowOpacity.toFixed(2);
};

/* ============================================================
   UI：テキスト色・サイズ
============================================================ */
document.querySelectorAll(".textColorOption").forEach(opt => {
    opt.onclick = () => {
        document.querySelectorAll(".textColorOption").forEach(o => o.classList.remove("selected"));
        opt.classList.add("selected");
        currentTextColor = opt.style.background;
    };
});

document.getElementById("textSize").onchange = (e) => {
    currentTextSize = parseInt(e.target.value);
};

/* ============================================================
   ペンツール
============================================================ */
document.querySelectorAll(".penColorOption").forEach(opt => {
    opt.onclick = () => {
        document.querySelectorAll(".penColorOption").forEach(o => o.classList.remove("selected"));
        opt.classList.add("selected");
        currentPenColor = opt.style.background;
    };
});

document.getElementById("penWidth").onchange = (e) => {
    currentPenWidth = parseInt(e.target.value);
};

document.getElementById("penOpacity").oninput = (e) => {
    currentPenOpacity = parseFloat(e.target.value);
    document.getElementById("penOpacityValue").textContent = currentPenOpacity.toFixed(2);
};

document.getElementById("penModeBtn").onclick = () => {
    penMode = !penMode;
    textAddMode = false;
};

document.getElementById("penClearBtn").onclick = () => {
    if (penPaths.length === 0) return;
    saveHistory();
    penPaths = [];
    drawCanvas();
};

/* ============================================================
   ペン描画
============================================================ */
let drawing = false;

canvas.addEventListener("mousedown", (e) => {
    if (!penMode) return;

    drawing = true;

    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / zoom;
    const y = (e.clientY - rect.top) / zoom;

    saveHistory();
    penPaths.push({
        points: [{ x, y }],
        color: currentPenColor,
        width: currentPenWidth,
        opacity: currentPenOpacity
    });
});

canvas.addEventListener("mousemove", (e) => {
    if (!penMode || !drawing) return;

    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / zoom;
    const y = (e.clientY - rect.top) / zoom;

    penPaths[penPaths.length - 1].points.push({ x, y });
    drawCanvas();
});

canvas.addEventListener("mouseup", () => {
    drawing = false;
});

/* ============================================================
   ズーム
============================================================ */
document.getElementById("zoomInBtn").onclick = () => {
    saveHistory();
    zoom += zoomStep;
    drawCanvas();
};

document.getElementById("zoomOutBtn").onclick = () => {
    saveHistory();
    zoom = Math.max(0.2, zoom - zoomStep);
    drawCanvas();
};

document.getElementById("zoomResetBtn").onclick = () => {
    saveHistory();
    zoom = 1.0;
    drawCanvas();
};

/* ============================================================
   help-popup（右パネル外に出す）
============================================================ */
document.querySelectorAll(".help-icon").forEach(icon => {
    const popup = icon.nextElementSibling;

    icon.addEventListener("mouseenter", () => {
        const rect = icon.getBoundingClientRect();
        popup.style.left = (rect.right + 10) + "px";
        popup.style.top = rect.top + "px";
        popup.style.display = "block";
    });

    icon.addEventListener("mouseleave", () => {
        popup.style.display = "none";
    });
});

/* ============================================================
   右クリックメニュー（テキスト・砦・矢印）
============================================================ */
canvas.addEventListener("contextmenu", (e) => {
    e.preventDefault();

    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / zoom;
    const y = (e.clientY - rect.top) / zoom;

    /* ---- テキスト判定 ---- */
    for (let t of texts) {
        const width = t.text.length * (t.size * 0.6);
        const height = t.size;

        if (x >= t.x && x <= t.x + width && y >= t.y - height && y <= t.y) {
            const menu = document.getElementById("textMenu");
            menu.style.left = e.pageX + "px";
            menu.style.top = e.pageY + "px";
            menu.dataset.textId = t.id;
            menu.classList.remove("hidden");
            return;
        }
    }

    /* ---- 砦マーカー判定 ---- */
    for (let m of markers) {
        const dx = x - m.x;
        const dy = y - m.y;
        if (dx * dx + dy * dy <= 100) {
            const menu = document.getElementById("markerMenu");
            menu.style.left = e.pageX + "px";
            menu.style.top = e.pageY + "px";
            menu.dataset.markerId = m.id;
            menu.classList.remove("hidden");
            return;
        }
    }

    /* ---- 矢印判定 ---- */
    for (let a of arrows) {
        const dx = x - a.x;
        const dy = y - a.y;
        if (Math.abs(dx) < 40 && Math.abs(dy) < 40) {
            const menu = document.getElementById("arrowMenu");
            menu.style.left = e.pageX + "px";
            menu.style.top = e.pageY + "px";
            menu.dataset.arrowId = a.id;
            menu.classList.remove("hidden");
            return;
        }
    }
});

/* ============================================================
   テキスト編集
============================================================ */
document.getElementById("editTextBtn").onclick = () => {
    const id = document.getElementById("textMenu").dataset.textId;
    const t = texts.find(x => x.id === id);
    if (!t) return;

    const newText = prompt("テキストを編集", t.text);
    if (newText !== null) {
        saveHistory();
        t.text = newText;
        drawCanvas();
    }

    document.getElementById("textMenu").classList.add("hidden");
};

document.getElementById("deleteTextBtn").onclick = () => {
    const id = document.getElementById("textMenu").dataset.textId;
    saveHistory();
    texts = texts.filter(t => t.id !== id);
    drawCanvas();
    document.getElementById("textMenu").classList.add("hidden");
};

/* ============================================================
   矢印操作
============================================================ */
document.getElementById("arrowRotateBtn").onclick = () => {
    const id = document.getElementById("arrowMenu").dataset.arrowId;
    const a = arrows.find(x => x.id === id);
    if (!a) return;

    saveHistory();
    a.angle += Math.PI / 6;
    drawCanvas();

    document.getElementById("arrowMenu").classList.add("hidden");
};

document.getElementById("arrowScaleUpBtn").onclick = () => {
    const id = document.getElementById("arrowMenu").dataset.arrowId;
    const a = arrows.find(x => x.id === id);
    if (!a) return;

    saveHistory();
    a.scale *= 1.1;
    drawCanvas();

    document.getElementById("arrowMenu").classList.add("hidden");
};

document.getElementById("arrowScaleDownBtn").onclick = () => {
    const id = document.getElementById("arrowMenu").dataset.arrowId;
    const a = arrows.find(x => x.id === id);
    if (!a) return;

    saveHistory();
    a.scale *= 0.9;
    drawCanvas();

    document.getElementById("arrowMenu").classList.add("hidden");
};

document.getElementById("arrowDeleteBtn").onclick = () => {
    const id = document.getElementById("arrowMenu").dataset.arrowId;
    saveHistory();
    arrows = arrows.filter(a => a.id !== id);
    drawCanvas();
    document.getElementById("arrowMenu").classList.add("hidden");
};

/* ============================================================
   描画処理
============================================================ */
function drawCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.scale(zoom, zoom);

    /* ---- 背景画像 ---- */
    if (backgroundImage) {
        ctx.drawImage(backgroundImage, 0, 0);
    }

    /* ---- ペン ---- */
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

    /* ---- 砦マーカー ---- */
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

    /* ---- 矢印 ---- */
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

    /* ---- テキスト ---- */
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

    /* ---- 入力中テキスト（カーソル付き） ---- */
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
        };
        img.src = reader.result;
    };
    reader.readAsDataURL(file);
});

/* ============================================================
   メニュー閉じる
============================================================ */
document.addEventListener("click", () => {
