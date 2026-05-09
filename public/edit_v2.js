// ====================== 初期変数 ======================
let canvas = document.getElementById("mapCanvas");
let ctx = canvas.getContext("2d");

let backgroundImage = null;
let markers = [];
let arrows = [];
let texts = [];
let penPaths = [];
let markerComments = {}; // ★ コメントは edit_state に統合

let undoStack = [];
let redoStack = [];

let currentTool = "marker";
let currentColor = "#ff66cc";
let currentSize = 20;
let currentOpacity = 1.0;

let isDrawing = false;
let currentPath = [];

let selectedMarker = null;
let selectedArrow = null;
let selectedText = null;

let socket = io();

// ====================== 状態取得 ======================
function getCurrentState() {
    return {
        backgroundImage: backgroundImage ? backgroundImage.src : null,
        markers: structuredClone(markers),
        arrows: structuredClone(arrows),
        texts: structuredClone(texts),
        penPaths: structuredClone(penPaths),
        markerComments: structuredClone(markerComments) // ★ コメントも同期
    };
}

// ====================== 状態復元 ======================
function restoreState(s) {
    if (!s) return;

    // 背景画像
    if (s.backgroundImage) {
        const img = new Image();
        img.onload = () => {
            backgroundImage = img;
            drawCanvas();
        };
        img.src = s.backgroundImage;
    }

    markers = s.markers || [];
    arrows = s.arrows || [];
    texts = s.texts || [];
    penPaths = s.penPaths || [];
    markerComments = s.markerComments || {}; // ★ コメント復元

    drawCanvas();
    updateCommentList();
}

// ====================== リアルタイム同期 ======================
function broadcastState() {
    socket.emit("edit_state", getCurrentState());
}

socket.on("edit_state", s => {
    restoreState(s);
});

// ====================== 描画処理 ======================
function drawCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 背景画像
    if (backgroundImage) {
        ctx.drawImage(backgroundImage, 0, 0, canvas.width, canvas.height);
    }

    // ペン描画
    penPaths.forEach(path => {
        ctx.strokeStyle = path.color;
        ctx.lineWidth = path.size;
        ctx.globalAlpha = path.opacity;

        ctx.beginPath();
        path.points.forEach((p, i) => {
            if (i === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
        });
        ctx.stroke();
        ctx.globalAlpha = 1.0;
    });

    // 矢印描画
    arrows.forEach(a => {
        drawArrow(a);
    });

    // マーカー描画
    markers.forEach(m => {
        ctx.save();
        ctx.globalAlpha = m.opacity ?? 1.0;

        // 円
        ctx.fillStyle = m.color;
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.size, 0, Math.PI * 2);
        ctx.fill();

        // ★ 中央に名前を描画（白文字・サイズ比例）
        if (m.name) {
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillStyle = "#fff";
            ctx.font = `700 ${m.size * 1.2}px "Noto Sans JP","Yu Gothic",sans-serif`;

            ctx.shadowColor = "rgba(0,0,0,0.6)";
            ctx.shadowBlur = 6;

            ctx.fillText(m.name, m.x, m.y);
        }

        ctx.restore();
    });

    // テキスト描画
    texts.forEach(t => {
        ctx.save();
        ctx.globalAlpha = t.opacity ?? 1.0;

        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillStyle = t.color;
        ctx.font = `${t.size}px "Noto Sans JP","Yu Gothic",sans-serif`;

        ctx.fillText(t.text, t.x, t.y);
        ctx.restore();
    });
}

// ====================== マーカー操作 ======================

// マーカー追加
function addMarker(x, y) {
    saveHistory();

    markers.push({
        x,
        y,
        color: currentColor,
        size: currentSize,
        opacity: currentOpacity,
        name: "" // ★ 名前は空で開始
    });

    drawCanvas();
    broadcastState();
}

// マーカー選択
function getMarkerAt(x, y) {
    return markers.find(m => {
        const dx = x - m.x;
        const dy = y - m.y;
        return Math.sqrt(dx * dx + dy * dy) <= m.size;
    });
}

// マーカー移動
function moveMarker(marker, x, y) {
    saveHistory();
    marker.x = x;
    marker.y = y;

    drawCanvas();
    broadcastState();
}

// マーカー削除
function deleteMarker(marker) {
    saveHistory();
    markers = markers.filter(m => m !== marker);

    // コメントも削除
    delete markerComments[marker._id];

    drawCanvas();
    broadcastState();
    updateCommentList();
}

// ====================== 右クリックメニュー ======================

const contextMenu = document.getElementById("contextMenu");
let contextTarget = null;

canvas.addEventListener("contextmenu", e => {
    e.preventDefault();

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const m = getMarkerAt(x, y);
    if (!m) return;

    contextTarget = m;

    contextMenu.style.left = `${e.clientX}px`;
    contextMenu.style.top = `${e.clientY}px`;
    contextMenu.style.display = "block";
});

document.addEventListener("click", () => {
    contextMenu.style.display = "none";
});

// ★ 名前変更
document.getElementById("renameMarkerBtn").onclick = () => {
    if (!contextTarget) return;

    const newName = prompt("新しい砦の名前を入力してください：");
    if (!newName) return;

    saveHistory();
    contextTarget.name = newName;

    drawCanvas();
    broadcastState();
    updateCommentList();
};

// 削除
document.getElementById("deleteMarkerBtn").onclick = () => {
    if (!contextTarget) return;
    deleteMarker(contextTarget);
};
// ====================== テキストツール ======================

function addText(x, y) {
    const text = prompt("テキストを入力してください：");
    if (!text) return;

    saveHistory();

    texts.push({
        x,
        y,
        text,
        color: currentColor,
        size: currentSize * 2,
        opacity: currentOpacity
    });

    drawCanvas();
    broadcastState();
}

function getTextAt(x, y) {
    return texts.find(t => {
        const width = ctx.measureText(t.text).width;
        const height = t.size;
        return x >= t.x && x <= t.x + width && y >= t.y && y <= t.y + height;
    });
}

function moveText(t, x, y) {
    saveHistory();
    t.x = x;
    t.y = y;

    drawCanvas();
    broadcastState();
}

// ====================== 矢印ツール ======================

function addArrow(startX, startY, endX, endY) {
    saveHistory();

    arrows.push({
        startX,
        startY,
        endX,
        endY,
        color: currentColor,
        size: currentSize,
        opacity: currentOpacity
    });

    drawCanvas();
    broadcastState();
}

function getArrowAt(x, y) {
    return arrows.find(a => {
        const dx = a.endX - a.startX;
        const dy = a.endY - a.startY;
        const length = Math.sqrt(dx * dx + dy * dy);
        if (length === 0) return false;

        const t = ((x - a.startX) * dx + (y - a.startY) * dy) / (length * length);
        if (t < 0 || t > 1) return false;

        const projX = a.startX + t * dx;
        const projY = a.startY + t * dy;

        const dist = Math.sqrt((x - projX) ** 2 + (y - projY) ** 2);
        return dist <= a.size + 4;
    });
}

function moveArrow(a, dx, dy) {
    saveHistory();

    a.startX += dx;
    a.startY += dy;
    a.endX += dx;
    a.endY += dy;

    drawCanvas();
    broadcastState();
}

function drawArrow(a) {
    ctx.save();
    ctx.globalAlpha = a.opacity ?? 1.0;
    ctx.strokeStyle = a.color;
    ctx.lineWidth = a.size;

    ctx.beginPath();
    ctx.moveTo(a.startX, a.startY);
    ctx.lineTo(a.endX, a.endY);
    ctx.stroke();

    const angle = Math.atan2(a.endY - a.startY, a.endX - a.startX);
    const headLen = a.size * 3;

    ctx.beginPath();
    ctx.moveTo(a.endX, a.endY);
    ctx.lineTo(
        a.endX - headLen * Math.cos(angle - Math.PI / 6),
        a.endY - headLen * Math.sin(angle - Math.PI / 6)
    );
    ctx.lineTo(
        a.endX - headLen * Math.cos(angle + Math.PI / 6),
        a.endY - headLen * Math.sin(angle + Math.PI / 6)
    );
    ctx.closePath();
    ctx.fillStyle = a.color;
    ctx.fill();

    ctx.restore();
}

// ====================== ペンツール ======================

canvas.addEventListener("mousedown", e => {
    if (currentTool !== "pen") return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    isDrawing = true;
    currentPath = [{ x, y }];
});

canvas.addEventListener("mousemove", e => {
    if (!isDrawing || currentTool !== "pen") return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    currentPath.push({ x, y });

    drawCanvas();
    ctx.strokeStyle = currentColor;
    ctx.lineWidth = currentSize;
    ctx.globalAlpha = currentOpacity;

    ctx.beginPath();
    currentPath.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();
    ctx.globalAlpha = 1.0;
});

canvas.addEventListener("mouseup", () => {
    if (!isDrawing || currentTool !== "pen") return;

    isDrawing = false;

    saveHistory();

    penPaths.push({
        color: currentColor,
        size: currentSize,
        opacity: currentOpacity,
        points: structuredClone(currentPath)
    });

    currentPath = [];

    drawCanvas();
    broadcastState();
});

// ====================== コメント同期（edit_state 統合版） ======================

// コメント追加
function addComment(marker, message) {
    if (!markerComments[marker._id]) {
        markerComments[marker._id] = [];
    }

    markerComments[marker._id].push({
        id: crypto.randomUUID(),
        message,
        time: Date.now()
    });

    saveHistory();
    updateCommentList();
    broadcastState();
}

// コメント編集
function editComment(markerId, commentId, newMessage) {
    const list = markerComments[markerId];
    if (!list) return;

    const c = list.find(x => x.id === commentId);
    if (!c) return;

    c.message = newMessage;

    saveHistory();
    updateCommentList();
    broadcastState();
}

// コメント削除
function deleteComment(markerId, commentId) {
    const list = markerComments[markerId];
    if (!list) return;

    markerComments[markerId] = list.filter(c => c.id !== commentId);

    saveHistory();
    updateCommentList();
    broadcastState();
}

// コメント欄更新
function updateCommentList() {
    const box = document.getElementById("commentList");
    box.innerHTML = "";

    markers.forEach(m => {
        const list = markerComments[m._id];
        if (!list || list.length === 0) return;

        const title = document.createElement("div");
        title.className = "comment-title";
        title.textContent = m.name || "無名の砦";
        box.appendChild(title);

        list.forEach(c => {
            const item = document.createElement("div");
            item.className = "comment-item";
            item.textContent = c.message;
            box.appendChild(item);
        });
    });
}
// ====================== Undo / Redo ======================

function saveHistory() {
    undoStack.push(getCurrentState());
    redoStack = [];
}

function undo() {
    if (undoStack.length === 0) return;

    redoStack.push(getCurrentState());
    const prev = undoStack.pop();
    restoreState(prev);
}

function redo() {
    if (redoStack.length === 0) return;

    undoStack.push(getCurrentState());
    const next = redoStack.pop();
    restoreState(next);
}

document.getElementById("undoBtn").onclick = undo;
document.getElementById("redoBtn").onclick = redo;


// ====================== 画像読み込み ======================

canvas.addEventListener("dragover", e => {
    e.preventDefault();
});

canvas.addEventListener("drop", e => {
    e.preventDefault();

    const file = e.dataTransfer.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
        const img = new Image();
        img.onload = () => {
            backgroundImage = img;
            saveHistory();
            drawCanvas();
            broadcastState();
        };
        img.src = reader.result;
    };
    reader.readAsDataURL(file);
});


// ====================== 保存処理 ======================

document.getElementById("saveAllBtn").onclick = async () => {
    if (!backgroundImage) {
        alert("背景画像がありません");
        return;
    }

    const title = prompt("保存名を入力してください：");
    if (!title) return;

    const imageData = canvas.toDataURL("image/png");

    const res = await fetch("/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            title,
            image: imageData,
            markers,
            comments: markerComments,
            category: "未分類"
        })
    });

    const json = await res.json();
    if (json.success) {
        alert("保存しました！");
    }
};


// ====================== キャンバスクリック処理 ======================

canvas.addEventListener("mousedown", e => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // ペンツールは Part2 で処理済み
    if (currentTool === "pen") return;

    // マーカー選択
    const m = getMarkerAt(x, y);
    if (m) {
        selectedMarker = m;
        return;
    }

    // テキスト選択
    const t = getTextAt(x, y);
    if (t) {
        selectedText = t;
        return;
    }

    // 矢印選択
    const a = getArrowAt(x, y);
    if (a) {
        selectedArrow = a;
        return;
    }

    // 新規追加
    if (currentTool === "marker") addMarker(x, y);
    if (currentTool === "text") addText(x, y);
});

canvas.addEventListener("mousemove", e => {
    if (!selectedMarker && !selectedText && !selectedArrow) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (selectedMarker) moveMarker(selectedMarker, x, y);
    if (selectedText) moveText(selectedText, x, y);
    if (selectedArrow) {
        const dx = x - selectedArrow.startX;
        const dy = y - selectedArrow.startY;
        moveArrow(selectedArrow, dx, dy);
    }
});

canvas.addEventListener("mouseup", () => {
    selectedMarker = null;
    selectedText = null;
    selectedArrow = null;
});

// ====================== UI 連動 ======================

// 砦マーカー
document.getElementById("markerSizeSlider").oninput = e => {
    currentSize = Number(e.target.value);
};

document.getElementById("markerOpacitySlider").oninput = e => {
    currentOpacity = Number(e.target.value);
    document.getElementById("markerOpacityValue").textContent = currentOpacity.toFixed(2);
};

// 矢印
document.getElementById("arrowSizeSlider").oninput = e => {
    currentSize = Number(e.target.value);
};

document.getElementById("arrowOpacitySlider").oninput = e => {
    currentOpacity = Number(e.target.value);
    document.getElementById("arrowOpacityValue").textContent = currentOpacity.toFixed(2);
};

// テキスト
document.getElementById("textSizeSlider").oninput = e => {
    currentSize = Number(e.target.value);
};

// ペン
document.getElementById("penOpacitySlider").oninput = e => {
    currentOpacity = Number(e.target.value);
    document.getElementById("penOpacityValue").textContent = currentOpacity.toFixed(2);
};

document.getElementById("penWidthSlider").oninput = e => {
    currentSize = Number(e.target.value);
};


// ====================== 初期描画 ======================
drawCanvas();
