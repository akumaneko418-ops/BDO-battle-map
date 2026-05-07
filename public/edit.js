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

let hoverMarkerId = null; // ホバー中のマーカーID（削除ボタン表示用）

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
    // 画像がないときのガイド表示
    ctx.fillStyle = "#f5f5f5";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#999";
    ctx.font = "20px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("ここに画像をドラッグ＆ドロップ", canvas.width / 2, canvas.height / 2);
    return;
  }

  // 背景画像
  ctx.drawImage(bgImage, 0, 0, canvas.width, canvas.height);

  // マーカー
  markers.forEach(m => {
    // 本体
    ctx.beginPath();
    ctx.arc(m.x, m.y, 14, 0, Math.PI * 2);
    ctx.fillStyle = m.color;
    ctx.fill();

    // 名前
    ctx.fillStyle = "black";
    ctx.font = "bold 14px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(m.label || "", m.x, m.y);

    // ホバー中なら削除ボタン（×）を表示
    if (m._id === hoverMarkerId) {
      const bx = m.x + 14;
      const by = m.y - 14;
      const size = 16;

      ctx.fillStyle = "#fff";
      ctx.fillRect(bx - size / 2, by - size / 2, size, size);
      ctx.strokeStyle = "#000";
      ctx.strokeRect(bx - size / 2, by - size / 2, size, size);

      ctx.beginPath();
      ctx.moveTo(bx - 5, by - 5);
      ctx.lineTo(bx + 5, by + 5);
      ctx.moveTo(bx + 5, by - 5);
      ctx.lineTo(bx - 5, by + 5);
      ctx.stroke();
    }
  });
}

// =========================
// マーカー取得
// =========================
function getMarkerAt(x, y) {
  return markers.find(m => Math.hypot(m.x - x, m.y - y) < 14);
}

// 削除ボタンの当たり判定
function isOnDeleteButton(marker, x, y) {
  const bx = marker.x + 14;
  const by = marker.y - 14;
  const size = 16;
  return (
    x >= bx - size / 2 &&
    x <= bx + size / 2 &&
    y >= by - size / 2 &&
    y <= by + size / 2
  );
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
// キャンバス操作
// =========================
canvas.addEventListener("mousedown", (e) => {
  if (!imageLoaded) {
    alert("先に画像を追加してください");
    return;
  }

  const x = e.offsetX;
  const y = e.offsetY;

  const marker = getMarkerAt(x, y);
  if (marker) {
    // 削除ボタン判定
    if (isOnDeleteButton(marker, x, y)) {
      socket.emit("deleteMarker", marker._id);
      return;
    }

    // ドラッグ開始
    dragging = true;
    dragTarget = marker;
    currentMarkerId = marker._id;
    return;
  }

  // 新規マーカー追加
  const label = document.getElementById("markerName").value.trim();
  const newMarker = {
    x,
    y,
    color: selectedColor,
    label
  };
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

  // ホバー中のマーカー判定（削除ボタン表示用）
  const marker = getMarkerAt(x, y);
  hoverMarkerId = marker ? marker._id : null;
  draw();

  // コメント用 tooltip 更新
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
      const color = getColorForName(c.nickname);
      const isMine = (c.nickname === myName);

      return `
        <div class="commentItem" data-marker-id="${marker._id}" data-comment-id="${c._id}" style="color:${color}">
          [${new Date(c.timestamp).toLocaleTimeString()}] 
          <b>${c.nickname}</b>: <span class="commentText">${c.message}</span>
          ${
            isMine
              ? `<span class="editBtn" onclick="editComment('${c._id}')">編集</span>
                 <span class="deleteBtn" onclick="deleteComment('${c._id}')">削除</span>`
              : `<span class="deleteBtn disabled">削除不可</span>`
          }
        </div>
      `;
    })
    .join("");
});

canvas.addEventListener("mouseup", () => {
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
// コメントにホバー → マーカー強調
// =========================
document.addEventListener("mousemove", (e) => {
  const item = e.target.closest(".commentItem");

  markers.forEach(m => m.highlight = false);

  if (item) {
    const markerId = item.dataset.markerId;
    const target = markers.find(m => m._id === markerId);
    if (target) target.highlight = true;
  }

  draw();
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
// コメント削除 / 編集（本人のみ）
// =========================
window.deleteComment = function (id) {
  socket.emit("deleteComment", id);
};

window.editComment = function (id) {
  // 現在の内容を tooltip から取得
  const el = document.querySelector(`.commentItem[data-comment-id="${id}"] .commentText`);
  if (!el) return;

  const current = el.textContent;
  const next = prompt("コメントを編集", current);
  if (next === null) return;
  const trimmed = next.trim();
  if (!trimmed) {
    alert("空のコメントにはできません");
    return;
  }

  socket.emit("editComment", { id, message: trimmed });
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

  // PNG データ
  const pngData = canvas.toDataURL("image/png");

  // コメントを配列に変換
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

    if (!res.ok) {
      throw new Error("保存に失敗しました");
    }

    const result = await res.json();
    alert("保存しました");
    // 必要なら一覧へ戻る
    // window.location.href = "/";
  } catch (e) {
    console.error(e);
    alert("保存中にエラーが発生しました");
  }
});

// =========================
// 再編集用ロード（?id=xxx）
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
