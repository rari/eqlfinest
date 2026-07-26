/**
 * Canonical spell metadata helpers for Spell Bars.
 * Pure functions — no DOM. Overrides are optional id-keyed records.
 */
const EQLSpellMeta = (() => {
  const FAMILIES = [
    "Direct Damage",
    "Healing",
    "Damage over Time",
    "Buffs",
    "Debuffs",
    "Crowd Control",
    "Pets and Summons",
    "Travel",
    "Utility",
  ];

  const TARGET_KINDS = [
    "single",
    "self",
    "targeted_ae",
    "pbae",
    "rain",
    "summon",
    "group",
    "unknown",
    "missing",
  ];

  const TARGET_LABELS = {
    single: "Target",
    self: "Self",
    targeted_ae: "Target AE",
    pbae: "PB AE",
    rain: "Rain",
    summon: "Summon",
    group: "Group",
    unknown: "Unknown",
    missing: "No target",
  };

  const SPELL_BLADE = {
    // Gem-1 only (enforced by UI). Timing: max(reuse, recovery) ≤ cast time.
    // Shown only when a hybrid is among the selected classes.
    classes: ["PAL", "SHD", "RNG", "BRD"],
  };

  const CC_SUBS = new Set([
    "Mesmerize",
    "Root",
    "Fear",
    "Charm",
    "Blind",
    "Silence",
    "Stun",
    "Memblur",
    "Memory Blur",
    "Pacify",
    "Harmony",
    "Lull",
    "Spinstun",
  ]);

  let overrides = {};

  function setOverrides(data) {
    const next = {};
    if (data && typeof data === "object") {
      for (const [key, value] of Object.entries(data)) {
        if (key.startsWith("_")) {
          continue;
        }
        next[key] = value;
      }
    }
    overrides = next;
  }

  function overrideFor(entry) {
    if (!entry) {
      return null;
    }
    const id = entry.id != null ? String(entry.id) : null;
    if (id && overrides[id]) {
      return overrides[id];
    }
    return null;
  }

  function tipTarget(tip) {
    return String(tip?.tg || "").trim();
  }

  function nameLower(entry) {
    return String(entry?.n || "").toLowerCase();
  }

  function getTargetKind(entry, tip) {
    const tg = tipTarget(tip);
    const lower = tg.toLowerCase();
    const cat = String(entry?.cat || "").trim();
    const nm = nameLower(entry);

    // Orange: rains (before generic targeted AE).
    if (
      (lower.includes("targeted ae") || lower.includes("ae")) &&
      (/\brain\b/.test(nm) ||
        nm.includes("rain of") ||
        nm.includes("storm") ||
        nm.includes("pogonip") ||
        nm.includes("avalanche") ||
        nm.includes("cascade of hail"))
    ) {
      return "rain";
    }

    // Purple: group spells.
    if (
      (lower.includes("group") || lower.includes("party")) &&
      !lower.includes("single")
    ) {
      return "group";
    }

    // Yellow: self-only.
    if (lower === "self") {
      return "self";
    }

    // Yellow: summons / create-item (no creature target).
    if (!tg) {
      return cat === "Create Item" || cat === "Pet" ? "summon" : "missing";
    }
    if (cat === "Create Item") {
      return "summon";
    }

    // Blue: caster-centered AE / PBAE.
    if (lower.includes("pb ae") || lower === "point blank" || lower === "pb") {
      return "pbae";
    }

    // Green: target-centered area effect (non-rain).
    if (lower.includes("targeted ae") || lower.includes("free target ae")) {
      return "targeted_ae";
    }

    // Red: cast on current target.
    if (
      lower.includes("single") ||
      lower.includes("lifetap") ||
      lower.includes("undead") ||
      lower.includes("summoned") ||
      lower.includes("plant") ||
      lower.includes("animal") ||
      lower.includes("pet") ||
      lower.includes("corpse") ||
      lower.includes("line of sight")
    ) {
      return "single";
    }

    if (lower.includes("ae") && !lower.includes("pb")) {
      return "targeted_ae";
    }

    return "unknown";
  }

  function getSpellFamily(entry, tip) {
    const ov = overrideFor(entry);
    if (ov?.family) {
      return ov.family;
    }
    const cat = String(entry?.cat || "").trim();
    const sub = String(entry?.sub || "").trim();

    if (cat === "Direct Damage") {
      return "Direct Damage";
    }
    if (cat === "Damage Over Time") {
      return "Damage over Time";
    }
    if (cat === "Heals") {
      return "Healing";
    }
    if (cat === "HP Buffs" || cat === "Statistic Buffs" || cat === "Regen") {
      return "Buffs";
    }
    if (cat === "Pet") {
      return "Pets and Summons";
    }
    if (cat === "Transport") {
      return "Travel";
    }
    if (cat === "Taps") {
      if (/power/i.test(sub)) {
        return "Utility";
      }
      return "Healing";
    }
    if (cat === "Utility Detrimental") {
      if (CC_SUBS.has(sub) || /mez|root|fear|charm|blind|silence|lull|pacify/i.test(sub)) {
        return "Crowd Control";
      }
      return "Debuffs";
    }
    if (cat === "Utility Beneficial" || cat === "Create Item") {
      return "Utility";
    }
    if (!cat) {
      return "Utility";
    }
    return "Utility";
  }

  function getSpellVariant(entry, tip) {
    const ov = overrideFor(entry);
    if (ov?.variant) {
      return ov.variant;
    }
    const nm = nameLower(entry);
    const sub = String(entry?.sub || "").trim();
    const tg = tipTarget(tip).toLowerCase();
    const targetKind = getTargetKind(entry, tip);
    const family = getSpellFamily(entry, tip);

    if (targetKind === "rain" || (targetKind === "targeted_ae" && (/\brain\b/.test(nm) || nm.includes("storm")))) {
      return "Rain";
    }
    if (/lure of|enticement of/.test(nm) || /\blure\b/.test(nm)) {
      return "Lure";
    }
    if (sub === "Stun" || family === "Crowd Control" && /stun/i.test(sub) || /\bstun\b/.test(nm)) {
      if (family === "Direct Damage" || sub === "Stun") {
        return "Stun";
      }
    }
    if (family === "Healing" && (sub === "Duration Heals" || /hot|heal over time|regrowth|chloroplast/i.test(nm))) {
      return "Heal over time";
    }
    if (/\bfast\b|remedy/.test(nm) && family === "Healing") {
      return "Fast";
    }
    if (/\befficient\b|conservation|thrifty/i.test(nm)) {
      return "Efficient";
    }
    if (targetKind === "group") {
      return "Group";
    }
    if (targetKind === "targeted_ae" || targetKind === "pbae") {
      return "Area effect";
    }
    if (targetKind === "summon") {
      return "Special target";
    }
    return "Standard";
  }

  function getSpellLineKey(entry, tip) {
    const family = getSpellFamily(entry, tip);
    const variant = getSpellVariant(entry, tip);
    const line = entry?.l ? String(entry.l) : "";
    return `${family}|${variant}|${line || nameLower(entry)}`;
  }

  function selectedHasHybrid(selectedClasses) {
    const list = Array.isArray(selectedClasses) ? selectedClasses : [];
    return list.some((code) => SPELL_BLADE.classes.includes(String(code).toUpperCase()));
  }

  function tipNumber(tip, key) {
    const value = Number(tip?.[key]);
    return Number.isFinite(value) ? value : null;
  }

  /** Reuse/recovery cooldown must be ≤ cast time (gem-1 Spellblade rule). */
  function hasSpellBladeTiming(tip) {
    const cast = tipNumber(tip, "ct");
    if (cast == null) {
      return false;
    }
    const recovery = tipNumber(tip, "rv");
    const reuse = tipNumber(tip, "rc");
    const cooldown = Math.max(recovery ?? 0, reuse ?? 0);
    return cooldown <= cast;
  }

  function isSpellBladeEligible(entry, tip, selectedClasses) {
    if (!selectedHasHybrid(selectedClasses)) {
      return false;
    }
    const ov = overrideFor(entry);
    if (ov && Object.prototype.hasOwnProperty.call(ov, "spellblade")) {
      return Boolean(ov.spellblade) && hasSpellBladeTiming(tip);
    }
    // Legacy override key from earlier "spellstrike" naming.
    if (ov && Object.prototype.hasOwnProperty.call(ov, "spellstrike")) {
      return Boolean(ov.spellstrike) && hasSpellBladeTiming(tip);
    }
    return hasSpellBladeTiming(tip);
  }

  function uniqueCloneName(baseName, existingNames) {
    const root = String(baseName || "Bar").trim() || "Bar";
    const names = new Set((existingNames || []).map((n) => String(n)));
    const first = `${root} Copy`;
    if (!names.has(first)) {
      return first;
    }
    let n = 2;
    while (names.has(`${root} Copy ${n}`)) {
      n += 1;
    }
    return `${root} Copy ${n}`;
  }

  return {
    FAMILIES,
    TARGET_KINDS,
    TARGET_LABELS,
    SPELL_BLADE,
    setOverrides,
    getSpellFamily,
    getSpellVariant,
    getSpellLineKey,
    getTargetKind,
    selectedHasHybrid,
    hasSpellBladeTiming,
    isSpellBladeEligible,
    uniqueCloneName,
  };
})();

if (typeof globalThis !== "undefined") {
  globalThis.EQLSpellMeta = EQLSpellMeta;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = EQLSpellMeta;
}
