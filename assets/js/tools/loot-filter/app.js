const uploadDrop = document.getElementById("upload-drop");
const fileInput = document.getElementById("file-input");
const uploadBtn = document.getElementById("upload-btn");
const mergeBtn = document.getElementById("merge-btn");
const importInput = document.getElementById("import-input");
const downloadBtn = document.getElementById("download-btn");
const fileMetaEl = document.getElementById("file-meta");
const editorPanel = document.getElementById("editor-panel");
const searchInput = document.getElementById("search-input");
const tagFilterBtn = document.getElementById("tag-filter-btn");
const tagFilterPanel = document.getElementById("tag-filter-panel");
const tagFilterOptions = document.getElementById("tag-filter-options");
const tagFilterSummary = document.getElementById("tag-filter-summary");
const tagFilterClear = document.getElementById("tag-filter-clear");
const tagFilterWrap = document.querySelector(".tag-filter-wrap");
const confirmRemoveEl = document.getElementById("confirm-remove");
const tableBody = document.getElementById("loot-table-body");
const tableHead = document.querySelector(".loot-table thead");
const rowCountEl = document.getElementById("row-count");

/** Column order matches headers: Loot, Merge, Store, Sell */
const ACTION_FILTER_IDS = [2, 3, 1, 4];

const TAG_DEFS = [
  { key: "magic", label: "Magic", group: "Flags" },
  { key: "no_trade", label: "No Trade", group: "Flags" },
  { key: "quest_item", label: "Quest Item", group: "Flags" },
  { key: "lore", label: "Lore", group: "Flags" },
  { key: "temporary", label: "Temporary", group: "Flags" },
  { key: "no_rent", label: "No Rent", group: "Flags" },
  { key: "placeable", label: "Placeable", group: "Flags" },
  { key: "attuneable", label: "Attuneable", group: "Flags" },
  { key: "artifact", label: "Artifact", group: "Flags" },
  { key: "expendable", label: "Expendable", group: "Flags" },
  { key: "head", label: "Head", group: "Slots" },
  { key: "face", label: "Face", group: "Slots" },
  { key: "ear", label: "Ear", group: "Slots" },
  { key: "neck", label: "Neck", group: "Slots" },
  { key: "shoulders", label: "Shoulders", group: "Slots" },
  { key: "arms", label: "Arms", group: "Slots" },
  { key: "back", label: "Back", group: "Slots" },
  { key: "wrist", label: "Wrist", group: "Slots" },
  { key: "hands", label: "Hands", group: "Slots" },
  { key: "finger", label: "Finger", group: "Slots" },
  { key: "chest", label: "Chest", group: "Slots" },
  { key: "waist", label: "Waist", group: "Slots" },
  { key: "legs", label: "Legs", group: "Slots" },
  { key: "feet", label: "Feet", group: "Slots" },
  { key: "primary", label: "Primary", group: "Slots" },
  { key: "secondary", label: "Secondary", group: "Slots" },
  { key: "range", label: "Range", group: "Slots" },
  { key: "ammo", label: "Ammo", group: "Slots" },
  { key: "plane_of_hate", label: "Plane of Hate", group: "Planes" },
  { key: "plane_of_fear", label: "Plane of Fear", group: "Planes" },
  { key: "plane_of_sky", label: "Plane of Sky", group: "Planes" },
  { key: "war", label: "WAR", group: "Classes" },
  { key: "clr", label: "CLR", group: "Classes" },
  { key: "pal", label: "PAL", group: "Classes" },
  { key: "rng", label: "RNG", group: "Classes" },
  { key: "shd", label: "SHD", group: "Classes" },
  { key: "dru", label: "DRU", group: "Classes" },
  { key: "mnk", label: "MNK", group: "Classes" },
  { key: "brd", label: "BRD", group: "Classes" },
  { key: "rog", label: "ROG", group: "Classes" },
  { key: "shm", label: "SHM", group: "Classes" },
  { key: "nec", label: "NEC", group: "Classes" },
  { key: "wiz", label: "WIZ", group: "Classes" },
  { key: "mag", label: "MAG", group: "Classes" },
  { key: "enc", label: "ENC", group: "Classes" },
  { key: "bst", label: "BST", group: "Classes" },
  { key: "ber", label: "BER", group: "Classes" },
  { key: "hum", label: "HUM", group: "Races" },
  { key: "bar", label: "BAR", group: "Races" },
  { key: "eru", label: "ERU", group: "Races" },
  { key: "elf", label: "ELF", group: "Races" },
  { key: "hie", label: "HIE", group: "Races" },
  { key: "def", label: "DEF", group: "Races" },
  { key: "hef", label: "HEF", group: "Races" },
  { key: "dwf", label: "DWF", group: "Races" },
  { key: "trl", label: "TRL", group: "Races" },
  { key: "ogr", label: "OGR", group: "Races" },
  { key: "hfl", label: "HFL", group: "Races" },
  { key: "gnm", label: "GNM", group: "Races" },
  { key: "iks", label: "IKS", group: "Races" },
];

const TAG_BY_KEY = Object.fromEntries(TAG_DEFS.map((tag) => [tag.key, tag]));
const CLASS_KEYS = TAG_DEFS.filter((tag) => tag.group === "Classes").map((tag) => tag.key);
const RACE_KEYS = TAG_DEFS.filter((tag) => tag.group === "Races").map((tag) => tag.key);
const CLOUD_PRIORITY = TAG_DEFS.filter((tag) =>
  ["Flags", "Slots", "Planes"].includes(tag.group)
).map((tag) => tag.key);

let rows = [];
let sourceFileName = "LF_export.ini";
let searchQuery = "";
let selectedTagKeys = [];
/** @type {Map<string, Record<string, boolean>>} */
let itemTagsByName = new Map();
let itemTagsLoaded = false;

function setStatus(message, { error = false } = {}) {
  if (window.EQLToast) {
    EQLToast.show(message, { error });
  }
}

function scrollToAfterUpload() {
  if (window.EQLToast) {
    EQLToast.scrollTo(editorPanel);
  } else if (editorPanel) {
    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "auto"
      : "smooth";
    editorPanel.scrollIntoView({ behavior, block: "start" });
  }
}

function escapeHtml(value) {
  if (window.EQLDom) {
    return window.EQLDom.escapeHtml(value || "");
  }
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function nameKey(name) {
  // Match game ↔ wiki names across quotes, backticks, dashes, and spacing.
  return String(name || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[''`´′''']/g, "")
    .replace(/[\s\-_–—−]+/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function wikiItemUrl(name) {
  const title = String(name || "").trim().replace(/ /g, "_");
  if (!title) {
    return "https://eqlwiki.com/";
  }
  return `https://eqlwiki.com/${encodeURIComponent(title)}`;
}

function filterLabel(filterId) {
  return EQLLootFilter.FILTER_LABELS[filterId] || "?";
}

function iconUrl(iconId) {
  return EQLLootFilter.iconPath(iconId);
}

function onIconError(img) {
  const initial = (img.dataset.initial || "?").charAt(0).toUpperCase();
  const fallback = document.createElement("span");
  fallback.className = "item-icon-fallback";
  fallback.setAttribute("aria-hidden", "true");
  fallback.textContent = initial;
  img.replaceWith(fallback);
}

function tagsForRow(row) {
  return itemTagsByName.get(nameKey(row.displayName)) || null;
}

function rowHasTag(row, tagKey) {
  const tags = tagsForRow(row);
  return Boolean(tags && tags[tagKey]);
}

function cloudTagsForRow(row) {
  const tags = tagsForRow(row);
  if (!tags) {
    return [];
  }
  const out = [];
  for (const key of CLOUD_PRIORITY) {
    if (tags[key]) {
      out.push(TAG_BY_KEY[key]);
    }
  }
  const classHits = CLASS_KEYS.filter((key) => tags[key]);
  if (classHits.length && classHits.length < CLASS_KEYS.length) {
    for (const key of classHits) {
      out.push(TAG_BY_KEY[key]);
    }
  } else if (classHits.length === CLASS_KEYS.length) {
    out.push({ key: "class_all", label: "ALL classes", group: "Classes" });
  }
  const raceHits = RACE_KEYS.filter((key) => tags[key]);
  if (raceHits.length && raceHits.length < RACE_KEYS.length) {
    for (const key of raceHits) {
      out.push(TAG_BY_KEY[key]);
    }
  } else if (raceHits.length === RACE_KEYS.length) {
    out.push({ key: "race_all", label: "ALL races", group: "Races" });
  }
  return out;
}

function filteredRows() {
  const query = searchQuery.trim().toLowerCase();
  return rows.filter((row) => {
    if (query) {
      const matchesQuery =
        row.displayName.toLowerCase().includes(query) ||
        row.itemId.includes(query) ||
        row.iconId.includes(query);
      if (!matchesQuery) {
        return false;
      }
    }
    if (!selectedTagKeys.length) {
      return true;
    }
    // Within a category: OR. Across categories: AND.
    const byGroup = new Map();
    for (const key of selectedTagKeys) {
      const group = TAG_BY_KEY[key]?.group || "Other";
      if (!byGroup.has(group)) {
        byGroup.set(group, []);
      }
      byGroup.get(group).push(key);
    }
    return [...byGroup.values()].every((keys) =>
      keys.some((key) => rowHasTag(row, key))
    );
  });
}

function updateToolbarState() {
  const disabled = rows.length === 0;
  downloadBtn.disabled = disabled;
  mergeBtn.disabled = disabled;
  if (tagFilterBtn) {
    tagFilterBtn.disabled = disabled || !itemTagsLoaded;
  }
}

function updateFileMeta(rawLineCount = null) {
  if (!rows.length) {
    fileMetaEl.textContent = "";
    return;
  }
  const plusCount = rows.filter((row) => row.isPlus).length;
  const exportRows = EQLLootFilter.flattenCanonicalRows(rows);
  const rawHint =
    rawLineCount != null ? ` · ${rawLineCount} raw lines loaded` : "";
  const baseHint = plusCount
    ? ` · ${plusCount} normalized to base (${exportRows.length} export lines)`
    : ` · ${exportRows.length} export lines`;
  fileMetaEl.textContent = `${sourceFileName} - ${rows.length} unique items${rawHint}${baseHint}`;
}

function renderTagCloud(row) {
  const tags = cloudTagsForRow(row);
  if (!tags.length) {
    return `<span class="item-tags" aria-label="Item tags"><span class="item-tag item-tag--unknown" title="No wiki tags found for this item">unknown</span></span>`;
  }
  return `<div class="item-tags" aria-label="Item tags">${tags
    .map(
      (tag) =>
        `<span class="item-tag item-tag--${escapeHtml(tag.group.toLowerCase())} item-tag--${escapeHtml(tag.key)}" title="${escapeHtml(tag.group)}: ${escapeHtml(tag.label)}">${escapeHtml(tag.label)}</span>`
    )
    .join("")}</div>`;
}

function renderTable() {
  const visible = filteredRows();
  rowCountEl.textContent = `${visible.length} of ${rows.length} items`;

  if (!visible.length) {
    tableBody.innerHTML = `
      <tr class="empty-row">
        <td colspan="8">${rows.length ? "No items match your search or tag filters." : "Open a loot filter to begin."}</td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = visible
    .map((row) => {
      const filterId = row.filterId;
      const actionCells = ACTION_FILTER_IDS.map((id) => {
        const checked = filterId === id ? "checked" : "";
        const label = filterLabel(id);
        return `
            <td class="action-cell">
              <label class="action-radio" title="${escapeHtml(label)}">
                <input type="radio" name="filter-${escapeHtml(row.groupKey)}" value="${id}" ${checked} data-group-key="${escapeHtml(row.groupKey)}" data-filter-id="${id}">
                <span class="action-mark" aria-hidden="true"></span>
                <span class="sr-only">${escapeHtml(label)}</span>
              </label>
            </td>
          `;
      }).join("");

      const initial = escapeHtml(row.displayName.charAt(0) || "?");

      return `
        <tr data-group-key="${escapeHtml(row.groupKey)}">
          <td class="icon-cell">
            <img class="item-icon" src="${escapeHtml(iconUrl(row.iconId))}" alt="" width="32" height="32" loading="lazy" decoding="async" data-initial="${initial}">
          </td>
          <td class="name-cell">
            <a
              class="item-name"
              href="${escapeHtml(wikiItemUrl(row.displayName))}"
              target="_blank"
              rel="noopener noreferrer"
            >${escapeHtml(row.displayName)}<span class="sr-only"> (opens in a new tab on eqlwiki.com)</span></a>
          </td>
          <td class="tags-cell">${renderTagCloud(row)}</td>
          ${actionCells}
          <td class="remove-cell">
            <button type="button" class="remove-btn" data-group-key="${escapeHtml(row.groupKey)}" title="Remove from filter" aria-label="Remove ${escapeHtml(row.displayName)}">✕</button>
          </td>
        </tr>
      `;
    })
    .join("");

  tableBody.querySelectorAll("img.item-icon").forEach((img) => {
    img.addEventListener("error", () => onIconError(img), { once: true });
  });
}

function showEditor() {
  editorPanel.classList.remove("hidden");
  updateToolbarState();
  renderTable();
}

function loadFromText(text, fileName) {
  const parsed = EQLLootFilter.validateLootFilterText(text, fileName);
  rows = EQLLootFilter.collapseRows(parsed.rows);
  sourceFileName = fileName || "LF_Character_server.ini";
  const plusCount = rows.filter((row) => row.isPlus).length;
  updateFileMeta(parsed.rows.length);
  if (parsed.errors.length) {
    setStatus(
      `Loaded ${rows.length} unique items (${parsed.errors.length} lines skipped).`,
      { error: true }
    );
  } else if (plusCount) {
    setStatus(
      `Loaded ${rows.length} unique items (${plusCount} with + names normalized to base).`
    );
  } else {
    setStatus(`Loaded ${rows.length} unique items.`);
  }
  showEditor();
  scrollToAfterUpload();
}

async function readFile(file) {
  if (!file) {
    return;
  }
  try {
    EQLLootFilter.validateSelectedFile(file);
    const text = await file.text();
    loadFromText(text, file.name);
  } catch (error) {
    const detail = String(error?.message || "Could not read that file.");
    setStatus(`${detail} Nothing was uploaded or saved.`, { error: true });
  }
}

function downloadIni() {
  if (!rows.length) {
    return Promise.resolve();
  }
  if (typeof JSZip === "undefined") {
    setStatus("Download failed: zip library not loaded.", { error: true });
    return Promise.resolve();
  }

  const exportText = EQLLootFilter.serializeIni(rows);
  const exportLines = exportText
    .split(/\r?\n/)
    .filter((line) => line.trim() && !line.trim().startsWith("#")).length;
  const plusCount = rows.filter((row) => row.isPlus).length;
  const iniName = sourceFileName.endsWith(".ini") ? sourceFileName : `${sourceFileName}.ini`;
  const zipName = iniName.replace(/\.ini$/i, ".zip");

  const zip = new JSZip();
  zip.file(iniName, exportText);

  return zip.generateAsync({ type: "blob" }).then((blob) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = zipName;
    link.click();
    URL.revokeObjectURL(url);
    if (plusCount) {
      setStatus(
        `Downloaded ${zipName} with ${exportLines} item lines (${plusCount} normalized to base name).`
      );
    } else {
      setStatus(`Downloaded ${zipName} with ${exportLines} item lines.`);
    }
  });
}

function setFilterForGroup(groupKey, filterId) {
  const row = rows.find((entry) => entry.groupKey === groupKey);
  if (!row) {
    return;
  }
  row.filterId = filterId;
}

function bulkSetVisibleFilter(filterId) {
  const visible = filteredRows();
  if (!visible.length) {
    setStatus("No visible items to update.", { error: true });
    return;
  }
  const label = filterLabel(filterId);
  for (const row of visible) {
    row.filterId = filterId;
  }
  renderTable();
  setStatus(`Set ${visible.length} visible item${visible.length === 1 ? "" : "s"} to ${label}.`);
}

function removeGroup(groupKey) {
  if (confirmRemoveEl.checked) {
    const row = rows.find((entry) => entry.groupKey === groupKey);
    if (!row || !window.confirm(`Remove "${row.displayName}" from this filter?`)) {
      return;
    }
  }
  rows = rows.filter((entry) => entry.groupKey !== groupKey);
  updateFileMeta();
  updateToolbarState();
  renderTable();
}

async function importFromFile(file) {
  if (!file) {
    return;
  }
  try {
    EQLLootFilter.validateSelectedFile(file);
    const parsed = EQLLootFilter.validateLootFilterText(await file.text(), file.name);
    rows = EQLLootFilter.mergeRows(rows, parsed.rows);
    let message = `Merged ${parsed.rows.length} lines from ${file.name} (${rows.length} unique items).`;
    if (parsed.errors.length) {
      message += ` (${parsed.errors.length} lines skipped)`;
    }
    setStatus(message, { error: parsed.errors.length > 0 });
    updateFileMeta();
    showEditor();
  } catch (error) {
    const detail = String(error?.message || "Could not read that file.");
    setStatus(`${detail} Nothing was uploaded or saved.`, { error: true });
  }
}

function openImport() {
  importInput.click();
}

function updateTagFilterSummary() {
  if (!tagFilterSummary || !tagFilterBtn) {
    return;
  }
  if (!selectedTagKeys.length) {
    tagFilterSummary.textContent = "Any tag";
    tagFilterBtn.classList.remove("is-active");
    return;
  }
  const labels = selectedTagKeys
    .map((key) => TAG_BY_KEY[key]?.label || key)
    .filter(Boolean);
  tagFilterSummary.textContent =
    labels.length <= 2 ? labels.join(", ") : `${labels.length} tags selected`;
  tagFilterBtn.classList.add("is-active");
}

function setTagFilterOpen(open) {
  if (!tagFilterBtn || !tagFilterPanel) {
    return;
  }
  tagFilterBtn.setAttribute("aria-expanded", open ? "true" : "false");
  tagFilterPanel.hidden = !open;
}

function populateTagFilter() {
  if (!tagFilterOptions) {
    return;
  }
  const groups = new Map();
  for (const tag of TAG_DEFS) {
    if (!groups.has(tag.group)) {
      groups.set(tag.group, []);
    }
    groups.get(tag.group).push(tag);
  }
  tagFilterOptions.innerHTML = [...groups.entries()]
    .map(([group, tags]) => {
      const options = tags
        .map(
          (tag) => `
            <label class="tag-filter-option">
              <input type="checkbox" value="${escapeHtml(tag.key)}" data-tag-key="${escapeHtml(tag.key)}">
              <span>${escapeHtml(tag.label)}</span>
            </label>`
        )
        .join("");
      return `
        <div class="tag-filter-group">
          <span class="tag-filter-group-label">${escapeHtml(group)}</span>
          ${options}
        </div>`;
    })
    .join("");
}

function readSelectedTags() {
  if (!tagFilterOptions) {
    selectedTagKeys = [];
    updateTagFilterSummary();
    return;
  }
  selectedTagKeys = [...tagFilterOptions.querySelectorAll('input[type="checkbox"]:checked')].map(
    (input) => input.value
  );
  updateTagFilterSummary();
}

function clearSelectedTags() {
  if (!tagFilterOptions) {
    return;
  }
  for (const input of tagFilterOptions.querySelectorAll('input[type="checkbox"]')) {
    input.checked = false;
  }
  readSelectedTags();
  renderTable();
}

async function loadItemTags() {
  try {
    const bust =
      (document.body && document.body.dataset && document.body.dataset.build) || "";
    const q = bust ? `?v=${encodeURIComponent(bust)}` : "";
    const tagsUrl =
      (window.EQLDom
        ? window.EQLDom.siteUrl("data/item_tags.json")
        : "../data/item_tags.json") + q;
    const response = await fetch(tagsUrl);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const payload = await response.json();
    const items = payload.items || {};
    itemTagsByName = new Map(
      Object.entries(items).map(([key, value]) => [nameKey(key), value])
    );
    itemTagsLoaded = true;
    updateToolbarState();
    if (rows.length) {
      renderTable();
    }
  } catch (error) {
    itemTagsLoaded = false;
    setStatus(
      `Could not load item tags (${String(error?.message || error)}). Tag filter is unavailable.`,
      { error: true }
    );
    updateToolbarState();
  }
}

populateTagFilter();
updateTagFilterSummary();
loadItemTags();

uploadBtn.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => {
  readFile(fileInput.files?.[0]);
  fileInput.value = "";
});

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

downloadBtn.addEventListener("click", () => {
  downloadIni().catch((error) => setStatus(error.message, { error: true }));
});

mergeBtn.addEventListener("click", () => openImport());
importInput.addEventListener("change", () => {
  const file = importInput.files?.[0];
  importInput.value = "";
  if (!file) {
    return;
  }
  importFromFile(file);
});

searchInput.addEventListener("input", () => {
  searchQuery = searchInput.value;
  renderTable();
});

if (tagFilterBtn && tagFilterPanel) {
  tagFilterBtn.addEventListener("click", () => {
    if (tagFilterBtn.disabled) {
      return;
    }
    setTagFilterOpen(tagFilterPanel.hidden);
  });
}

if (tagFilterOptions) {
  tagFilterOptions.addEventListener("change", (event) => {
    if (!(event.target instanceof HTMLInputElement) || event.target.type !== "checkbox") {
      return;
    }
    readSelectedTags();
    renderTable();
  });
}

if (tagFilterClear) {
  tagFilterClear.addEventListener("click", () => {
    clearSelectedTags();
  });
}

document.addEventListener("click", (event) => {
  if (!tagFilterPanel || tagFilterPanel.hidden || !tagFilterWrap) {
    return;
  }
  if (tagFilterWrap.contains(event.target)) {
    return;
  }
  setTagFilterOpen(false);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && tagFilterPanel && !tagFilterPanel.hidden) {
    setTagFilterOpen(false);
    tagFilterBtn?.focus();
  }
});

if (tableHead) {
  tableHead.addEventListener("click", (event) => {
    const button = event.target.closest("[data-bulk-filter-id]");
    if (!button) {
      return;
    }
    const filterId = Number.parseInt(button.dataset.bulkFilterId, 10);
    if (!Number.isFinite(filterId)) {
      return;
    }
    bulkSetVisibleFilter(filterId);
  });
}

tableBody.addEventListener("change", (event) => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || input.type !== "radio") {
    return;
  }
  setFilterForGroup(input.dataset.groupKey, Number.parseInt(input.dataset.filterId, 10));
});

tableBody.addEventListener("click", (event) => {
  const button = event.target.closest(".remove-btn");
  if (!button) {
    return;
  }
  removeGroup(button.dataset.groupKey);
});


renderTable();
