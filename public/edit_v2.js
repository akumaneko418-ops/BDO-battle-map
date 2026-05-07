const socket = io();

let markers = [];
let texts = [];
let markerComments = {};

let currentMarkerId = null;
let currentTextColor = "#000000";
let currentTextSize = 16;
let textAddMode = false;

const canvas = document.getElementById("mapCanvas");
const ctx = canvas.getContext("2d");

/* ============================
   マーカー色選択
   ============================ */
document.querySelectorAll(".colorOption").forEach(opt => {
    opt.onclick = () => {
        document.querySelectorAll(".colorOption").forEach(o => o.classList.remove("selected"));
        opt.classList.add("selected");
    };
});

/* ============================
   テキスト色選択（黒・赤・青）
   ============================ */
document.querySelectorAll(".textColorOption").forEach(opt => {
    opt.onclick = () => {
        currentTextColor = opt.style.background;
        document.querySelectorAll(".textColorOption").forEach(o => o.classList.remove("selected"));
        opt.classList.add("selected");
    };
});

/* ============================
   テキストサイズ選択
   ============================ */
document.getElementById("textSize").onchange = (e) => {
    currentTextSize = parseInt(e.target.value);
};

/* ============================
   テキスト追加モード
   ============================ */
document.getElementById("addTextModeBtn").onclick = () => {
    textAddMode = true;
};

/* ============================
   キャンバス左クリック
   ============================ */
canvas.addEventListener("click", (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    /* ---- テキスト追加モード ---- */
    if (textAddMode) {
        const text = document.getElementById("textInput").value.trim();
        if (!text) return;

        const id = "text_" + Date.now();

        texts.push({
            id,
            text,
            x,
            y,
            color: currentTextColor,
            size: currentTextSize,
            highlight: false
        });

        textAddMode = false;
        drawCanvas();
        return;
    }

    /* ---- マーカー追加 ---- */
    const name = document.getElementById("markerName").value.trim();
    if (!name) return;

    const selectedColor = document.querySelector(".colorOption.selected");
    if (!selectedColor) return;

    const color = selectedColor.style.background;

    const id = "marker_" + Date.now();

    markers.push({
        id,
        name,
        x,
        y,
        color,
        highlight: false
    });

    drawCanvas();
});

/* ============================
   右クリックメニュー（マーカー & テキスト）
   ============================ */
canvas.addEventListener("contextmenu", (e) => {
    e.preventDefault();

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

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

    /* ---- マーカー判定 ---- */
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
});

/* ============================
   マーカー → コメント追加
   ============================ */
document.getElementById("addCommentBtn").onclick = () => {
    const id = document.getElementById("markerMenu").dataset.markerId;
    currentMarkerId = id;

    const text = prompt("コメントを入力");
    if (!text) return;

    socket.emit("addComment", {
        markerId: id,
        text
    });

    document.getElementById("markerMenu").classList.add("hidden");
};

/* ============================
   マーカー削除
   ============================ */
document.getElementById("deleteMarkerBtn").onclick = () => {
    const id = document.getElementById("markerMenu").dataset.markerId;
    markers = markers.filter(m => m.id !== id);
    delete markerComments[id];
    drawCanvas();
    document.getElementById("markerMenu").classList.add("hidden");
};

/* ============================
   テキスト編集
   ============================ */
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

/* ============================
   テキスト削除
   ============================ */
document.getElementById("deleteTextBtn").onclick = () => {
    const id = document.getElementById("textMenu").dataset.textId;
    texts = texts.filter(t => t.id !== id);
    drawCanvas();
    document.getElementById("textMenu").classList.add("hidden");
};

/* ============================
   コメント受信
   ============================ */
socket.on("commentAdded", data => {
    const { markerId, markerName, markerColor, text } = data;

    const list = document.getElementById("commentList");

    const item = document.createElement("div");
    item.className = "commentItem";
    item.dataset.markerId = markerId;

    item.innerHTML = `
        <span class="commentMarkerName" style="color:${markerColor}">
            ${markerName}
        </span>
        ：${text}
    `;

    list.appendChild(item);

    item.addEventListener("mouseenter", () => highlightMarker(markerId, true));
    item.addEventListener("mouseleave", () => highlightMarker(markerId, false));
});

/* ============================
   マーカー強調
   ============================ */
function highlightMarker(id, on) {
    const m = markers.find(x => x.id === id);
    if (!m) return;
    m.highlight = on;
    drawCanvas();
}

/* ============================
   描画
   ============================ */
function drawCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    /* ---- マーカー ---- */
    markers.forEach(m => {
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.highlight ? 14 : 10, 0, Math.PI * 2);
        ctx.fillStyle = m.color;
        ctx.fill();

        ctx.fillStyle = "black";
        ctx.font = "14px sans-serif";
        ctx.fillText(m.name, m.x + 12, m.y + 4);
    });

    /* ---- テキスト（Glow + Shadow） ---- */
    texts.forEach(t => {

        ctx.save();

        const size = t.highlight ? t.size + 4 : t.size;
        ctx.font = `${size}px sans-serif`;
        ctx.fillStyle = t.color;

        /* 外側光彩（Outer Glow） */
        ctx.shadowColor = "rgba(255,255,255,0.8)";
        ctx.shadowBlur = t.highlight ? 18 : 10;

        /* ドロップシャドウ */
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;

        ctx.fillText(t.text, t.x, t.y);

        ctx.restore();
    });
}

/* ============================
   クリックでメニューを閉じる
   ============================ */
document.addEventListener("click", () => {
    document.getElementById("markerMenu").classList.add("hidden");
    document.getElementById("textMenu").classList.add("hidden");
});
