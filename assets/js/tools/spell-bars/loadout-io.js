/**
 * Round-trip-safe parser/serializer for EverQuest Legends <Character>_<server>_LO#.ini
 * spell loadout files.
 *
 * The [SpellLoadouts] section stores up to 60 bars as flat keys:
 *   SpellLoadoutN.inuse = 0|1
 *   SpellLoadoutN.name  = <text>
 *   SpellLoadoutN.slot1..slot14 = <spellId or -1>
 *
 * Keys are NOT contiguous per bar in real files (inuse flags are often written
 * as one block, names/slots later). We therefore preserve the entire file and
 * only patch the specific keys we manage - appending any new keys at the end of
 * the [SpellLoadouts] section so unrelated sections/keys survive verbatim.
 */
const EQLLoadout = (() => {
  const SLOT_COUNT = 14;
  const MAX_LOADOUTS = 60;
  const MAX_BYTES = 2 * 1024 * 1024;
  const LO_FILENAME_RE = /_LO(\d+)\.ini$/i;
  const KEY_RE = /^SpellLoadout(\d+)\.(inuse|name|slot(\d+))$/i;

  function looksLikeLoadoutFilename(name) {
    return /\.ini$/i.test(String(name || "").trim());
  }

  function validateSelectedFile(file) {
    if (!file) {
      throw new Error("No file selected.");
    }
    if (!file.size) {
      throw new Error(`"${file.name}" is empty. Choose a saved <Character>_<server>_LO#.ini loadout.`);
    }
    if (file.size > MAX_BYTES) {
      throw new Error(
        `"${file.name}" is too large (${file.size.toLocaleString()} bytes). Loadout files are small text .ini files.`
      );
    }
    if (!looksLikeLoadoutFilename(file.name)) {
      throw new Error(
        `"${file.name}" does not look like a loadout. Use a <Character>_<server>_LO#.ini file from your EQ folder.`
      );
    }
  }

  function validateText(text, filename) {
    const label = filename || "loadout.ini";
    if (typeof text !== "string" || !text.trim()) {
      throw new Error(`"${label}" has no readable text.`);
    }
    if (text.includes("\u0000")) {
      throw new Error(`"${label}" looks like a binary file, not a loadout .ini.`);
    }
    const sample = text.slice(0, 4096);
    const replacementCount = (sample.match(/\uFFFD/g) || []).length;
    if (replacementCount > 20) {
      throw new Error(`"${label}" could not be read as text. Choose a <Character>_<server>_LO#.ini loadout file.`);
    }
    if (!/\[SpellLoadouts\]/i.test(text)) {
      throw new Error(`"${label}" is not an EQ spell loadout (missing [SpellLoadouts]).`);
    }
  }

  function parseSlot(value) {
    const n = Number.parseInt(String(value ?? "").trim(), 10);
    if (!Number.isFinite(n) || n < 0) {
      return null;
    }
    return n;
  }

  function parse(text, filename) {
    validateText(text, filename);

    // Split into content lines while preserving each line's original terminator,
    // so mixed \n / \r\n files round-trip byte-for-byte.
    const rawParts = text.split(/(\r\n|\r|\n)/);
    const lines = [];
    const eols = [];
    for (let i = 0; i < rawParts.length; i += 2) {
      lines.push(rawParts[i]);
      eols.push(rawParts[i + 1] ?? "");
    }
    let defaultEol = "";
    for (const e of eols) {
      if (e) {
        defaultEol = e;
        break;
      }
    }
    if (!defaultEol) {
      defaultEol = text.includes("\r\n") ? "\r\n" : "\n";
    }

    // Locate the [SpellLoadouts] section line range: (startIdx, endIdx exclusive).
    let startIdx = -1;
    let endIdx = lines.length;
    for (let i = 0; i < lines.length; i += 1) {
      const header = lines[i].match(/^\s*\[(.+?)\]\s*$/);
      if (!header) {
        continue;
      }
      if (header[1].toLowerCase() === "spellloadouts") {
        startIdx = i;
      } else if (startIdx >= 0 && i > startIdx) {
        endIdx = i;
        break;
      }
    }
    if (startIdx < 0) {
      throw new Error(`"${filename || "loadout.ini"}" is missing the [SpellLoadouts] section.`);
    }

    const existingKeys = new Set();
    const byIndex = new Map();
    for (let i = startIdx + 1; i < endIdx; i += 1) {
      const line = lines[i];
      const eq = line.indexOf("=");
      if (eq < 0) {
        continue;
      }
      const rawKey = line.slice(0, eq).trim();
      const value = line.slice(eq + 1).trim();
      const match = rawKey.match(KEY_RE);
      if (!match) {
        continue;
      }
      const index = Number.parseInt(match[1], 10);
      if (index < 1 || index > MAX_LOADOUTS) {
        continue;
      }
      existingKeys.add(rawKey.toLowerCase());
      let bar = byIndex.get(index);
      if (!bar) {
        bar = { index, inuse: false, name: "", slots: new Array(SLOT_COUNT).fill(null) };
        byIndex.set(index, bar);
      }
      const field = match[2].toLowerCase();
      if (field === "inuse") {
        bar.inuse = value.trim() === "1";
      } else if (field === "name") {
        bar.name = value;
      } else {
        const slotNo = Number.parseInt(match[3], 10);
        if (slotNo >= 1 && slotNo <= SLOT_COUNT) {
          bar.slots[slotNo - 1] = parseSlot(value);
        }
      }
    }

    const loMatch = String(filename || "").match(LO_FILENAME_RE);

    return {
      defaultEol,
      lines,
      eols,
      startIdx,
      endIdx,
      existingKeys,
      byIndex,
      filename: filename || "loadout.ini",
      loIndex: loMatch ? Number(loMatch[1]) : null,
    };
  }

  /** Active (in-use) bars from a parsed model, sorted by index, deep-copied for editing. */
  function activeBars(model) {
    const out = [];
    for (const bar of model.byIndex.values()) {
      if (bar.inuse) {
        out.push({ index: bar.index, name: bar.name, slots: bar.slots.slice() });
      }
    }
    out.sort((a, b) => a.index - b.index);
    return out;
  }

  /** First unused loadout index (1..60), or null when all 60 are taken. */
  function nextFreeIndex(model, bars) {
    const used = new Set(bars.map((bar) => bar.index));
    for (let i = 1; i <= MAX_LOADOUTS; i += 1) {
      if (!used.has(i)) {
        return i;
      }
    }
    return null;
  }

  function serialize(model, bars) {
    const { defaultEol, lines, eols, startIdx, endIdx, existingKeys, byIndex } = model;

    const activeByIndex = new Map(bars.map((bar) => [bar.index, bar]));
    const desired = new Map(); // lowerKey -> { key, value }
    const order = [];

    const setDesired = (key, value) => {
      const lower = key.toLowerCase();
      if (!desired.has(lower)) {
        order.push(key);
      }
      desired.set(lower, { key, value });
    };

    // Bars the file originally treated as in-use. Only these can be "removed".
    const originallyActive = new Set();
    for (const [index, bar] of byIndex) {
      if (bar.inuse) {
        originallyActive.add(index);
      }
    }

    // 1. Write every currently-active bar in full.
    for (const bar of [...bars].sort((a, b) => a.index - b.index)) {
      const prefix = `SpellLoadout${bar.index}`;
      setDesired(`${prefix}.inuse`, "1");
      setDesired(`${prefix}.name`, bar.name != null ? String(bar.name) : "");
      for (let slot = 1; slot <= SLOT_COUNT; slot += 1) {
        const value = bar.slots[slot - 1];
        setDesired(`${prefix}.slot${slot}`, value == null ? "-1" : String(value));
      }
    }

    // 2. Bars that were in-use but the user removed: flag inuse=0 and clear any
    //    existing name/slot keys. Pre-existing inuse=0 bars are left verbatim so a
    //    no-op download round-trips the file unchanged.
    for (const index of [...originallyActive].sort((a, b) => a - b)) {
      if (activeByIndex.has(index)) {
        continue;
      }
      const prefix = `SpellLoadout${index}`;
      setDesired(`${prefix}.inuse`, "0");
      const nameKey = `${prefix}.name`;
      if (existingKeys.has(nameKey.toLowerCase())) {
        setDesired(nameKey, "");
      }
      for (let slot = 1; slot <= SLOT_COUNT; slot += 1) {
        const slotKey = `${prefix}.slot${slot}`;
        if (existingKeys.has(slotKey.toLowerCase())) {
          setDesired(slotKey, "-1");
        }
      }
    }

    const emitted = new Set();
    const outLines = lines.slice();
    const outEols = eols.slice();
    for (let i = startIdx + 1; i < endIdx; i += 1) {
      const line = outLines[i];
      const eq = line.indexOf("=");
      if (eq < 0) {
        continue;
      }
      const rawKey = line.slice(0, eq).trim();
      const target = desired.get(rawKey.toLowerCase());
      if (target) {
        outLines[i] = `${rawKey}=${target.value}`;
        emitted.add(rawKey.toLowerCase());
      }
    }

    const appended = [];
    for (const key of order) {
      const lower = key.toLowerCase();
      if (!emitted.has(lower)) {
        appended.push(`${desired.get(lower).key}=${desired.get(lower).value}`);
      }
    }
    if (appended.length) {
      // Insert before the following section header, or before a trailing empty
      // sentinel line when [SpellLoadouts] is the final section.
      let insertPos = endIdx;
      if (insertPos === outLines.length && outLines.length && outLines[outLines.length - 1] === "") {
        insertPos = outLines.length - 1;
      }
      if (insertPos > 0 && !outEols[insertPos - 1]) {
        outEols[insertPos - 1] = defaultEol;
      }
      const newEols = appended.map(() => defaultEol);
      outLines.splice(insertPos, 0, ...appended);
      outEols.splice(insertPos, 0, ...newEols);
    }

    let result = "";
    for (let i = 0; i < outLines.length; i += 1) {
      result += outLines[i] + (outEols[i] || "");
    }
    return result;
  }

  return {
    SLOT_COUNT,
    MAX_LOADOUTS,
    MAX_BYTES,
    LO_FILENAME_RE,
    looksLikeLoadoutFilename,
    validateSelectedFile,
    validateText,
    parse,
    activeBars,
    nextFreeIndex,
    serialize,
  };
})();

if (typeof globalThis !== "undefined") {
  globalThis.EQLLoadout = EQLLoadout;
}
