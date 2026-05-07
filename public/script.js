const socket = io();

const canvas = document.getElementById("mapCanvas");
const ctx = canvas.getContext("2d");

let markers = [];
let markerComments = {};
let currentMarkerId = null;

// マーカーを描画
function drawMarkers() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  markers.forEach(m => {
    ctx.beginPath();
    ctx.arc(m.x, m.y, 8, 0, Math.PI * 2);
    ctx.fillStyle = "red";
    ctx.fill();
  });
}

// マーカーをクリックしたら選択
canvas.addEventListener("click", (e) => {
  const x = e.offsetX;
  const y = e.offsetY;

  const marker = markers.find(m => Math.hypot(m.x - x, m.y - y) < 10);
  if (marker) {
    currentMarkerId = marker.id;
    console.log("選択中のマーカー:", currentMarkerId);
  }
});

// マーカーにホバーしたらコメント表示
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
    .map(c => `[${new Date(c.timestamp).toLocaleTimeString()}] ${c.nickname}: ${c.message}`)
    .join("<br>");
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

// 初期マーカー（例）
markers = [
  { id: "m1", x: 200, y: 300 },
  { id: "m2", x: 500, y: 400 },
  { id: "m3", x: 800, y: 200 }
];

drawMarkers();
