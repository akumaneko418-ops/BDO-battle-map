const socket = io();

const canvas = document.getElementById("mapCanvas");
const ctx = canvas.getContext("2d");

let markers = [];
let markerComments = {};
let currentMarkerId = null;

// ニックネーム → 色 のキャッシュ
const nameColors = {};

// ニックネームから色を生成（ハッシュ）
function getColorForName(name) {
  if (nameColors[name]) return nameColors[name];

  // ハッシュ生成
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }

  // ハッシュ → HSL 色変換
  const hue = Math.abs(hash) % 360;
  const color = `hsl(${hue}, 70%, 60%)`;

  nameColors[name] = color;
  return color;
}

// マーカー描画
function drawMarkers() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  markers.forEach(m => {
    ctx.beginPath();
    ctx.arc(m.x, m.y, 8, 0, Math.PI * 2);
    ctx.fillStyle = "red";
    ctx.fill();
  });
}

// マーカー選択
canvas.addEventListener("click", (e) => {
  const x = e.offsetX;
  const y = e.offsetY;

  const marker = markers.find(m => Math.hypot(m.x - x, m.y - y) < 10);
  if (marker) {
    currentMarkerId = marker.id;
    console.log("選択中のマーカー:", currentMarkerId);
  }
});

// マーカーにホバー → コメント表示
canvas.addEventListener("mousemove", (e) => {
  const x = e.offsetX;
  const y = e.offsetY;

  const marker = markers.find(m => Math.hypot(m.x - x, m.y - y) < 10);
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
      return `<div style="color:${color}">
        [${new Date(c.timestamp).toLocaleTimeString()}] 
        <b>${c.nickname}</b>: ${c.message}
      </div>`;
    })
    .join("");
});

// コメント送信
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

// 過去コメント受信
socket.on("pastComments", (grouped) => {
  markerComments = grouped;
});

// 新規コメント受信
socket.on("chat", (data) => {
  if (!markerComments[data.markerId]) markerComments[data.markerId] = [];
  markerComments[data.markerId].push(data);
});

// 初期マーカー
markers = [
  { id: "m1", x: 200, y: 300 },
  { id: "m2", x: 500, y: 400 },
  { id: "m3", x: 800, y: 200 }
];

drawMarkers();

