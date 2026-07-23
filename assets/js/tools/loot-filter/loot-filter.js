/**
 * Parse and serialize EverQuest Legends LF_*.ini loot filter rows.
 * Format: ITEM_ID^FILTER_ID^ICON_ID^ITEM_NAME
 *
 * Plus tiers (+1..+N) collapse to a single base-name row for editing/export.
 * Cover Ranges (+1-5 expansion on download) was removed; see COVER_RANGES.md (gitignored).
 */
const EQLLootFilter = (() => {
  const FILTER = {
    store: 1,
    loot: 2,
    merge: 3,
    sell: 4,
  };

  const FILTER_LABELS = {
    1: "Store",
    2: "Loot",
    3: "Merge",
    4: "Sell",
  };

  const HEADER = "#ITEM_ID^FILTER_ID^ICON_ID^ITEM_NAME";
  const PLUS_MAX = 5;
  // Allow optional whitespace around +N (EQ names are usually "Name +4")
  const PLUS_SUFFIX_RE = /\s*\+(\d+)\s*$/;
  const MAX_LOOT_FILTER_BYTES = 2 * 1024 * 1024;
  // userdata/LF_Character_Server.ini (character may contain underscores; server is the last segment)
  const LOOT_FILTER_FILENAME_RE = /^LF_.+_[^_]+\.ini$/i;
  const HEADER_RE = /#?\s*ITEM_ID\^FILTER_ID\^ICON_ID\^ITEM_NAME/i;

  function parsePlusName(name) {
    const match = String(name || "").match(PLUS_SUFFIX_RE);
    if (!match) {
      return { baseName: String(name || "").trim(), tier: null, isPlus: false };
    }
    const tier = Number.parseInt(match[1], 10);
    if (!Number.isFinite(tier) || tier < 1) {
      return { baseName: String(name || "").trim(), tier: null, isPlus: false };
    }
    return {
      baseName: String(name).slice(0, -match[0].length).trim(),
      tier,
      isPlus: true,
    };
  }

  function finalizePlusEntry(entry) {
    const validTiers = Object.keys(entry.tierVariants)
      .map((value) => Number.parseInt(value, 10))
      .filter((tier) => tier >= 1 && tier <= PLUS_MAX);

    if (validTiers.length) {
      const best = Math.min(...validTiers);
      const variant = entry.tierVariants[best];
      entry.representativeTier = best;
      entry.itemId = variant.itemId;
      entry.iconId = variant.iconId;
      return;
    }

    if (entry.overflowSource) {
      entry.representativeTier = 1;
      entry.itemId = entry.overflowSource.itemId;
      entry.iconId = entry.overflowSource.iconId;
    }
  }

  function normalizeDisplayNameToBase(entry) {
    const parsed = parsePlusName(entry.displayName);
    if (parsed.isPlus) {
      entry.displayName = parsed.baseName;
    }
    return entry;
  }

  function plusMatchName(entry) {
    const parsed = parsePlusName(entry.displayName);
    return (parsed.isPlus ? parsed.baseName : entry.displayName).toLowerCase();
  }

  function mergePlainIntoPlusGroups(groups) {
    const plusByName = new Map();
    for (const entry of groups.values()) {
      if (entry.isPlus) {
        plusByName.set(plusMatchName(entry), entry);
      }
    }
    for (const [key, entry] of [...groups.entries()]) {
      if (entry.isPlus) {
        continue;
      }
      const plus = plusByName.get(entry.displayName.toLowerCase());
      if (!plus) {
        continue;
      }
      plus.baseVariant = {
        itemId: entry.itemId,
        iconId: entry.iconId,
        name: entry.displayName,
      };
      groups.delete(key);
    }
  }

  function rowGroupKey(row) {
    const parsed = parsePlusName(row.name);
    if (parsed.isPlus) {
      return `plus:${parsed.baseName.toLowerCase()}`;
    }
    return `item:${row.itemId}`;
  }

  function parseLine(line) {
    let trimmed = String(line || "").trim();
    if (!trimmed) {
      return null;
    }
    if (trimmed.startsWith("#")) {
      trimmed = trimmed.slice(1).trim();
      if (!trimmed || trimmed.toUpperCase() === "ITEM_ID^FILTER_ID^ICON_ID^ITEM_NAME") {
        return null;
      }
    }
    const parts = trimmed.split("^");
    if (parts.length < 4) {
      return null;
    }
    const filterId = Number.parseInt(parts[1], 10);
    if (!FILTER_LABELS[filterId]) {
      return null;
    }
    return {
      itemId: parts[0].trim(),
      filterId,
      iconId: parts[2].trim(),
      name: parts.slice(3).join("^").trim(),
    };
  }

  function parseIni(text) {
    const rows = [];
    const errors = [];
    const lines = String(text || "").split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const row = parseLine(line);
      if (row) {
        rows.push(row);
      } else if (line.trim() && !line.trim().startsWith("#")) {
        errors.push({ line: index + 1, text: line.trim() });
      }
    }
    return { rows, errors };
  }

  function looksLikeLootFilterFilename(name) {
    return LOOT_FILTER_FILENAME_RE.test(String(name || "").trim());
  }

  function validateSelectedFile(file) {
    if (!file) {
      throw new Error("No file selected.");
    }
    if (!file.size) {
      throw new Error(
        `"${file.name}" is empty. Choose a saved LF_<Character>_<server>.ini loot filter.`
      );
    }
    if (file.size > MAX_LOOT_FILTER_BYTES) {
      throw new Error(
        `"${file.name}" is too large (${file.size.toLocaleString()} bytes). Loot filter files are text .ini files.`
      );
    }
    if (!/\.ini$/i.test(file.name)) {
      throw new Error(
        `"${file.name}" is not an .ini file. Use an LF_<Character>_<server>.ini loot filter from your EQ userdata folder.`
      );
    }
    if (!looksLikeLootFilterFilename(file.name)) {
      throw new Error(
        `"${file.name}" does not look like a loot filter. Use an LF_<Character>_<server>.ini file from your EQ userdata folder.`
      );
    }
  }

  function validateLootFilterText(text, filename) {
    const label = filename || "loot filter";
    if (typeof text !== "string" || !text.trim()) {
      throw new Error(`"${label}" has no readable text.`);
    }
    if (text.includes("\u0000")) {
      throw new Error(`"${label}" looks like a binary file, not a loot filter .ini.`);
    }
    const sample = text.slice(0, 4096);
    const replacementCount = (sample.match(/\uFFFD/g) || []).length;
    if (replacementCount > 20) {
      throw new Error(
        `"${label}" could not be read as text. Choose an LF_<Character>_<server>.ini loot filter.`
      );
    }
    if (/\[SpellLoadouts\]/i.test(text)) {
      throw new Error(
        `"${label}" looks like a spell loadout, not a loot filter (ITEM_ID^FILTER_ID^ICON_ID^ITEM_NAME).`
      );
    }

    const parsed = parseIni(text);
    const hasHeader = HEADER_RE.test(text);
    if (!parsed.rows.length) {
      if (hasHeader) {
        throw new Error(
          `"${label}" has the loot filter header but no ITEM_ID^FILTER_ID^ICON_ID^ITEM_NAME rows.`
        );
      }
      throw new Error(
        `"${label}" is not an EQ loot filter. Expected lines like ITEM_ID^FILTER_ID^ICON_ID^ITEM_NAME (FILTER_ID 1-4).`
      );
    }

    const dataLines = String(text)
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"));
    if (dataLines.length && parsed.errors.length > parsed.rows.length) {
      throw new Error(
        `"${label}" has too many invalid lines (${parsed.errors.length} bad vs ${parsed.rows.length} valid). Check that each row is ITEM_ID^FILTER_ID^ICON_ID^ITEM_NAME with FILTER_ID 1-4.`
      );
    }

    return parsed;
  }

  function serializeRow(row) {
    return `${row.itemId}^${row.filterId}^${row.iconId}^${row.name}`;
  }

  function itemIdValue(value) {
    const parsed = Number.parseInt(String(value ?? "").trim(), 10);
    return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
  }

  function compareByItemId(a, b) {
    const left = itemIdValue(a?.itemId);
    const right = itemIdValue(b?.itemId);
    if (left !== right) {
      return left - right;
    }
    return String(a?.itemId ?? "").localeCompare(String(b?.itemId ?? ""), undefined, {
      numeric: true,
      sensitivity: "base",
    });
  }

  function flattenCanonicalRows(rows) {
    // Collapse + tiers to a single base-name line.
    return rows.map((row) => {
      const baseId = row.baseVariant?.itemId || row.itemId;
      const baseIcon = row.baseVariant?.iconId || row.iconId;
      const parsed = parsePlusName(row.displayName);
      const baseName = parsed.isPlus ? parsed.baseName : row.displayName;
      return {
        itemId: baseId,
        filterId: row.filterId,
        iconId: baseIcon,
        name: baseName,
      };
    });
  }

  function serializeIni(rows) {
    const flattened = flattenCanonicalRows(rows);
    const ordered = [...flattened].sort(compareByItemId);
    return `${HEADER}\n${ordered.map(serializeRow).join("\n")}\n`;
  }

  function collapseRows(rawRows) {
    const groups = new Map();

    for (const raw of rawRows) {
      const parsed = parsePlusName(raw.name);
      const key = rowGroupKey(raw);
      let entry = groups.get(key);
      if (!entry) {
        entry = {
          groupKey: key,
          displayName: raw.name,
          filterId: raw.filterId,
          itemId: raw.itemId,
          iconId: raw.iconId,
          isPlus: parsed.isPlus,
          representativeTier: parsed.isPlus ? 1 : null,
          tierVariants: {},
          overflowSource: null,
        };
        groups.set(key, entry);
      }

      if (parsed.isPlus && parsed.tier) {
        if (parsed.tier <= PLUS_MAX) {
          entry.tierVariants[parsed.tier] = {
            itemId: raw.itemId,
            iconId: raw.iconId,
            name: raw.name,
          };
        } else if (!entry.overflowSource) {
          entry.overflowSource = {
            itemId: raw.itemId,
            iconId: raw.iconId,
            tier: parsed.tier,
            name: raw.name,
          };
        }
      }

      entry.filterId = raw.filterId;
    }

    for (const entry of groups.values()) {
      if (entry.isPlus) {
        finalizePlusEntry(entry);
      }
    }

    mergePlainIntoPlusGroups(groups);

    // Always strip +# suffixes, then dedupe by base name.
    return dedupeByBaseName([...groups.values()]);
  }

  function mergePlusFields(target, incoming) {
    target.isPlus = Boolean(target.isPlus || incoming.isPlus);
    target.filterId = incoming.filterId;
    target.itemId = incoming.itemId;
    target.iconId = incoming.iconId;
    target.representativeTier = incoming.representativeTier ?? target.representativeTier;
    target.tierVariants = {
      ...(target.tierVariants || {}),
      ...(incoming.tierVariants || {}),
    };
    if (incoming.baseVariant) {
      target.baseVariant = incoming.baseVariant;
    } else if (incoming.isPlus === false && !target.baseVariant) {
      target.baseVariant = {
        itemId: incoming.itemId,
        iconId: incoming.iconId,
        name: incoming.displayName,
      };
    }
    if (incoming.isPlus || String(incoming.groupKey || "").startsWith("plus:")) {
      const plusKey = String(incoming.groupKey || "").startsWith("plus:")
        ? incoming.groupKey
        : `plus:${plusMatchName(incoming)}`;
      target.groupKey = plusKey;
    }
    if (target.isPlus) {
      finalizePlusEntry(target);
    }
    normalizeDisplayNameToBase(target);
    return target;
  }

  /** Strip +# suffixes, then keep one row per base name (later rows win filter). */
  function dedupeByBaseName(rows) {
    const byBase = new Map();
    for (const row of rows) {
      const clone = structuredClone(row);
      normalizeDisplayNameToBase(clone);
      const key = plusMatchName(clone);
      const existing = byBase.get(key);
      if (!existing) {
        byBase.set(key, clone);
        continue;
      }
      mergePlusFields(existing, clone);
    }
    return [...byBase.values()].sort(compareByItemId);
  }

  function mergeRows(baseRows, incomingRows) {
    // Full list: existing editor rows + newly loaded file, then normalize + dedupe once.
    return dedupeByBaseName([
      ...baseRows.map((row) => structuredClone(row)),
      ...collapseRows(incomingRows),
    ]);
  }

  function replaceRows(_baseRows, incomingRows) {
    return collapseRows(incomingRows);
  }

  function iconPath(iconId) {
    if (window.EQLDom) {
      return window.EQLDom.iconUrl("items", iconId);
    }
    const id = String(iconId ?? "").replace(/\D/g, "") || "0";
    return `../assets/icons/items/Item_${id}.png`;
  }

  return {
    FILTER,
    FILTER_LABELS,
    HEADER,
    PLUS_MAX,
    MAX_LOOT_FILTER_BYTES,
    parsePlusName,
    rowGroupKey,
    parseLine,
    parseIni,
    looksLikeLootFilterFilename,
    validateSelectedFile,
    validateLootFilterText,
    normalizeDisplayNameToBase,
    compareByItemId,
    serializeRow,
    serializeIni,
    collapseRows,
    flattenCanonicalRows,
    dedupeByBaseName,
    mergeRows,
    replaceRows,
    iconPath,
  };
})();

if (typeof globalThis !== "undefined") {
  globalThis.EQLLootFilter = EQLLootFilter;
}
