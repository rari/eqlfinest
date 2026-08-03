(function (root) {
  'use strict';

  const RANK_SUFFIX = /\s+\+\d+\s*$/;
  const EXALTATION = /\(\s*exaltation\s*\)/i;

  const MAX_INVENTORY_BYTES = 2 * 1024 * 1024;
  const INVENTORY_FILENAME_RE = /inventory\.txt$/i;

  function looksLikeInventoryFilename(name) {
    return INVENTORY_FILENAME_RE.test(String(name || '').trim());
  }

  function validateSelectedFile(file) {
    if (!file) {
      throw new Error('No file selected.');
    }
    if (!file.size) {
      throw new Error(
        `"${file.name}" is empty. Run /outputfile inventory in game, then choose Inventory.txt from your EQ folder.`
      );
    }
    if (file.size > MAX_INVENTORY_BYTES) {
      throw new Error(
        `"${file.name}" is too large (${file.size.toLocaleString()} bytes). Inventory exports are text .txt files.`
      );
    }
    if (!/\.txt$/i.test(file.name)) {
      throw new Error(
        `"${file.name}" is not a .txt file. Use Inventory.txt from /outputfile inventory in your EQ folder.`
      );
    }
    if (!looksLikeInventoryFilename(file.name)) {
      throw new Error(
        `"${file.name}" does not look like an inventory export. Use Inventory.txt from /outputfile inventory.`
      );
    }
  }

  function validateInventoryText(text, filename) {
    const label = filename || 'Inventory.txt';
    if (typeof text !== 'string' || !text.trim()) {
      throw new Error(`"${label}" has no readable text.`);
    }
    if (text.includes('\u0000')) {
      throw new Error(`"${label}" looks like a binary file, not an inventory export.`);
    }
    const sample = text.slice(0, 4096);
    const replacementCount = (sample.match(/\uFFFD/g) || []).length;
    if (replacementCount > 20) {
      throw new Error(
        `"${label}" could not be read as text. Choose Inventory.txt from /outputfile inventory.`
      );
    }
    if (/\[SpellLoadouts\]/i.test(text)) {
      throw new Error(
        `"${label}" looks like a spell loadout, not an inventory export.`
      );
    }
    if (/ITEM_ID\^FILTER_ID\^ICON_ID\^ITEM_NAME/i.test(text) || /^LF_/i.test(label)) {
      throw new Error(
        `"${label}" looks like a loot filter, not an inventory export.`
      );
    }
    const hasInventoryHeader = /^location\tname/im.test(text.replace(/^\uFEFF/, ''));
    const hasTabRows = text.split(/\r?\n/).some((line) => line.split('\t').length >= 3);
    if (!hasInventoryHeader && !hasTabRows) {
      throw new Error(
        `"${label}" is not an EQ inventory export. Expected a Location / Name tab-separated file from /outputfile inventory.`
      );
    }
  }

  function stripRank(name) {
    return String(name || '').trim().replace(RANK_SUFFIX, '').trim();
  }

  function normalizeItemName(name) {
    return stripRank(name)
      .replace(/[‘’`´]/g, "'")
      .replace(/\s+/g, ' ')
      .trim()
      .toLocaleLowerCase('en-US');
  }

  function friendlyLocation(rawLocation, section) {
    if (section === 'keyring') {
      if (/^equipment$/i.test(rawLocation)) return 'Equipment Storage';
      if (/^activated$/i.test(rawLocation)) return 'Activated Items';
      if (/^augmentation$/i.test(rawLocation)) return 'Augmentation Storage';
      return `${rawLocation} Storage`;
    }
    return rawLocation;
  }

  function parsePositiveInteger(value, fallback = 1) {
    const number = Number.parseInt(String(value || '').trim(), 10);
    return Number.isFinite(number) && number > 0 ? number : fallback;
  }

  function parseInventory(text) {
    const sourceText = String(text || '').replace(/^\uFEFF/, '');
    const lines = sourceText.split(/\r?\n/);
    const items = new Map();
    const rawItems = [];
    let section = 'inventory';
    let recognizedRows = 0;
    let ignoredExaltations = 0;
    let sawInventoryHeader = false;
    let sawKeyRingHeader = false;

    const detected = {
      equippedAndBags: false,
      bank: false,
      sharedBank: false,
      hoard: false,
      personalDepot: false,
      equipmentStorage: false,
      activatedStorage: false,
      augmentationStorage: false,
    };

    for (const rawLine of lines) {
      if (!rawLine.trim()) continue;
      const columns = rawLine.split('\t');
      const first = String(columns[0] || '').trim();
      const second = String(columns[1] || '').trim();

      if (/^location$/i.test(first) && /^name$/i.test(second)) {
        section = 'inventory';
        sawInventoryHeader = true;
        continue;
      }
      if (/^keyring$/i.test(first) && /^name$/i.test(second)) {
        section = 'keyring';
        sawKeyRingHeader = true;
        continue;
      }

      if (columns.length < 2) continue;

      const rawLocation = first;
      const rawName = second;
      if (!rawLocation || !rawName || /^empty$/i.test(rawName)) continue;
      if (EXALTATION.test(rawName)) {
        ignoredExaltations += 1;
        continue;
      }

      let count;
      let id;
      if (section === 'keyring') {
        id = String(columns[2] || '').trim();
        count = 1;
      } else {
        id = String(columns[2] || '').trim();
        count = parsePositiveInteger(columns[3], 1);
      }

      const baseName = stripRank(rawName);
      const key = normalizeItemName(baseName);
      if (!key || key === 'empty') continue;

      const location = friendlyLocation(rawLocation, section);
      const entry = {
        key,
        name: baseName,
        originalName: rawName,
        location,
        rawLocation,
        count,
        id,
        section,
      };
      rawItems.push(entry);
      recognizedRows += 1;

      if (!items.has(key)) {
        items.set(key, {
          key,
          name: baseName,
          totalCount: 0,
          locations: [],
          ids: new Set(),
          variants: new Set(),
        });
      }
      const aggregate = items.get(key);
      aggregate.totalCount += count;
      aggregate.locations.push({ location, count, originalName: rawName, id });
      if (id) aggregate.ids.add(id);
      aggregate.variants.add(rawName);

      if (/^(any slot|ear|head|face|neck|shoulders|arms|back|wrist|range|hands|primary|secondary|fingers|chest|legs|feet|waist|ammo|general\s+\d+|held)/i.test(rawLocation)) detected.equippedAndBags = true;
      if (/^bank\d+/i.test(rawLocation)) detected.bank = true;
      if (/^sharedbank\d+/i.test(rawLocation)) detected.sharedBank = true;
      if (/^hoard\s+\d+/i.test(rawLocation)) detected.hoard = true;
      if (/^personal-depot\d+/i.test(rawLocation)) detected.personalDepot = true;
      if (section === 'keyring' && /^equipment$/i.test(rawLocation)) detected.equipmentStorage = true;
      if (section === 'keyring' && /^activated$/i.test(rawLocation)) detected.activatedStorage = true;
      if (section === 'keyring' && /^augmentation$/i.test(rawLocation)) detected.augmentationStorage = true;
    }

    const warnings = [];
    if (!sawInventoryHeader) warnings.push('The standard Location / Name inventory header was not detected.');
    if (!detected.hoard) warnings.push("Dragon's Hoard was not detected in this export.");
    if (!detected.equipmentStorage) warnings.push('Equipment Storage was not detected in this export.');
    if (!sawKeyRingHeader) warnings.push('The KeyRing section was not detected. The file may omit storage near the end.');
    if (recognizedRows === 0) warnings.push('No item rows were parsed.');

    return {
      items,
      rawItems,
      detected,
      warnings,
      stats: {
        inputLines: lines.length,
        parsedRows: recognizedRows,
        uniqueItems: items.size,
        ignoredExaltations,
      },
    };
  }

  function cloneParsed(parsed) {
    const items = new Map();
    for (const [key, entry] of parsed.items.entries()) {
      items.set(key, {
        ...entry,
        locations: entry.locations.map((location) => ({ ...location })),
        ids: new Set(entry.ids),
        variants: new Set(entry.variants),
      });
    }
    return {
      ...parsed,
      items,
      rawItems: [...parsed.rawItems],
      detected: { ...parsed.detected },
      warnings: [...parsed.warnings],
      stats: { ...parsed.stats },
    };
  }

  function withManualCounts(parsed, counts = {}, location = 'Currency tab (manual)') {
    const result = cloneParsed(parsed);
    for (const [name, rawCount] of Object.entries(counts || {})) {
      const count = Math.max(0, Number.parseInt(String(rawCount || 0), 10) || 0);
      if (!count) continue;
      const baseName = stripRank(name);
      const key = normalizeItemName(baseName);
      if (!result.items.has(key)) {
        result.items.set(key, {
          key,
          name: baseName,
          totalCount: 0,
          locations: [],
          ids: new Set(),
          variants: new Set(),
        });
      }
      const aggregate = result.items.get(key);
      aggregate.totalCount += count;
      aggregate.locations.push({ location, count, originalName: baseName, id: '' });
      aggregate.variants.add(baseName);
    }
    result.manualCounts = { ...counts };
    return result;
  }

  function inventoryCount(parsed, name) {
    return parsed.items.get(normalizeItemName(name))?.totalCount || 0;
  }

  function inventoryEntry(parsed, name) {
    return parsed.items.get(normalizeItemName(name)) || null;
  }

  function compactLocations(entry) {
    if (!entry) return [];
    const grouped = new Map();
    for (const row of entry.locations) {
      grouped.set(row.location, (grouped.get(row.location) || 0) + row.count);
    }
    return [...grouped.entries()].map(([location, count]) => ({ location, count }));
  }

  function questResources(quest) {
    return [quest.rune, ...quest.items.map((item) => item.name)];
  }

  function evaluateQuest(quest, parsed) {
    const resources = questResources(quest).map((name) => {
      const entry = inventoryEntry(parsed, name);
      return {
        name,
        key: normalizeItemName(name),
        count: entry?.totalCount || 0,
        locations: compactLocations(entry),
      };
    });
    const missing = resources.filter((item) => item.count < 1);
    const rewardEntries = quest.rewards.map((name) => {
      const entry = inventoryEntry(parsed, name);
      return {
        name,
        key: normalizeItemName(name),
        count: entry?.totalCount || 0,
        locations: compactLocations(entry),
      };
    });
    const ownedRewards = rewardEntries.filter((entry) => entry.count > 0);
    return {
      ...quest,
      resources,
      missing,
      rewardEntries,
      ownedRewards,
      individuallyReady: missing.length === 0,
      rewardConflict: ownedRewards.length > 0,
    };
  }

  function mulberry32(seed) {
    return function random() {
      let t = (seed += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function canConsume(quest, remaining) {
    return quest.resources.every((resource) => (remaining.get(resource.key) || 0) >= 1);
  }

  function consume(quest, remaining) {
    for (const resource of quest.resources) {
      remaining.set(resource.key, (remaining.get(resource.key) || 0) - 1);
    }
  }

  function priorityValue(level) {
    if (level === 'high') return 3;
    if (level === 'low') return 1;
    return 2;
  }

  function compareObjective(a, b) {
    const keys = ['high', 'normal', 'low', 'total', 'completion'];
    for (const key of keys) {
      if ((a[key] || 0) !== (b[key] || 0)) return (a[key] || 0) - (b[key] || 0);
    }
    return 0;
  }

  function chooseRecommendedBatch(evaluatedQuests, parsed, options = {}) {
    const classPriority = options.classPriority || {};
    const preferClassCompletion = options.preferClassCompletion !== false;
    const includeRewardConflicts = options.includeRewardConflicts === true;
    const candidates = evaluatedQuests.filter((quest) => quest.individuallyReady && (includeRewardConflicts || !quest.rewardConflict));

    const completedByClass = new Map();
    for (const quest of evaluatedQuests) {
      if (quest.rewardConflict) completedByClass.set(quest.className, (completedByClass.get(quest.className) || 0) + 1);
    }

    const initialCounts = new Map();
    for (const [key, entry] of parsed.items.entries()) initialCounts.set(key, entry.totalCount);

    let best = { selected: [], remaining: new Map(initialCounts), objective: { high: 0, normal: 0, low: 0, total: 0, completion: 0 } };
    const attempts = Math.max(300, Math.min(1800, candidates.length * 20));

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const random = mulberry32(0x51f15e + attempt * 7919);
      const ordered = [...candidates].sort((a, b) => {
        const pa = priorityValue(classPriority[a.className] || 'normal');
        const pb = priorityValue(classPriority[b.className] || 'normal');
        if (pa !== pb) return pb - pa;
        const ca = preferClassCompletion ? (completedByClass.get(a.className) || 0) : 0;
        const cb = preferClassCompletion ? (completedByClass.get(b.className) || 0) : 0;
        const itemPressureA = a.resources.reduce((sum, resource) => sum + 1 / Math.max(1, inventoryCount(parsed, resource.name)), 0);
        const itemPressureB = b.resources.reduce((sum, resource) => sum + 1 / Math.max(1, inventoryCount(parsed, resource.name)), 0);
        const deterministic = (cb - ca) * 0.45 + (itemPressureB - itemPressureA) * 0.12;
        return deterministic + (random() - 0.5) * 1.2;
      });

      const remaining = new Map(initialCounts);
      const selected = [];
      const objective = { high: 0, normal: 0, low: 0, total: 0, completion: 0 };
      for (const quest of ordered) {
        if (!canConsume(quest, remaining)) continue;
        consume(quest, remaining);
        selected.push(quest);
        const level = classPriority[quest.className] || 'normal';
        objective[level] += 1;
        objective.total += 1;
        if (preferClassCompletion) objective.completion += completedByClass.get(quest.className) || 0;
      }
      if (compareObjective(objective, best.objective) > 0) best = { selected, remaining, objective };
    }

    const selectedIds = new Set(best.selected.map((quest) => quest.id));
    const blocked = candidates.filter((quest) => !selectedIds.has(quest.id)).map((quest) => ({
      ...quest,
      allocationMissing: quest.resources.filter((resource) => (best.remaining.get(resource.key) || 0) < 1),
    }));

    return { ...best, selectedIds, blocked };
  }

  function analyzeInventory(parsed, data, options = {}) {
    const evaluatedQuests = data.quests.map((quest) => evaluateQuest(quest, parsed));
    const allocation = chooseRecommendedBatch(evaluatedQuests, parsed, options);

    const ready = evaluatedQuests.filter((quest) => quest.individuallyReady && !quest.rewardConflict);
    const conflicts = evaluatedQuests.filter((quest) => quest.individuallyReady && quest.rewardConflict);
    const near = evaluatedQuests
      .filter((quest) => !quest.individuallyReady && quest.missing.length <= 2)
      .sort((a, b) => a.missing.length - b.missing.length || a.className.localeCompare(b.className));

    const requiredUsage = new Map();
    for (const quest of data.quests) {
      for (const name of questResources(quest)) {
        const key = normalizeItemName(name);
        if (!requiredUsage.has(key)) requiredUsage.set(key, { name, quests: [] });
        requiredUsage.get(key).quests.push({ id: quest.id, className: quest.className, test: quest.test });
      }
    }

    const loosePieces = [];
    for (const [key, usage] of requiredUsage.entries()) {
      const entry = parsed.items.get(key);
      if (!entry) continue;
      const selectedUse = allocation.selected.reduce((sum, quest) => sum + quest.resources.filter((resource) => resource.key === key).length, 0);
      loosePieces.push({
        name: usage.name,
        count: entry.totalCount,
        selectedUse,
        remainingAfterBatch: Math.max(0, entry.totalCount - selectedUse),
        locations: compactLocations(entry),
        quests: usage.quests,
        isRune: /^wind rune /i.test(usage.name),
      });
    }
    loosePieces.sort((a, b) => Number(b.isRune) - Number(a.isRune) || a.name.localeCompare(b.name));

    const runeSummary = loosePieces.filter((item) => item.isRune);
    const classStats = data.classes.map((classInfo) => {
      const classQuests = evaluatedQuests.filter((quest) => quest.className === classInfo.name);
      return {
        ...classInfo,
        total: classQuests.length,
        rewardOwned: classQuests.filter((quest) => quest.rewardConflict).length,
        individuallyReady: classQuests.filter((quest) => quest.individuallyReady && !quest.rewardConflict).length,
        recommended: classQuests.filter((quest) => allocation.selectedIds.has(quest.id)).length,
      };
    });

    return {
      parsed,
      evaluatedQuests,
      allocation,
      ready,
      conflicts,
      near,
      loosePieces,
      runeSummary,
      classStats,
    };
  }

  function locationText(locations) {
    if (!locations?.length) return 'not found';
    return locations.map((entry) => `${entry.location}${entry.count > 1 ? ` ×${entry.count}` : ''}`).join('; ');
  }

  function buildTextReport(analysis, fileName = 'inventory.txt') {
    const lines = [];
    lines.push('PLANE OF SKY TURN-IN ANALYZER');
    lines.push(`Inventory: ${fileName}`);
    lines.push(`Recommended non-conflicting batch: ${analysis.allocation.selected.length}`);
    lines.push(`Individually ready: ${analysis.ready.length}`);
    lines.push(`Ready but reward already owned: ${analysis.conflicts.length}`);
    lines.push('');
    if (analysis.parsed.warnings.length) {
      lines.push('EXPORT WARNINGS');
      analysis.parsed.warnings.forEach((warning) => lines.push(`- ${warning}`));
      lines.push('');
    }
    lines.push('RECOMMENDED TURN-INS');
    if (!analysis.allocation.selected.length) lines.push('- None');
    for (const quest of analysis.allocation.selected) {
      lines.push(`- ${quest.className} — ${quest.test}`);
      lines.push(`  NPC: ${quest.npc}; say: ${quest.phrase}`);
      for (const resource of quest.resources) lines.push(`  ${resource.name}: ${locationText(resource.locations)}`);
      lines.push(`  Reward: ${quest.rewards.join(' + ')}`);
    }
    lines.push('');
    lines.push('NEARLY COMPLETE');
    if (!analysis.near.length) lines.push('- None');
    for (const quest of analysis.near) {
      lines.push(`- ${quest.className} — ${quest.test}: missing ${quest.missing.map((item) => item.name).join(', ')}`);
    }
    lines.push('');
    lines.push('RUNE COUNTS');
    if (!analysis.runeSummary.length) lines.push('- No Wind Rune counts entered. Currency-tab runes are not included in the inventory export.');
    for (const rune of analysis.runeSummary) lines.push(`- ${rune.name}: ${rune.count} (${locationText(rune.locations)})`);
    return lines.join('\n');
  }

  const engine = {
    stripRank,
    normalizeItemName,
    validateSelectedFile,
    validateInventoryText,
    parseInventory,
    cloneParsed,
    withManualCounts,
    inventoryCount,
    inventoryEntry,
    compactLocations,
    evaluateQuest,
    chooseRecommendedBatch,
    analyzeInventory,
    buildTextReport,
    locationText,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = engine;
  root.SkyEngine = engine;
})(typeof globalThis !== 'undefined' ? globalThis : this);
