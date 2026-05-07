/* ============================================================
   初期設定
============================================================ */
const socket = io();

let zoom = 1.0;
let zoomStep = 0.1;

const canvas = document.getElementById("mapCanvas");
const ctx = canvas.getContext("2d");

/* ============================================================
   データ構造
============================================================ */
let markers = [];        // 砦マーカー
let arrows = [];         // 矢印スタンプ
let texts = [];          // テキスト
let penPaths = [];       // ペンツールの線
let markerComments = {}; // コメント

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
   UI：テキスト
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

document.getElementById("addTextModeBtn").onclick = () => {
    textAddMode = true;
    penMode = false;
};

/* ============================================================
   UI：ペンツール
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
    penPaths = [];
    drawCanvas();
};

/* ============================================================
   ズーム
============================================================ */
document.getElementById("zoomInBtn").onclick = () => {
    zoom += zoomStep;
    drawCanvas();
};

document.getElementById("zoomOutBtn").onclick = () => {
    zoom = Math.max(0.2, zoom - zoomStep);
    drawCanvas();
};

document.getElementById("zoomResetBtn").onclick = () => {
    zoom = 1.0;
    drawCanvas();
};

/* ============================================================
   キャンバスクリック
============================================================ */
canvas.addEventListener("click", (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / zoom;
    const y = (e.clientY - rect.top) / zoom;

    /* ---- テキスト追加 ---- */
    if (textAddMode) {
        const text = document.getElementById("textInput").value.trim();
        if (!text) return;

        texts.push({
            id: "text_" + Date.now(),
            text,
            x,
            y,
            color: currentTextColor,
            size: currentTextSize
        });

        textAddMode = false;
        drawCanvas();
        return;
    }

    /* ---- ペンツール ---- */
    if (penMode) return;

    /* ---- 砦マーカー追加 ---- */
    const name = document.getElementById("markerName").value.trim();
    if (name) {
        markers.push({
            id: "marker_" + Date.now(),
            name,
            x,
            y,
            color: currentMarkerColor,
            opacity: currentMarkerOpacity
        });
        drawCanvas();
        return;
    }
});

/* ============================================================
   ペンツール描画
============================================================ */
let drawing = false;

canvas.addEventListener("mousedown", (e) => {
    if (!penMode) return;

    drawing = true;

    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / zoom;
    const y = (e.clientY - rect.top) / zoom;

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
   右クリックメニュー
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

    /* ---- 矢印スタンプ判定 ---- */
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
   コメント
============================================================ */
document.getElementById("addCommentBtn").onclick = () => {
    const id = document.getElementById("markerMenu").dataset.markerId;
    const text = prompt("コメントを入力");
    if (!text) return;

    socket.emit("addComment", {
        markerId: id,
        text
    });

    document.getElementById("markerMenu").classList.add("hidden");
};

socket.on("commentAdded", data => {
    const { markerId, markerName, markerColor, text } = data;

    const list = document.getElementById("commentList");

    const item = document.createElement("div");
    item.className = "commentItem";
    item.dataset.markerId = markerId;

    item.innerHTML = `
        <span style="color:${markerColor}">${markerName}</span>：${text}
    `;

    list.appendChild(item);
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
        t.text = newText;
        drawCanvas();
    }

    document.getElementById("textMenu").classList.add("hidden");
};

document.getElementById("deleteTextBtn").onclick = () => {
    const id = document.getElementById("textMenu").dataset.textId;
    texts = texts.filter(t => t.id !== id);
    drawCanvas();
    document.getElementById("textMenu").classList.add("hidden");
};

/* ============================================================
   矢印スタンプ操作
============================================================ */
document.getElementById("arrowRotateBtn").onclick = () => {
    const id = document.getElementById("arrowMenu").dataset.arrowId;
    const a = arrows.find(x => x.id === id);
    if (!a) return;

    a.angle += Math.PI / 6; // 30°
    drawCanvas();

    document.getElementById("arrowMenu").classList.add("hidden");
};

document.getElementById("arrowScaleUpBtn").onclick = () => {
    const id = document.getElementById("arrowMenu").dataset.arrowId;
    const a = arrows.find(x => x.id === id);
    if (!a) return;

    a.scale *= 1.1;
    drawCanvas();

    document.getElementById("arrowMenu").classList.add("hidden");
};

document.getElementById("arrowScaleDownBtn").onclick = () => {
    const id = document.getElementById("arrowMenu").dataset.arrowId;
    const a = arrows.find(x => x.id === id);
    if (!a) return;

    a.scale *= 0.9;
    drawCanvas();

    document.getElementById("arrowMenu").classList.add("hidden");
};

document.getElementById("arrowDeleteBtn").onclick = () => {
    const id = document.getElementById("arrowMenu").dataset.arrowId;
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

    /* ---- ペンツール ---- */
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
        ctx.font = "14px sans-serif";
        ctx.fillText(m.name, m.x + 12, m.y + 4);

        ctx.restore();
    });

    /* ---- 矢印スタンプ ---- */
    arrows.forEach(a => {
        ctx.save();
        ctx.translate(a.x, a.y);
        ctx.rotate(a.angle);
        ctx.scale(a.scale, a.scale);
        ctx.globalAlpha = a.opacity;

        ctx.beginPath();
        ctx.moveTo(0, -20);
        ctx.lineTo(15, 20);
        ctx.lineTo(-15, 20);
        ctx.closePath();

        ctx.fillStyle = a.color;
        ctx.fill();

        ctx.restore();
    });

    /* ---- テキスト ---- */
    texts.forEach(t => {
        ctx.save();

        ctx.font = `${t.size}px sans-serif`;
        ctx.fillStyle = t.color;

        ctx.shadowColor = "rgba(255,255,255,0.8)";
        ctx.shadowBlur = 10;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;

        ctx.fillText(t.text, t.x, t.y);

        ctx.restore();
    });

    ctx.restore();
}

/* ============================================================
   画像ドラッグ＆ドロップ
============================================================ */
document.body.addEventListener("dragover", (e) => {
    e.preventDefault();
});

document.body.addEventListener("drop", (e) => {
    e.preventDefault();

    const file = e.dataTransfer.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
        const img = new Image();
        img.onload = () => {
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);
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
