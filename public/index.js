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
            icon.textContent = isOpen ? "▲" : "▼";
        });
    });
}

initFoldUI();

// ===============================
// 新規作成
// ===============================
document.getElementById("newBtn").onclick = () => {
    location.href = "edit.html";
};

// ===============================
// 保存済み画像削除
// ===============================
async function deleteImage(id) {
    if (!confirm("本当に削除しますか？")) return;

    const res = await fetch("/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id })
    });

    const json = await res.json();

    if (json.success) {
        alert("削除しました");
        loadSavedImages();
    } else {
        alert("削除に失敗しました: " + json.error);
    }
}

// ===============================
// 保存済み画像一覧
// ===============================
async function loadSavedImages() {
    const res = await fetch("/list");
    let files = await res.json();

    files.sort((a, b) => b.savedAt - a.savedAt);

    const container = document.getElementById("savedList");
    container.innerHTML = "";

    const groups = {};
    files.forEach(f => {
        if (!groups[f.category]) groups[f.category] = [];
        groups[f.category].push(f);
    });

    Object.keys(groups).forEach(cat => {
        const header = document.createElement("div");
        header.className = "fold-header";
        header.innerHTML = `
            <div class="left">
                <span class="fold-icon">▼</span> ${cat}
            </div>
        `;

        const section = document.createElement("div");
        section.className = "fold-content";

        groups[cat].forEach(f => {
            const row = document.createElement("div");
            row.className = "item-row";

            row.innerHTML = `
                <span>${f.title}</span>
                <div>
                    <button class="edit-btn" onclick="location.href='edit.html?id=${f.id}'">編集</button>
                    <button class="delete-btn" onclick="deleteImage('${f.id}')">削除</button>
                </div>
            `;

            section.appendChild(row);
        });

        header.onclick = () => {
            const icon = header.querySelector(".fold-icon");
            const isOpen = section.style.display !== "none";
            section.style.display = isOpen ? "none" : "block";
            icon.textContent = isOpen ? "▲" : "▼";
        };

        container.appendChild(header);
        container.appendChild(section);
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
            <div>
                <button class="edit-btn" onclick="location.href='edit.html?preset=${encodeURIComponent(f)}'">編集</button>
                <button class="delete-btn" onclick="deletePreset('${f}')">削除</button>
            </div>
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
// プリセットアップロード（ブラウザ側）
// ===============================
document.getElementById("addPresetBtn").onclick = (e) => {
    e.stopPropagation(); // ★ fold-header の開閉を防止
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
