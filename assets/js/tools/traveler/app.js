const form = document.getElementById("path-form");
const fromInput = document.getElementById("from-zone");
const toInput = document.getElementById("to-zone");
const fromLabel = document.getElementById("from-zone-label");
const toLabel = document.getElementById("to-zone-label");
const fromBtn = document.getElementById("from-zone-btn");
const toBtn = document.getElementById("to-zone-btn");
const swapBtn = document.getElementById("swap-zones");
const shareBtn = document.getElementById("share-btn");
const resultPanel = document.getElementById("result");
const errorPanel = document.getElementById("error");
const resultTitle = document.getElementById("result-title");
const resultTabs = document.getElementById("result-tabs");
const tabPanels = document.getElementById("tab-panels");
const zoneSheet = document.getElementById("zone-sheet");
const zoneSheetTitle = document.getElementById("zone-sheet-title");
const zoneSheetClose = document.getElementById("zone-sheet-close");
const zoneSheetBackdrop = document.getElementById("zone-sheet-backdrop");
const zoneSearch = document.getElementById("zone-search");
const zoneOptions = document.getElementById("zone-options");
const eraFiltersEl = document.getElementById("era-filters");

const MODES = ["foot", "druid", "wizard"];
const ERA_STORAGE_KEY = "traveler-eras";
const VALID_ERAS = ["classic", "kunark", "velious"];
const SHARE_HASH_PREFIX = "#r=";

let activeMode = "foot";
let preferredShareMode = null;
let syncingHash = false;
let routeResults = {};
let activePickerTarget = null;
let allZones = [];
let selectedEras = new Set(["classic"]);

const modeLabels = {
  foot: "By foot",
  druid: "Druid ports",
  wizard: "Wizard ports",
};

const modeDescriptions = {
  foot: "Zone lines + naval translocators",
  druid: "Foot/naval + Circle spells",
  wizard: "Foot/naval + Portal spells",
};

function setStatus(text, { error = false } = {}) {
  if (window.EQLToast) {
    EQLToast.show(text, { error });
  }
}

function loadZones() {
  allZones = EQLPathfinder.allZones();
}

function renderEraFilters() {
  if (!eraFiltersEl) {
    return;
  }
  eraFiltersEl.querySelectorAll(".filter-chip").forEach((chip) => {
    const active = selectedEras.has(chip.dataset.era);
    chip.classList.toggle("active", active);
    chip.setAttribute("aria-pressed", active ? "true" : "false");
  });
}

function saveEras() {
  try {
    localStorage.setItem(
      ERA_STORAGE_KEY,
      VALID_ERAS.filter((era) => selectedEras.has(era)).join(",")
    );
  } catch (_error) {
    // Ignore storage failures.
  }
}

function clearSelectionsOutsideEra() {
  const zoneSet = new Set(allZones);
  if (fromInput.value && !zoneSet.has(fromInput.value)) {
    setZoneValue("from", "");
  }
  if (toInput.value && !zoneSet.has(toInput.value)) {
    setZoneValue("to", "");
  }
}

function applySelectedEras() {
  if (!selectedEras.size) {
    selectedEras.add("classic");
  }
  EQLPathfinder.setEras([...selectedEras]);
  saveEras();
  renderEraFilters();
  loadZones();
  clearSelectionsOutsideEra();
}

function toggleEra(era) {
  if (!VALID_ERAS.includes(era)) {
    return;
  }
  if (selectedEras.has(era)) {
    if (selectedEras.size === 1) {
      return;
    }
    selectedEras.delete(era);
  } else {
    selectedEras.add(era);
  }
  if (!syncingHash) {
    clearShareHash();
  }
  applySelectedEras();
}

function parseStoredEras(raw) {
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
  } catch (_error) {
    // Fall through.
  }
  return String(raw)
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function highlightMatch(label, query) {
  const safe = escapeHtml(label);
  const cleaned = query.trim();
  if (!cleaned) {
    return safe;
  }

  const folded = label.toLowerCase();
  const needle = cleaned.toLowerCase();
  const index = folded.indexOf(needle);
  if (index < 0) {
    return safe;
  }

  const end = index + needle.length;
  return (
    escapeHtml(label.slice(0, index)) +
    "<mark>" +
    escapeHtml(label.slice(index, end)) +
    "</mark>" +
    escapeHtml(label.slice(end))
  );
}

function setZoneValue(target, value) {
  const input = target === "from" ? fromInput : toInput;
  const label = target === "from" ? fromLabel : toLabel;
  const placeholder =
    target === "from" ? "Choose starting zone" : "Choose destination";

  input.value = value || "";
  if (value) {
    label.textContent = value;
    label.classList.remove("is-placeholder");
  } else {
    label.textContent = placeholder;
    label.classList.add("is-placeholder");
  }
  if (!syncingHash) {
    clearShareHash();
  }
  updateShareButton();
}

function renderZoneOptions(query = "") {
  const matches = query.trim()
    ? EQLPathfinder.searchZones(query, 80)
    : allZones.slice(0, 80);

  zoneOptions.innerHTML = "";

  if (!matches.length) {
    zoneOptions.innerHTML =
      '<li class="zone-options-empty">No zones match that search.</li>';
    return;
  }

  const fragment = document.createDocumentFragment();
  matches.forEach((zone) => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "zone-option";
    button.dataset.zone = zone;
    button.innerHTML = highlightMatch(zone, query);
    item.appendChild(button);
    fragment.appendChild(item);
  });
  zoneOptions.appendChild(fragment);
}

function openZoneSheet(target) {
  activePickerTarget = target;
  zoneSheetTitle.textContent =
    target === "from" ? "Starting zone" : "Destination zone";
  zoneSearch.value = "";
  renderZoneOptions();
  zoneSheet.classList.remove("hidden");
  document.body.classList.add("sheet-open");
  const panel = zoneSheet.querySelector(".zone-sheet-panel") || zoneSheet;
  if (window.EQLFocusTrap) {
    EQLFocusTrap.activate(panel, {
      initialFocus: zoneSearch,
      onEscape: closeZoneSheet,
    });
  } else {
    window.setTimeout(() => zoneSearch.focus(), 30);
  }
}

function closeZoneSheet() {
  activePickerTarget = null;
  zoneSheet.classList.add("hidden");
  document.body.classList.remove("sheet-open");
  if (window.EQLFocusTrap) {
    EQLFocusTrap.deactivate();
  }
}

function selectZone(zone) {
  if (!activePickerTarget) {
    return;
  }
  setZoneValue(activePickerTarget, zone);
  closeZoneSheet();
}

function hidePanels() {
  resultPanel.classList.add("hidden");
  errorPanel.classList.add("hidden");
}

function showError(message) {
  hidePanels();
  errorPanel.textContent = message;
  errorPanel.classList.remove("hidden");
}

function hopLabel(count) {
  return count === 1 ? "1 hop" : `${count} hops`;
}

function stepDescription(step) {
  const to = escapeHtml(step.to || "");
  const label = escapeHtml(step.label || "");
  if (step.type === "port" && step.label) {
    return `Port via <strong>${label}</strong> to ${to}`;
  }
  if (step.type === "boat" && step.label) {
    return `Take the <strong>${label}</strong> to ${to}`;
  }
  return `Travel to <strong>${to}</strong>`;
}

function stepBadgeClass(type) {
  if (type === "boat" || type === "port" || type === "walk") {
    return type;
  }
  return "walk";
}

function renderSteps(container, data) {
  container.innerHTML = "";

  if (!data) {
    const item = document.createElement("li");
    item.innerHTML = `<span class="step-badge walk">N/A</span><span class="step-text">No route found for this travel mode.</span>`;
    container.appendChild(item);
    return;
  }

  if (!data.steps.length) {
    const item = document.createElement("li");
    item.innerHTML = `<span class="step-badge walk">Here</span><span class="step-text">You are already in the destination zone.</span>`;
    container.appendChild(item);
    return;
  }

  data.steps.forEach((step, index) => {
    const item = document.createElement("li");
    const type = stepBadgeClass(step.type);
    const badge = type === "boat" ? "naval" : type;
    item.innerHTML = `
      <span class="step-badge ${type}">${badge}</span>
      <span class="step-text">${index + 1}. ${stepDescription(step)}</span>
    `;
    container.appendChild(item);
  });
}

function tabHopText(mode) {
  const data = routeResults[mode];
  if (!data) return "No route";
  return hopLabel(data.hops);
}

function selectTab(mode) {
  activeMode = mode;
  const tabs = [...resultTabs.querySelectorAll(".tab-btn")];

  tabs.forEach((button) => {
    const selected = button.dataset.mode === mode;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-selected", selected ? "true" : "false");
    button.tabIndex = selected ? 0 : -1;
  });

  tabPanels.querySelectorAll(".tab-panel").forEach((panel) => {
    const selected = panel.dataset.mode === mode;
    panel.classList.toggle("active", selected);
    panel.hidden = !selected;
  });
}

function buildTabs() {
  resultTabs.innerHTML = "";
  tabPanels.innerHTML = "";

  MODES.forEach((mode) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `tab-btn${mode === activeMode ? " active" : ""}`;
    button.dataset.mode = mode;
    button.id = `tab-${mode}`;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", mode === activeMode ? "true" : "false");
    button.setAttribute("aria-controls", `panel-${mode}`);
    button.tabIndex = mode === activeMode ? 0 : -1;
    button.innerHTML = `
      <span class="tab-title">${modeLabels[mode]}</span>
      <span class="tab-hops">${tabHopText(mode)}</span>
    `;
    button.addEventListener("click", () => selectTab(mode));
    resultTabs.appendChild(button);

    const panel = document.createElement("div");
    panel.className = `tab-panel${mode === activeMode ? " active" : ""}`;
    panel.dataset.mode = mode;
    panel.id = `panel-${mode}`;
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", `tab-${mode}`);
    panel.hidden = mode !== activeMode;

    const data = routeResults[mode];
    const summary = document.createElement("p");
    summary.className = "result-summary";
    summary.textContent = data
      ? `Shortest route ${modeDescriptions[mode].toLowerCase()}: ${hopLabel(data.hops)}.`
      : `No route found ${modeDescriptions[mode].toLowerCase()}.`;

    const steps = document.createElement("ol");
    steps.className = "step-list";
    renderSteps(steps, data);

    panel.append(summary, steps);
    tabPanels.appendChild(panel);
  });

  const bestMode = MODES.reduce((best, mode) => {
    const current = routeResults[mode];
    const bestData = routeResults[best];
    if (!current) return best;
    if (!bestData) return mode;
    return current.hops < bestData.hops ? mode : best;
  }, MODES[0]);

  if (preferredShareMode && MODES.includes(preferredShareMode)) {
    activeMode = preferredShareMode;
    preferredShareMode = null;
  } else if (routeResults[bestMode]) {
    activeMode = bestMode;
  }

  selectTab(activeMode);
}

function showResults(from, to, results) {
  hidePanels();
  routeResults = results;

  const anyRoute = MODES.some((mode) => results[mode]);
  if (!anyRoute) {
    showError("No route found for any travel mode. Check your zone names and try again.");
    return;
  }

  const sample = MODES.map((mode) => results[mode]).find(Boolean);
  resultTitle.textContent = `${sample.start} → ${sample.end}`;
  buildTabs();
  resultPanel.classList.remove("hidden");
  const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";
  resultPanel.scrollIntoView({ behavior, block: "start" });
}

function fetchPath(from, to, mode) {
  return EQLPathfinder.shortestPath(from, to, mode);
}

function updateShareButton() {
  if (!shareBtn) {
    return;
  }
  shareBtn.disabled = !(fromInput.value.trim() && toInput.value.trim());
}

function toBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(text) {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/");
  const padLength = (4 - (padded.length % 4)) % 4;
  const binary = atob(padded + "=".repeat(padLength));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function encodeSharePayload() {
  const payload = {
    f: fromInput.value.trim(),
    t: toInput.value.trim(),
    e: VALID_ERAS.filter((era) => selectedEras.has(era)),
    m: activeMode,
  };
  return toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
}

function decodeSharePayload(encoded) {
  try {
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(encoded)));
    if (!payload || typeof payload.f !== "string" || typeof payload.t !== "string") {
      return null;
    }
    const from = payload.f.trim();
    const to = payload.t.trim();
    if (!from || !to) {
      return null;
    }
    const eras = Array.isArray(payload.e)
      ? payload.e.map((era) => String(era).toLowerCase()).filter((era) => VALID_ERAS.includes(era))
      : [];
    const mode = MODES.includes(payload.m) ? payload.m : null;
    return { from, to, eras, mode };
  } catch {
    return null;
  }
}

function shareUrlForRoute() {
  return `${location.origin}${location.pathname}${location.search}${SHARE_HASH_PREFIX}${encodeSharePayload()}`;
}

function clearShareHash() {
  if (!(location.hash || "").startsWith(SHARE_HASH_PREFIX)) {
    return;
  }
  history.replaceState(null, "", `${location.pathname}${location.search}`);
}

async function copyShareLink() {
  if (!fromInput.value.trim() || !toInput.value.trim()) {
    setStatus("Pick from and to zones before sharing.");
    return;
  }
  const url = shareUrlForRoute();
  try {
    await navigator.clipboard.writeText(url);
    setStatus("Share link copied (your page stays on this search).");
  } catch {
    setStatus(`Copy this link: ${url}`);
  }
}

async function findRoutes({ preferredMode = null } = {}) {
  hidePanels();

  const from = fromInput.value.trim();
  const to = toInput.value.trim();

  if (!from || !to) {
    showError("Please provide both from and to zones.");
    return false;
  }

  const goBtn = form.querySelector(".go-btn");
  goBtn.disabled = true;
  goBtn.textContent = "Searching...";

  try {
    preferredShareMode = preferredMode;
    const results = Object.fromEntries(
      MODES.map((mode) => [mode, fetchPath(from, to, mode)])
    );
    showResults(from, to, results);
    updateShareButton();
    return true;
  } finally {
    goBtn.disabled = false;
    goBtn.textContent = "Find routes";
  }
}

async function loadFromHash() {
  const hash = location.hash || "";
  if (!hash.startsWith(SHARE_HASH_PREFIX)) {
    return false;
  }
  const decoded = decodeSharePayload(hash.slice(SHARE_HASH_PREFIX.length));
  if (!decoded) {
    setStatus("That share link looks invalid.", { error: true });
    return false;
  }

  syncingHash = true;
  try {
    if (decoded.eras.length) {
      selectedEras = new Set(decoded.eras);
      applySelectedEras();
    }
    const zoneSet = new Set(allZones);
    if (!zoneSet.has(decoded.from) || !zoneSet.has(decoded.to)) {
      setStatus(
        "That share link uses a zone outside the selected expansions (or unknown to this guide).",
        { error: true }
      );
      return false;
    }
    setZoneValue("from", decoded.from);
    setZoneValue("to", decoded.to);
  } finally {
    syncingHash = false;
  }

  await findRoutes({ preferredMode: decoded.mode });
  return true;
}

swapBtn.addEventListener("click", () => {
  const fromValue = fromInput.value;
  const toValue = toInput.value;
  setZoneValue("from", toValue);
  setZoneValue("to", fromValue);
});

fromBtn.addEventListener("click", () => openZoneSheet("from"));
toBtn.addEventListener("click", () => openZoneSheet("to"));
zoneSheetClose.addEventListener("click", closeZoneSheet);
zoneSheetBackdrop.addEventListener("click", closeZoneSheet);
zoneSearch.addEventListener("input", () => renderZoneOptions(zoneSearch.value));

resultTabs.addEventListener("keydown", (event) => {
  const tabs = [...resultTabs.querySelectorAll('[role="tab"]')];
  if (!tabs.length) {
    return;
  }
  const currentIndex = tabs.findIndex((tab) => tab === document.activeElement);
  if (currentIndex < 0) {
    return;
  }
  let nextIndex = currentIndex;
  if (event.key === "ArrowRight" || event.key === "ArrowDown") {
    nextIndex = (currentIndex + 1) % tabs.length;
  } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
    nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
  } else if (event.key === "Home") {
    nextIndex = 0;
  } else if (event.key === "End") {
    nextIndex = tabs.length - 1;
  } else {
    return;
  }
  event.preventDefault();
  const next = tabs[nextIndex];
  selectTab(next.dataset.mode);
  next.focus();
});

zoneOptions.addEventListener("click", (event) => {
  const button = event.target.closest(".zone-option");
  if (!button) {
    return;
  }
  selectZone(button.dataset.zone);
});

if (eraFiltersEl) {
  eraFiltersEl.addEventListener("click", (event) => {
    const button = event.target.closest(".filter-chip");
    if (!button) {
      return;
    }
    toggleEra(button.dataset.era);
  });
}

if (shareBtn) {
  shareBtn.addEventListener("click", () => {
    copyShareLink().catch((error) => setStatus(error.message, { error: true }));
  });
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  await findRoutes();
});

window.addEventListener("hashchange", () => {
  if (syncingHash) {
    return;
  }
  loadFromHash().catch((error) => setStatus(error.message, { error: true }));
});

async function boot() {
  try {
    await EQLPathfinder.init();
    const stored =
      parseStoredEras(localStorage.getItem(ERA_STORAGE_KEY)) ||
      parseStoredEras(localStorage.getItem("traveler-era"));
    selectedEras = new Set(
      (stored?.length ? stored : [EQLPathfinder.defaultEra()]).filter((era) =>
        VALID_ERAS.includes(era)
      )
    );
    if (!selectedEras.size) {
      selectedEras.add("classic");
    }
    applySelectedEras();
    updateShareButton();
    await loadFromHash();
  } catch (error) {
    showError("Could not load zone data. Refresh the page and try again.");
    console.error(error);
  }
}

boot();
