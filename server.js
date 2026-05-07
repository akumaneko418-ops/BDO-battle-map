import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { MongoClient } from "mongodb";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

app.use(express.static(path.join(__dirname, "public")));

const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri);

let commentsCollection;

// ★ MongoDB 接続が完了してから Socket.IO を開始する
async function start() {
  await client.connect();
  const db = client.db("bdo");
  commentsCollection = db.collection("comments");

  console.log("MongoDB connected");

  io.on("connection", async (socket) => {
    console.log("ユーザー接続:", socket.id);

    try {
      const comments = await commentsCollection.find().toArray();
      socket.emit("pastComments", comments);
    } catch (err) {
      console.error("Failed to load past comments:", err);
    }

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

  const port = process.env.PORT || 10000;
  httpServer.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
}

start();
