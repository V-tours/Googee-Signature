// ======================================================
// SUPABASE CONFIG
// ======================================================

// ⚠️ SECURITY NOTE: This anon key is public. For production: (Issue #21)
// 1. Enable Row Level Security (RLS) on 'plots' and 'polygons' tables
// 2. Create policies: viewer = SELECT only, admin = authenticated full access
// 3. Use Supabase Auth for admin sessions

// NOTE: Projection math (screenToSphere, sphereToScreen) and WebGL rendering (Issue #23)
// are duplicated in viewer.html. Changes to projection logic must be synced.

const SUPABASE_URL = "https://wkndbbqmguuzneogbkvy.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndrbmRiYnFtZ3V1em5lb2dia3Z5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3NjEyODYsImV4cCI6MjA5NTMzNzI4Nn0.vrln5KZm2HbPU3_eDwoSHzwcb_DnCWvtq0iqvG0PC_M";

const SB_HEADERS = {
  "Content-Type": "application/json",
  "apikey": SUPABASE_ANON_KEY,
  "Authorization": `Bearer ${SUPABASE_ANON_KEY}`
};

async function sbFetch(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: { ...SB_HEADERS, ...(options.headers || {}) }
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err);
  }
  return res.status === 204 ? null : res.json();
}


// ======================================================
// STATUS CONFIG
// ======================================================

const STATUS_COLORS = {
  available: { fill: "#22c55e", stroke: "#16a34a" },
  booked:    { fill: "#f59e0b", stroke: "#d97706" },
  sold:      { fill: "#ef4444", stroke: "#dc2626" },
  default:   { fill: "#6b7280", stroke: "#4b5563" }
};

function getStatusColor(status) {
  return STATUS_COLORS[(status || "").toLowerCase()] || STATUS_COLORS.default;
}


// ======================================================
// STATE
// ======================================================

const plots = [];
let plotStatuses = {};
let selectedPlot = null;
let drawMode = false;
let retraceMode = false;
let tempCoordinates = []; // array of {yaw, pitch}


// ======================================================
// CONFIG & NAMED CONSTANTS (Issue #25)
// ======================================================

const MIN_POLYGON_POINTS = 3;
const PANORAMA_URL = "./assets/Panorama1_000.jpg";

const MOUSE_SENSITIVITY = 0.0015;
const TOUCH_SENSITIVITY = 0.002;
const DRAG_THRESHOLD = 4;
const TOUCH_DRAG_THRESHOLD = 6;
const WHEEL_ZOOM_SPEED = 0.05;
const PINCH_ZOOM_SPEED = 0.1;
const REFERENCE_FOV = 75;


// ======================================================
// DOM
// ======================================================

const plotCountInput     = document.getElementById("plotCountInput");
const generatePlotsBtn   = document.getElementById("generatePlotsBtn");
const progressText       = document.getElementById("progressText");
const progressBar        = document.getElementById("progressBar");
const plotSearch         = document.getElementById("plotSearch");
const plotList           = document.getElementById("plotList");
const plotCountLabel     = document.getElementById("plotCountLabel");
const selectedPlotNumber = document.getElementById("selectedPlotNumber");
const selectedPlotId     = document.getElementById("selectedPlotId");
const selectedPlotHidden = document.getElementById("selectedPlotHidden");
const coordinateCount    = document.getElementById("coordinateCount");
const coordinatesList    = document.getElementById("coordinatesList");
const toastContainer     = document.getElementById("toastContainer");
const confirmModal       = document.getElementById("confirmModal");
const cancelGenerate     = document.getElementById("cancelGenerate");
const confirmGenerate    = document.getElementById("confirmGenerate");
const modeBadge          = document.getElementById("modeBadge");
const drawHud            = document.getElementById("drawHud");
const drawPointCount     = document.getElementById("drawPointCount");
const drawUndo           = document.getElementById("drawUndo");
const drawFinish         = document.getElementById("drawFinish");
const drawCancel         = document.getElementById("drawCancel");
const btnStartTracing    = document.getElementById("btnStartTracing");
const btnRetrace         = document.getElementById("btnRetrace");
const btnSave            = document.getElementById("btnSave");
const btnDelete          = document.getElementById("btnDelete");


// ======================================================
// HELPERS
// ======================================================

function generatePlotId(number) {
  return `PLOT_${String(number).padStart(3, "0")}`;
}

function getMappedCount() {
  return plots.filter(p => p.coordinates.length > 0).length;
}


// ======================================================
// TOAST
// ======================================================

function showToast(message, type = "info") {
  const colors = {
    success: "border-emerald-500 bg-emerald-950/80 text-emerald-200",
    error:   "border-rose-500 bg-rose-950/80 text-rose-200",
    warning: "border-amber-500 bg-amber-950/80 text-amber-200",
    info:    "border-blue-500 bg-blue-950/80 text-blue-200"
  };
  
  const toast = document.createElement("div");
  toast.className = `flex items-center gap-3 border ${colors[type] || colors.info} px-4 py-3 rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.5)] text-xs font-semibold backdrop-blur-xl animate-fade-in transition-all duration-350 transform translate-y-2 opacity-0`;
  toast.style.cssText = "transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1); border-left-width: 4px;";
  
  // Icon placeholder or status indicators
  const indicators = {
    success: "🟢",
    error:   "🔴",
    warning: "🟡",
    info:    "🔵"
  };
  
  toast.innerHTML = `
    <span>${indicators[type] || "ℹ️"}</span>
    <span class="flex-1">${message}</span>
  `;
  
  toastContainer.appendChild(toast);
  
  // Force reflow and animate in
  setTimeout(() => {
    toast.style.opacity = "1";
    toast.style.transform = "translateY(0)";
  }, 10);
  
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(-10px)";
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}


// ======================================================
// REUSABLE CONFIRM MODAL (Issue #20)
// ======================================================

function showConfirmModal(title, message, onConfirm) {
  const modal = document.getElementById("genericConfirmModal");
  const titleEl = document.getElementById("genericModalTitle");
  const messageEl = document.getElementById("genericModalMessage");
  const cancelBtn = document.getElementById("genericModalCancel");
  const confirmBtn = document.getElementById("genericModalConfirm");

  titleEl.textContent = title;
  messageEl.textContent = message;
  modal.classList.remove("hidden");

  const close = () => {
    modal.classList.add("hidden");
    confirmBtn.replaceWith(confirmBtn.cloneNode(true));
    cancelBtn.replaceWith(cancelBtn.cloneNode(true));
  };

  document.getElementById("genericModalConfirm").addEventListener("click", () => {
    onConfirm();
    close();
  });

  document.getElementById("genericModalCancel").addEventListener("click", () => {
    close();
  });
}


// ======================================================
// PROGRESS
// ======================================================

function updateProgress() {
  const total = plots.length;
  const mapped = getMappedCount();
  progressText.textContent = `${mapped} / ${total}`;
  const pct = total === 0 ? 0 : (mapped / total) * 100;
  progressBar.style.width = `${pct}%`;
}


// ======================================================
// PLOT DETAILS PANEL
// ======================================================

function updateSelectedPlotPanel() {
  if (!selectedPlot) {
    selectedPlotNumber.textContent = "Select a plot to begin mapping";
    selectedPlotId.value = "";
    coordinateCount.textContent = "0 Points";
    coordinatesList.innerHTML = `<div class="text-slate-650 italic text-center py-6">No plot selected</div>`;
    return;
  }
  selectedPlotNumber.textContent = `Plot ${selectedPlot.plotNumber}`;
  selectedPlotId.value = selectedPlot.plotId;
  coordinateCount.textContent = `${selectedPlot.coordinates.length} Points`;
  renderCoordinateList();
}


// ======================================================
// COORDINATE LIST
// ======================================================

function renderCoordinateList() {
  if (!selectedPlot) return;
  if (selectedPlot.coordinates.length === 0) {
    coordinatesList.innerHTML = `<div class="text-slate-650 italic text-center py-6">No coordinates mapped</div>`;
    return;
  }
  coordinatesList.innerHTML = "";
  selectedPlot.coordinates.forEach((pt, index) => {
    const row = document.createElement("div");
    row.className = "flex justify-between items-center py-1 border-b border-white/5 last:border-0";
    row.innerHTML = `
      <span class="text-slate-500 font-semibold font-mono">#${index + 1}</span>
      <span class="text-slate-300 font-mono tracking-tight">${pt.yaw.toFixed(4)}, ${pt.pitch.toFixed(4)}</span>
    `;
    coordinatesList.appendChild(row);
  });
}


// ======================================================
// SELECT PLOT
// ======================================================

function selectPlot(plot) {
  selectedPlot = plot;
  selectedPlotHidden.value = plot.plotId;
  updateSelectedPlotPanel();
  renderPlotList();
  needsRender = true;
  svgDirty = true;
}


// ======================================================
// PLOT CARD
// ======================================================

function createPlotCard(plot) {
  const isSelected = selectedPlot && selectedPlot.plotId === plot.plotId;
  const isMapped = plot.coordinates.length > 0;
  const status = (plotStatuses[plot.plotNumber] || "").toLowerCase();

  const colorConfig = {
    available: { bg: "bg-emerald-500/10", border: "border-emerald-500/20", text: "text-emerald-400", dot: "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" },
    booked:    { bg: "bg-amber-500/10", border: "border-amber-500/20", text: "text-amber-400", dot: "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]" },
    sold:      { bg: "bg-rose-500/10", border: "border-rose-500/20", text: "text-rose-400", dot: "bg-rose-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]" },
    default:   { bg: "bg-slate-900/50", border: "border-slate-800", text: "text-slate-500", dot: "bg-slate-700" }
  };

  const currentStyle = colorConfig[status] || colorConfig.default;

  const card = document.createElement("div");
  card.className = `p-3.5 rounded-2xl border cursor-pointer transition-all duration-300 ${
    isSelected 
      ? "border-blue-500 bg-blue-500/10 shadow-[0_4px_20px_rgba(59,130,246,0.15)] scale-[0.98]" 
      : "border-white/5 bg-slate-900/40 hover:bg-slate-900/80 hover:border-white/10"
  }`;

  card.innerHTML = `
    <div class="flex items-center justify-between">
      <div class="space-y-1">
        <div class="font-title font-bold text-sm tracking-wide ${isSelected ? 'text-blue-400' : 'text-slate-200'}">Plot ${plot.plotNumber}</div>
        <div class="text-[10px] font-bold uppercase tracking-wider ${currentStyle.text}">${status || "unknown"}</div>
      </div>
      <div class="flex items-center gap-2">
        ${isMapped ? `<span class="text-[10px] font-bold text-slate-500 font-mono">Mapped</span>` : ''}
        <div class="h-2.5 w-2.5 rounded-full ${isSelected ? 'bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.8)] animate-pulse' : currentStyle.dot}"></div>
      </div>
    </div>
  `;

  card.addEventListener("click", () => selectPlot(plot));
  return card;
}


// ======================================================
// PLOT LIST
// ======================================================

function renderPlotList() {
  const search = plotSearch.value.trim().toLowerCase();
  plotList.innerHTML = "";
  const filtered = plots.filter(plot => {
    const name = `plot ${plot.plotNumber}`;
    return name.toLowerCase().includes(search) || plot.plotId.toLowerCase().includes(search);
  });
  filtered.forEach(plot => plotList.appendChild(createPlotCard(plot)));
  plotCountLabel.textContent = `${plots.length} Plots`;
}


// ======================================================
// GENERATE PLOTS
// ======================================================

function generatePlots(count, silent = false) {
  plots.length = 0;
  selectedPlot = null;
  localStorage.setItem("plotCount", count);
  for (let i = 1; i <= count; i++) {
    plots.push({ plotId: generatePlotId(i), plotNumber: i, coordinates: [] });
  }
  renderPlotList();
  updateProgress();
  updateSelectedPlotPanel();
  needsRender = true;
  svgDirty = true;
  if (!silent) {
    showToast(`${count} plots created`, "success");
  }
}


// ======================================================
// LOAD FROM SUPABASE (Issue #2 & #8)
// ======================================================

async function loadAllData() {
  showToast("Loading data...", "info");
  try {
    const plotRows = await sbFetch("plots?select=plot,status");
    plotStatuses = {};
    plotRows.forEach(row => { plotStatuses[row.plot] = row.status; });

    const polyRows = await sbFetch("polygons?select=plot_number,coordinates");

    // Auto-detect max plot counts to prevent empty local storage data reset
    const maxPlotNum = Math.max(
      ...plotRows.map(r => r.plot),
      ...polyRows.map(r => r.plot_number),
      0
    );

    if (plots.length === 0 && maxPlotNum > 0) {
      plotCountInput.value = maxPlotNum;
      generatePlots(maxPlotNum, true);
    }

    polyRows.forEach(row => {
      const plot = plots.find(p => p.plotNumber === row.plot_number);
      if (plot) plot.coordinates = row.coordinates;
    });

    renderPlotList();
    updateProgress();
    needsRender = true;
    svgDirty = true;
    showToast("Data loaded", "success");
  } catch (e) {
    console.error(e);
    showToast("Failed to load data", "error");
  }
}


// ======================================================
// SAVE POLYGON TO SUPABASE
// ======================================================

async function savePolygonToSupabase(plot) {
  try {
    await sbFetch("polygons", {
      method: "POST",
      headers: { "Prefer": "resolution=merge-duplicates" },
      body: JSON.stringify({
        plot_number: plot.plotNumber,
        coordinates: plot.coordinates,
        updated_at: new Date().toISOString()
      })
    });
    showToast("Saved to database ✓", "success");
  } catch (e) {
    console.error(e);
    showToast("Save failed", "error");
  }
}


// ======================================================
// DELETE POLYGON FROM SUPABASE
// ======================================================

async function deletePolygonFromSupabase(plotNumber) {
  try {
    await sbFetch(`polygons?plot_number=eq.${plotNumber}`, { method: "DELETE" });
  } catch (e) {
    console.error(e);
  }
}


// ======================================================
// ======================================================
// CUSTOM WEBGL PANORAMA VIEWER
// ======================================================
// ======================================================

let gl, program, texture;
let canvas, svgOverlay;

// Camera state
let yaw = Math.PI;    // horizontal rotation in radians
let pitch = 0;         // look at horizon (0 = level)
let fov = REFERENCE_FOV;         // field of view in degrees

const MIN_FOV = 20;
const MAX_FOV = 100;
const MIN_PITCH = -Math.PI / 2 + 0.01;
const MAX_PITCH =  Math.PI / 2 - 0.01;

// Drag state
let isDragging = false;
let lastMouseX = 0;
let lastMouseY = 0;
let dragStartX = 0;
let dragStartY = 0;
let didDrag = false;

// Touch state
let lastTouchDist = 0;
let lastTouchX = 0;
let lastTouchY = 0;

// Render Dirty Flags (Issue #5 & #6)
let needsRender = true;
let svgDirty = true;

const uniforms = {
  yaw: null,
  pitch: null,
  fov: null,
  res: null,
  tex: null
};

// ======================================================
// WEBGL SETUP
// ======================================================

const VERT_SRC = `
  attribute vec2 a_pos;
  varying vec2 v_uv;
  void main() {
    v_uv = a_pos;
    gl_Position = vec4(a_pos, 0.0, 1.0);
  }
`;

const FRAG_SRC = `
  precision highp float;
  uniform sampler2D u_tex;
  uniform float u_yaw;
  uniform float u_pitch;
  uniform float u_fov;
  uniform vec2 u_res;
  varying vec2 v_uv;

  #define PI 3.14159265358979

  void main() {
    // Screen UV [-1, 1]
    vec2 uv = v_uv;

    // Adjust for aspect ratio
    float aspect = u_res.x / u_res.y;
    uv.x *= aspect;

    // FOV scale
    float fovRad = u_fov * PI / 180.0;
    float scale = tan(fovRad * 0.5);
    uv *= scale;

    // Ray direction in camera space
    vec3 ray = normalize(vec3(uv.x, uv.y, -1.0));

    // Rotate by pitch (around X axis)
    float cp = cos(-u_pitch);
    float sp = sin(-u_pitch);
    vec3 rp = vec3(
      ray.x,
      ray.y * cp - ray.z * sp,
      ray.y * sp + ray.z * cp
    );

    // Rotate by yaw (around Y axis)
    float cy = cos(u_yaw);
    float sy = sin(u_yaw);
    vec3 rd = vec3(
      rp.x * cy + rp.z * sy,
      rp.y,
      -rp.x * sy + rp.z * cy
    );

    // Convert to equirectangular UV
    float lon = atan(rd.x, rd.z);
    float lat = asin(clamp(rd.y, -1.0, 1.0));

    float texU = 0.5 - lon / (2.0 * PI);
    float texV = 0.5 - lat / PI;

    gl_FragColor = texture2D(u_tex, vec2(texU, texV));
  }
`;

function createShader(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.error("Shader error:", gl.getShaderInfoLog(s));
    return null;
  }
  return s;
}

function getMaxTextureSize() {
  try {
    const testCanvas = document.createElement("canvas");
    const testGl = testCanvas.getContext("webgl") || testCanvas.getContext("experimental-webgl");
    if (testGl) {
      const max = testGl.getParameter(testGl.MAX_TEXTURE_SIZE);
      return Math.min(max, 8192);
    }
  } catch (e) {}
  return 4096;
}

function initWebGL() {
  const container = document.getElementById("viewer");

  canvas = document.createElement("canvas");
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;";
  container.appendChild(canvas);

  // SVG overlay for polygons
  svgOverlay = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svgOverlay.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:5;";
  container.appendChild(svgOverlay);

  gl = canvas.getContext("webgl", { antialias: true });
  if (!gl) { alert("WebGL not supported"); return; }

  const vert = createShader(gl, gl.VERTEX_SHADER, VERT_SRC);
  const frag = createShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC);

  program = gl.createProgram();
  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.linkProgram(program);
  gl.useProgram(program);

  // Cache WebGL uniform locations once (Issue #7)
  uniforms.yaw = gl.getUniformLocation(program, "u_yaw");
  uniforms.pitch = gl.getUniformLocation(program, "u_pitch");
  uniforms.fov = gl.getUniformLocation(program, "u_fov");
  uniforms.res = gl.getUniformLocation(program, "u_res");
  uniforms.tex = gl.getUniformLocation(program, "u_tex");

  // Full-screen quad
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1,  1, -1,  -1, 1,
     1, -1,  1,  1,  -1, 1
  ]), gl.STATIC_DRAW);

  const loc = gl.getAttribLocation(program, "a_pos");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  // Texture
  texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  // Placeholder pixel
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
    new Uint8Array([10, 10, 20, 255]));

  // XHR progressive download indicator (Issue #13)
  loadPanoProgressive(PANORAMA_URL);

  // Resize
  resizeCanvas();
  window.addEventListener("resize", () => {
    resizeCanvas();
    needsRender = true;
    svgDirty = true;
  });

  // Mouse events
  document.addEventListener("mousedown", onMouseDown);
  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mouseup", onMouseUp);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  document.addEventListener("click", onCanvasClick);

  // Touch events
  document.addEventListener("touchstart", onTouchStart, { passive: false });
  document.addEventListener("touchmove", onTouchMove, { passive: false });
  document.addEventListener("touchend", onTouchEnd);

  // Context Loss & Restore handling (Issue #14)
  canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    document.getElementById("loadingScreen").style.display = "flex";
    document.getElementById("loadingText").textContent = "Graphics context lost. Restoring...";
  }, false);

  canvas.addEventListener("webglcontextrestored", () => {
    initWebGL();
    needsRender = true;
    svgDirty = true;
  }, false);
}

function loadPanoProgressive(url) {
  const xhr = new XMLHttpRequest();
  xhr.open("GET", url, true);
  xhr.responseType = "blob";
  
  const loadingText = document.getElementById("loadingText");
  
  xhr.onprogress = (e) => {
    if (e.lengthComputable) {
      const pct = Math.round((e.loaded / e.total) * 100);
      loadingText.textContent = `Downloading Panorama Canvas (${pct}%)…`;
    }
  };
  
  xhr.onload = () => {
    if (xhr.status >= 200 && xhr.status < 300) {
      const blob = xhr.response;
      const img = new Image();
      img.onload = () => {
        const MAX_TEX = getMaxTextureSize();
        let source = img;
        if (img.naturalWidth > MAX_TEX || img.naturalHeight > MAX_TEX) {
          const scale = Math.min(MAX_TEX / img.naturalWidth, MAX_TEX / img.naturalHeight);
          const w = Math.floor(img.naturalWidth  * scale);
          const h = Math.floor(img.naturalHeight * scale);
          const offscreen = document.createElement("canvas");
          offscreen.width  = w;
          offscreen.height = h;
          offscreen.getContext("2d").drawImage(img, 0, 0, w, h);
          source = offscreen;
        }
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
        document.getElementById("loadingScreen").style.display = "none";
        needsRender = true;
        svgDirty = true;
      };
      img.src = URL.createObjectURL(blob);
    } else {
      loadingText.textContent = `Failed to load panorama texture: ${xhr.statusText}`;
    }
  };
  
  xhr.onerror = () => {
    loadingText.textContent = "Network error occurred while fetching panorama.";
  };
  
  xhr.send();
}

function resizeCanvas() {
  const container = document.getElementById("viewer");
  const dpr = window.devicePixelRatio || 1;
  const W = Math.floor(container.clientWidth  * dpr);
  const H = Math.floor(container.clientHeight * dpr);
  if (canvas.width !== W || canvas.height !== H) {
    canvas.width  = W;
    canvas.height = H;
  }
  gl.viewport(0, 0, canvas.width, canvas.height);
}


// ======================================================
// RENDER LOOP
// ======================================================

function render() {
  if (!gl || !program) return;

  gl.clear(gl.COLOR_BUFFER_BIT);

  gl.uniform1f(uniforms.yaw,   yaw);
  gl.uniform1f(uniforms.pitch, pitch);
  gl.uniform1f(uniforms.fov,   fov);
  gl.uniform2f(uniforms.res,   canvas.width, canvas.height);
  gl.uniform1i(uniforms.tex,   0);

  gl.drawArrays(gl.TRIANGLES, 0, 6);

  if (svgDirty) {
    renderSVGOverlay();
    svgDirty = false;
  }
}


// ======================================================
// SPHERICAL <-> SCREEN PROJECTION
// ======================================================

function screenToSphere(sx, sy) {
  const dpr = window.devicePixelRatio || 1;
  sx *= dpr; sy *= dpr;
  const W = canvas.width;
  const H = canvas.height;
  const aspect = W / H;
  const fovRad = fov * Math.PI / 180;
  const scale = Math.tan(fovRad * 0.5);

  const uvx = (sx / W) * 2 - 1;
  const uvy = 1 - (sy / H) * 2;

  const rax = uvx * scale * aspect;
  const ray = uvy * scale;
  const raz = -1.0;
  const rlen = Math.sqrt(rax*rax + ray*ray + raz*raz);
  const rnx = rax/rlen, rny = ray/rlen, rnz = raz/rlen;

  const cp = Math.cos(-pitch), sp = Math.sin(-pitch);
  const rpx = rnx;
  const rpy = rny*cp - rnz*sp;
  const rpz = rny*sp + rnz*cp;

  const cy = Math.cos(yaw), syy = Math.sin(yaw);
  const rdx =  rpx*cy + rpz*syy;
  const rdy =  rpy;
  const rdz = -rpx*syy + rpz*cy;

  const lon = Math.atan2(rdx, rdz);
  const lat = Math.asin(Math.max(-1, Math.min(1, rdy)));

  return { yaw: lon, pitch: lat };
}

function sphereToScreen(ptYaw, ptPitch) {
  const W = canvas.width;
  const H = canvas.height;
  const aspect = W / H;
  const fovRad = fov * Math.PI / 180;
  const scale = Math.tan(fovRad * 0.5);

  const rdx = Math.sin(ptYaw) * Math.cos(ptPitch);
  const rdy = Math.sin(ptPitch);
  const rdz = Math.cos(ptYaw) * Math.cos(ptPitch);

  const cy = Math.cos(yaw), syy = Math.sin(yaw);
  const rpx =  rdx*cy - rdz*syy;
  const rpy =  rdy;
  const rpz =  rdx*syy + rdz*cy;

  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const rnx =  rpx;
  const rny =  rpy*cp - rpz*sp;
  const rnz =  rpy*sp + rpz*cp;

  if (rnz >= 0) return null;

  const uvx = (rnx / (-rnz)) / scale / aspect;
  const uvy = (rny / (-rnz)) / scale;

  const dpr2 = window.devicePixelRatio || 1;
  const screenX = (uvx + 1) * 0.5 * W;
  const screenY = (1 - (uvy + 1) * 0.5) * H;

  if (screenX < -W || screenX > 2*W || screenY < -H || screenY > 2*H) return null;

  return { x: screenX / dpr2, y: screenY / dpr2 };
}


// ======================================================
// SVG OVERLAY — POLYGONS
// ======================================================

function renderSVGOverlay() {
  while (svgOverlay.firstChild) svgOverlay.removeChild(svgOverlay.firstChild);

  plots.forEach(plot => {
    if (plot.coordinates.length < 3) return;
    const isSelected = selectedPlot && selectedPlot.plotId === plot.plotId;
    const status = (plotStatuses[plot.plotNumber] || "").toLowerCase();
    const color = getStatusColor(status);
    drawPolygonOnSVG(plot.coordinates, color.fill, color.stroke, isSelected ? 0.6 : 0.35, isSelected ? "#facc15" : color.stroke, isSelected ? 3 : 1.5, `plot-${plot.plotId}`);
  });

  if (drawMode && tempCoordinates.length > 0) {
    drawPolygonOnSVG(tempCoordinates, "#ef4444", "#ef4444", 0.2, "#ef4444", 1.5, "temp-poly");
    tempCoordinates.forEach((pt, i) => {
      const screen = sphereToScreen(pt.yaw, pt.pitch);
      if (!screen) return;
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("cx", screen.x);
      circle.setAttribute("cy", screen.y);
      circle.setAttribute("r", "6");
      circle.setAttribute("fill", "#ef4444");
      circle.setAttribute("stroke", "#ffffff");
      circle.setAttribute("stroke-width", "2");
      svgOverlay.appendChild(circle);

      const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
      text.setAttribute("x", screen.x + 9);
      text.setAttribute("y", screen.y + 4);
      text.setAttribute("fill", "#fff");
      text.setAttribute("font-size", "11");
      text.setAttribute("font-family", "monospace");
      text.textContent = i + 1;
      svgOverlay.appendChild(text);
    });
  }

  if (drawMode && hoverSnapPt) {
    const snapCircle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    snapCircle.setAttribute("cx", hoverSnapPt.x.toFixed(1));
    snapCircle.setAttribute("cy", hoverSnapPt.y.toFixed(1));
    snapCircle.setAttribute("r", "6");
    snapCircle.setAttribute("fill", "#fbbf24");
    snapCircle.setAttribute("stroke", "#000");
    snapCircle.setAttribute("stroke-width", "2");
    svgOverlay.appendChild(snapCircle);
  }
}

function drawPolygonOnSVG(coords, fill, stroke, fillOpacity, strokeColor, strokeWidth, id) {
  if (coords.length < 2) return;

  const screenPts = coords.map(pt => sphereToScreen(pt.yaw, pt.pitch));
  const visible = screenPts.filter(p => p !== null);
  if (visible.length < 2) return;

  const pointsStr = screenPts
    .map(p => p ? `${p.x.toFixed(1)},${p.y.toFixed(1)}` : null)
    .filter(Boolean)
    .join(" ");

  const poly = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
  poly.setAttribute("points", pointsStr);
  poly.setAttribute("fill", fill);
  poly.setAttribute("fill-opacity", fillOpacity);
  poly.setAttribute("stroke", strokeColor);
  poly.setAttribute("stroke-width", strokeWidth);
  poly.setAttribute("stroke-linejoin", "round");
  if (id) poly.setAttribute("id", id);

  svgOverlay.appendChild(poly);
}


// ======================================================
// MOUSE HANDLERS
// ======================================================

function onMouseDown(e) {
  didDrag = false;
  dragStartX = e.clientX;
  dragStartY = e.clientY;

  if (e.target.closest(".w-\\[280px\\]") || e.target.closest("#drawHud") || e.target.closest("#confirmModal") || e.target.closest("#genericConfirmModal")) return;

  isDragging = true;
  lastMouseX = e.clientX;
  lastMouseY = e.clientY;
  canvas.style.cursor = "grabbing";
}

let hoverSnapPt = null;

function findSnappedCoordinate(sx, sy) {
  const SNAP_DISTANCE = 15; // pixels
  let closestPt = null;
  let minDist = Infinity;

  plots.forEach(plot => {
    if (!plot.coordinates) return;
    plot.coordinates.forEach(c => {
      const screenPt = sphereToScreen(c.yaw, c.pitch);
      if (!screenPt) return;
      const dist = Math.hypot(screenPt.x - sx, screenPt.y - sy);
      if (dist < SNAP_DISTANCE && dist < minDist) {
        minDist = dist;
        closestPt = { yaw: c.yaw, pitch: c.pitch, isSnapped: true };
      }
    });
  });

  tempCoordinates.forEach(c => {
    const screenPt = sphereToScreen(c.yaw, c.pitch);
    if (!screenPt) return;
    const dist = Math.hypot(screenPt.x - sx, screenPt.y - sy);
    if (dist < SNAP_DISTANCE && dist < minDist) {
      minDist = dist;
      closestPt = { yaw: c.yaw, pitch: c.pitch, isSnapped: true };
    }
  });

  if (closestPt) return closestPt;
  const pt = screenToSphere(sx, sy);
  if (pt) pt.isSnapped = false;
  return pt;
}

function onMouseMove(e) {
  if (isDragging) {
    const dx = e.clientX - lastMouseX;
    const dy = e.clientY - lastMouseY;

    const sensitivity = (fov / REFERENCE_FOV) * MOUSE_SENSITIVITY;
    yaw   -= dx * sensitivity;
    pitch -= dy * sensitivity;
    pitch  = Math.max(MIN_PITCH, Math.min(MAX_PITCH, pitch));

    lastMouseX = e.clientX;
    lastMouseY = e.clientY;

    const totalDx = e.clientX - dragStartX;
    const totalDy = e.clientY - dragStartY;
    if (Math.sqrt(totalDx*totalDx + totalDy*totalDy) > DRAG_THRESHOLD) didDrag = true;

    needsRender = true;
    svgDirty = true;
  } else if (drawMode) {
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const snapped = findSnappedCoordinate(sx, sy);
    if (snapped && snapped.isSnapped) {
      hoverSnapPt = sphereToScreen(snapped.yaw, snapped.pitch);
    } else {
      hoverSnapPt = null;
    }
    needsRender = true;
    svgDirty = true;
  }
}

function onMouseUp(e) {
  isDragging = false;
  canvas.style.cursor = drawMode ? "crosshair" : "grab";
}

function onWheel(e) {
  e.preventDefault();
  fov += e.deltaY * WHEEL_ZOOM_SPEED;
  fov = Math.max(MIN_FOV, Math.min(MAX_FOV, fov));
  needsRender = true;
  svgDirty = true;
}

function onCanvasClick(e) {
  if (didDrag) return;
  if (!drawMode) return;

  // Ignore clicks on UI elements (buttons, sidebars)
  if (e.target.closest(".w-\\[280px\\]") || e.target.closest("#drawHud") || e.target.closest("#confirmModal") || e.target.closest("#genericConfirmModal")) return;

  const rect = canvas.getBoundingClientRect();
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;

  const pt = findSnappedCoordinate(sx, sy);
  if (pt) {
    delete pt.isSnapped;
    tempCoordinates.push(pt);
  }
  updateDrawCount();
  renderTemporaryCoordinateList();
  needsRender = true;
  svgDirty = true;
}


// ======================================================
// TOUCH HANDLERS
// ======================================================

function onTouchStart(e) {
  if (e.touches.length === 1) {
    didDrag = false;
    lastTouchX = e.touches[0].clientX;
    lastTouchY = e.touches[0].clientY;
    dragStartX = lastTouchX;
    dragStartY = lastTouchY;

    if (e.target.closest(".w-\\[280px\\]") || e.target.closest("#drawHud") || e.target.closest("#confirmModal") || e.target.closest("#genericConfirmModal")) return;

    isDragging = true;
  } else if (e.touches.length === 2) {
    isDragging = false;
    lastTouchDist = Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY
    );
  }
}

function onTouchMove(e) {
  e.preventDefault();
  if (e.touches.length === 1 && isDragging) {
    const dx = e.touches[0].clientX - lastTouchX;
    const dy = e.touches[0].clientY - lastTouchY;
    const sensitivity = (fov / REFERENCE_FOV) * TOUCH_SENSITIVITY;
    yaw   -= dx * sensitivity;
    pitch -= dy * sensitivity;
    pitch  = Math.max(MIN_PITCH, Math.min(MAX_PITCH, pitch));
    lastTouchX = e.touches[0].clientX;
    lastTouchY = e.touches[0].clientY;
    const totalDx = e.touches[0].clientX - dragStartX;
    const totalDy = e.touches[0].clientY - dragStartY;
    if (Math.sqrt(totalDx*totalDx + totalDy*totalDy) > TOUCH_DRAG_THRESHOLD) didDrag = true;
    needsRender = true;
    svgDirty = true;
  } else if (e.touches.length === 2) {
    const dist = Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY
    );
    fov -= (dist - lastTouchDist) * PINCH_ZOOM_SPEED;
    fov = Math.max(MIN_FOV, Math.min(MAX_FOV, fov));
    lastTouchDist = dist;
    needsRender = true;
    svgDirty = true;
  }
}

function onTouchEnd(e) {
  if (e.touches.length === 0) {
    if (!didDrag && drawMode && e.changedTouches.length === 1) {
      const rect = canvas.getBoundingClientRect();
      const sx = e.changedTouches[0].clientX - rect.left;
      const sy = e.changedTouches[0].clientY - rect.top;
      const pt = findSnappedCoordinate(sx, sy);
      if (pt) {
        delete pt.isSnapped;
        tempCoordinates.push(pt);
      }
      updateDrawCount();
      renderTemporaryCoordinateList();
      needsRender = true;
      svgDirty = true;
    }
    isDragging = false;
  }
}


// ======================================================
// RENDER LOOP (Continuous check, conditionally rendering - Issue #6)
// ======================================================

function startRenderLoop() {
  function loop() {
    if (needsRender) {
      render();
      needsRender = false;
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}


// ======================================================
// MODE BADGE
// ======================================================

function setModeBadge(text) {
  modeBadge.textContent = text;
}


// ======================================================
// DRAW HUD HELPERS
// ======================================================

function openDrawHud() {
  drawHud.classList.remove("hidden");
  canvas.style.cursor = "crosshair";
  updateDrawCount();
}

function closeDrawHud() {
  drawHud.classList.add("hidden");
  canvas.style.cursor = "grab";
}

function updateDrawCount() {
  drawPointCount.textContent = tempCoordinates.length;
}


// ======================================================
// DRAW MODES
// ======================================================

function startDrawMode() {
  if (!selectedPlot) { showToast("Select a plot first", "warning"); return; }
  drawMode = true;
  retraceMode = false;
  tempCoordinates = [];
  setModeBadge(`Tracing Plot ${selectedPlot.plotNumber}`);
  openDrawHud();
  showToast("Trace Mode Started — click to place points", "info");
}

function startRetraceMode() {
  if (!selectedPlot) { showToast("Select a plot first", "warning"); return; }
  drawMode = true;
  retraceMode = true;
  tempCoordinates = [...selectedPlot.coordinates];
  setModeBadge(`Retracing Plot ${selectedPlot.plotNumber}`);
  openDrawHud();
  needsRender = true;
  svgDirty = true;
  showToast("Retrace Mode Started", "warning");
}

function cancelDrawMode() {
  drawMode = false;
  retraceMode = false;
  tempCoordinates = [];
  closeDrawHud();
  setModeBadge("View Mode");
  needsRender = true;
  svgDirty = true;
  showToast("Tracing Cancelled", "error");
}

function undoLastPoint() {
  if (tempCoordinates.length === 0) return;
  tempCoordinates.pop();
  updateDrawCount();
  renderTemporaryCoordinateList();
  needsRender = true;
  svgDirty = true;
}

// Issue #6 needsRender triggers
function finishDrawing() {
  if (tempCoordinates.length < MIN_POLYGON_POINTS) {
    showToast(`Minimum ${MIN_POLYGON_POINTS} points required`, "error");
    return;
  }
  drawMode = false;
  closeDrawHud();
  renderTemporaryCoordinateList();
  setModeBadge("Ready To Save");
  needsRender = true;
  svgDirty = true;
  showToast("Polygon ready — click Save", "success");
}


// ======================================================
// TEMP COORDINATES PANEL
// ======================================================

function renderTemporaryCoordinateList() {
  coordinatesList.innerHTML = "";
  tempCoordinates.forEach((pt, index) => {
    const row = document.createElement("div");
    row.className = "mb-1";
    row.textContent = `(${index + 1}) ${pt.yaw.toFixed(4)}, ${pt.pitch.toFixed(4)}`;
    coordinatesList.appendChild(row);
  });
  coordinateCount.textContent = `${tempCoordinates.length} Points`;
}


// ======================================================
// RENDER ALL POLYGONS
// ======================================================

function renderAllPolygons() {
  needsRender = true;
  svgDirty = true;
}

function renderPlotPolygon(plot) {
  needsRender = true;
  svgDirty = true;
}


// ======================================================
// SAVE
// ======================================================

btnSave.addEventListener("click", async () => {
  if (!selectedPlot) { showToast("Select a plot", "warning"); return; }
  if (tempCoordinates.length < MIN_POLYGON_POINTS) { showToast("Nothing to save", "warning"); return; }

  selectedPlot.coordinates = [...tempCoordinates];
  tempCoordinates = [];
  drawMode = false;
  retraceMode = false;

  closeDrawHud();
  renderPlotList();
  updateProgress();
  updateSelectedPlotPanel();
  setModeBadge("View Mode");
  needsRender = true;
  svgDirty = true;

  await savePolygonToSupabase(selectedPlot);
});


// ======================================================
// DELETE (Issue #20: uses reusable confirm modal instead of native confirm)
// ======================================================

btnDelete.addEventListener("click", () => {
  if (!selectedPlot) { showToast("Select a plot", "warning"); return; }
  
  showConfirmModal(
    "Delete Polygon?",
    `Are you sure you want to delete the mapping polygon for Plot ${selectedPlot.plotNumber}?`,
    async () => {
      selectedPlot.coordinates = [];
      await deletePolygonFromSupabase(selectedPlot.plotNumber);

      updateProgress();
      updateSelectedPlotPanel();
      renderPlotList();
      needsRender = true;
      svgDirty = true;
      showToast("Plot polygon deleted", "error");
    }
  );
});


// ======================================================
// SEARCH
// ======================================================

plotSearch.addEventListener("input", renderPlotList);


// ======================================================
// GENERATE PROJECT
// ======================================================

generatePlotsBtn.addEventListener("click", () => {
  const count = Number(plotCountInput.value);
  if (!count || count < 1) { showToast("Enter valid plot count", "error"); return; }
  if (plots.length > 0) {
    confirmModal.classList.remove("hidden");
  } else {
    generatePlots(count);
  }
});

cancelGenerate.addEventListener("click", () => confirmModal.classList.add("hidden"));

confirmGenerate.addEventListener("click", () => {
  const count = Number(plotCountInput.value);
  generatePlots(count);
  confirmModal.classList.add("hidden");
});


// ======================================================
// BUTTON EVENTS
// ======================================================

btnStartTracing.addEventListener("click", startDrawMode);
btnRetrace.addEventListener("click", startRetraceMode);
drawUndo.addEventListener("click", undoLastPoint);
drawFinish.addEventListener("click", finishDrawing);
drawCancel.addEventListener("click", cancelDrawMode);


// ======================================================
// APP START
// ======================================================

window.addEventListener("DOMContentLoaded", async () => {
  initWebGL();
  startRenderLoop();

  if (canvas) {
    canvas.style.cursor = "grab";
  }

  const savedCount = localStorage.getItem("plotCount");
  if (savedCount) {
    plotCountInput.value = savedCount;
    generatePlots(Number(savedCount), true);
  }

  updateProgress();
  updateSelectedPlotPanel();
  setModeBadge("View Mode");

  await loadAllData();
});
// ======================================================