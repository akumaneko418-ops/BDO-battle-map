// ====================== Fold UI ======================
function initFoldUI() {
    document.querySelectorAll(".fold-content").forEach(fc => fc.style.display = "none");
    document.querySelectorAll(".fold-icon").forEach(i => i.textContent = "▼");
    document.querySelectorAll(".fold-header").forEach(h => {
        h.addEventListener("click", () => {
            const c = h.nextElementSibling;
            if (!c) return;
            const icon = h.querySelector(".fold-icon");
            const open = c.style.display === "none";
            c.style.display = open ? "block" : "none";
            if (icon) icon.textContent = open ? "▲" : "▼";
        });
    });
}

// ====================== 初期設定 ======================
const socket = io();
let zoom = 1.0, zoomStep = 0.1;
const canvas = document.getElementById("mapCanvas");
const ctx = canvas.getContext("2d");
let backgroundImage = null;
let offsetX = 0, offsetY = 0, isPanning = false, panStartX = 0, panStartY = 0;

let markers = [], arrows = [], texts = [], penPaths = [];
let markerComments = {}, highlightedMarkerId = null;

let selectedObject = null, selectedType = null;
let transformMode = null, transformStart = null;

initFoldUI();

// ====================== Undo / Redo ======================
let history = [], redoHistory = [];

function getCurrentState() {
    return {
        markers: structuredClone(markers),
        arrows: structuredClone(arrows),
        texts: structuredClone(texts),
        penPaths: structuredClone(penPaths),
        backgroundImageSrc: backgroundImage ? backgroundImage.src : null,
        zoom, offsetX, offsetY,
        markerComments: structuredClone(markerComments)
    };
}

function restoreState(s) {
    markers = s.markers || [];
    arrows = s.arrows || [];
    texts = s.texts || [];
    penPaths = s.penPaths || [];
    zoom = s.zoom || 1;
    offsetX = s.offsetX || 0;
    offsetY = s.offsetY || 0;
    markerComments = s.markerComments || {};

    if (s.backgroundImageSrc) {
        const img = new Image();
        img.onload = () => { backgroundImage = img; drawCanvas(); updateCommentList(); };
        img.src = s.backgroundImageSrc;
    } else {
        backgroundImage = null;
        drawCanvas();
        updateCommentList();
    }
}

function saveHistory() {
    history.push(JSON.stringify(getCurrentState()));
    if (history.length > 100) history.shift();
    redoHistory = [];
    updateUndoRedoButtons();
}

function broadcastState() { socket.emit("edit_state", getCurrentState()); }
socket.on("edit_state", restoreState);

document.getElementById("undoBtn").onclick = () => {
    cancelTyping();
    if (!history.length) return;
    redoHistory.push(JSON.stringify(getCurrentState()));
    restoreState(JSON.parse(history.pop()));
    updateUndoRedoButtons();
    broadcastState();
};

document.getElementById("redoBtn").onclick = () => {
    cancelTyping();
    if (!redoHistory.length) return;
    history.push(JSON.stringify(getCurrentState()));
    restoreState(JSON.parse(redoHistory.pop()));
    updateUndoRedoButtons();
    broadcastState();
};

function updateUndoRedoButtons() {
    document.getElementById("undoBtn").classList.toggle("disabled", !history.length);
    document.getElementById("redoBtn").classList.toggle("disabled", !redoHistory.length);
}

// ====================== ツール解除（グローバル） ======================
function clearToolSelection() {
    if (currentTool === "pen") return; // ★ ペンは解除しない
    currentTool = "none";
    penMode = false;
    textAddMode = false;

    document.querySelectorAll(".colorOption, .arrowColorOption, .textColorOption, .penColorOption")
        .forEach(btn => btn.classList.remove("selected"));
}

// ====================== ツール設定 ======================
let currentTool = "none";
let currentMarkerColor = "#ff7eb9", currentMarkerOpacity = 1.0, currentMarkerSize = 10;
let currentArrowColor = "#ff7eb9", currentArrowOpacity = 1.0, currentArrowScale = 1.0;
let currentTextColor = "#ff7eb9", currentTextSize = 16;
let penMode = false, currentPenColor = "#ff7eb9", currentPenWidth = 3, currentPenOpacity = 1.0;
let textAddMode = false;

document.getElementById("penClearBtn").onclick = () => {
    cancelTyping(); saveHistory(); penPaths = []; drawCanvas(); broadcastState();
};

function activateColor(el) {
    document.querySelectorAll(".colorOption,.arrowColorOption,.textColorOption,.penColorOption")
        .forEach(b => b.classList.remove("selected"));
    el.classList.add("selected");
}

document.querySelectorAll(".colorOption").forEach(el => {
    el.onclick = () => {
        cancelTyping(); selectedObject = null; selectedType = null;
        currentMarkerColor = getComputedStyle(el).backgroundColor;
        activateColor(el); currentTool = "marker"; penMode = false; textAddMode = false;
        drawCanvas();
    };
});

document.querySelectorAll(".arrowColorOption").forEach(el => {
    el.onclick = () => {
        cancelTyping(); selectedObject = null; selectedType = null;
        currentArrowColor = getComputedStyle(el).backgroundColor;
        activateColor(el); currentTool = "arrow"; penMode = false; textAddMode = false;
        drawCanvas();
    };
});

document.querySelectorAll(".textColorOption").forEach(el => {
    el.onclick = () => {
        cancelTyping(); selectedObject = null; selectedType = null;
        currentTextColor = getComputedStyle(el).backgroundColor;
        activateColor(el); currentTool = "text"; textAddMode = true; penMode = false;
        drawCanvas();
    };
});

document.querySelectorAll(".penColorOption").forEach(el => {
    el.onclick = () => {
        cancelTyping(); selectedObject = null; selectedType = null;
        currentPenColor = getComputedStyle(el).backgroundColor;
        activateColor(el); currentTool = "pen"; penMode = true; textAddMode = false;
        drawCanvas();
    };
});

// ====================== スライダー ======================
document.getElementById("markerSizeSlider").oninput = e => currentMarkerSize = +e.target.value;
document.getElementById("arrowSizeSlider").oninput = e => currentArrowScale = +e.target.value;
document.getElementById("markerOpacitySlider").oninput = e => {
    currentMarkerOpacity = +e.target.value;
    document.getElementById("markerOpacityValue").textContent = currentMarkerOpacity.toFixed(2);
};
document.getElementById("arrowOpacitySlider").oninput = e => {
    currentArrowOpacity = +e.target.value;
    document.getElementById("arrowOpacityValue").textContent = currentArrowOpacity.toFixed(2);
};
document.getElementById("penOpacitySlider").oninput = e => {
    currentPenOpacity = +e.target.value;
    document.getElementById("penOpacityValue").textContent = currentPenOpacity.toFixed(2);
};
document.getElementById("textSizeSlider").oninput = e => currentTextSize = +e.target.value;
document.getElementById("penWidthSlider").oninput = e => currentPenWidth = +e.target.value;

// ====================== 座標変換 ======================
function getCanvasClickPosition(e) {
    const rect = canvas.getBoundingClientRect();
    const rawX = e.clientX - rect.left - offsetX;
    const rawY = e.clientY - rect.top - offsetY;
    const cx = canvas.width / 2, cy = canvas.height / 2;
    return { x: (rawX - cx) / zoom + cx, y: (rawY - cy) / zoom + cy };
}

// ====================== テキスト入力 ======================
let typing = false, typingText = "", typingX = 0, typingY = 0;

function cancelTyping() {
    if (typing) { typing = false; typingText = ""; drawCanvas(); }
}

document.addEventListener("keydown", e => {
    if (!typing) return;
    if (e.key === "Enter") {
        if (typingText.trim()) {
            saveHistory();
            texts.push({
                id: "text_" + Date.now(),
                x: typingX, y: typingY,
                text: typingText,
                color: currentTextColor,
                size: currentTextSize,
                angle: 0
            });
            broadcastState();
        }
        typing = false; typingText = ""; drawCanvas(); e.preventDefault(); return;
    }
    if (e.key === "Escape") { typing = false; typingText = ""; drawCanvas(); e.preventDefault(); return; }
    if (e.key === "Backspace") { typingText = typingText.slice(0, -1); drawCanvas(); e.preventDefault(); return; }
    if (e.key.length === 1) { typingText += e.key; drawCanvas(); e.preventDefault(); }
});

// ====================== バウンディングボックス ======================
function getBoundingBox(obj, type) {
    if (type === "arrow") {
        const s = 25 * (obj.scale || 1);
        return { x: obj.x - s, y: obj.y - s, w: s * 2, h: s * 2 };
    }
    if (type === "text") {
        ctx.save();
        ctx.font = `700 ${obj.size}px "Noto Sans JP","Yu Gothic",sans-serif`;
        const w = ctx.measureText(obj.text).width;
        ctx.restore();
        return { x: obj.x, y: obj.y - obj.size, w, h: obj.size };
    }
    return { x: 0, y: 0, w: 0, h: 0 };
}

function drawTransformHandles(obj, type) {
    const b = getBoundingBox(obj, type);
    ctx.save();
    ctx.strokeStyle = "#4da3ff"; ctx.lineWidth = 2;
    ctx.strokeRect(b.x, b.y, b.w, b.h);

    const size = 8;
    [[b.x,b.y],[b.x+b.w,b.y],[b.x,b.y+b.h],[b.x+b.w,b.y+b.h]].forEach(([hx,hy])=>{
        ctx.fillStyle="#4da3ff"; ctx.fillRect(hx-size/2,hy-size/2,size,size);
    });

    const rx = b.x + b.w/2, ry = b.y - 20;
    ctx.beginPath(); ctx.arc(rx, ry, 6, 0, Math.PI*2); ctx.fillStyle="#4da3ff"; ctx.fill();
    ctx.restore();
}

function hitScaleHandle(px,py,b){
    const s=10;
    return [[b.x,b.y],[b.x+b.w,b.y],[b.x,b.y+b.h],[b.x+b.w,b.y+b.h]]
        .some(([hx,hy])=>Math.abs(px-hx)<=s && Math.abs(py-hy)<=s);
}

function hitRotateHandle(px,py,b){
    const rx=b.x+b.w/2, ry=b.y-20;
    return (px-rx)**2 + (py-ry)**2 <= 100;
}

// ====================== クリック処理 ======================
canvas.addEventListener("click", e => {
    const {x,y}=getCanvasClickPosition(e);

    if (currentTool==="text") {
        typing=true; typingText=""; typingX=x; typingY=y;
        selectedObject=null; selectedType=null;
        drawCanvas(); broadcastState(); return;
    }

    const hitArrow = hitTestArrow(x,y);
    const hitText = texts.find(t=>{
        const b=getBoundingBox(t,"text");
        return x>=b.x && x<=b.x+b.w && y>=b.y && y<=b.y+b.h;
    });

    if (hitArrow){ selectedObject=hitArrow; selectedType="arrow"; drawCanvas(); return; }
    if (hitText){ selectedObject=hitText; selectedType="text"; drawCanvas(); return; }

    if (currentTool==="marker"){
        saveHistory();
        markers.push({
            id:"marker_"+Date.now(), x,y,
            name:document.getElementById("markerName").value,
            color:currentMarkerColor, opacity:currentMarkerOpacity, size:currentMarkerSize
        });
        selectedObject=null; selectedType=null;
        drawCanvas(); broadcastState(); updateCommentList(); return;
    }

    if (currentTool==="arrow"){
        saveHistory();
        arrows.push({
            id:"arrow_"+Date.now(), x,y,
            angle:0, scale:currentArrowScale,
            color:currentArrowColor, opacity:currentArrowOpacity
        });
        selectedObject=null; selectedType=null;
        drawCanvas(); broadcastState(); return;
    }

    selectedObject=null; selectedType=null; drawCanvas();
});
// ====================== ヒットテスト ======================
let draggingMarker=null, draggingArrow=null, dragOffsetX=0, dragOffsetY=0;

function hitTestMarker(x,y){
    return markers.find(m=>{
        const dx=x-m.x, dy=y-m.y;
        return Math.sqrt(dx*dx+dy*dy)<= (m.size||10);
    })||null;
}

function hitTestArrow(x,y){
    const rBase=25;
    return arrows.find(a=>{
        const r=rBase*(a.scale||1);
        return Math.abs(x-a.x)<=r && Math.abs(y-a.y)<=r;
    })||null;
}

// ====================== ペン・ドラッグ・パン・変形 ======================
let drawing = false;

canvas.addEventListener("mousedown", e => {
    const {x,y}=getCanvasClickPosition(e);

    const clearTool = () => clearToolSelection();

    if (selectedObject && selectedType) {
        const b=getBoundingBox(selectedObject,selectedType);

        if (hitScaleHandle(x,y,b)) {
            clearTool();
            transformMode="scale";
            transformStart={
                x,y,box:b,
                originalScale:selectedType==="arrow"?selectedObject.scale||1:null,
                originalSize:selectedType==="text"?selectedObject.size:null
            };
            saveHistory(); return;
        }

        if (hitRotateHandle(x,y,b)) {
            clearTool();
            transformMode="rotate";
            transformStart={
                x,y,
                centerX:selectedType==="arrow"?selectedObject.x:b.x+b.w/2,
                centerY:selectedType==="arrow"?selectedObject.y:b.y+b.h/2,
                originalAngle:selectedObject.angle||0
            };
            saveHistory(); return;
        }

        if (selectedType==="arrow") {
            if (x>=b.x && x<=b.x+b.w && y>=b.y && y<=b.y+b.h) {
                clearTool();
                saveHistory();
                draggingArrow=selectedObject;
                dragOffsetX=x-draggingArrow.x;
                dragOffsetY=y-draggingArrow.y;
                return;
            }
        }

        if (selectedType==="text") {
            if (x>=b.x && x<=b.x+b.w && y>=b.y && y<=b.y+b.h) {
                clearTool();
                transformMode="move";
                transformStart={
                    x,y,
                    originalX:selectedObject.x,
                    originalY:selectedObject.y
                };
                saveHistory(); return;
            }
        }
    }

    if (currentTool==="marker") {
        const hit=hitTestMarker(x,y);
        if (hit){
            clearTool();
            saveHistory();
            draggingMarker=hit;
            dragOffsetX=x-hit.x; dragOffsetY=y-hit.y;
            return;
        }
    }

    if (currentTool==="arrow") {
        const hit=hitTestArrow(x,y);
        if (hit){
            clearTool();
            saveHistory();
            draggingArrow=hit;
            dragOffsetX=x-hit.x; dragOffsetY=y-hit.y;
            selectedObject=hit; selectedType="arrow";
            return;
        }
    }

    if (currentTool==="pen") {
        clearTool();
        drawing=true; saveHistory();
        penPaths.push({
            points:[{x,y}],
            color:currentPenColor,
            width:currentPenWidth,
            opacity:currentPenOpacity
        });
        return;
    }

    if (currentTool==="pan") {
        clearTool();
        isPanning=true;
        panStartX=e.clientX-offsetX;
        panStartY=e.clientY-offsetY;
        return;
    }
});

canvas.addEventListener("mousemove", e => {
    const {x,y}=getCanvasClickPosition(e);

    if (transformMode==="scale" && selectedObject && transformStart) {
        const dx=x-transformStart.x, dy=y-transformStart.y;
        const d=Math.max(dx,dy);

        if (selectedType==="arrow") {
            selectedObject.scale=Math.max(0.2,(transformStart.originalScale||1)+d/100);
        }
        if (selectedType==="text") {
            selectedObject.size=Math.max(8,(transformStart.originalSize||selectedObject.size)+d/2);
        }
        drawCanvas(); return;
    }

    if (transformMode==="rotate" && selectedObject && transformStart) {
        const cx=transformStart.centerX, cy=transformStart.centerY;
        selectedObject.angle=Math.atan2(y-cy,x-cx);
        drawCanvas(); return;
    }

    if (transformMode==="move" && selectedType==="text" && transformStart) {
        selectedObject.x=transformStart.originalX+(x-transformStart.x);
        selectedObject.y=transformStart.originalY+(y-transformStart.y);
        drawCanvas(); return;
    }

    if (draggingMarker) {
        draggingMarker.x=x-dragOffsetX;
        draggingMarker.y=y-dragOffsetY;
        drawCanvas(); return;
    }

    if (draggingArrow) {
        draggingArrow.x=x-dragOffsetX;
        draggingArrow.y=y-dragOffsetY;
        drawCanvas(); return;
    }

    if (drawing) {
        penPaths[penPaths.length-1].points.push({x,y});
        drawCanvas(); return;
    }

    if (isPanning) {
        offsetX=e.clientX-panStartX;
        offsetY=e.clientY-panStartY;
        drawCanvas();
    }
});

canvas.addEventListener("mouseup", () => {
    const changed = drawing || draggingMarker || draggingArrow || transformMode;
    drawing=false; isPanning=false;
    draggingMarker=null; draggingArrow=null;
    transformMode=null; transformStart=null;

    if (changed) {
        drawCanvas(); broadcastState(); updateCommentList();
    }
});

// ====================== ズーム ======================
document.getElementById("zoomInBtn").onclick = () => {
    cancelTyping(); selectedObject=null; selectedType=null;
    saveHistory(); zoom+=zoomStep; drawCanvas(); broadcastState();
};
document.getElementById("zoomOutBtn").onclick = () => {
    cancelTyping(); selectedObject=null; selectedType=null;
    saveHistory(); zoom=Math.max(0.2,zoom-zoomStep); drawCanvas(); broadcastState();
};
document.getElementById("zoomResetBtn").onclick = () => {
    cancelTyping(); selectedObject=null; selectedType=null;
    saveHistory(); zoom=1.0; drawCanvas(); broadcastState();
};

// ====================== PNG書き出し ======================
document.getElementById("exportPngBtn").onclick = () => {
    cancelTyping();

    const fileNameInput = document.getElementById("fileNameInput");
    let title = fileNameInput.value.trim();

    if (!title) title = "battle-map";

    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `${title}.png`;
    a.click();
};
// ====================== 描画処理 ======================
function drawCanvas() {
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.save();
    ctx.translate(offsetX,offsetY);
    ctx.translate(canvas.width/2,canvas.height/2);
    ctx.scale(zoom,zoom);
    ctx.translate(-canvas.width/2,-canvas.height/2);

    if(backgroundImage) ctx.drawImage(backgroundImage,0,0);

    penPaths.forEach(p=>{
        ctx.save();
        ctx.strokeStyle=p.color; ctx.lineWidth=p.width;
        ctx.globalAlpha=p.opacity; ctx.lineJoin="round"; ctx.lineCap="round";
        ctx.beginPath();
        p.points.forEach((pt,i)=> i?ctx.lineTo(pt.x,pt.y):ctx.moveTo(pt.x,pt.y));
        ctx.stroke(); ctx.restore();
    });

    markers.forEach(m=>{
        ctx.save(); ctx.globalAlpha=m.opacity;
        ctx.beginPath(); ctx.arc(m.x,m.y,m.size||10,0,Math.PI*2);
        ctx.fillStyle=m.color; ctx.fill();
        ctx.fillStyle="#000";
        ctx.font=`700 14px "Noto Sans JP","Yu Gothic",sans-serif`;
        ctx.fillText(m.name,m.x+(m.size||10)+4,m.y+4);
        ctx.restore();
    });

    if(highlightedMarkerId){
        const m=markers.find(mm=>mm.id===highlightedMarkerId);
        if(m){
            ctx.save(); ctx.globalAlpha=0.4;
            ctx.beginPath();
            ctx.arc(m.x,m.y,(m.size||10)+12,0,Math.PI*2);
            ctx.fillStyle=m.color; ctx.fill(); ctx.restore();
        }
    }

    arrows.forEach(a=>{
        ctx.save();
        ctx.translate(a.x,a.y);
        ctx.rotate(a.angle||0);
        ctx.scale(a.scale||1,a.scale||1);
        ctx.globalAlpha=a.opacity||currentArrowOpacity;
        ctx.beginPath();
        ctx.moveTo(0,-25);
        ctx.lineTo(10,0); ctx.lineTo(4,0);
        ctx.lineTo(4,25); ctx.lineTo(-4,25);
        ctx.lineTo(-4,0); ctx.lineTo(-10,0);
        ctx.closePath();
        ctx.fillStyle=a.color||currentArrowColor;
        ctx.fill(); ctx.restore();
    });

    texts.forEach(t=>{
        ctx.save();
        ctx.translate(t.x,t.y);
        if(t.angle) ctx.rotate(t.angle);
        ctx.font=`700 ${t.size}px "Noto Sans JP","Yu Gothic",sans-serif`;
        ctx.fillStyle=t.color;
        ctx.shadowColor="rgba(255,255,255,0.9)";
        ctx.shadowBlur=12; ctx.shadowOffsetX=2; ctx.shadowOffsetY=2;
        ctx.fillText(t.text,0,0);
        ctx.restore();
    });

    if(typing){
        ctx.save();
        ctx.font=`700 ${currentTextSize}px "Noto Sans JP","Yu Gothic",sans-serif`;
        ctx.fillStyle=currentTextColor;
        ctx.shadowColor="rgba(255,255,255,0.9)";
        ctx.shadowBlur=12; ctx.shadowOffsetX=2; ctx.shadowOffsetY=2;
        ctx.fillText(typingText,typingX,typingY);
        const w=ctx.measureText(typingText).width;
        const cx=typingX+w+2;
        ctx.beginPath();
        ctx.moveTo(cx,typingY-currentTextSize);
        ctx.lineTo(cx,typingY+4);
        ctx.lineWidth=2; ctx.strokeStyle=currentTextColor;
        ctx.stroke(); ctx.restore();
    }

    if(selectedObject && selectedType) drawTransformHandles(selectedObject,selectedType);
    ctx.restore();
}

// ====================== ドロップ ======================
window.addEventListener("dragover",e=>e.preventDefault(),false);
window.addEventListener("drop",e=>e.preventDefault(),false);
document.body.addEventListener("dragover",e=>e.preventDefault());
document.body.addEventListener("drop",e=>e.preventDefault());

document.body.addEventListener("drop",e=>{
    e.preventDefault();
    const file=e.dataTransfer.files[0];
    if(!file)return;
    const reader=new FileReader();
    reader.onload=()=>{
        const img=new Image();
        img.onload=()=>{
            saveHistory();
            canvas.width=img.width;
            canvas.height=img.height;
            backgroundImage=img;
            document.getElementById("dropHint").style.display="none";
            drawCanvas(); broadcastState();
        };
        img.src=reader.result;
    };
    reader.readAsDataURL(file);
});

// ====================== 右クリックメニュー ======================
canvas.addEventListener("contextmenu",e=>{
    e.preventDefault();
    const {x,y}=getCanvasClickPosition(e);
    const hitMarker=hitTestMarker(x,y);
    const hitArrow=hitTestArrow(x,y);
    const hitText=texts.find(t=>{
        const b=getBoundingBox(t,"text");
        return x>=b.x && x<=b.x+b.w && y>=b.y && y<=b.y+b.h;
    });

    hideAllMenus();

    if(hitMarker){ window.selectedMarker=hitMarker;
        showMenu("markerMenu",e.clientX,e.clientY); return; }
    if(hitArrow){ window.selectedArrow=hitArrow;
        showMenu("arrowMenu",e.clientX,e.clientY); return; }
    if(hitText){ window.selectedText=hitText;
        showMenu("textMenu",e.clientX,e.clientY); return; }
});

function hideAllMenus(){
    document.getElementById("markerMenu").classList.add("hidden");
    document.getElementById("arrowMenu").classList.add("hidden");
    document.getElementById("textMenu").classList.add("hidden");
}

function showMenu(id,x,y){
    const m=document.getElementById(id);
    m.style.left=x+"px"; m.style.top=y+"px";
    m.classList.remove("hidden");
}

// ====================== メニュー操作 ======================
document.getElementById("deleteMarkerBtn").onclick=()=>{
    if(!window.selectedMarker)return;
    saveHistory();
    markers=markers.filter(m=>m!==window.selectedMarker);
    delete markerComments[window.selectedMarker.id];
    hideAllMenus(); drawCanvas(); updateCommentList(); broadcastState();
};

document.getElementById("arrowRotateLeftBtn").onclick=()=>{
    if(!window.selectedArrow)return;
    saveHistory();
    window.selectedArrow.angle=(window.selectedArrow.angle||0)-Math.PI/8;
    hideAllMenus(); drawCanvas(); broadcastState();
};

document.getElementById("arrowRotateRightBtn").onclick=()=>{
    if(!window.selectedArrow)return;
    saveHistory();
    window.selectedArrow.angle=(window.selectedArrow.angle||0)+Math.PI/8;
    hideAllMenus(); drawCanvas(); broadcastState();
};

document.getElementById("arrowDeleteBtn").onclick=()=>{
    if(!window.selectedArrow)return;
    saveHistory();
    arrows=arrows.filter(a=>a!==window.selectedArrow);
    hideAllMenus(); drawCanvas(); broadcastState();
};

document.getElementById("deleteTextBtn").onclick=()=>{
    if(!window.selectedText)return;
    saveHistory();
    texts=texts.filter(t=>t!==window.selectedText);
    hideAllMenus(); drawCanvas(); broadcastState();
};

document.getElementById("addCommentBtn").onclick=()=>{
    if(!window.selectedMarker)return;
    const t=prompt("コメントを入力してください：");
    if(!t)return;
    const m=window.selectedMarker;
    if(!markerComments[m.id]) markerComments[m.id]=[];
    markerComments[m.id].push(t);
    updateCommentList(); hideAllMenus();
};

function updateCommentList(){
    const list=document.getElementById("commentList");
    if(!list)return;
    list.innerHTML="";
    markers.forEach(m=>{
        const cs=markerComments[m.id];
        if(!cs)return;
        cs.forEach(c=>{
            const div=document.createElement("div");
            div.className="commentItem";
            const name=document.createElement("span");
            name.className="markerName";
            name.textContent=m.name||"(無名)";
            name.style.color=m.color;
            const text=document.createElement("span");
            text.textContent="："+c;

            name.onmouseenter=()=>{ highlightedMarkerId=m.id; drawCanvas(); };
            name.onmouseleave=()=>{ highlightedMarkerId=null; drawCanvas(); };

            div.appendChild(name); div.appendChild(text);
            list.appendChild(div);
        });
    });
}

document.addEventListener("click",()=>hideAllMenus());

// ====================== 保存処理 ======================
let currentTitle = null;

document.getElementById("saveAllBtn").onclick = async () => {
    cancelTyping();

    const fileNameInput = document.getElementById("fileNameInput");
    const title = fileNameInput.value.trim();

    if (!title) {
        alert("ファイル名を入力してください");
        return;
    }

    currentTitle = title;

    const image = canvas.toDataURL("image/png");

    const payload = {
        title,
        image,
        markers,
        comments: markerComments
    };

    const res = await fetch("/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
    title: currentTitle,
    category: document.getElementById("categorySelect").value, // ★ 追加
    image: canvas.toDataURL(),
    markers,
    comments:markerComments
})

    });

    const json = await res.json();

    if (json.success) {
        alert("保存しました！");
        location.href = "index.html";
    } else {
        alert("保存に失敗しました");
    }
};

// ====================== ★ 保存データロード（id=◯◯） ======================
async function loadDataIfNeeded() {
    const params = new URLSearchParams(location.search);
    const id = params.get("id");
    if (!id) return;

    const res = await fetch(`/load?id=${id}`);
    const data = await res.json();

    document.getElementById("fileNameInput").value = data.title;
    currentTitle = data.title;

    const img = new Image();
    img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        backgroundImage = img;
        drawCanvas();
    };
    img.src = data.image;

    markers = data.markers || [];
    markerComments = data.comments || {};

    updateCommentList();
    drawCanvas();
}

// ====================== ★ プリセットロード（preset=◯◯） ======================
async function loadPresetIfNeeded() {
    const params = new URLSearchParams(location.search);
    const preset = params.get("preset");
    if (!preset) return;

    const res = await fetch(`/presetImage?name=${preset}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);

    const img = new Image();
    img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        backgroundImage = img;
        drawCanvas();
    };
    img.src = url;

    document.getElementById("fileNameInput").value = preset;
    currentTitle = preset;
}

// ====================== 初期描画 ======================
updateUndoRedoButtons();
drawCanvas();
updateCommentList();
loadDataIfNeeded();
loadPresetIfNeeded();
