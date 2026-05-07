// edit.js
const socket = io();
const canvas = document.getElementById("mapCanvas");
const ctx = canvas.getContext("2d");
const imageTitleInput = document.getElementById("imageTitle");
const saveImageBtn = document.getElementById("saveImageBtn");

let markers = [];
let markerComments = {};
let currentMarkerId = null;
let selectedColor = "#ff7eb9";
let imageLoaded = false;
let bgImage = null;

let dragging = false;
let dragTarget = null;
let hoverMarkerId = null;

// =========================
// ニックネーム → 色
// =========================
const nameColors = {};
function getColorForName(name) {
    if (nameColors[name]) return nameColors[name];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash) % 360;
    const color = `hsl(${hue}, 70%, 60%)`;
    nameColors[name] = color;
    return color;
}

// =========================
// カラーピッカー
// =========================
document.querySelectorAll(".colorOption").forEach(el => {
    el.addEventListener("click", () => {
        document.querySelectorAll(".colorOption").forEach(c => c.classList.remove("selectedColor"));
        el.classList.add("selectedColor");
        selectedColor = el.style.background;
    });
});
const defaultColor = document.getElementById("pink");
if (defaultColor) defaultColor.classList.add("selectedColor");

// =========================
// 描画
// =========================
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!imageLoaded) {
        ctx.fillStyle = "#f5f5f5";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#999";
        ctx.font = "20px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("ここに画像をドラッグ＆ドロップ", canvas.width / 2, canvas.height / 2);
        return;
    }

    ctx.drawImage(bgImage, 0, 0, canvas.width, canvas.height);

    markers.forEach(m => {
        ctx.beginPath();
        ctx.arc(m.x, m.y, 14, 0, Math.PI * 2);
        ctx.fillStyle = m.color;
        ctx.fill();

        ctx.fillStyle = "black";
        ctx.font = "bold 14px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(m.label || "", m.x, m.y);
    });
}

// =========================
// マーカー取得
// =========================
function getMarkerAt(x, y) {
    return markers.find(m => Math.hypot(m.x - x, m.y - y) < 14);
}

// =========================
// 画像ドラッグ＆ドロップ
// =========================
const canvasArea = document.querySelector(".canvas-area");
if (canvasArea) {
    canvasArea.addEventListener("dragenter", (e) => {
        e.preventDefault();
        e.stopPropagation();
        canvasArea.classList.add("drag-over");
    });

    canvasArea.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.stopPropagation();
    });

    canvasArea.addEventListener("dragleave", (e) => {
        e.preventDefault();
        e.stopPropagation();
        canvasArea.classList.remove("drag-over");
    });

    canvasArea.addEventListener("drop", (e) => {
        e.preventDefault();
        e.stopPropagation();
        canvasArea.classList.remove("drag-over");

        const file = e.dataTransfer.files[0];
        if (!file) return;
        if (!file.type.startsWith("image/")) {
            alert("画像ファイルをドロップしてください");
            return;
        }

        const reader = new FileReader();
        reader.onload = (ev) => {
            const img = new Image();
            img.onload = () => {
                bgImage = img;
                imageLoaded = true;
                canvas.width = img.width;
                canvas.height = img.height;
                markers = [];
                markerComments = {};
                currentMarkerId = null;
                draw();
            };
            img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
    });
}

// =========================
// ★ 右クリックメニュー
// =========================
canvas.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    if (!imageLoaded) return;

    const x = e.offsetX;
    const y = e.offsetY;
    const marker = getMarkerAt(x, y);
    if (!marker) return;

    currentMarkerId = marker._id;

    const menu = document.getElementById("markerMenu");
    menu.style.left = e.pageX + "px";
    menu.style.top = e.pageY + "px";
    menu.classList.remove("hidden");
    menu.dataset.markerId = marker._id;
});

// 右クリックメニュー内のイベントをキャンバスに伝播させない
(function () {
    const menu = document.getElementById("markerMenu");
    if (menu) {
        ["mousedown", "mouseup", "click"].forEach(ev => {
            menu.addEventListener(ev, (e) => {
                e.stopPropagation();
            });
        });
    }
})();

document.addEventListener("click", () => {
    document.getElementById("markerMenu").classList.add("hidden");
});

// コメント追加
document.getElementById("addCommentBtn").onclick = () => {
    const id = document.getElementById("markerMenu").dataset.markerId;
    currentMarkerId = id;
    document.getElementById("message").focus();
    document.getElementById("markerMenu").classList.add("hidden");
};

// マーカー削除（コメントも削除）
document.getElementById("deleteMarkerBtn").onclick = () => {
    const id = document.getElementById("markerMenu").dataset.markerId;
    socket.emit("deleteMarker", id);
    delete markerComments[id];
    if (currentMarkerId === id) currentMarkerId = null;
    document.getElementById("markerMenu").classList.add("hidden");
};

// =========================
// キャンバス操作
// =========================
canvas.addEventListener("mousedown", (e) => {
    if (e.button === 2) return; // 右クリックは無視

    if (!imageLoaded) {
        alert("先に画像を追加してください");
        return;
    }

    const x = e.offsetX;
    const y = e.offsetY;
    const marker = getMarkerAt(x, y);

    if (marker) {
        dragging = true;
        dragTarget = marker;
        currentMarkerId = marker._id;
        return;
    }

    const label = document.getElementById("markerName").value.trim();
    const newMarker = { x, y, color: selectedColor, label };
    socket.emit("addMarker", newMarker);
});

canvas.addEventListener("mousemove", (e) => {
    if (!imageLoaded) {
        draw();
        return;
    }

    const x = e.offsetX;
    const y = e.offsetY;

    if (dragging && dragTarget) {
        dragTarget.x = x;
        dragTarget.y = y;
        draw();
        return;
    }

    const marker = getMarkerAt(x, y);
    hoverMarkerId = marker ? marker._id : null;
    draw();

    const tooltip = document.getElementById("tooltip");
    if (!marker) {
        tooltip.style.display = "none";
        return;
    }

    const comments = markerComments[marker._id] || [];
    const myName = document.getElementById("nickname").value;

    tooltip.style.left = e.pageX + "px";
    tooltip.style.top = e.pageY + "px";
    tooltip.style.display = "block";

    tooltip.innerHTML = comments
        .map(c => {
            const color = marker.color;
            return `
                <div class="commentItem" data-marker-id="${marker._id}" data-comment-id="${c._id}">
                    <span style="color:${color}; font-weight:bold;">(${marker.label})：</span>
                    <span>${c.message}</span>
                </div>
            `;
        })
        .join("");
});

canvas.addEventListener("mouseup", (e) => {
    if (e.button === 2) return; // 右クリックは無視

    if (dragTarget) {
        socket.emit("moveMarker", {
            _id: dragTarget._id,
            x: dragTarget.x,
            y: dragTarget.y
        });
    }
    dragging = false;
    dragTarget = null;
});

canvas.addEventListener("mouseleave", () => {
    dragging = false;
    dragTarget = null;
});

// =========================
// コメント送信
// =========================
document.getElementById("sendBtn").addEventListener("click", () => {
    if (!currentMarkerId) {
        alert("先にマーカーを選択してください");
        return;
    }

    const nickname = document.getElementById("nickname").value.trim();
    const message = document.getElementById("message").value.trim();

    if (!nickname || !message) {
        alert("ニックネームとコメントを入力してください");
        return;
    }

    const data = {
        markerId: currentMarkerId,
        nickname,
        message,
        timestamp: Date.now()
    };

    socket.emit("chat", data);
    document.getElementById("message").value = "";
});

// =========================
// コメント削除 / 編集（右クリック削除に統合済み）
// =========================
window.deleteComment = function (id) {
    socket.emit("deleteComment", id);
};

// =========================
// 保存処理
// =========================
saveImageBtn.addEventListener("click", async () => {
    if (!imageLoaded) {
        alert("先に画像を追加してください");
        return;
    }

    const title = imageTitleInput.value.trim();
    if (!title) {
        alert("画像タイトルを入力してください");
        return;
    }

    const pngData = canvas.toDataURL("image/png");

    const commentsArray = [];
    for (const markerId in markerComments) {
        (markerComments[markerId] || []).forEach(c => {
            commentsArray.push(c);
        });
    }

    const payload = {
        title,
        image: pngData,
        markers,
        comments: commentsArray
    };

    try {
        const res = await fetch("/save", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        if (!res.ok) throw new Error("保存に失敗しました");

        alert("保存しました");
    } catch (e) {
        console.error(e);
        alert("保存中にエラーが発生しました");
    }
});

// =========================
// 再編集ロード
// =========================
(function loadIfEditMode() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");
    if (!id) {
        draw();
        return;
    }

    fetch(`/load?id=${id}`)
        .then(res => res.json())
        .then(data => {
            imageTitleInput.value = data.title || "";

            const img = new Image();
            img.onload = () => {
                bgImage = img;
                imageLoaded = true;
                canvas.width = img.width;
                canvas.height = img.height;

                markers = data.markers || [];
                markerComments = {};

                (data.comments || []).forEach(c => {
                    if (!markerComments[c.markerId]) markerComments[c.markerId] = [];
                    markerComments[c.markerId].push(c);
                });

                draw();
            };
            img.src = data.image;
        })
        .catch(err => {
            console.error(err);
            draw();
        });
})();

// =========================
// Socket.IO イベント
// =========================
socket.on("loadMarkers", (data) => {
    markers = data;
    draw();
});

socket.on("addMarker", (marker) => {
    markers.push(marker);
    draw();
});

socket.on("moveMarker", (data) => {
    const m = markers.find(m => m._id === data._id);
    if (m) {
        m.x = data.x;
        m.y = data.y;
    }
    draw();
});

socket.on("deleteMarker", (id) => {
    markers = markers.filter(m => m._id !== id);
    delete markerComments[id];
    if (currentMarkerId === id) currentMarkerId = null;
    draw();
});

socket.on("pastComments", (grouped) => {
    markerComments = grouped || {};
});

socket.on("chat", (data) => {
    if (!markerComments[data.markerId]) markerComments[data.markerId] = [];
    markerComments[data.markerId].push(data);
});

socket.on("deleteComment", (id) => {
    for (const key in markerComments) {
        markerComments[key] = markerComments[key].filter(c => c._id !== id);
    }
});

socket.on("editComment", (data) => {
    const { id, message } = data;
    for (const key in markerComments) {
        const list = markerComments[key];
        if (!list) continue;
        const target = list.find(c => c._id === id);
        if (target) {
            target.message = message;
            break;
        }
    }
});
