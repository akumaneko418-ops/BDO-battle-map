import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { MongoClient, ObjectId } from "mongodb";
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
let markersCollection;

async function start() {
  await client.connect();
  const db = client.db("bdo");

  commentsCollection = db.collection("comments");
  markersCollection = db.collection("markers");

  console.log("MongoDB connected");

  io.on("connection", async (socket) => {
    console.log("ユーザー接続:", socket.id);

    // --- マーカー送信 ---
    const markers = await markersCollection.find().toArray();
    socket.emit("loadMarkers", markers);

    // --- コメント送信 ---
    const comments = await commentsCollection.find().toArray();
    const grouped = {};
    for (const c of comments) {
      if (!grouped[c.markerId]) grouped[c.markerId] = [];
      grouped[c.markerId].push(c);
    }
    socket.emit("pastComments", grouped);

    // --- マーカー追加 ---
    socket.on("addMarker", async (marker) => {
      const result = await markersCollection.insertOne(marker);
      marker._id = result.insertedId;
      io.emit("addMarker", marker);
    });

    // --- マーカー移動 ---
    socket.on("moveMarker", async (data) => {
      await markersCollection.updateOne(
        { _id: new ObjectId(data._id) },
        { $set: { x: data.x, y: data.y } }
      );
      io.emit("moveMarker", data);
    });

    // --- マーカー削除 ---
    socket.on("deleteMarker", async (id) => {
      await markersCollection.deleteOne({ _id: new ObjectId(id) });
      await commentsCollection.deleteMany({ markerId: id });
      io.emit("deleteMarker", id);
    });

    // --- コメント追加 ---
    socket.on("chat", async (data) => {
      const result = await commentsCollection.insertOne(data);
      data._id = result.insertedId;
      io.emit("chat", data);
    });

    // --- コメント削除 ---
    socket.on("deleteComment", async (id) => {
      await commentsCollection.deleteOne({ _id: new ObjectId(id) });
      io.emit("deleteComment", id);
    });
  });

  const port = process.env.PORT || 10000;
  httpServer.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
}

start();


