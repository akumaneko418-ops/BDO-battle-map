// ===============================
// server.js（完全版・リアルタイム同期統合）
// ===============================

const express = require("express");
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const multer = require("multer");
const http = require("http");
const socketIO = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

const PORT = process.env.PORT || 3000;

// ===============================
// ディレクトリ
// ===============================
const DATA_DIR = path.join(__dirname, "data");
const PRESET_DIR = path.join(DATA_DIR, "presets");
const TMP_DIR = path.join(__dirname, "tmp");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(PRESET_DIR)) fs.mkdirSync(PRESET_DIR);
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR);

// ===============================
// ミドルウェア
// ===============================
app.use(express.json({ limit: "50mb" }));
app.use(express.static("public"));

// ===============================
// 保存処理（PNG + JSON）
// ===============================
app.post("/save", (req, res) => {
  const { title, image, markers, comments, category } = req.body;

  if (!title || !image) {
    return res.status(400).json({ error: "title と image は必須です" });
  }

  const existingTitles = fs.readdirSync(DATA_DIR)
    .filter(f => f.endsWith(".json"))
    .map(f => {
      const d = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f)));
      return d.title;
    });

  let finalTitle = title;
  let counter = 2;
  while (existingTitles.includes(finalTitle)) {
    finalTitle = `${title}(${counter})`;
    counter++;
  }

  const id = uuidv4();
  const base = path.join(DATA_DIR, id);

  const pngData = image.replace(/^data:image\/png;base64,/, "");
  fs.writeFileSync(`${base}.png`, pngData, "base64");

  const json = {
    id,
    title: finalTitle,
    category,
    markers,
    comments,
    imagePath: `${id}.png`,
    savedAt: Date.now()
  };
  fs.writeFileSync(`${base}.json`, JSON.stringify(json, null, 2));

  res.json({ success: true, id });
});

// ===============================
// 一覧
// ===============================
app.get("/list", (req, res) => {
  const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith(".json"));

  const list = files.map(f => {
    const d = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f)));
    return {
      id: d.id,
      title: d.title,
      category: d.category || "未分類",
      savedAt: d.savedAt || 0
    };
  });

  list.sort((a, b) => b.savedAt - a.savedAt);

  res.json(list);
});

// ===============================
// 再編集ロード
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
// ダウンロード
// ===============================
app.get("/download/:id", (req, res) => {
  const id = req.params.id;

  const jsonPath = path.join(DATA_DIR, `${id}.json`);
  const pngPath = path.join(DATA_DIR, `${id}.png`);

  if (!fs.existsSync(jsonPath) || !fs.existsSync(pngPath)) {
    return res.status(404).send("Not found");
  }

  const data = JSON.parse(fs.readFileSync(jsonPath));
  res.download(pngPath, `${data.title}.png`);
});

// ===============================
// 削除
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
// プリセット一覧
// ===============================
app.get("/listPresets", (req, res) => {
  const files = fs.readdirSync(PRESET_DIR).filter(f => f.endsWith(".png"));
  res.json(files);
});

// ===============================
// プリセットアップロード
// ===============================
const upload = multer({ dest: TMP_DIR });

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
// プリセット削除
// ===============================
app.post("/deletePreset", (req, res) => {
  const name = req.body.name;
  if (!name) return res.status(400).send("No name");

  const filePath = path.join(PRESET_DIR, name);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

  res.send("OK");
});

// ===============================
// プリセット取得
// ===============================
app.get("/presetImage", (req, res) => {
  const name = req.query.name;
  if (!name) return res.status(400).send("No name");

  const filePath = path.join(PRESET_DIR, name);
  if (!fs.existsSync(filePath)) return res.status(404).send("Not found");

  res.sendFile(filePath);
});

// ===============================
// Socket.IO（edit_state に統合）
// ===============================
io.on("connection", socket => {

  // ★ 新エディタのリアルタイム同期（全状態を edit_state で扱う）
  socket.on("edit_state", s => {
    console.log("edit_state received");
    socket.broadcast.emit("edit_state", s);
  });

});

// ===============================
// サーバー起動
// ===============================
server.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
