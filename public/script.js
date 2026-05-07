const socket = io();

const canvas = document.getElementById("mapCanvas");
const ctx = canvas.getContext("2d");

let markers = [];
let markerComments = {};
let currentMarkerId = null;

// ニックネーム → 色
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

// ★ マーカー色選択
let selectedColor = "#ff7eb9"; // 初期はピンク

document.querySelectorAll(".colorOption").forEach(el => {
  el.addEventListener("click", () => {
    document.querySelectorAll(".colorOption").forEach(c => c.classList.remove("selectedColor"));
    el.classList.add("selectedColor");
    selectedColor = el.style.background;
  });
});

// 初期選択
document.getElementById("pink").classList.add("selectedColor");

// マーカー描画
function drawMarkers() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  markers.forEach(m => {
    ctx.beginPath();
    ctx.arc(m.x, m.y, 10, 0, Math.PI * 2);
    ctx.fillStyle = m.color;
    ctx.fill();
  });
}

// ★ キャンバスクリック → マーカー追加
canvas.addEventListener("click", (e) => {
  const x = e.offsetX;
  const y = e.offsetY;

  // 既存マーカー選択
  const marker = markers.find(m => Math.hypot(m.x - x, m.y - y) < 12);
  if (marker) {
    currentMarkerId = marker.id;
    console.log("選択中のマーカー:", currentMarkerId);
    return;
  }

  // 新規マーカー作成
  const id = "m" + (markers.length + 1);

  markers.push({
    id,
    x,
    y,
    color: selectedColor
  });

  currentMarkerId = id;
  drawMarkers();
});

// ホバーでコメント表示
canvas.addEventListener("mousemove", (e) => {
  const x = e.offsetX;
  const y = e.offsetY;

  const marker = markers.find(m => Math.hypot(m.x - x, m.y - y) < 12);
  const tooltip = document.getElementById("tooltip");

  if (!marker) {
    tooltip.style.display = "none";
    return;
  }

  const comments = markerComments[marker.id] || [];

  tooltip.style.left = e.pageX + "px";
  tooltip.style.top = e.pageY + "px";
  tooltip.style.display = "block";

  tooltip.innerHTML = comments
    .map(c => {
      const color = getColorForName(c.nickname);
      const canDelete = (c.nickname === document.getElementById("nickname").value);

      return `
        <div style="color:${color}">
          [${new Date(c.timestamp).toLocaleTimeString()}] 
          <b>${c.nickname}</b>: ${c.message}
          ${canDelete ? `<span class="deleteBtn" onclick="deleteComment('${c._id}')">削除</span>` : ""}
        </div>
      `;
    })
    .join("");
});

// コメント削除
function deleteComment(id) {
  socket.emit("deleteComment", id);
}

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

// 初期マーカーなし
markers = [];
drawMarkers();


