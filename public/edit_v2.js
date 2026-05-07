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
   描画処理（中央基準ズーム）
============================================================ */
function drawCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();

    // ★ 中央基準ズーム（ズレ修正済み）
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(-canvas.width / 2, -canvas.height / 2);

    if (backgroundImage) {
        ctx.drawImage(backgroundImage, 0, 0);
    }

    /* ===== ペン描画 ===== */
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

    /* ===== 砦マーカー ===== */
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
/* ======== ▲▲▲ Part 1 からの続き ▲▲▲ ======== */

/* ===== 矢印スタンプ ===== */
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

/* ===== テキスト描画 ===== */
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

/* ===== テキスト入力中カーソル ===== */
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

/* ======== ▲▲▲ Part 2 からの続き ▲▲▲ ======== */

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
    document.getElementById("markerMenu").classList.add("hidden");
    document.getElementById("textMenu").classList.add("hidden");
    document.getElementById("arrowMenu").classList.add("hidden");
});

/* ============================================================
   初期状態
============================================================ */
updateUndoRedoButtons();
drawCanvas();

/* ======== ★★★ Part 3 / 3（END） ★★★ ======== */
