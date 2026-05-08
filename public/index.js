// ===============================
// 折りたたみ UI 初期化
// ===============================
function initFoldUI() {
    document.querySelectorAll(".fold-content").forEach(fc => fc.style.display = "block");
    document.querySelectorAll(".fold-icon").forEach(i => i.textContent = "▼");

    document.querySelectorAll(".fold-header").forEach(h => {
        h.addEventListener("click", () => {
            const content = h.nextElementSibling;
            if (!content) return;

            const icon = h.querySelector(".fold-icon");
            const isOpen = content.style.display !== "none";

            content.style.display = isOpen ? "none" : "block";
            if (icon) icon.textContent = isOpen ? "▲" : "▼";
        });
    });
}

initFoldUI();

// ===============================
// 新規作成
// ===============================
document.getElementById("newCreateBtn").onclick = () => {
    location.href = "edit.html";
};

// ===============================
// 保存済み画像一覧
// ===============================
async function loadSavedImages() {
    const res = await fetch("/list");
    const files = await res.json();

    const container = document.getElementById("savedImages");
    container.innerHTML = "";

    files.forEach(f => {
        const row = document.createElement("div");
        row.className = "item-row";

        row.innerHTML = `
            <span>${f.title}</span>
            <button onclick="location.href='edit.html?id=${f.id}'">編集</button>
        `;

        container.appendChild(row);
    });
}

// ===============================
// プリセット一覧
// ===============================
async function loadPresets() {
    const res = await fetch("/listPresets");
    const files = await res.json();

    const container = document.getElementById("presetList");
    container.innerHTML = "";

    files.forEach(f => {
        const row = document.createElement("div");
        row.className = "item-row";

        row.innerHTML = `
            <span>${f}</span>
            <button onclick="deletePreset('${f}')">削除</button>
        `;

        container.appendChild(row);
    });
}

// ===============================
// プリセット削除
// ===============================
async function deletePreset(name) {
    await fetch("/deletePreset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name })
    });
    loadPresets();
}

// ===============================
// プリセット追加
// ===============================
document.getElementById("addPresetBtn").onclick = () => {
    document.getElementById("presetFileInput").click();
};

document.getElementById("presetFileInput").onchange = async e => {
    const file = e.target.files[0];
    if (!file) return;

    const form = new FormData();
    form.append("preset", file);

    await fetch("/uploadPreset", {
        method: "POST",
        body: form
    });

    loadPresets();
};

// ===============================
// 初期ロード
// ===============================
loadSavedImages();
loadPresets();
