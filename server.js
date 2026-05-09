// ===============================
// server.js（保存・読み込み・一覧・DL・プリセット管理 完全版）
// ===============================

const express = require("express");
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const multer = require("multer");

const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);

app.use(express.json({ limit: "50mb" }));
app.use(express.static("public"));

// ===============================
// データ保存フォルダ
// ===============================
const DATA_DIR = path.join(__dirname, "data");
const PRESET_DIR = path.join(DATA_DIR, "presets");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(PRESET_DIR)) fs.mkdirSync(PRESET_DIR);

// ===============================
// 画像保存（タイトル重複チェック + 保存日時追加）
// ===============================
app.post("/save", (req, res) => {
  const { title, image, markers, comments, category } = req.body;

  if (!title || !image) {
    return res.status(400).json({ error: "title と image は必須です" });
  }

  // 既存タイトル一覧を取得
  const existingTitles = fs.readdirSync(DATA_DIR)
    .filter(f => f.endsWith(".json"))
    .map(f => {
      const d = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f)));
      return d.title;
    });

  // 重複タイトル処理
  let finalTitle = title;
  let counter = 2;
  while (existingTitles.includes(finalTitle)) {
    finalTitle = `${title}(${counter})`;
    counter++;
  }

  const id = uuidv4();
  const fileBase = path.join(DATA_DIR, id);

  // PNG 保存
  const pngData = image.replace(/^data:image\/png;base64,/, "");
  fs.writeFileSync(`${fileBase}.png`, pngData, "base64");

  // JSON 保存（保存日時 savedAt を追加）
  const json = {
    id,
    title: finalTitle,
    category,
    markers,
    comments,
    imagePath: `${id}.png`,
    savedAt: Date.now()
  };
  fs.writeFileSync(`${fileBase}.json`, JSON.stringify(json, null, 2));

  res.json({ success: true, id });
});

// ===============================
// 保存済み画像一覧（新しい順）
// ===============================
app.get("/list", (req, res) => {
  const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith(".json"));

  let list = files.map(f => {
    const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f)));
    return {
      id: data.id,
      title: data.title,
      category: data.category || "未分類",
      savedAt: data.savedAt || 0
    };
  });

  // 新しい順にソート
  list.sort((a, b) => b.savedAt - a.savedAt);

  res.json(list);
});

// ===============================
// 再編集用ロード
// ===============================
app.get("/load", (req, res) => {
  const id = req.query.id;
  if (!id) return res.status(400).json({ error: "id が必要です" });

  const jsonPath = path.join(DATA_DIR, `${id}.json`);
  const pngPath = path.join(DATA_DIR, `${id}.png`);

  if (!fs.existsSync(jsonPath) || !fs.existsSync(pngPath)) {
    return res.status(404).json({ error: "データが見つかりません" });
  }

  const data = JSON.parse(fs.readFileSync(jsonPath));
  const pngBase64 = fs.readFileSync(pngPath, "base64");

  res.json({
    title: data.title,
    markers: data.markers,
    comments: data.comments,
    image: `data:image/png;base64,${pngBase64}`
  });
});

// ===============================
// ダウンロード（タイトル.png）
// ===============================
app.get("/download/:id", (req, res) => {
  const id = req.params.id;

  const jsonPath = path.join(DATA_DIR, `${id}.json`);
  const pngPath = path.join(DATA_DIR, `${id}.png`);

  if (!fs.existsSync(jsonPath) || !fs.existsSync(pngPath)) {
    return res.status(404).send("Not found");
  }

  const data = JSON.parse(fs.readFileSync(jsonPath));
  const filename = `${data.title}.png`;

  res.download(pngPath, filename);
});

// ===============================
// 保存済み画像削除
// ===============================
app.post("/delete", (req, res) => {
  const id = req.body.id;
  if (!id) return res.status(400).json({ error: "id が必要です" });

  const jsonPath = path.join(DATA_DIR, `${id}.json`);
  const pngPath = path.join(DATA_DIR, `${id}.png`);

  if (fs.existsSync(jsonPath)) fs.unlinkSync(jsonPath);
  if (fs.existsSync(pngPath)) fs.unlinkSync(pngPath);

  res.json({ success: true });
});

// ===============================
// ★ プリセット画像一覧
// ===============================
app.get("/listPresets", (req, res) => {
  const files = fs.readdirSync(PRESET_DIR).filter(f => f.endsWith(".png"));
  res.json(files);
});

// ===============================
// ★ プリセット画像アップロード（Render対応）
// ===============================
const upload = multer({ dest: "/tmp" });

app.post("/uploadPreset", upload.single("preset"), (req, res) => {
  if (!req.file) return res.status(400).send("No file");

  const ext = path.extname(req.file.originalname).toLowerCase();
  if (ext !== ".png") return res.status(400).send("PNG only");

  const newName = req.file.filename + ".png";
  const newPath = path.join(PRESET_DIR, newName);

  fs.rename(req.file.path, newPath, (err) => {
    if (err) {
      console.error("Preset save error:", err);
      return res.status(500).send("Save failed");
    }
    res.send("OK");
  });
});

// ===============================
// ★ プリセット画像削除
// ===============================
app.post("/deletePreset", (req, res) => {
  const name = req.body.name;
  if (!name) return res.status(400).send("No name");

  const filePath = path.join(PRESET_DIR, name);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

  res.send("OK");
});

// ===============================
// ★ プリセット画像取得
// ===============================
app.get("/presetImage", (req, res) => {
  const name = req.query.name;
  if (!name) return res.status(400).send("No name");

  const filePath = path.join(PRESET_DIR, name);
  if (!fs.existsSync(filePath)) return res.status(404).send("Not found");

  res.sendFile(filePath);
});

// ===============================
// Socket.IO（マーカー & コメント）
// ===============================
let markers = [];
let comments = [];

io.on("connection", (socket) => {
  socket.emit("loadMarkers", markers);
  socket.emit("pastComments", groupComments());

  socket.on("addMarker", (m) => {
    m._id = uuidv4();
    markers.push(m);
    io.emit("addMarker", m);
  });

  socket.on("moveMarker", (data) => {
    const m = markers.find(x => x._id === data._id);
    if (m) {
      m.x = data.x;
      m.y = data.y;
      io.emit("moveMarker", data);
    }
  });

  socket.on("deleteMarker", (id) => {
    markers = markers.filter(m => m._id !== id);
    comments = comments.filter(c => c.markerId !== id);
    io.emit("deleteMarker", id);
  });

  socket.on("chat", (c) => {
    c._id = uuidv4();
    comments.push(c);
    io.emit("chat", c);
  });

  socket.on("deleteComment", (id) => {
    comments = comments.filter(c => c._id !== id);
    io.emit("deleteComment", id);
  });

  socket.on("editComment", (data) => {
    const c = comments.find(x => x._id === data.id);
    if (c) {
      c.message = data.message;
      io.emit("editComment", data);
    }
  });
});

function groupComments() {
  const grouped = {};
  comments.forEach(c => {
    if (!grouped[c.markerId]) grouped
function groupComments() {
  const grouped = {};
  comments.forEach(c => {
    if (!grouped[c.markerId]) grouped[c.markerId] = [];
    grouped[c.markerId].push(c);
  });
  return grouped;
}

// ===============================
// 保存データ読み込み
// ===============================
app.get("/load", (req, res) => {
  const id = req.query.id;
  if (!id) return res.status(400).send("No id");

  const filePath = path.join(DATA_DIR, id + ".json");
  if (!fs.existsSync(filePath)) return res.status(404).send("Not found");

  const json = fs.readFileSync(filePath, "utf8");
  res.json(JSON.parse(json));
});

// ===============================
// 保存処理
// ===============================
app.post("/save", (req, res) => {
  const { title, category, image, markers, comments } = req.body;

  if (!title) return res.json({ success: false });

  const filePath = path.join(DATA_DIR, title + ".json");

  const data = {
    title,
    category,
    image,
    markers,
    comments
  };

  fs.writeFile(filePath, JSON.stringify(data, null, 2), err => {
    if (err) return res.json({ success: false });
    res.json({ success: true });
  });
});

// ===============================
// サーバー起動
// ===============================
server.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
