import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

// 静的ファイル（publicフォルダ）を配信
app.use(express.static(path.join(__dirname, "public")));

// Socket.IO（リアルタイム通信）
io.on("connection", (socket) => {
  console.log("ユーザー接続:", socket.id);

  // 描画イベント
  socket.on("draw", (data) => {
    socket.broadcast.emit("draw", data);
  });

  // コメント受信 → 全員に配信
  socket.on("chat", (data) => {
    io.emit("chat", data);
  });

  socket.on("disconnect", () => {
    console.log("ユーザー切断:", socket.id);
  });
});

// Render が指定するポートで起動
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
