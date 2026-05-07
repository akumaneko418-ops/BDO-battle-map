const socket = io();

const canvas = document.getElementById("mapCanvas");
const ctx = canvas.getContext("2d");

let markers = [];
let markerComments = {};
let currentMarkerId = null;

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
// マーカー色選択
// =========================
let selectedColor = "#ff7eb9";

document.querySelectorAll(".colorOption").forEach(el => {
  el.addEventListener("click", () => {
    document.querySelectorAll(".colorOption").forEach(c => c.classList.remove("selectedColor"));
    el.classList.add("selectedColor");
    selectedColor = el.style.background;
  });
});

document.getElementById("pink").classList.add("selectedColor");

// =========================
// マーカー描画（●＋名前＋強調表示）
// =========================
function drawMarkers() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  markers.forEach(m => {
    // 強調表示（白い縁取り）
    if (m.highlight) {
      ctx.beginPath();
      ctx.arc(m.x, m.y, 18, 0, Math.PI * 2);
      ctx.fillStyle = "white";
      ctx.fill();
    }

    // 本体
    ctx.beginPath();
    ctx.arc(m.x, m.y, 14, 0, Math.PI * 2);
    ctx.fillStyle = m.color;
    ctx.fill();

    // 名前（空でもOK）
    ctx.fillStyle = "black";
    ctx.font = "bold 14px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(m.label, m.x, m.y);
  });
}

// =========================
// マーカー判定
// =========================
function getMarkerAt(x, y) {
  return markers.find(m => Math.hypot(m.x - x, m.y - y) < 14);
}

// =========================
// マーカー追加（左クリック）
// =========================
canvas.addEventListener("click", (e) => {
  const x = e.offsetX;
  const y = e.offsetY;

  const marker = getMarkerAt(x, y);
  if (marker) {
    currentMarkerId = marker._id;
    return;
  }

  // ★ 未入力でもOK
  const label = document.getElementById("markerName").value.trim();

  const newMarker = {
    x,
    y,
    color: selectedColor,
    label // 空文字でもそのまま
  };

  socket.emit("addMarker", newMarker);
});

// =========================
// マーカー削除（右クリック）
// =========================
canvas.addEventListener("contextmenu", (e) => {
  e.preventDefault();

  const x = e.offsetX;
  const y = e.offsetY;

  const marker = getMarkerAt(x, y);
  if (!marker) return;

  socket.emit("deleteMarker", marker._id);
});

// =========================
// マーカー移動（ドラッグ）
// =========================
let dragging = false;
let dragTarget = null;

canvas.addEventListener("mousedown", (e) => {
  const x = e.offsetX;
  const y = e.offsetY;

  const marker = getMarkerAt(x, y);
  if (marker) {
    dragging = true;
    dragTarget = marker;
  }
});

canvas.addEventListener("mousemove", (e) => {
  if (!dragging || !dragTarget) return;

  dragTarget.x = e.offsetX;
  dragTarget.y = e.offsetY;

  drawMarkers();
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

// =========================
// コメント表示（ホバー）
// =========================
canvas.addEventListener("mousemove", (e) => {
  if (dragging) return;

  const x = e.offsetX;
  const y = e.offsetY;

  const marker = getMarkerAt(x, y);
  const tooltip = document.getElementById("tooltip");

  if (!marker) {
    tooltip.style.display = "none";
    return;
  }

  const comments = markerComments[marker._id] || [];

  tooltip.style.left = e.pageX + "px";
  tooltip.style.top = e.pageY + "px";
  tooltip.style.display = "block";

  tooltip.innerHTML = comments
    .map(c => {
      const color = getColorForName(c.nickname);
      const canDelete = (c.nickname === document.getElementById("nickname").value);

      return `
        <div class="commentItem" data-marker-id="${marker._id}" style="color:${color}">
          [${new Date(c.timestamp).toLocaleTimeString()}] 
          <b>${c.nickname}</b>: ${c.message}
          ${canDelete ? `<span class="deleteBtn" onclick="deleteComment('${c._id}')">削除</span>` : ""}
        </div>
      `;
    })
    .join("");
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

  drawMarkers();
});

// =========================
// コメント削除
// =========================
function deleteComment(id) {
  socket.emit("deleteComment", id);
}

// =========================
// コメント送信
// =========================
document.getElementById("sendBtn").addEventListener("click", () => {
  const nickname = document.getElementById("nickname").value;
  const message = document.getElementById("message").value;

  if (!currentMarkerId) {
    alert("先にマーカーを選択してください");
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
// Socket.IO
// =========================
socket.on("loadMarkers", (data) => {
  markers = data;
  drawMarkers();
});

socket.on("addMarker", (marker) => {
  markers.push(marker);
  drawMarkers();
});

socket.on("moveMarker", (data) => {
  const m = markers.find(m => m._id === data._id);
  if (m) {
    m.x = data.x;
    m.y = data.y;
  }
  drawMarkers();
});

socket.on("deleteMarker", (id) => {
  markers = markers.filter(m => m._id !== id);
  delete markerComments[id];
  drawMarkers();
});

socket.on("pastComments", (grouped) => {
  markerComments = grouped;
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

