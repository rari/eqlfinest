const uploadDrop = document.getElementById("upload-drop");
let fileInput = document.getElementById("file-input");
const uploadBtn = document.getElementById("upload-btn");
const previewOnlyBtn = document.getElementById("preview-only-btn");
const classChipRow = document.getElementById("class-chip-row");
const playerLevelInput = document.getElementById("player-level");
const classPanel = document.getElementById("class-panel");
const editorPanel = document.getElementById("editor-panel");
const barSelect = document.getElementById("bar-select");
const barNameInput = document.getElementById("bar-name-input");
const addBarBtn = document.getElementById("add-bar-btn");
const cloneBarBtn = document.getElementById("clone-bar-btn");
const removeBarBtn = document.getElementById("remove-bar-btn");
const downloadBtn = document.getElementById("download-btn");
const shareBtn = document.getElementById("share-btn");
const slotGrid = document.getElementById("slot-grid");
const indexUpdated = document.getElementById("index-updated");
const nextLevelBtn = document.getElementById("next-level-btn");
const nextLevelBtnLabel = document.getElementById("next-level-btn-label");
const swapStatus = document.getElementById("swap-status");

const picker = document.getElementById("picker");
const pickerTitle = document.getElementById("picker-title");
const pickerClose = document.getElementById("picker-close");
const pickerSearch = document.getElementById("picker-search");
const pickerCat = document.getElementById("picker-cat");
const pickerScope = document.getElementById("picker-scope");
const pickerResults = document.getElementById("picker-results");
const pickerNewOnly = document.getElementById("picker-new-only");
const pickerNewOnlyWrap = document.getElementById("picker-new-only-wrap");

const SLOT_COUNT = EQLLoadout.SLOT_COUNT;
const MAX_CLASSES = 3;
const MAX_RESULTS = 250;
const MAX_LEVEL = 50;
const SHARE_HASH_PREFIX = "#b=";

// Pure-melee classes have no memmable spells (only disciplines / combat arts).
const MELEE_ONLY_CLASSES = new Set(["WAR", "MNK", "ROG", "BER"]);
// Categories that are activated abilities, not spellbook/gem spells.
const NON_SPELL_CATEGORIES = new Set(["Disciplines", "Combat Abilities"]);

const CLASS_ORDER = [
  "WAR", "CLR", "PAL", "RNG", "SHD", "DRU", "MNK", "BRD",
  "ROG", "SHM", "NEC", "WIZ", "MAG", "ENC", "BST", "BER",
];
const CLASS_NAMES = {
  WAR: "Warrior", CLR: "Cleric", PAL: "Paladin", RNG: "Ranger",
  SHD: "Shadow Knight", DRU: "Druid", MNK: "Monk", BRD: "Bard",
  ROG: "Rogue", SHM: "Shaman", NEC: "Necromancer", WIZ: "Wizard",
  MAG: "Magician", ENC: "Enchanter", BST: "Beastlord", BER: "Berserker",
};

// Display order for the class picker: two rows of 8, alphabetical by full name.
// (Sprite column order still follows CLASS_ORDER, so icons use that index.)
const CLASS_PICKER_ORDER = [
  "BRD", "BST", "BER", "CLR", "DRU", "ENC", "MAG", "MNK",
  "NEC", "PAL", "RNG", "ROG", "SHD", "SHM", "WAR", "WIZ",
];

let spellDb = { spells: {}, paths: {} };
let tipDb = { spells: {} };
let allSpells = [];
let spellByName = new Map();
let candidateSpells = [];
let selectedClasses = [];
let playerLevel = 0;
let model = null;
let bars = [];
let currentBarIndex = null;
let sourceFileName = "loadout.ini";
let sharedMode = false;
let previewMode = false;
let syncingHash = false;
let pickerSlot = null;
let pickerMode = "assign";
let swapSourceSlot = null;
let tipEl = null;
let tipSpellId = null;
let tipEnabled = false;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function setStatus(text, { error = false } = {}) {
  if (window.EQLToast) {
    EQLToast.show(text, { error });
  }
}

function scrollToAfterUpload() {
  const target = classPanel || editorPanel;
  if (window.EQLToast) {
    EQLToast.scrollTo(target);
  } else if (target) {
    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "auto"
      : "smooth";
    target.scrollIntoView({ behavior, block: "start" });
  }
}

function formatUpdatedDate(iso) {
  const raw = String(iso || "").trim();
  if (!raw) {
    return "";
  }
  const parsed = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return raw;
  }
  return parsed.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

function renderIndexUpdated() {
  const label = formatUpdatedDate(spellDb.updated);
  indexUpdated.textContent = label ? `Spell index last updated on ${label}` : "";
}

function spellTipForEntry(entry) {
  return entry?.id != null ? lookupTip(entry.id) : null;
}

function targetDecor(entry, tip = null) {
  const t = tip ?? spellTipForEntry(entry);
  const kind = EQLSpellMeta.getTargetKind(entry, t);
  const label = EQLSpellMeta.TARGET_LABELS[kind] || kind;
  const fullTarget = t?.tg ? String(t.tg).trim() : "";
  const title = fullTarget || label;
  return {
    kind,
    label,
    title,
    kindClass: `target-kind-${kind}`,
  };
}

function spellstrikeChipHtml() {
  return `<span class="spellstrike-chip">Spellstrike</span>`;
}

function spellMetaLine(entry, tip = null) {
  const t = tip ?? spellTipForEntry(entry);
  const family = EQLSpellMeta.getSpellFamily(entry, t);
  const variant = EQLSpellMeta.getSpellVariant(entry, t);
  return `${escapeHtml(family)} · ${escapeHtml(variant)}`;
}

function isSpellstrike(entry, tip = null) {
  const t = tip ?? spellTipForEntry(entry);
  return EQLSpellMeta.isSpellstrikeEligible(entry, t, selectedClasses);
}

function isNextLevelValid() {
  return playerLevel > 0 && playerLevel < MAX_LEVEL;
}

function nextLevelNumber() {
  return playerLevel > 0 ? playerLevel + 1 : null;
}

function canUseNewOnlyFilter() {
  return playerLevel > 0 && pickerMode !== "nextLevel";
}

function isSpellNew(entry) {
  if (playerLevel <= 0) {
    return false;
  }
  const codes = selectedClasses.length ? selectedClasses : CLASS_ORDER;
  return codes.some(
    (code) => classCanCast(entry, code) && Number(entry.c[code]) === playerLevel
  );
}

function buildNextLevelSpellList() {
  const levelN = nextLevelNumber();
  if (levelN == null || levelN > MAX_LEVEL) {
    return [];
  }
  const codes = selectedClasses.length ? selectedClasses : CLASS_ORDER;
  const seen = new Set();
  const out = [];
  for (const entry of allSpells) {
    if (!spellHasSelectedClass(entry)) {
      continue;
    }
    const learnsAtN = codes.some(
      (code) => classCanCast(entry, code) && Number(entry.c[code]) === levelN
    );
    if (!learnsAtN || seen.has(entry.id)) {
      continue;
    }
    seen.add(entry.id);
    out.push(entry);
  }
  out.sort((a, b) => a.n.localeCompare(b.n, undefined, { sensitivity: "base" }));
  return out;
}

function updateNextLevelLabel() {
  if (!nextLevelBtnLabel) {
    return;
  }
  const n = playerLevel > 0 ? playerLevel + 1 : 2;
  nextLevelBtnLabel.textContent = `Show level ${n} spells`;
}

function updatePickerNewOnlyState() {
  if (!pickerNewOnly) {
    return;
  }
  const applies = canUseNewOnlyFilter();
  pickerNewOnly.disabled = !applies;
  if (!applies) {
    pickerNewOnly.checked = false;
  }
  if (pickerNewOnlyWrap) {
    if (pickerMode === "nextLevel") {
      pickerNewOnlyWrap.title = "Not available when browsing next-level spells";
    } else if (playerLevel <= 0) {
      pickerNewOnlyWrap.title = "Set your level to filter new spells";
    } else {
      pickerNewOnlyWrap.title = "";
    }
  }
}

/* ---------- class selection ---------- */

function renderClassChips() {
  classChipRow.innerHTML = CLASS_PICKER_ORDER.map((code) => {
    const on = selectedClasses.includes(code);
    const spriteIndex = CLASS_ORDER.indexOf(code);
    return `
      <button type="button" class="class-toggle class-${code.toLowerCase()}${on ? " is-on" : ""}"
        data-class="${code}" aria-pressed="${on ? "true" : "false"}"
        aria-label="${escapeHtml(CLASS_NAMES[code])}" title="${escapeHtml(CLASS_NAMES[code])}">
        <span class="class-icon" data-ci="${spriteIndex}" aria-hidden="true"></span>
        <span class="class-code">${escapeHtml(code)}</span>
      </button>
    `;
  }).join("");
}

function toggleClass(code) {
  if (!CLASS_ORDER.includes(code)) {
    return;
  }
  const at = selectedClasses.indexOf(code);
  if (at >= 0) {
    selectedClasses.splice(at, 1);
  } else {
    if (selectedClasses.length >= MAX_CLASSES) {
      setStatus(`Pick at most ${MAX_CLASSES} classes. Deselect one first.`, { error: true });
      return;
    }
    selectedClasses.push(code);
  }
  renderClassChips();
  rebuildCandidates();
  if (bars.length) {
    renderSlots();
  }
  updateControls();
}

/* ---------- spell index helpers ---------- */

function buildSpellArray() {
  spellByName = new Map();
  allSpells = Object.entries(spellDb.spells || {}).map(([id, entry]) => {
    const row = {
      id: Number(id),
      n: entry.n || "",
      i: entry.i || "",
      c: entry.c || null,
      cat: entry.cat || "",
      sub: entry.sub || "",
      p: entry.p || 0,
      l: entry.l || "",
    };
    const key = String(row.n).trim().toLowerCase();
    if (key && !spellByName.has(key)) {
      spellByName.set(key, { ...entry, id: row.id });
    }
    return row;
  });
}

function lookupSpellByName(name) {
  const key = String(name || "")
    .trim()
    .toLowerCase();
  return key ? spellByName.get(key) || null : null;
}

function nextUpgrade(entry) {
  const path =
    entry?.l && Array.isArray(spellDb.paths?.[entry.l]) ? spellDb.paths[entry.l] : [];
  if (path.length < 2) {
    return { upgrade: null, isFinal: false, hasLine: false };
  }
  const currentName = String(entry.n || "")
    .trim()
    .toLowerCase();
  const index = path.findIndex((name) => String(name).toLowerCase() === currentName);
  if (index < 0) {
    return { upgrade: null, isFinal: false, hasLine: true };
  }
  if (index >= path.length - 1) {
    return { upgrade: null, isFinal: true, hasLine: true };
  }
  const nextName = path[index + 1];
  const byName = lookupSpellByName(nextName);
  let upgrade = byName;
  if (byName?.id != null) {
    const full = lookupSpell(byName.id);
    upgrade = full ? { ...full, id: byName.id } : byName;
  } else if (nextName) {
    upgrade = { n: nextName };
  }
  return { upgrade, isFinal: false, hasLine: true };
}

function classChipIsOutOfReach(entry, code) {
  if (!entry?.c || !classCanCast(entry, code)) {
    return false;
  }
  const level = Number(entry.c[code]);
  const classMismatch =
    selectedClasses.length > 0 && !selectedClasses.includes(code);
  const levelTooHigh = playerLevel > 0 && level > playerLevel;
  return classMismatch || levelTooHigh;
}

function upgradeRowHtml(entry, info = null) {
  if (!entry) {
    return "";
  }
  const { upgrade, isFinal, hasLine } = info || nextUpgrade(entry);
  if (upgrade) {
    const icon = upgrade.i ? spellIconHtml(upgrade) : "";
    const levels = classChipsHtml(upgrade, {
      scopeToSelection: false,
      markOutOfReach: true,
    });
    const tip = spellTipForEntry(upgrade);
    const spellstrike = isSpellstrike(upgrade, tip);
    const tipAttr =
      upgrade.id != null
        ? ` data-tip-spell="${escapeHtml(upgrade.id)}"`
        : "";
    const badges = spellstrike ? spellstrikeChipHtml() : "";
    return `
      <div class="slot-upgrade has-next${spellstrike ? " is-spellstrike" : ""}"${tipAttr}>
        <span class="slot-upgrade-label">Next upgrade</span>
        <div class="slot-upgrade-title">${icon}<strong>${escapeHtml(upgrade.n)}</strong></div>
        ${badges}
        ${levels ? `<div class="slot-upgrade-levels">${levels}</div>` : ""}
      </div>
    `;
  }
  if (isFinal) {
    return `<div class="slot-upgrade is-final"><span class="slot-upgrade-label">Top of spell line</span></div>`;
  }
  if (hasLine) {
    return `<div class="slot-upgrade"><span class="slot-upgrade-label">Upgrade path unavailable</span></div>`;
  }
  return `<div class="slot-upgrade is-none"><span class="slot-upgrade-label">No spell line</span></div>`;
}

// A spell is only offered when it's on the authoritative EQL player-spell
// allow-list (entry.p, built from the wiki class spell tables) AND a non-melee
// class can cast it. Everything off that list is "extra" (item-clicky / monster
// illusions, NPC effects, removed spells) and is never shown.
function isMemmableSpell(entry) {
  if (!entry.p) {
    return false;
  }
  return !NON_SPELL_CATEGORIES.has(entry.cat);
}

function classCanCast(entry, code) {
  if (MELEE_ONLY_CLASSES.has(code)) {
    return false;
  }
  return Number(entry.c?.[code]) > 0;
}

function spellHasSelectedClass(entry) {
  if (!entry.c || !isMemmableSpell(entry)) {
    return false;
  }
  const codes = selectedClasses.length ? selectedClasses : CLASS_ORDER;
  return codes.some((code) => classCanCast(entry, code));
}

function scopeLevel(entry) {
  const codes = selectedClasses.length ? selectedClasses : CLASS_ORDER;
  let best = Infinity;
  for (const code of codes) {
    if (classCanCast(entry, code)) {
      best = Math.min(best, Number(entry.c[code]));
    }
  }
  return best;
}

function rebuildCandidates() {
  candidateSpells = allSpells.filter(spellHasSelectedClass);
  candidateSpells.sort((a, b) => {
    const la = scopeLevel(a);
    const lb = scopeLevel(b);
    if (la !== lb) {
      return la - lb;
    }
    return a.n.localeCompare(b.n, undefined, { sensitivity: "base" });
  });
  if (isPickerOpen()) {
    populateCategoryFilter();
    renderPickerResults();
  }
}

function lookupSpell(spellId) {
  if (spellId == null) {
    return null;
  }
  const entry = spellDb.spells[String(spellId)];
  if (!entry) {
    return null;
  }
  return { ...entry, id: Number(spellId) };
}

function lookupTip(spellId) {
  if (spellId == null) {
    return null;
  }
  return tipDb.spells?.[String(spellId)] || null;
}

function formatTipTime(seconds) {
  const n = Number(seconds);
  if (!Number.isFinite(n) || n < 0) {
    return "";
  }
  const text = Number.isInteger(n) ? String(n) : String(n);
  return `${text} sec`;
}

function formatTipClasses(classLevels) {
  if (!classLevels || typeof classLevels !== "object") {
    return "";
  }
  return CLASS_ORDER
    .filter((code) => Number(classLevels[code]) > 0)
    .map((code) => `${code}(${Number(classLevels[code])})`)
    .join(" ");
}

function formatTipLevel(classLevels) {
  if (!classLevels || typeof classLevels !== "object") {
    return "";
  }
  const levels = CLASS_ORDER
    .map((code) => Number(classLevels[code]))
    .filter((level) => Number.isFinite(level) && level > 0);
  if (!levels.length) {
    return "";
  }
  return String(Math.min(...levels));
}

function tipLine(label, value) {
  if (value == null || value === "") {
    return "";
  }
  return `<div class="spell-tip-line"><span class="spell-tip-label">${escapeHtml(label)}:</span> ${escapeHtml(value)}</div>`;
}

function renderTipHtml(spellId) {
  const tip = lookupTip(spellId);
  const entry = lookupSpell(spellId);
  if (!tip && !entry) {
    return "";
  }
  const name = tip?.n || entry?.n || `Spell ${spellId}`;
  const iconFile = tip?.i || entry?.i || "";
  const icon = iconFile
    ? `<img class="spell-tip-icon" src="${window.EQLDom ? window.EQLDom.iconUrl("spells", iconFile) : `../assets/icons/spells/${escapeHtml(iconFile)}`}" alt="" width="40" height="40" decoding="async">`
    : "";
  const classLevels = tip?.cl || entry?.c || null;
  const classes = formatTipClasses(classLevels);
  const level = formatTipLevel(classLevels);
  const body = [
    tipLine("Duration", tip?.dur),
    tipLine("Level", level),
    tipLine("Skill", tip?.sk),
    tipLine("Mana", tip?.m),
    tipLine("Cast", formatTipTime(tip?.ct)),
    tipLine("Recovery", formatTipTime(tip?.rv)),
    tipLine("Reuse", formatTipTime(tip?.rc)),
    tipLine("Spell Line", tip?.ln),
    tipLine("Target", tip?.tg),
  ].join("");
  const description = tip?.d
    ? `<p class="spell-tip-desc">${escapeHtml(tip.d)}</p>`
    : "";
  return `
    <div class="spell-tip-head">
      <div class="spell-tip-titles">
        <strong class="spell-tip-name">Spell: ${escapeHtml(name)}</strong>
        ${classes ? `<div class="spell-tip-classes">${escapeHtml(classes)}</div>` : ""}
      </div>
      ${icon}
    </div>
    <div class="spell-tip-stats">${body}</div>
    ${description}
  `;
}

function ensureTipEl() {
  if (tipEl) {
    return tipEl;
  }
  tipEl = document.createElement("div");
  tipEl.className = "spell-tip hidden";
  tipEl.setAttribute("role", "tooltip");
  document.body.appendChild(tipEl);
  return tipEl;
}

function hideSpellTip() {
  tipSpellId = null;
  if (tipEl) {
    tipEl.classList.add("hidden");
    tipEl.innerHTML = "";
  }
}

function positionSpellTip(clientX, clientY) {
  const el = ensureTipEl();
  if (el.classList.contains("hidden")) {
    return;
  }
  const pad = 14;
  const rect = el.getBoundingClientRect();
  let left = clientX + 16;
  let top = clientY + 16;
  if (left + rect.width + pad > window.innerWidth) {
    left = Math.max(pad, clientX - rect.width - 16);
  }
  if (top + rect.height + pad > window.innerHeight) {
    top = Math.max(pad, clientY - rect.height - 16);
  }
  el.style.left = `${Math.round(left)}px`;
  el.style.top = `${Math.round(top)}px`;
}

function showSpellTip(spellId, clientX, clientY) {
  if (!tipEnabled || spellId == null) {
    return;
  }
  const html = renderTipHtml(spellId);
  if (!html) {
    hideSpellTip();
    return;
  }
  const el = ensureTipEl();
  if (tipSpellId !== String(spellId)) {
    tipSpellId = String(spellId);
    el.innerHTML = html;
  }
  el.classList.remove("hidden");
  positionSpellTip(clientX, clientY);
}

function tipTargetSpellId(node) {
  // Slot action chrome should not steal tips; picker rows are buttons and must tip.
  if (node?.closest?.(".slot-btn, .slot-actions")) {
    return null;
  }
  const host = node?.closest?.("[data-tip-spell]");
  if (!host) {
    return null;
  }
  const raw = host.getAttribute("data-tip-spell");
  return raw && raw !== "null" ? raw : null;
}

function bindSpellTips(root) {
  if (!root) {
    return;
  }
  root.addEventListener("pointerover", (event) => {
    if (!tipEnabled || event.pointerType === "touch") {
      return;
    }
    const spellId = tipTargetSpellId(event.target);
    if (spellId) {
      showSpellTip(spellId, event.clientX, event.clientY);
    }
  });
  root.addEventListener("pointermove", (event) => {
    if (!tipEnabled || event.pointerType === "touch" || !tipSpellId) {
      return;
    }
    if (tipTargetSpellId(event.target) === tipSpellId) {
      positionSpellTip(event.clientX, event.clientY);
    }
  });
  root.addEventListener("pointerout", (event) => {
    if (!tipEnabled) {
      return;
    }
    const next = event.relatedTarget;
    if (next && root.contains(next) && tipTargetSpellId(next) === tipSpellId) {
      return;
    }
    if (!tipTargetSpellId(event.target)) {
      return;
    }
    hideSpellTip();
  });
}

function spellIconHtml(entry, extraClass = "") {
  const file = entry?.i;
  if (!file) {
    return "";
  }
  return `<img class="spell-icon ${extraClass}" src="${window.EQLDom ? window.EQLDom.iconUrl("spells", file) : `../assets/icons/spells/${escapeHtml(file)}`}" alt="" width="24" height="24" loading="lazy" decoding="async">`;
}

function classChipsHtml(
  entry,
  { scopeToSelection = true, markOutOfReach = false, wrapperClass = "slot-class-pills" } = {}
) {
  if (!entry?.c) {
    return "";
  }
  const pool =
    scopeToSelection && selectedClasses.length ? selectedClasses : CLASS_ORDER;
  const codes = pool.filter((code) => classCanCast(entry, code));
  if (!codes.length) {
    return "";
  }
  const chips = codes
    .map((code) => {
      const warn =
        markOutOfReach && classChipIsOutOfReach(entry, code) ? " is-out-of-reach" : "";
      return `<span class="class-chip class-${code.toLowerCase()}${warn}">${escapeHtml(code)} ${Number(entry.c[code])}</span>`;
    })
    .join("");
  return `<span class="${wrapperClass}">${chips}</span>`;
}

function slotSwapBtnHtml(slotNumber) {
  return `<button type="button" class="slot-btn slot-swap" data-slot="${slotNumber}">Swap</button>`;
}

/* ---------- share links ---------- */

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

function encodeSharePayload(bar) {
  const payload = {
    n: bar.name || "Shared bar",
    s: (bar.slots || []).slice(0, SLOT_COUNT).map((id) => (id == null ? -1 : id)),
  };
  while (payload.s.length < SLOT_COUNT) {
    payload.s.push(-1);
  }
  return toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
}

function decodeSharePayload(encoded) {
  try {
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(encoded)));
    if (!payload || !Array.isArray(payload.s)) {
      return null;
    }
    const slots = payload.s.slice(0, SLOT_COUNT).map((value) => {
      const id = Number.parseInt(String(value), 10);
      if (!Number.isFinite(id) || id < 0) {
        return null;
      }
      return id;
    });
    while (slots.length < SLOT_COUNT) {
      slots.push(null);
    }
    return {
      name: String(payload.n || "Shared bar").trim() || "Shared bar",
      slots,
    };
  } catch {
    return null;
  }
}

function shareUrlForBar(bar) {
  if (!bar) {
    return `${location.origin}${location.pathname}${location.search}`;
  }
  return `${location.origin}${location.pathname}${location.search}${SHARE_HASH_PREFIX}${encodeSharePayload(bar)}`;
}

function clearShareHash() {
  if (!(location.hash || "").startsWith(SHARE_HASH_PREFIX)) {
    return;
  }
  history.replaceState(null, "", `${location.pathname}${location.search}`);
}

function applySharedBar(decoded) {
  sharedMode = true;
  previewMode = false;
  model = null;
  sourceFileName = "shared";
  bars = [{ index: 1, name: decoded.name, slots: decoded.slots.slice() }];
  currentBarIndex = 1;
  editorPanel.classList.remove("hidden");
  cancelSwap();
  selectBar(1);
  setStatus(`Opened shared bar “${decoded.name}”. Load a loadout file to edit and download.`);
}

function startPreviewOnly() {
  clearShareHash();
  sharedMode = false;
  previewMode = true;
  model = { preview: true };
  sourceFileName = "preview.ini";
  const defaultName = selectedClasses.length
    ? `${selectedClasses.join("-")} Preview`
    : "Preview bar";
  bars = [
    {
      index: 1,
      name: defaultName,
      slots: new Array(SLOT_COUNT).fill(null),
    },
  ];
  currentBarIndex = 1;
  editorPanel.classList.remove("hidden");
  cancelSwap();
  selectBar(1);
  setStatus("Preview mode — build one bar and share it. Download needs a loaded loadout file.");
  scrollToAfterUpload();
}

function loadFromHash() {
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
  applySharedBar(decoded);
  syncingHash = false;
  return true;
}

async function copyShareLink() {
  const bar = currentBar();
  if (!bar) {
    setStatus("Load a bar before copying a share link.");
    return;
  }
  // Clipboard only — never rewrite the address bar (avoids frozen shared refreshes).
  const url = shareUrlForBar(bar);
  try {
    await navigator.clipboard.writeText(url);
    setStatus("Share link copied (your page stays on the open loadout).");
  } catch {
    setStatus(`Copy this link: ${url}`);
  }
}

/* ---------- editor ---------- */

function currentBar() {
  return bars.find((bar) => bar.index === currentBarIndex) || bars[0] || null;
}

function populateBarSelect() {
  barSelect.innerHTML = bars
    .map((bar) => `<option value="${bar.index}">${escapeHtml(bar.name || `Saved bar ${bar.index}`)}</option>`)
    .join("");
  if (currentBarIndex != null) {
    barSelect.value = String(currentBarIndex);
  }
}

function cancelSwap() {
  if (swapSourceSlot == null) {
    updateSwapStatus();
    return;
  }
  swapSourceSlot = null;
  updateSwapStatus();
  renderSlots();
}

function updateSwapStatus() {
  if (!swapStatus) {
    return;
  }
  if (swapSourceSlot == null) {
    swapStatus.classList.add("hidden");
    swapStatus.innerHTML = "";
    return;
  }
  swapStatus.classList.remove("hidden");
  swapStatus.innerHTML =
    `Swap: gem ${swapSourceSlot} selected — click another gem to swap, or ` +
    `<button type="button" class="link-btn swap-cancel">Cancel</button>.`;
}

function handleSwapClick(slotNumber) {
  if (swapSourceSlot == null) {
    swapSourceSlot = slotNumber;
    updateSwapStatus();
    renderSlots();
    return;
  }
  if (swapSourceSlot === slotNumber) {
    cancelSwap();
    return;
  }
  const bar = currentBar();
  if (!bar) {
    return;
  }
  const from = swapSourceSlot - 1;
  const to = slotNumber - 1;
  const temp = bar.slots[from];
  bar.slots[from] = bar.slots[to];
  bar.slots[to] = temp;
  const fromNum = swapSourceSlot;
  swapSourceSlot = null;
  updateSwapStatus();
  renderSlots();
  setStatus(`Swapped gems ${fromNum} and ${slotNumber}.`);
}

function renderSlots() {
  const bar = currentBar();
  if (!bar) {
    slotGrid.innerHTML = '<p class="empty-note">No saved bars. Use “Add bar” to create one.</p>';
    return;
  }
  slotGrid.innerHTML = bar.slots
    .map((spellId, index) => renderSlot(index + 1, spellId))
    .join("");
}

function renderSlot(slotNumber, spellId) {
  const isSwapSource = swapSourceSlot === slotNumber;
  const swapBtn = slotSwapBtnHtml(slotNumber);
  const swapClass = isSwapSource ? " is-swap-source" : "";

  if (spellId == null) {
    return `
      <article class="slot slot-empty target-kind-missing${swapClass}" data-slot="${slotNumber}">
        <span class="slot-number">${slotNumber}</span>
        <div class="slot-main">
          <div class="slot-body"><span class="slot-empty-label">Empty gem</span></div>
          <div class="slot-actions">
            ${swapBtn}
            <button type="button" class="slot-btn slot-edit" data-slot="${slotNumber}">Add spell</button>
          </div>
        </div>
      </article>
    `;
  }
  const entry = lookupSpell(spellId);
  const name = entry ? escapeHtml(entry.n) : `Unknown spell`;
  const icon = entry ? spellIconHtml(entry) : "";
  const tip = entry ? spellTipForEntry(entry) : null;
  const decor = entry ? targetDecor(entry, tip) : { kindClass: "target-kind-missing" };
  const spellstrike = entry ? isSpellstrike(entry, tip) : false;
  const meta = entry
    ? spellMetaLine(entry, tip)
    : `ID ${escapeHtml(spellId)} · not in spell index`;
  const currentLevels = entry
    ? classChipsHtml(entry, { scopeToSelection: false })
    : "";
  const upgradeInfo = entry ? nextUpgrade(entry) : null;
  const upgradeRow = entry ? upgradeRowHtml(entry, upgradeInfo) : "";
  const upgradeClass = upgradeInfo?.upgrade
    ? " has-upgrade"
    : upgradeInfo?.isFinal
      ? " fully-upgraded"
      : "";
  const canAutoUpgrade = Boolean(upgradeInfo?.upgrade?.id);
  const upgradeBtn = canAutoUpgrade
    ? `<button type="button" class="slot-btn slot-upgrade-btn" data-slot="${slotNumber}" data-upgrade-id="${escapeHtml(upgradeInfo.upgrade.id)}">Upgrade</button>`
    : "";
  const badges = entry
    ? [spellstrike ? spellstrikeChipHtml() : ""].filter(Boolean).join("")
    : "";
  const slotClasses = [
    entry ? "" : "slot-unknown",
    decor.kindClass,
    spellstrike ? "is-spellstrike" : "",
    upgradeClass.trim(),
    swapClass.trim(),
  ].filter(Boolean).join(" ");
  const targetTitle = entry ? escapeHtml(decor.title) : "";
  return `
    <article class="slot ${slotClasses}" data-slot="${slotNumber}"${targetTitle ? ` title="${targetTitle}"` : ""}>
      <span class="slot-number">${slotNumber}</span>
      <div class="slot-main">
        <div class="slot-body">
          <div class="slot-current"${entry ? ` data-tip-spell="${escapeHtml(spellId)}"` : ""}>
            <div class="slot-title">${icon}<strong>${name}</strong></div>
            <span class="slot-meta">${meta}</span>
            ${badges}
            ${currentLevels ? `<div class="slot-current-levels">${currentLevels}</div>` : ""}
          </div>
          ${upgradeRow}
        </div>
        <div class="slot-actions">
          ${swapBtn}
          ${upgradeBtn}
          <button type="button" class="slot-btn slot-edit" data-slot="${slotNumber}">Change</button>
          <button type="button" class="slot-btn slot-clear" data-slot="${slotNumber}">Clear</button>
        </div>
      </div>
    </article>
  `;
}

function selectBar(index) {
  cancelSwap();
  currentBarIndex = index;
  const bar = currentBar();
  if (bar) {
    currentBarIndex = bar.index;
    barNameInput.value = bar.name || "";
  } else {
    barNameInput.value = "";
  }
  populateBarSelect();
  renderSlots();
  updateControls();
}

function updateControls() {
  const hasBar = Boolean(currentBar());
  const atCap = model && !previewMode ? EQLLoadout.nextFreeIndex(model, bars) == null : true;
  const barLocked = sharedMode || previewMode;
  downloadBtn.disabled = !model || sharedMode || previewMode;
  removeBarBtn.disabled = !hasBar || barLocked;
  addBarBtn.disabled = !model || barLocked || bars.length >= EQLLoadout.MAX_LOADOUTS || previewMode;
  barNameInput.disabled = !hasBar || sharedMode;
  shareBtn.disabled = !hasBar;
  if (cloneBarBtn) {
    cloneBarBtn.disabled = !model || barLocked || !hasBar || atCap;
  }
  if (nextLevelBtn) {
    nextLevelBtn.disabled = !isNextLevelValid();
  }
  updateNextLevelLabel();
  if (!isPickerOpen()) {
    updatePickerNewOnlyState();
  }
}

function addBar() {
  if (!model || previewMode || sharedMode) {
    return;
  }
  const index = EQLLoadout.nextFreeIndex(model, bars);
  if (index == null) {
    setStatus(`All ${EQLLoadout.MAX_LOADOUTS} loadout slots are in use.`, { error: true });
    return;
  }
  const defaultName = selectedClasses.length
    ? `${selectedClasses.join("-")} Default`
    : `Saved bar ${index}`;
  const bar = { index, name: defaultName, slots: new Array(SLOT_COUNT).fill(null) };
  bars.push(bar);
  bars.sort((a, b) => a.index - b.index);
  currentBarIndex = index;
  selectBar(index);
  setStatus(`Added bar ${index}.`);
}

function cloneBar() {
  if (!model || sharedMode || previewMode) {
    return;
  }
  const source = currentBar();
  if (!source) {
    return;
  }
  const index = EQLLoadout.nextFreeIndex(model, bars);
  if (index == null) {
    setStatus(`All ${EQLLoadout.MAX_LOADOUTS} loadout slots are in use.`, { error: true });
    return;
  }
  const existingNames = bars.map((bar) => bar.name || "");
  const name = EQLSpellMeta.uniqueCloneName(
    source.name || `Saved bar ${source.index}`,
    existingNames
  );
  const bar = {
    index,
    name,
    slots: source.slots.slice().map((id) => (id == null ? null : id)),
  };
  bars.push(bar);
  bars.sort((a, b) => a.index - b.index);
  selectBar(index);
  setStatus(`Cloned bar as “${name}”.`);
}

function removeBar() {
  const bar = currentBar();
  if (!bar) {
    return;
  }
  if (!window.confirm(`Remove "${bar.name || `Saved bar ${bar.index}`}" (bar ${bar.index})?`)) {
    return;
  }
  bars = bars.filter((item) => item.index !== bar.index);
  currentBarIndex = bars.length ? bars[0].index : null;
  selectBar(currentBarIndex);
  setStatus(`Removed bar ${bar.index}.`);
}

/* ---------- spell picker ---------- */

function isPickerOpen() {
  return !picker.classList.contains("hidden");
}

function openPicker(slotNumber) {
  const bar = currentBar();
  if (!bar) {
    return;
  }
  cancelSwap();
  pickerMode = "assign";
  pickerSlot = slotNumber;
  pickerTitle.textContent = `Choose a spell for gem ${slotNumber}`;
  pickerSearch.value = "";
  populateCategoryFilter();
  renderPickerScope();
  updatePickerNewOnlyState();
  renderPickerResults();
  picker.classList.remove("hidden");
  document.body.classList.add("picker-open");
  if (window.EQLFocusTrap) {
    EQLFocusTrap.activate(picker.querySelector(".picker-dialog") || picker, {
      initialFocus: pickerSearch,
      onEscape: closePicker,
    });
  } else {
    window.setTimeout(() => pickerSearch.focus(), 30);
  }
}

function openNextLevelPicker() {
  if (!isNextLevelValid()) {
    return;
  }
  cancelSwap();
  pickerMode = "nextLevel";
  pickerSlot = null;
  const levelN = nextLevelNumber();
  pickerTitle.textContent = `Spells learned at level ${levelN}`;
  pickerSearch.value = "";
  populateCategoryFilter();
  renderPickerScope();
  updatePickerNewOnlyState();
  renderPickerResults();
  picker.classList.remove("hidden");
  document.body.classList.add("picker-open");
  if (window.EQLFocusTrap) {
    EQLFocusTrap.activate(picker.querySelector(".picker-dialog") || picker, {
      initialFocus: pickerSearch,
      onEscape: closePicker,
    });
  } else {
    window.setTimeout(() => pickerSearch.focus(), 30);
  }
}

function closePicker() {
  picker.classList.add("hidden");
  document.body.classList.remove("picker-open");
  pickerSlot = null;
  pickerMode = "assign";
  hideSpellTip();
  if (window.EQLFocusTrap) {
    EQLFocusTrap.deactivate();
  }
}

function renderPickerScope() {
  if (pickerMode === "nextLevel") {
    const levelN = nextLevelNumber();
    if (selectedClasses.length) {
      const names = selectedClasses.map((code) => CLASS_NAMES[code] || code).join(", ");
      pickerScope.textContent = `Spells ${names} learn at level ${levelN}. Browse only — pick a gem and use Change to assign.`;
    } else {
      pickerScope.textContent = `Spells any class learns at level ${levelN}. Pick your classes above to narrow this down. Browse only.`;
    }
    return;
  }
  const levelNote = playerLevel > 0 ? ` · level ${playerLevel} or lower` : "";
  if (selectedClasses.length) {
    const names = selectedClasses.map((code) => CLASS_NAMES[code] || code).join(", ");
    pickerScope.textContent = `Showing spells for: ${names}${levelNote}`;
  } else {
    pickerScope.textContent = `Showing all player spells${levelNote}. Pick your classes above to narrow this down.`;
  }
}

function pickerSpellPool() {
  return pickerMode === "nextLevel" ? buildNextLevelSpellList() : candidateSpells;
}

function populateCategoryFilter() {
  const pool = pickerSpellPool();
  const familiesPresent = new Set();
  for (const entry of pool) {
    const tip = spellTipForEntry(entry);
    familiesPresent.add(EQLSpellMeta.getSpellFamily(entry, tip));
  }
  const sorted = EQLSpellMeta.FAMILIES.filter((family) => familiesPresent.has(family));
  const prev = pickerCat.value;
  pickerCat.innerHTML =
    `<option value="">All families</option>` +
    sorted.map((family) => `<option value="${escapeHtml(family)}">${escapeHtml(family)}</option>`).join("");
  if (prev && sorted.includes(prev)) {
    pickerCat.value = prev;
  }
}

function equippedSpellIds() {
  const bar = currentBar();
  if (!bar) {
    return new Set();
  }
  return new Set(bar.slots.filter((id) => id != null).map(Number));
}

function matchingSpells() {
  const query = pickerSearch.value.trim().toLowerCase();
  const familyFilter = pickerCat.value;
  const numeric = /^\d+$/.test(query);
  const newOnly = pickerNewOnly?.checked && canUseNewOnlyFilter();
  const pool = pickerSpellPool();
  const out = [];
  for (const entry of pool) {
    if (pickerMode !== "nextLevel" && playerLevel > 0 && scopeLevel(entry) > playerLevel) {
      continue;
    }
    if (newOnly && !isSpellNew(entry)) {
      continue;
    }
    if (familyFilter) {
      const tip = spellTipForEntry(entry);
      if (EQLSpellMeta.getSpellFamily(entry, tip) !== familyFilter) {
        continue;
      }
    }
    if (query) {
      const nameHit = entry.n.toLowerCase().includes(query);
      const idHit = numeric && String(entry.id).includes(query);
      if (!nameHit && !idHit) {
        continue;
      }
    }
    out.push(entry);
  }
  out.sort((a, b) => {
    const tipA = spellTipForEntry(a);
    const tipB = spellTipForEntry(b);
    if (familyFilter) {
      const subCmp = spellSubcategory(a, tipA).localeCompare(
        spellSubcategory(b, tipB),
        undefined,
        { sensitivity: "base" }
      );
      if (subCmp !== 0) {
        return subCmp;
      }
    } else {
      const famCmp = EQLSpellMeta.getSpellFamily(a, tipA).localeCompare(
        EQLSpellMeta.getSpellFamily(b, tipB),
        undefined,
        { sensitivity: "base" }
      );
      if (famCmp !== 0) {
        return famCmp;
      }
    }
    const la = scopeLevel(a);
    const lb = scopeLevel(b);
    if (la !== lb) {
      return la - lb;
    }
    return a.n.localeCompare(b.n, undefined, { sensitivity: "base" });
  });
  return out;
}

function spellSubcategory(entry, tip = null) {
  const t = tip ?? spellTipForEntry(entry);
  const sub = String(entry?.sub || "").trim();
  if (sub) {
    return sub;
  }
  return EQLSpellMeta.getSpellVariant(entry, t) || "General";
}

function pickerRowHtml(entry, equipped, { hideFamily = false } = {}) {
  const tip = spellTipForEntry(entry);
  const decor = targetDecor(entry, tip);
  const spellstrike = isSpellstrike(entry, tip);
  const onBar = equipped.has(entry.id);
  const family = EQLSpellMeta.getSpellFamily(entry, tip);
  const variant = EQLSpellMeta.getSpellVariant(entry, tip);
  const meta = hideFamily
    ? escapeHtml(variant)
    : `${escapeHtml(family)} · ${escapeHtml(variant)}`;
  const equippedLabel = onBar ? `<span class="picker-equipped">On bar</span>` : "";
  const rowClasses = [
    onBar ? "is-equipped" : "",
    decor.kindClass,
    spellstrike ? "is-spellstrike" : "",
  ].filter(Boolean).join(" ");
  const badges = [
    spellstrike ? spellstrikeChipHtml() : "",
    equippedLabel,
  ].filter(Boolean).join("");
  return `
    <button type="button" class="picker-row ${rowClasses}" data-id="${entry.id}" data-tip-spell="${entry.id}" title="${escapeHtml(
      onBar ? "Already on this bar" : decor.title
    )}">
      ${spellIconHtml(entry)}
      <span class="picker-name">${escapeHtml(entry.n)}</span>
      <span class="picker-sub">${meta}</span>
      ${badges}
      ${classChipsHtml(entry, { scopeToSelection: true, wrapperClass: "picker-classes" })}
    </button>
  `;
}

function renderPickerResults() {
  const results = matchingSpells();
  const capped = results.length > MAX_RESULTS;
  const shown = capped ? results.slice(0, MAX_RESULTS) : results;
  const equipped = equippedSpellIds();
  const familyFilter = pickerCat.value;

  if (!shown.length) {
    const hint =
      pickerMode === "nextLevel"
        ? " or class selection"
        : selectedClasses.length
          ? " or class selection"
          : "";
    pickerResults.innerHTML = `<p class="picker-empty">No spells match. Try a different search${hint}.</p>`;
    return;
  }

  let html = "";
  if (familyFilter) {
    const bySub = new Map();
    for (const entry of shown) {
      const tip = spellTipForEntry(entry);
      const sub = spellSubcategory(entry, tip);
      if (!bySub.has(sub)) {
        bySub.set(sub, []);
      }
      bySub.get(sub).push(entry);
    }
    const subKeys = [...bySub.keys()].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" })
    );
    for (const sub of subKeys) {
      const group = bySub.get(sub);
      html += `<div class="picker-group">${escapeHtml(sub)}</div>`;
      for (const entry of group) {
        html += pickerRowHtml(entry, equipped, { hideFamily: true });
      }
    }
  } else {
    const byFamily = new Map();
    for (const entry of shown) {
      const tip = spellTipForEntry(entry);
      const family = EQLSpellMeta.getSpellFamily(entry, tip);
      if (!byFamily.has(family)) {
        byFamily.set(family, []);
      }
      byFamily.get(family).push(entry);
    }
    for (const family of EQLSpellMeta.FAMILIES) {
      const group = byFamily.get(family);
      if (!group?.length) {
        continue;
      }
      html += `<div class="picker-group">${escapeHtml(family)}</div>`;
      for (const entry of group) {
        html += pickerRowHtml(entry, equipped);
      }
    }
  }
  if (capped) {
    html += `<p class="picker-more">Showing first ${MAX_RESULTS}. Narrow your search to see more.</p>`;
  }
  pickerResults.innerHTML = html;
}

function assignSpell(spellId) {
  const bar = currentBar();
  if (!bar || pickerSlot == null || pickerMode !== "assign") {
    return;
  }
  bar.slots[pickerSlot - 1] = spellId;
  renderSlots();
  const entry = lookupSpell(spellId);
  setStatus(`Set gem ${pickerSlot} to ${entry ? entry.n : `spell ${spellId}`}.`);
  closePicker();
}

function clearSlot(slotNumber) {
  const bar = currentBar();
  if (!bar) {
    return;
  }
  bar.slots[slotNumber - 1] = null;
  renderSlots();
}

function applyUpgrade(slotNumber, upgradeId) {
  const bar = currentBar();
  const spellId = Number(upgradeId);
  if (!bar || !Number.isFinite(spellId) || spellId <= 0) {
    return;
  }
  bar.slots[slotNumber - 1] = spellId;
  renderSlots();
  const entry = lookupSpell(spellId);
  setStatus(`Upgraded gem ${slotNumber} to ${entry ? entry.n : `spell ${spellId}`}.`);
}

/* ---------- load / download ---------- */

function loadFromText(text, filename) {
  clearShareHash();
  sharedMode = false;
  previewMode = false;
  model = EQLLoadout.parse(text, filename);
  bars = EQLLoadout.activeBars(model);
  sourceFileName = filename || "loadout.ini";
  currentBarIndex = bars.length ? bars[0].index : null;
  editorPanel.classList.remove("hidden");
  selectBar(currentBarIndex);
  if (!bars.length) {
    const message = `No active bars in ${filename}. Use “Add bar” to create one, then download.`;
    setStatus(message);
  } else {
    setStatus(`Loaded ${bars.length} bar${bars.length === 1 ? "" : "s"} from ${filename}.`);
  }
  scrollToAfterUpload();
}

async function readFile(file) {
  if (!file) {
    return;
  }
  try {
    EQLLoadout.validateSelectedFile(file);
    const buffer = await file.arrayBuffer();
    const text = new TextDecoder("utf-8").decode(buffer);
    loadFromText(text, file.name);
  } catch (error) {
    const detail = String(error?.message || "Could not read that file.").replace(
      /\s*Nothing was uploaded or saved\.?\s*$/i,
      ""
    );
    setStatus(`${detail} Nothing was uploaded or saved.`, { error: true });
  }
}

function downloadZip() {
  if (!model || previewMode || sharedMode) {
    setStatus("Download needs a loaded loadout file.", { error: true });
    return Promise.resolve();
  }
  if (typeof JSZip === "undefined") {
    setStatus("Download failed: zip library not loaded.", { error: true });
    return Promise.resolve();
  }
  const text = EQLLoadout.serialize(model, bars);
  const iniName = sourceFileName.endsWith(".ini") ? sourceFileName : `${sourceFileName}.ini`;
  const zipName = iniName.replace(/\.ini$/i, ".zip");

  const zip = new JSZip();
  zip.file(iniName, text);
  return zip.generateAsync({ type: "blob" }).then((blob) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = zipName;
    link.click();
    URL.revokeObjectURL(url);
    setStatus(`Downloaded ${zipName} with ${bars.length} active bar${bars.length === 1 ? "" : "s"}. Unzip it back into your EQ folder.`);
  });
}

function replaceFileInput() {
  const fresh = document.createElement("input");
  fresh.id = "file-input";
  fresh.type = "file";
  fresh.accept = ".ini,text/plain";
  fresh.hidden = true;
  fileInput.replaceWith(fresh);
  fileInput = fresh;
  fileInput.addEventListener("change", onFileInputChange);
}

function onFileInputChange() {
  const file = fileInput.files?.[0];
  readFile(file).finally(replaceFileInput);
}

async function boot() {
  tipEnabled = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  renderClassChips();
  updateControls();
  try {
    const bust =
      (document.body && document.body.dataset && document.body.dataset.build) || "";
    const q = bust ? `?v=${encodeURIComponent(bust)}` : "";
    const spellUrl = (window.EQLDom ? window.EQLDom.siteUrl("data/spells.json") : "../data/spells.json") + q;
    const tipUrl =
      (window.EQLDom ? window.EQLDom.siteUrl("data/spell_tooltips.json") : "../data/spell_tooltips.json") + q;
    const overridesUrl =
      (window.EQLDom ? window.EQLDom.siteUrl("data/spell_overrides.json") : "../data/spell_overrides.json") + q;
    const [spellResponse, tipResponse, overridesResponse] = await Promise.all([
      fetch(spellUrl),
      fetch(tipUrl),
      fetch(overridesUrl),
    ]);
    if (!spellResponse.ok) {
      throw new Error(`Could not load spell index (${spellResponse.status}).`);
    }
    spellDb = await spellResponse.json();
    spellDb.spells = spellDb.spells || {};
    spellDb.paths = spellDb.paths || {};
    if (tipResponse.ok) {
      tipDb = await tipResponse.json();
      tipDb.spells = tipDb.spells || {};
    }
    if (overridesResponse.ok) {
      EQLSpellMeta.setOverrides(await overridesResponse.json());
    }
    buildSpellArray();
    rebuildCandidates();
    renderIndexUpdated();
    loadFromHash();
  } catch (error) {
    setStatus(error.message || "Failed to load spell index.", { error: true });
  }
}

/* ---------- events ---------- */

uploadBtn.addEventListener("click", () => {
  replaceFileInput();
  fileInput.click();
});
if (previewOnlyBtn) {
  previewOnlyBtn.addEventListener("click", startPreviewOnly);
}
fileInput.addEventListener("change", onFileInputChange);

uploadDrop.addEventListener("dragover", (event) => {
  event.preventDefault();
  uploadDrop.classList.add("dragover");
});
uploadDrop.addEventListener("dragleave", () => uploadDrop.classList.remove("dragover"));
uploadDrop.addEventListener("drop", (event) => {
  event.preventDefault();
  uploadDrop.classList.remove("dragover");
  readFile(event.dataTransfer?.files?.[0]);
});

classChipRow.addEventListener("click", (event) => {
  const button = event.target.closest(".class-toggle");
  if (button) {
    toggleClass(button.dataset.class);
  }
});

playerLevelInput.addEventListener("input", () => {
  const n = Number.parseInt(playerLevelInput.value, 10);
  playerLevel = Number.isFinite(n) && n > 0 ? Math.min(n, MAX_LEVEL) : 0;
  updateControls();
  if (isPickerOpen()) {
    renderPickerScope();
    updatePickerNewOnlyState();
    populateCategoryFilter();
    renderPickerResults();
  }
  if (bars.length) {
    renderSlots();
  }
});

barSelect.addEventListener("change", () => selectBar(Number(barSelect.value)));
barNameInput.addEventListener("input", () => {
  const bar = currentBar();
  if (bar) {
    bar.name = barNameInput.value;
    populateBarSelect();
  }
});
addBarBtn.addEventListener("click", addBar);
if (cloneBarBtn) {
  cloneBarBtn.addEventListener("click", cloneBar);
}
removeBarBtn.addEventListener("click", removeBar);
if (nextLevelBtn) {
  nextLevelBtn.addEventListener("click", openNextLevelPicker);
}
shareBtn.addEventListener("click", () => {
  copyShareLink().catch((error) => setStatus(error.message, { error: true }));
});
downloadBtn.addEventListener("click", () => {
  downloadZip().catch((error) => setStatus(error.message, { error: true }));
});
window.addEventListener("hashchange", () => {
  if (syncingHash) {
    return;
  }
  loadFromHash();
});

slotGrid.addEventListener("click", (event) => {
  const swapButton = event.target.closest(".slot-swap");
  if (swapButton) {
    handleSwapClick(Number(swapButton.dataset.slot));
    return;
  }
  const upgradeBtnEl = event.target.closest(".slot-upgrade-btn");
  if (upgradeBtnEl) {
    applyUpgrade(Number(upgradeBtnEl.dataset.slot), upgradeBtnEl.dataset.upgradeId);
    return;
  }
  const editBtn = event.target.closest(".slot-edit");
  if (editBtn) {
    openPicker(Number(editBtn.dataset.slot));
    return;
  }
  const clearBtn = event.target.closest(".slot-clear");
  if (clearBtn) {
    clearSlot(Number(clearBtn.dataset.slot));
  }
});

if (swapStatus) {
  swapStatus.addEventListener("click", (event) => {
    if (event.target.closest(".swap-cancel")) {
      cancelSwap();
    }
  });
}

pickerClose.addEventListener("click", closePicker);
picker.addEventListener("click", (event) => {
  if (event.target === picker) {
    closePicker();
  }
});
pickerSearch.addEventListener("input", renderPickerResults);
pickerCat.addEventListener("change", renderPickerResults);
if (pickerNewOnly) {
  pickerNewOnly.addEventListener("change", renderPickerResults);
}
pickerResults.addEventListener("click", (event) => {
  const row = event.target.closest(".picker-row");
  if (row && pickerMode === "assign") {
    assignSpell(Number(row.dataset.id));
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") {
    return;
  }
  if (isPickerOpen()) {
    if (!window.EQLFocusTrap) {
      closePicker();
    }
    return;
  }
  if (swapSourceSlot != null) {
    cancelSwap();
  }
});

bindSpellTips(slotGrid);
bindSpellTips(pickerResults);
pickerResults.addEventListener("scroll", hideSpellTip, { passive: true });
window.addEventListener("blur", hideSpellTip);

boot();
