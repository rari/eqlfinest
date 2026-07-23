const canvas = document.getElementById("map-canvas");
const ctx = canvas.getContext("2d");
const mapEmpty = document.getElementById("map-empty");
const mapWorkspace = document.querySelector(".map-workspace");
const mapToolbar = document.querySelector(".map-toolbar");
const mapShell = document.querySelector(".map-shell");
const uploadDrop = document.getElementById("upload-drop");
const mapNameInput = document.getElementById("map-name");
const uploadBtn = document.getElementById("upload-btn");
const uploadInput = document.getElementById("upload-input");
const downloadBtn = document.getElementById("download-btn");
const renderBtn = document.getElementById("render-btn");
const searchInput = document.getElementById("search-input");
const searchPrev = document.getElementById("search-prev");
const searchNext = document.getElementById("search-next");
const searchCount = document.getElementById("search-count");
const mapCoords = document.getElementById("map-coords");
const labelTextInput = document.getElementById("label-text");
const lineColorInput = document.getElementById("line-color");
const labelColorInput = document.getElementById("label-color");
const joinIntersectBtn = document.getElementById("join-intersect");
const endLineBtn = document.getElementById("end-line-btn");
const removeLineBtn = document.getElementById("remove-line-btn");
const recolorLineBtn = document.getElementById("recolor-line-btn");
const applyLabelBtn = document.getElementById("apply-label-btn");
const removeLabelBtn = document.getElementById("remove-label-btn");
const recolorLabelBtn = document.getElementById("recolor-label-btn");
const bgToggleBtn = document.getElementById("bg-toggle");
const zoomInBtn = document.getElementById("zoom-in");
const zoomOutBtn = document.getElementById("zoom-out");
const zoomFitBtn = document.getElementById("zoom-fit");

const LABEL_LAYER_KEYS = ["base", 1, 2, 3];
const SNAP_THRESHOLD = 8;

const state = {
  mapName: "map",
  baseLines: [],
  labelLayers: { base: [], 1: [], 2: [], 3: [] },
  visibleLayers: { base: true, 1: true, 2: true, 3: true },
  activeLayer: "base",
  tool: "pan",
  bgTheme: "light",
  joinAtIntersect: true,
  view: { scale: 1, offsetX: 0, offsetY: 0 },
  selected: null,
  searchMatches: [],
  activeSearchIndex: -1,
  lineChain: null,
  hoverWorld: null,
  loaded: false,
  panning: false,
  panStart: null,
  suppressClick: false,
  draggingLabel: null,
};

function labelLayerKey(value) {
  return value === "base" ? "base" : Number(value);
}

function labelLayerName(layer) {
  return layer === "base" ? "base" : `layer ${layer}`;
}

function sameLabelLayer(a, b) {
  return labelLayerKey(a) === labelLayerKey(b);
}

function hexToRgb(hex) {
  const n = parseInt(String(hex).slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHex(r, g, b) {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

function setStatus(message, isError = false) {
  if (window.EQLToast) {
    EQLToast.show(message, { error: Boolean(isError) });
  }
}

function scrollToAfterUpload() {
  const target = mapToolbar || mapWorkspace;
  if (window.EQLToast) {
    EQLToast.scrollTo(target);
  } else if (target) {
    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "auto"
      : "smooth";
    target.scrollIntoView({ behavior, block: "start" });
  }
}

function resizeCanvas() {
  const wrap = canvas.parentElement;
  const width = Math.max(320, Math.floor(wrap.clientWidth));
  const height = Math.max(420, Math.min(760, Math.floor(window.innerHeight * 0.58)));
  canvas.width = width;
  canvas.height = height;
  canvas.style.aspectRatio = `${width} / ${height}`;
  render();
}

function getDefaultLineColor() {
  return hexToRgb(lineColorInput.value);
}

function getDefaultLabelColor() {
  return hexToRgb(labelColorInput.value);
}

function snapWorldPoint(x, y) {
  if (!state.joinAtIntersect) {
    return { x, y, z: 0 };
  }
  const snapped = EQLMapRenderer.snapToEndpoints(x, y, state.baseLines, SNAP_THRESHOLD);
  return { x: snapped.x, y: snapped.y, z: 0 };
}

function updateButtons() {
  downloadBtn.disabled = !state.loaded;
  renderBtn.disabled = !state.loaded;
  const sel = state.selected;
  const hasLine = sel?.kind === "line";
  const hasLabel = sel?.kind === "point";
  removeLineBtn.disabled = !hasLine;
  recolorLineBtn.disabled = !hasLine;
  removeLabelBtn.disabled = !hasLabel;
  recolorLabelBtn.disabled = !hasLabel;
  applyLabelBtn.disabled = !hasLabel;
  endLineBtn.disabled = !state.lineChain?.points?.length;
  document.querySelectorAll(".move-layer-btn").forEach((btn) => {
    const targetLayer = labelLayerKey(btn.dataset.moveLayer);
    const onCurrentLayer = hasLabel && sameLabelLayer(sel.layer, targetLayer);
    btn.disabled = !hasLabel || onCurrentLayer;
  });
  const moveAllBtn = document.getElementById("move-all-labels-btn");
  if (moveAllBtn) {
    const totalElsewhere = ["base", 2, 3].reduce(
      (sum, layer) => sum + (state.labelLayers[layer]?.length || 0),
      0
    );
    moveAllBtn.disabled = !state.loaded || totalElsewhere === 0;
  }
  const hasSearch = state.searchMatches.length > 0;
  searchPrev.disabled = !hasSearch;
  searchNext.disabled = !hasSearch;
  if (hasSearch) {
    const match = state.searchMatches[state.activeSearchIndex];
    const label = match?.point?.text ? ` ${match.point.text}` : "";
    searchCount.textContent = `${state.activeSearchIndex + 1} / ${state.searchMatches.length}${label}`;
  } else {
    searchCount.textContent = searchInput.value.trim() ? "No matching labels" : "";
  }
  mapEmpty.hidden = state.loaded;
  canvas.dataset.tool = state.tool;
  bgToggleBtn.textContent = `Background: ${state.bgTheme === "light" ? "Light" : "Dark"}`;
  joinIntersectBtn.classList.toggle("active", state.joinAtIntersect);
  joinIntersectBtn.setAttribute("aria-pressed", String(state.joinAtIntersect));
}

function linePreviewOptions() {
  if (!state.lineChain?.points?.length) {
    return null;
  }
  const color = getDefaultLineColor();
  return {
    points: state.lineChain.points,
    r: color.r,
    g: color.g,
    b: color.b,
  };
}

function render() {
  updateButtons();
  if (!state.loaded) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }
  EQLMapRenderer.draw(ctx, {
    width: canvas.width,
    height: canvas.height,
    view: state.view,
    baseLines: state.baseLines,
    labelLayers: state.labelLayers,
    visibleLayers: state.visibleLayers,
    selected: state.selected,
    searchMatches: state.searchMatches,
    activeSearchIndex: state.activeSearchIndex,
    bgTheme: state.bgTheme,
    linePreview: linePreviewOptions(),
    hoverWorld: state.tool === "line" ? state.hoverWorld : null,
    activeTool: state.tool,
  });
}

function fitMap() {
  const bounds = EQLMapRenderer.collectBounds(state.baseLines, state.labelLayers);
  state.view = EQLMapRenderer.fitView(bounds, canvas.width, canvas.height);
  render();
}

function centerOnMatch(match) {
  if (!match) {
    return;
  }
  const point = match.point;
  state.view.offsetX = canvas.width / 2 - point.x * state.view.scale;
  state.view.offsetY = canvas.height / 2 - point.y * state.view.scale;
  state.selected = { kind: "point", layer: match.layer, index: match.index };
  syncSelectionToForm();
  render();
}

function refreshSearch() {
  state.searchMatches = EQLMapRenderer.searchLabels(state.labelLayers, searchInput.value);
  state.activeSearchIndex = state.searchMatches.length ? 0 : -1;
  if (state.searchMatches.length) {
    centerOnMatch(state.searchMatches[0]);
  } else {
    render();
  }
}

function stepSearch(delta) {
  if (!state.searchMatches.length) {
    return;
  }
  state.activeSearchIndex =
    (state.activeSearchIndex + delta + state.searchMatches.length) %
    state.searchMatches.length;
  centerOnMatch(state.searchMatches[state.activeSearchIndex]);
}

function detectLayerFromName(fileName) {
  const base = fileName.replace(/\.txt$/i, "");
  const match = base.match(/^(.*)_([123])$/);
  if (match) {
    return { mapName: match[1], layer: Number(match[2]) };
  }
  return { mapName: base, layer: "base" };
}

function validateUploadFiles(files) {
  if (!files.length) {
    throw new Error("No files selected.");
  }

  const byLayer = {};
  let expectedName = null;

  for (const file of files) {
    if (!/\.txt$/i.test(file.name)) {
      throw new Error(`"${file.name}" is not a .txt map file.`);
    }

    const info = detectLayerFromName(file.name);
    if (!info.mapName) {
      throw new Error(`Could not parse map name from "${file.name}".`);
    }

    if (expectedName === null) {
      expectedName = info.mapName;
    } else if (info.mapName !== expectedName) {
      throw new Error(
        `Mixed map names: "${expectedName}" and "${info.mapName}". All files must share the same base name (e.g. paw.txt, paw_1.txt).`
      );
    }

    const layerKey = info.layer === "base" ? "base" : String(info.layer);
    if (byLayer[layerKey]) {
      throw new Error(`Duplicate file for layer ${layerKey}: "${file.name}".`);
    }
    byLayer[layerKey] = file;
  }

  if (!byLayer.base) {
    throw new Error('Base map required (zone.txt without _1/_2/_3 suffix).');
  }

  return { byLayer, mapName: expectedName };
}

async function loadFiles(fileList) {
  const files = [...fileList];
  const { byLayer, mapName } = validateUploadFiles(files);

  state.baseLines = [];
  state.labelLayers = { base: [], 1: [], 2: [], 3: [] };
  const parseErrors = [];

  for (const [layerKey, file] of Object.entries(byLayer)) {
    const text = await file.text();
    const parsed = EQLMapFormat.parseFile(text);

    if (parsed.errors.length) {
      parseErrors.push(`${file.name}: ${parsed.errors.length} unrecognized line(s).`);
    }

    if (layerKey === "base") {
      if (!parsed.lines.length && parsed.points.length) {
        throw new Error(`${file.name} looks like a label file, not a base map.`);
      }
      if (!parsed.lines.length && !parsed.points.length && parsed.errors.length) {
        throw new Error(`${file.name} could not be parsed as a base map.`);
      }
      state.baseLines = parsed.lines;
      state.labelLayers.base = parsed.points;
    } else {
      if (parsed.lines.length && !parsed.points.length) {
        throw new Error(`${file.name} looks like a base map, not a label layer.`);
      }
      state.labelLayers[Number(layerKey)] = parsed.points;
    }
  }

  state.mapName = EQLMapFormat.stripMapSuffix(mapName);
  mapNameInput.value = state.mapName;
  state.loaded = true;
  state.selected = null;
  state.lineChain = null;
  fitMap();
  refreshSearch();

  const labelCount = LABEL_LAYER_KEYS.reduce(
    (sum, layer) => sum + (state.labelLayers[layer]?.length || 0),
    0
  );
  let message = `Loaded ${state.mapName} (${state.baseLines.length} lines, ${labelCount} labels).`;
  if (parseErrors.length) {
    message += ` Warning: ${parseErrors.join(" ")}`;
  }
  setStatus(message, parseErrors.length > 0);
  canvas.setAttribute(
    "aria-label",
    `Map of ${state.mapName}. Use arrow keys to pan, plus and minus to zoom, Home to fit.`
  );
  canvas.removeAttribute("aria-describedby");
  scrollToAfterUpload();
}

async function downloadZip() {
  if (!state.loaded || typeof JSZip === "undefined") {
    return;
  }
  const zip = new JSZip();
  const baseName = EQLMapFormat.stripMapSuffix(mapNameInput.value || state.mapName);

  zip.file(
    `${baseName}.txt`,
    EQLMapFormat.serializeBase(state.baseLines, state.labelLayers.base || [])
  );
  for (const layer of [1, 2, 3]) {
    zip.file(
      EQLMapFormat.labelFileName(baseName, layer),
      EQLMapFormat.serializeLabels(state.labelLayers[layer] || [])
    );
  }

  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${baseName}-map.zip`;
  link.click();
  URL.revokeObjectURL(url);
  setStatus(`Downloaded ${link.download} (${baseName}.txt + label layers 1-3).`);
}

function downloadPng() {
  if (!state.loaded) {
    return;
  }
  const baseName = EQLMapFormat.stripMapSuffix(mapNameInput.value || state.mapName);
  const bounds = EQLMapRenderer.collectBounds(state.baseLines, state.labelLayers);
  const spanX = Math.max(bounds.maxX - bounds.minX, 1);
  const spanY = Math.max(bounds.maxY - bounds.minY, 1);
  const maxDim = 2400;
  const aspect = spanX / spanY;
  let width;
  let height;
  if (aspect >= 1) {
    width = maxDim;
    height = Math.max(320, Math.round(maxDim / aspect));
  } else {
    height = maxDim;
    width = Math.max(320, Math.round(maxDim * aspect));
  }

  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = width;
  exportCanvas.height = height;
  const exportCtx = exportCanvas.getContext("2d");
  const view = EQLMapRenderer.fitView(bounds, width, height, 48);

  EQLMapRenderer.draw(exportCtx, {
    width,
    height,
    view,
    baseLines: state.baseLines,
    labelLayers: state.labelLayers,
    visibleLayers: state.visibleLayers,
    selected: null,
    searchMatches: [],
    activeSearchIndex: -1,
    bgTheme: state.bgTheme,
    exportMode: true,
    linePreview: null,
    hoverWorld: null,
    activeTool: "pan",
  });

  exportCanvas.toBlob((blob) => {
    if (!blob) {
      setStatus("Could not render PNG.", true);
      return;
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${baseName}.png`;
    link.click();
    URL.revokeObjectURL(url);
    setStatus(`Downloaded ${link.download}.`);
  }, "image/png");
}

const TOOL_SECTIONS = {
  pan: "navigation",
  line: "lines",
  label: "labels",
  "move-label": "move-label",
};

function openSidebarSection(sectionId) {
  if (!sectionId) {
    return;
  }
  const section = document.querySelector(`.sidebar-section[data-section="${sectionId}"]`);
  if (section) {
    section.open = true;
  }
}

function setTool(tool) {
  state.tool = tool;
  state.draggingLabel = null;
  if (tool !== "line") {
    state.lineChain = null;
    state.hoverWorld = null;
  }

  if (tool === "line" && state.activeLayer !== "base") {
    setActiveLayer("base", { skipToolSwitch: true });
  }
  if (tool === "label" && state.activeLayer === "base") {
    setActiveLayer("1", { skipToolSwitch: true });
  }
  if (tool === "move-label" && state.activeLayer === "base") {
    setActiveLayer("1", { skipToolSwitch: true });
  }

  openSidebarSection(TOOL_SECTIONS[tool]);

  document.querySelectorAll(".tool-btn[data-tool]").forEach((btn) => {
    const on = btn.dataset.tool === tool;
    btn.classList.toggle("active", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  });
  render();
}

function setActiveLayer(layer, options = {}) {
  state.activeLayer = layer;
  document.querySelectorAll(".layer-btn[data-layer]").forEach((btn) => {
    const match = String(btn.dataset.layer) === String(layer);
    btn.classList.toggle("active", match);
    btn.setAttribute("aria-pressed", match ? "true" : "false");
  });
  if (!options.skipToolSwitch && layer !== "base" && state.tool === "line") {
    setTool("label");
  }
}

function toggleVisibleLayer(layer) {
  state.visibleLayers[layer] = !state.visibleLayers[layer];
  document.querySelectorAll(".layer-btn[data-vis]").forEach((btn) => {
    const key = btn.dataset.vis === "base" ? "base" : Number(btn.dataset.vis);
    const on = Boolean(state.visibleLayers[key]);
    btn.classList.toggle("active", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  });
  render();
}

function toggleJoinIntersect() {
  state.joinAtIntersect = !state.joinAtIntersect;
  render();
}

function syncSelectionToForm() {
  const sel = state.selected;
  if (sel?.kind === "point") {
    const point = state.labelLayers[sel.layer][sel.index];
    labelTextInput.value = point.text;
    labelColorInput.value = rgbToHex(point.r, point.g, point.b);
  } else if (sel?.kind === "line") {
    const line = state.baseLines[sel.index];
    lineColorInput.value = rgbToHex(line.r, line.g, line.b);
  }
  updateButtons();
}

function selectHit(hit) {
  state.selected = hit;
  syncSelectionToForm();
  render();
}

function removeSelectedLine() {
  if (state.selected?.kind !== "line") {
    return;
  }
  state.baseLines.splice(state.selected.index, 1);
  state.selected = null;
  render();
  setStatus("Line removed.");
}

function removeSelectedLabel() {
  if (state.selected?.kind !== "point") {
    return;
  }
  state.labelLayers[state.selected.layer].splice(state.selected.index, 1);
  state.selected = null;
  refreshSearch();
  render();
  setStatus("Label removed.");
}

function recolorSelectedLine() {
  if (state.selected?.kind !== "line") {
    return;
  }
  const color = getDefaultLineColor();
  const line = state.baseLines[state.selected.index];
  line.r = color.r;
  line.g = color.g;
  line.b = color.b;
  render();
  setStatus("Line recolored.");
}

function recolorSelectedLabel() {
  if (state.selected?.kind !== "point") {
    return;
  }
  const color = getDefaultLabelColor();
  const point = state.labelLayers[state.selected.layer][state.selected.index];
  point.r = color.r;
  point.g = color.g;
  point.b = color.b;
  render();
  setStatus("Label recolored.");
}

function moveSelectedLabelToLayer(targetLayer) {
  const sel = state.selected;
  if (sel?.kind !== "point") {
    return;
  }
  const toLayer = labelLayerKey(targetLayer);
  if (sameLabelLayer(sel.layer, toLayer)) {
    return;
  }
  const [point] = state.labelLayers[sel.layer].splice(sel.index, 1);
  state.labelLayers[toLayer].push(point);
  state.selected = {
    kind: "point",
    layer: toLayer,
    index: state.labelLayers[toLayer].length - 1,
  };
  syncSelectionToForm();
  if (searchInput.value.trim()) {
    refreshSearch();
  } else {
    render();
  }
  setStatus(`Label moved to ${labelLayerName(toLayer)}.`);
}

function moveAllLabelsToLayer1() {
  let count = 0;
  for (const layer of ["base", 2, 3]) {
    const points = state.labelLayers[layer];
    while (points.length) {
      state.labelLayers[1].push(points.shift());
      count += 1;
    }
  }
  state.selected = null;
  if (searchInput.value.trim()) {
    refreshSearch();
  } else {
    render();
  }
  setStatus(count ? `Moved ${count} label(s) to layer 1.` : "No labels to move.");
}

function applyLabelText() {
  if (state.selected?.kind !== "point") {
    return;
  }
  const text = labelTextInput.value.trim();
  if (!text) {
    setStatus("Label text cannot be empty.", true);
    return;
  }
  state.labelLayers[state.selected.layer][state.selected.index].text = text;
  refreshSearch();
  render();
  setStatus("Label text updated.");
}

function endLineChain() {
  if (!state.lineChain?.points?.length) {
    return;
  }
  state.lineChain = null;
  state.hoverWorld = null;
  setStatus("Line finished.");
  render();
}

function addLinePoint(worldX, worldY) {
  const pt = snapWorldPoint(worldX, worldY);
  const color = getDefaultLineColor();

  if (!state.lineChain) {
    state.lineChain = { points: [pt] };
    setStatus("Line started. Click to add more points, then End line.");
    render();
    return;
  }

  const points = state.lineChain.points;
  const prev = points[points.length - 1];
  state.baseLines.push({
    type: "line",
    x1: prev.x,
    y1: prev.y,
    z1: prev.z || 0,
    x2: pt.x,
    y2: pt.y,
    z2: pt.z || 0,
    r: color.r,
    g: color.g,
    b: color.b,
  });
  points.push(pt);
  setStatus(`Line segment added (${state.baseLines.length} total).`);
  render();
}

function addLabelAt(worldX, worldY) {
  const layer = labelLayerKey(state.activeLayer);
  const color = getDefaultLabelColor();
  const text = labelTextInput.value.trim() || "New_Label";
  state.labelLayers[layer].push({
    type: "point",
    x: worldX,
    y: worldY,
    z: 0,
    r: color.r,
    g: color.g,
    b: color.b,
    sublayer: 2,
    text,
  });
  state.selected = {
    kind: "point",
    layer,
    index: state.labelLayers[layer].length - 1,
  };
  syncSelectionToForm();
  if (searchInput.value.trim()) {
    refreshSearch();
  } else {
    render();
  }
  setStatus(`Label added on ${labelLayerName(layer)}.`);
}

function canvasPointFromEvent(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    sx: ((event.clientX - rect.left) / rect.width) * canvas.width,
    sy: ((event.clientY - rect.top) / rect.height) * canvas.height,
  };
}

function handleMapAction(event) {
  if (!state.loaded) {
    return;
  }
  if (state.suppressClick) {
    state.suppressClick = false;
    return;
  }

  const { sx, sy } = canvasPointFromEvent(event);
  const world = EQLMapRenderer.screenToWorld(state.view, sx, sy);

  if (state.tool === "pan") {
    const hit = EQLMapRenderer.findHit(
      state.view,
      state.baseLines,
      state.labelLayers,
      state.visibleLayers,
      sx,
      sy
    );
    selectHit(hit);
    return;
  }

  if (state.tool === "label") {
    addLabelAt(world.x, world.y);
    return;
  }

  if (state.tool === "line") {
    addLinePoint(world.x, world.y);
    return;
  }

  if (state.tool === "move-label") {
    const hit = EQLMapRenderer.findPointHit(
      state.view,
      state.labelLayers,
      state.visibleLayers,
      sx,
      sy
    );
    selectHit(hit);
  }
}

function handlePointerDown(event) {
  if (!state.loaded) {
    return;
  }

  const { sx, sy } = canvasPointFromEvent(event);

  if (state.tool === "move-label") {
    const hit = EQLMapRenderer.findPointHit(
      state.view,
      state.labelLayers,
      state.visibleLayers,
      sx,
      sy
    );
    if (hit) {
      canvas.setPointerCapture(event.pointerId);
      state.draggingLabel = { layer: hit.layer, index: hit.index };
      state.selected = hit;
      state.suppressClick = false;
      syncSelectionToForm();
      render();
    }
    return;
  }

  if (state.tool !== "pan") {
    return;
  }

  canvas.setPointerCapture(event.pointerId);
  state.panning = true;
  state.suppressClick = false;
  state.panStart = {
    x: sx,
    y: sy,
    offsetX: state.view.offsetX,
    offsetY: state.view.offsetY,
  };
}

function handlePointerUp(event) {
  if (canvas.hasPointerCapture(event.pointerId)) {
    canvas.releasePointerCapture(event.pointerId);
  }

  if (state.draggingLabel) {
    if (state.suppressClick) {
      setStatus("Label moved.");
    }
    state.draggingLabel = null;
  }

  state.panning = false;
  state.panStart = null;
}

function handlePointerMove(event) {
  handleCanvasMove(event);
}

function handleCanvasMove(event) {
  const { sx, sy } = canvasPointFromEvent(event);
  const world = EQLMapRenderer.screenToWorld(state.view, sx, sy);
  mapCoords.textContent = `X: ${world.x.toFixed(1)} · Y: ${world.y.toFixed(1)} · Z: 0.0`;

  if (state.tool === "line") {
    state.hoverWorld = snapWorldPoint(world.x, world.y);
    render();
  } else if (state.hoverWorld) {
    state.hoverWorld = null;
  }

  if (state.draggingLabel) {
    const point = state.labelLayers[state.draggingLabel.layer][state.draggingLabel.index];
    if (point) {
      point.x = world.x;
      point.y = world.y;
      state.suppressClick = true;
      render();
    }
    return;
  }

  if (state.panning && state.panStart) {
    const dx = sx - state.panStart.x;
    const dy = sy - state.panStart.y;
    if (Math.hypot(dx, dy) > 4) {
      state.suppressClick = true;
    }
    state.view.offsetX = state.panStart.offsetX + dx;
    state.view.offsetY = state.panStart.offsetY + dy;
    render();
  }
}

function openFilePicker() {
  uploadInput.click();
}

function acceptDroppedFiles(fileList) {
  if (!fileList?.length) {
    return;
  }
  loadFiles(fileList).catch((error) => setStatus(error.message, true));
}

function setDropHighlight(on) {
  mapShell?.classList.toggle("dragover", on);
  uploadDrop?.classList.toggle("dragover", on);
}

if (mapShell) {
  mapShell.addEventListener("dragover", (event) => {
    event.preventDefault();
    setDropHighlight(true);
  });
  mapShell.addEventListener("dragleave", (event) => {
    if (event.relatedTarget && mapShell.contains(event.relatedTarget)) {
      return;
    }
    setDropHighlight(false);
  });
  mapShell.addEventListener("drop", (event) => {
    event.preventDefault();
    setDropHighlight(false);
    acceptDroppedFiles(event.dataTransfer?.files);
  });
}

uploadBtn?.addEventListener("click", openFilePicker);
uploadInput.addEventListener("change", () => {
  acceptDroppedFiles(uploadInput.files);
  uploadInput.value = "";
});

downloadBtn.addEventListener("click", () => {
  downloadZip().catch((error) => setStatus(error.message, true));
});

renderBtn.addEventListener("click", downloadPng);

searchInput.addEventListener("input", refreshSearch);
searchPrev.addEventListener("click", () => stepSearch(-1));
searchNext.addEventListener("click", () => stepSearch(1));

document.querySelectorAll(".tool-btn[data-tool]").forEach((btn) => {
  btn.addEventListener("click", () => setTool(btn.dataset.tool));
});

document.querySelectorAll(".layer-btn[data-layer]").forEach((btn) => {
  btn.addEventListener("click", () => setActiveLayer(btn.dataset.layer));
});

document.querySelectorAll(".layer-btn[data-vis]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const key = btn.dataset.vis === "base" ? "base" : Number(btn.dataset.vis);
    toggleVisibleLayer(key);
  });
});

joinIntersectBtn.addEventListener("click", toggleJoinIntersect);
endLineBtn.addEventListener("click", endLineChain);
removeLineBtn.addEventListener("click", removeSelectedLine);
recolorLineBtn.addEventListener("click", recolorSelectedLine);
applyLabelBtn.addEventListener("click", applyLabelText);
removeLabelBtn.addEventListener("click", removeSelectedLabel);
recolorLabelBtn.addEventListener("click", recolorSelectedLabel);

document.querySelectorAll(".move-layer-btn").forEach((btn) => {
  btn.addEventListener("click", () => moveSelectedLabelToLayer(btn.dataset.moveLayer));
});

document.getElementById("move-all-labels-btn").addEventListener("click", moveAllLabelsToLayer1);

labelTextInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && state.selected?.kind === "point") {
    applyLabelText();
  }
});

bgToggleBtn.addEventListener("click", () => {
  state.bgTheme = state.bgTheme === "dark" ? "light" : "dark";
  render();
});

zoomInBtn.addEventListener("click", () => {
  state.view.scale *= 1.2;
  render();
});
zoomOutBtn.addEventListener("click", () => {
  state.view.scale /= 1.2;
  render();
});
zoomFitBtn.addEventListener("click", fitMap);

canvas.addEventListener("keydown", (event) => {
  if (!state.loaded) {
    return;
  }
  const panStep = 40;
  let handled = true;
  switch (event.key) {
    case "ArrowLeft":
      state.view.offsetX += panStep;
      break;
    case "ArrowRight":
      state.view.offsetX -= panStep;
      break;
    case "ArrowUp":
      state.view.offsetY += panStep;
      break;
    case "ArrowDown":
      state.view.offsetY -= panStep;
      break;
    case "+":
    case "=":
      state.view.scale *= 1.2;
      break;
    case "-":
    case "_":
      state.view.scale /= 1.2;
      break;
    case "Home":
      fitMap();
      break;
    default:
      handled = false;
  }
  if (handled) {
    event.preventDefault();
    render();
  }
});

mapNameInput.addEventListener("change", () => {
  state.mapName = EQLMapFormat.stripMapSuffix(mapNameInput.value);
  mapNameInput.value = state.mapName;
});

canvas.addEventListener("pointerdown", handlePointerDown);
canvas.addEventListener("pointerup", handlePointerUp);
canvas.addEventListener("pointercancel", handlePointerUp);
canvas.addEventListener("click", handleMapAction);
canvas.addEventListener("pointermove", handlePointerMove);

canvas.addEventListener("wheel", (event) => {
  if (!state.loaded) {
    return;
  }
  event.preventDefault();
  const { sx, sy } = canvasPointFromEvent(event);
  const before = EQLMapRenderer.screenToWorld(state.view, sx, sy);
  const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
  state.view.scale *= factor;
  state.view.offsetX = sx - before.x * state.view.scale;
  state.view.offsetY = sy - before.y * state.view.scale;
  render();
}, { passive: false });

window.addEventListener("resize", resizeCanvas);

resizeCanvas();
render();
