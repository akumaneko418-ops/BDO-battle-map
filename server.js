import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";
import { MongoClient } from "mongodb";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

// ===== MongoDB 接続 =====
const mongoClient = new MongoClient(process.env.MONGODB_URI);
let commentsCollection;

async function connectDB() {
  try {
    await mongoClient.connect();
    const db = mongoClient.db("bdo_map");
    commentsCollection = db.collection("comments");
    console.log("MongoDB connected");
  } catch (err) {
    console.error("MongoDB connection error:", err);
  }
}
connectDB();

// 静的ファイル（publicフォルダ）を配信
app.use(express.static(path.join(__dirname, "public")));

// Socket.IO（リアルタイム通信）
io.on("connection", async (socket) => {
  console.log("ユーザー接続:", socket.id);

  // ===== 接続時に過去コメントを送信 =====
  try {
    const pastComments = await commentsCollection
      .find({})
      .sort({ timestamp: 1 })
      .toArray();

    socket.emit("pastComments", pastComments);
  } catch (err) {
    console.error("Failed to load past comments:", err);
  }

  // ===== 描画イベント =====
  socket.on("draw", (data) => {
    socket.broadcast.emit("draw", data);
  });

  // ===== コメント受信 → DB保存 → 全員に配信 =====
  socket.on("chat", async (data) => {
    try {
      await commentsCollection.insertOne(data);
      io.emit("chat", data);
    } catch (err) {
      console.error("Failed to save comment:", err);
    }
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
