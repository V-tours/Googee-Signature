// ======================================================
// SUPABASE CONFIG
// ======================================================

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
// CONFIG
// ======================================================

const MIN_POLYGON_POINTS = 3;
const PANORAMA_URL = "./assets/Panorama1_000.jpg";


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
    success: "bg-green-600",
    error:   "bg-red-600",
    warning: "bg-amber-600",
    info:    "bg-blue-600"
  };
  const toast = document.createElement("div");
  toast.className = `${colors[type]} px-4 py-3 rounded-xl shadow-lg text-sm`;
  toast.textContent = message;
  toastContainer.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
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
    coordinatesList.innerHTML = "No coordinates";
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
    coordinatesList.innerHTML = "No coordinates";
    return;
  }
  coordinatesList.innerHTML = "";
  selectedPlot.coordinates.forEach((pt, index) => {
    const row = document.createElement("div");
    row.className = "mb-1";
    row.textContent = `(${index + 1}) ${pt.yaw.toFixed(4)}, ${pt.pitch.toFixed(4)}`;
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
  renderAllPolygons();
}


// ======================================================
// PLOT CARD
// ======================================================

function createPlotCard(plot) {
  const isSelected = selectedPlot && selectedPlot.plotId === plot.plotId;
  const isMapped = plot.coordinates.length > 0;
  const status = (plotStatuses[plot.plotNumber] || "").toLowerCase();

  const statusDot = { available: "🟢", booked: "🟡", sold: "🔴" }[status] || "⚪";

  const card = document.createElement("div");
  card.className = `p-3 rounded-xl border cursor-pointer transition ${
    isSelected ? "border-blue-500 bg-blue-500/10" : "border-slate-800 bg-slate-900"
  }`;

  card.innerHTML = `
    <div class="flex items-center justify-between">
      <div>
        <div class="font-medium">Plot ${plot.plotNumber}</div>
        <div class="text-xs text-slate-400">${status || "unknown"}</div>
      </div>
      <div class="text-lg">${isSelected ? "🟡" : isMapped ? statusDot : "⚪"}</div>
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

function generatePlots(count) {
  plots.length = 0;
  selectedPlot = null;
  localStorage.setItem("plotCount", count);
  for (let i = 1; i <= count; i++) {
    plots.push({ plotId: generatePlotId(i), plotNumber: i, coordinates: [] });
  }
  renderPlotList();
  updateProgress();
  updateSelectedPlotPanel();
  renderAllPolygons();
  showToast(`${count} plots created`, "success");
}


// ======================================================
// LOAD FROM SUPABASE
// ======================================================

async function loadAllData() {
  showToast("Loading data...", "info");
  try {
    const plotRows = await sbFetch("plots?select=plot,status");
    plotStatuses = {};
    plotRows.forEach(row => { plotStatuses[row.plot] = row.status; });

    const polyRows = await sbFetch("polygons?select=plot_number,coordinates");
    polyRows.forEach(row => {
      const plot = plots.find(p => p.plotNumber === row.plot_number);
      if (plot) plot.coordinates = row.coordinates;
    });

    renderPlotList();
    updateProgress();
    renderAllPolygons();
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
let pitch = Math.PI / 2 - 0.01; // look straight down at nadir
let fov = 75;         // field of view in degrees

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

  // Load panorama
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    document.getElementById("loadingScreen").style.display = "none";
    render();
  };
  img.onerror = () => {
    document.getElementById("loadingScreen").innerHTML = `
      <div style="color:#ef4444;font-size:14px;">Failed to load panorama.<br>Make sure <code>./assets/Panorama1_000.jpg</code> exists.</div>
    `;
  };
  img.src = PANORAMA_URL;

  // Resize
  resizeCanvas();
  window.addEventListener("resize", () => { resizeCanvas(); render(); });

  // Mouse events
  canvas.addEventListener("mousedown", onMouseDown);
  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("mouseup", onMouseUp);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("click", onCanvasClick);

  // Touch events
  canvas.addEventListener("touchstart", onTouchStart, { passive: false });
  canvas.addEventListener("touchmove", onTouchMove, { passive: false });
  canvas.addEventListener("touchend", onTouchEnd);
}

function resizeCanvas() {
  const container = document.getElementById("viewer");
  canvas.width = container.clientWidth;
  canvas.height = container.clientHeight;
  gl.viewport(0, 0, canvas.width, canvas.height);
}


// ======================================================
// RENDER LOOP
// ======================================================

function render() {
  if (!gl || !program) return;

  gl.clear(gl.COLOR_BUFFER_BIT);

  const uYaw   = gl.getUniformLocation(program, "u_yaw");
  const uPitch = gl.getUniformLocation(program, "u_pitch");
  const uFov   = gl.getUniformLocation(program, "u_fov");
  const uRes   = gl.getUniformLocation(program, "u_res");
  const uTex   = gl.getUniformLocation(program, "u_tex");

  gl.uniform1f(uYaw,   yaw);
  gl.uniform1f(uPitch, pitch);
  gl.uniform1f(uFov,   fov);
  gl.uniform2f(uRes,   canvas.width, canvas.height);
  gl.uniform1i(uTex,   0);

  gl.drawArrays(gl.TRIANGLES, 0, 6);

  renderSVGOverlay();
}


// ======================================================
// SPHERICAL <-> SCREEN PROJECTION
// ======================================================

// screenToSphere: screen pixel -> spherical coords stored as {yaw, pitch}
// Follows shader pipeline exactly:
//   ray = normalize(uvx*scale*aspect, uvy*scale, -1)
//   rp  = rotX(-pitch) * ray
//   rd  = rotY(yaw) * rp
//   lon = atan2(rd.x, rd.z)
//   lat = asin(rd.y)
//   stored: yaw=lon, pitch=lat
function screenToSphere(sx, sy) {
  const W = canvas.width;
  const H = canvas.height;
  const aspect = W / H;
  const fovRad = fov * Math.PI / 180;
  const scale = Math.tan(fovRad * 0.5);

  // Step 1: pixel -> NDC [-1,1]
  const uvx = (sx / W) * 2 - 1;
  const uvy = 1 - (sy / H) * 2;

  // Step 2: NDC -> ray (unnormalized, shader normalizes but direction is same)
  const rax = uvx * scale * aspect;
  const ray = uvy * scale;
  const raz = -1.0;
  const rlen = Math.sqrt(rax*rax + ray*ray + raz*raz);
  const rnx = rax/rlen, rny = ray/rlen, rnz = raz/rlen;

  // Step 3: rotX(-pitch) * ray
  const cp = Math.cos(-pitch), sp = Math.sin(-pitch);
  const rpx = rnx;
  const rpy = rny*cp - rnz*sp;
  const rpz = rny*sp + rnz*cp;

  // Step 4: rotY(yaw) * rp
  const cy = Math.cos(yaw), syy = Math.sin(yaw);
  const rdx =  rpx*cy + rpz*syy;
  const rdy =  rpy;
  const rdz = -rpx*syy + rpz*cy;

  // Step 5: spherical coords
  const lon = Math.atan2(rdx, rdz);
  const lat = Math.asin(Math.max(-1, Math.min(1, rdy)));

  return { yaw: lon, pitch: lat };
}

// sphereToScreen: exact inverse of screenToSphere
// Given stored {yaw=lon, pitch=lat}, reverse steps 5->1
function sphereToScreen(ptYaw, ptPitch) {
  const W = canvas.width;
  const H = canvas.height;
  const aspect = W / H;
  const fovRad = fov * Math.PI / 180;
  const scale = Math.tan(fovRad * 0.5);

  // Inverse step 5: lon/lat -> rd
  const rdx = Math.sin(ptYaw) * Math.cos(ptPitch);
  const rdy = Math.sin(ptPitch);
  const rdz = Math.cos(ptYaw) * Math.cos(ptPitch);

  // Inverse step 4: rotY(-yaw) * rd = rp
  const cy = Math.cos(yaw), syy = Math.sin(yaw);
  const rpx =  rdx*cy - rdz*syy;
  const rpy =  rdy;
  const rpz =  rdx*syy + rdz*cy;

  // Inverse step 3: rotX(pitch) * rp = ray  [p_sign=+1, r_sign=+1]
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const rnx =  rpx;
  const rny =  rpy*cp - rpz*sp;
  const rnz =  rpy*sp + rpz*cp;

  // Behind camera (rnz should be negative for visible points)
  if (rnz >= 0) return null;

  // Inverse step 2: ray -> NDC
  const uvx = (rnx / (-rnz)) / scale / aspect;
  const uvy = (rny / (-rnz)) / scale;

  // Inverse step 1: NDC -> pixel
  const screenX = (uvx + 1) * 0.5 * W;
  const screenY = (1 - (uvy + 1) * 0.5) * H;

  if (screenX < -W || screenX > 2*W || screenY < -H || screenY > 2*H) return null;

  return { x: screenX, y: screenY };
}


// ======================================================
// SVG OVERLAY — POLYGONS
// ======================================================

function renderSVGOverlay() {
  // Clear SVG
  while (svgOverlay.firstChild) svgOverlay.removeChild(svgOverlay.firstChild);

  // Draw saved polygons
  plots.forEach(plot => {
    if (plot.coordinates.length < 3) return;
    const isSelected = selectedPlot && selectedPlot.plotId === plot.plotId;
    const status = (plotStatuses[plot.plotNumber] || "").toLowerCase();
    const color = getStatusColor(status);
    drawPolygonOnSVG(plot.coordinates, color.fill, color.stroke, isSelected ? 0.6 : 0.35, isSelected ? "#facc15" : color.stroke, isSelected ? 3 : 1.5, `plot-${plot.plotId}`);
  });

  // Draw temp polygon while drawing
  if (drawMode && tempCoordinates.length > 0) {
    drawPolygonOnSVG(tempCoordinates, "#ef4444", "#ef4444", 0.2, "#ef4444", 1.5, "temp-poly");
    // Draw dots for each temp point
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

      // Point number label
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
}

function drawPolygonOnSVG(coords, fill, stroke, fillOpacity, strokeColor, strokeWidth, id) {
  if (coords.length < 2) return;

  const screenPts = coords.map(pt => sphereToScreen(pt.yaw, pt.pitch));

  // Check if any points are visible
  const visible = screenPts.filter(p => p !== null);
  if (visible.length < 2) return;

  // Build points string — skip null (behind camera) points
  // Use a polyline approach: if a segment crosses behind camera, we skip it
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
  isDragging = true;
  didDrag = false;
  lastMouseX = e.clientX;
  lastMouseY = e.clientY;
  dragStartX = e.clientX;
  dragStartY = e.clientY;
  canvas.style.cursor = "grabbing";
}

function onMouseMove(e) {
  if (!isDragging) return;

  const dx = e.clientX - lastMouseX;
  const dy = e.clientY - lastMouseY;

  const sensitivity = (fov / 75) * 0.003;
  yaw   -= dx * sensitivity;
  pitch += dy * sensitivity;
  pitch  = Math.max(MIN_PITCH, Math.min(MAX_PITCH, pitch));

  lastMouseX = e.clientX;
  lastMouseY = e.clientY;

  const totalDx = e.clientX - dragStartX;
  const totalDy = e.clientY - dragStartY;
  if (Math.sqrt(totalDx*totalDx + totalDy*totalDy) > 4) didDrag = true;

  render();
}

function onMouseUp(e) {
  isDragging = false;
  canvas.style.cursor = drawMode ? "crosshair" : "grab";
}

function onWheel(e) {
  e.preventDefault();
  fov += e.deltaY * 0.05;
  fov = Math.max(MIN_FOV, Math.min(MAX_FOV, fov));
  render();
}

function onCanvasClick(e) {
  if (didDrag) return;
  if (!drawMode) return;

  const rect = canvas.getBoundingClientRect();
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;

  const pt = screenToSphere(sx, sy);
  tempCoordinates.push(pt);
  updateDrawCount();
  renderTemporaryCoordinateList();
  render();
}


// ======================================================
// TOUCH HANDLERS
// ======================================================

function onTouchStart(e) {
  e.preventDefault();
  if (e.touches.length === 1) {
    isDragging = true;
    didDrag = false;
    lastTouchX = e.touches[0].clientX;
    lastTouchY = e.touches[0].clientY;
    dragStartX = lastTouchX;
    dragStartY = lastTouchY;
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
    const sensitivity = (fov / 75) * 0.004;
    yaw   -= dx * sensitivity;
    pitch += dy * sensitivity;
    pitch  = Math.max(MIN_PITCH, Math.min(MAX_PITCH, pitch));
    lastTouchX = e.touches[0].clientX;
    lastTouchY = e.touches[0].clientY;
    const totalDx = e.touches[0].clientX - dragStartX;
    const totalDy = e.touches[0].clientY - dragStartY;
    if (Math.sqrt(totalDx*totalDx + totalDy*totalDy) > 6) didDrag = true;
    render();
  } else if (e.touches.length === 2) {
    const dist = Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY
    );
    fov -= (dist - lastTouchDist) * 0.1;
    fov = Math.max(MIN_FOV, Math.min(MAX_FOV, fov));
    lastTouchDist = dist;
    render();
  }
}

function onTouchEnd(e) {
  if (e.touches.length === 0) {
    // Tap to place point
    if (!didDrag && drawMode && e.changedTouches.length === 1) {
      const rect = canvas.getBoundingClientRect();
      const sx = e.changedTouches[0].clientX - rect.left;
      const sy = e.changedTouches[0].clientY - rect.top;
      const pt = screenToSphere(sx, sy);
      tempCoordinates.push(pt);
      updateDrawCount();
      renderTemporaryCoordinateList();
      render();
    }
    isDragging = false;
  }
}


// ======================================================
// RENDER LOOP (continuous while dragging)
// ======================================================

function startRenderLoop() {
  function loop() {
    render();
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
  render();
  showToast("Retrace Mode Started", "warning");
}

function cancelDrawMode() {
  drawMode = false;
  retraceMode = false;
  tempCoordinates = [];
  closeDrawHud();
  setModeBadge("View Mode");
  render();
  showToast("Tracing Cancelled", "error");
}

function undoLastPoint() {
  if (tempCoordinates.length === 0) return;
  tempCoordinates.pop();
  updateDrawCount();
  renderTemporaryCoordinateList();
  render();
}

function finishDrawing() {
  if (tempCoordinates.length < MIN_POLYGON_POINTS) {
    showToast(`Minimum ${MIN_POLYGON_POINTS} points required`, "error");
    return;
  }
  drawMode = false;
  closeDrawHud();
  renderTemporaryCoordinateList();
  setModeBadge("Ready To Save");
  render();
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
// RENDER ALL POLYGONS (triggers SVG re-render)
// ======================================================

function renderAllPolygons() {
  render();
}

function renderPlotPolygon(plot) {
  render();
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
  render();

  await savePolygonToSupabase(selectedPlot);
});


// ======================================================
// DELETE
// ======================================================

btnDelete.addEventListener("click", async () => {
  if (!selectedPlot) { showToast("Select a plot", "warning"); return; }
  const confirmed = confirm(`Delete polygon for Plot ${selectedPlot.plotNumber}?`);
  if (!confirmed) return;

  selectedPlot.coordinates = [];
  await deletePolygonFromSupabase(selectedPlot.plotNumber);

  updateProgress();
  updateSelectedPlotPanel();
  renderPlotList();
  render();
  showToast("Plot polygon deleted", "error");
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

window.addEventListener("load", async () => {
  initWebGL();
  startRenderLoop();

  canvas.style.cursor = "grab";

  const savedCount = localStorage.getItem("plotCount");
  if (savedCount) {
    plotCountInput.value = savedCount;
    generatePlots(Number(savedCount));
  }

  updateProgress();
  updateSelectedPlotPanel();
  setModeBadge("View Mode");

  // Load data after viewer is ready (image may still be loading, that's fine)
  await loadAllData();
});
// ======================================================