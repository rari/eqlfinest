(function () {
  'use strict';

  const data = window.SKY_DATA;
  const engine = window.SkyEngine;
  const elements = {
    fileInput: document.getElementById('fileInput'),
    dropZone: document.getElementById('dropZone'),
    analysisPanel: document.getElementById('analysisPanel'),
    runePanel: document.getElementById('runePanel'),
    resultsPanel: document.getElementById('resultsPanel'),
    fileLabel: document.getElementById('fileLabel'),
    summaryCards: document.getElementById('summaryCards'),
    workflowMessage: document.getElementById('workflowMessage'),
    priorityGrid: document.getElementById('priorityGrid'),
    preferCompletion: document.getElementById('preferCompletion'),
    includeConflicts: document.getElementById('includeConflicts'),
    resetPriorities: document.getElementById('resetPriorities'),
    tabBar: document.getElementById('tabBar'),
    jumpToTabs: document.getElementById('jumpToTabs'),
    classFilter: document.getElementById('classFilter'),
    searchFilter: document.getElementById('searchFilter'),
    results: document.getElementById('results'),
    printButton: document.getElementById('printButton'),
    exportButton: document.getElementById('exportButton'),
    shareButton: document.getElementById('shareButton'),
    runeInputGrid: document.getElementById('runeInputGrid'),
    runeTotal: document.getElementById('runeTotal'),
    clearRunes: document.getElementById('clearRunes'),
    summaryPanel: document.getElementById('summaryPanel'),
    currencyWarning: document.getElementById('currencyWarning'),
  };

  // Alphabetical for quick scanning and entry.
  const runeOrder = [
    'Wind Rune Azia', 'Wind Rune Beza', 'Wind Rune Caza', 'Wind Rune Dena', 'Wind Rune Ena',
    'Wind Rune Fana', 'Wind Rune Geza', 'Wind Rune Heda', 'Wind Rune Izah', 'Wind Rune Jaka',
    'Wind Rune Kala', 'Wind Rune Lena', 'Wind Rune Meda', 'Wind Rune Neza', 'Wind Rune Ozah',
  ];

  const state = {
    fileName: '',
    rawText: '',
    parsed: null,
    analysis: null,
    activeTab: 'recommended',
    overviewFilter: 'all',
    piecesSort: { key: 'name', dir: 'asc' },
    manualOnly: false,
    classPriority: Object.fromEntries(data.classes.map((item) => [item.name, 'normal'])),
    manualRunes: Object.fromEntries(runeOrder.map((name) => [name, 0])),
    pieceOverrides: {},
  };

  const RUNE_STORAGE_KEY = 'eqlfinest-sky-sets-runes-v1';
  const SHARE_HASH_PREFIX = '#share=';

  function loadStoredRunes() {
    try {
      const raw = window.localStorage?.getItem(RUNE_STORAGE_KEY);
      if (!raw) return;
      const stored = JSON.parse(raw);
      if (!stored || typeof stored !== 'object') return;
      for (const name of runeOrder) {
        if (stored[name] == null) continue;
        state.manualRunes[name] = Math.max(0, Math.min(99, Number.parseInt(String(stored[name]), 10) || 0));
      }
    } catch {
      /* ignore bad or blocked storage */
    }
  }

  function saveStoredRunes() {
    try {
      window.localStorage?.setItem(RUNE_STORAGE_KEY, JSON.stringify(state.manualRunes));
    } catch {
      /* ignore quota / private mode */
    }
  }

  function toBase64Url(bytes) {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  function fromBase64Url(text) {
    const padded = String(text || '').replace(/-/g, '+').replace(/_/g, '/');
    const padLength = (4 - (padded.length % 4)) % 4;
    const binary = atob(padded + '='.repeat(padLength));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function skyItemNames() {
    const names = new Set();
    for (const quest of data.quests) {
      for (const item of quest.items || []) {
        if (item?.name) names.add(item.name);
      }
      for (const reward of quest.rewards || []) {
        if (reward) names.add(reward);
      }
    }
    return names;
  }

  function effectiveSkyItemCounts() {
    if (!state.parsed) return {};
    const effective = effectiveParsed();
    const pieces = {};
    for (const name of skyItemNames()) {
      const count = Math.min(99, engine.inventoryCount(effective, name));
      if (count > 0) pieces[name] = count;
    }
    return pieces;
  }

  function hasShareablePlan() {
    if (Object.values(state.manualRunes).some((count) => count > 0)) return true;
    if (Object.keys(effectiveSkyItemCounts()).length > 0) return true;
    if (Object.values(state.classPriority).some((level) => level !== 'normal')) return true;
    if (!elements.preferCompletion.checked) return true;
    if (elements.includeConflicts.checked) return true;
    return false;
  }

  function updateShareButton() {
    if (!elements.shareButton) return;
    elements.shareButton.disabled = !state.analysis || !hasShareablePlan();
  }

  function encodeSharePayload() {
    const priorities = {};
    for (const [className, level] of Object.entries(state.classPriority)) {
      if (level && level !== 'normal') priorities[className] = level;
    }
    const payload = {
      v: 1,
      r: runeOrder.map((name) => Math.max(0, Math.min(99, Number.parseInt(String(state.manualRunes[name] || 0), 10) || 0))),
      p: effectiveSkyItemCounts(),
      pr: priorities,
      pc: elements.preferCompletion.checked ? 1 : 0,
      ic: elements.includeConflicts.checked ? 1 : 0,
    };
    return toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  }

  function decodeSharePayload(encoded) {
    try {
      const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(encoded)));
      if (!payload || payload.v !== 1 || !Array.isArray(payload.r)) return null;

      const manualRunes = Object.fromEntries(runeOrder.map((name) => [name, 0]));
      for (let i = 0; i < runeOrder.length; i += 1) {
        manualRunes[runeOrder[i]] = Math.max(0, Math.min(99, Number.parseInt(String(payload.r[i] ?? 0), 10) || 0));
      }

      const pieceOverrides = {};
      if (payload.p && typeof payload.p === 'object') {
        for (const [name, raw] of Object.entries(payload.p)) {
          const value = Math.max(0, Math.min(99, Number.parseInt(String(raw), 10) || 0));
          if (value > 0 && String(name || '').trim()) pieceOverrides[String(name).trim()] = value;
        }
      }

      const classPriority = Object.fromEntries(data.classes.map((item) => [item.name, 'normal']));
      if (payload.pr && typeof payload.pr === 'object') {
        for (const [className, level] of Object.entries(payload.pr)) {
          if (!Object.prototype.hasOwnProperty.call(classPriority, className)) continue;
          if (level === 'high' || level === 'low' || level === 'normal') classPriority[className] = level;
        }
      }

      return {
        manualRunes,
        pieceOverrides,
        classPriority,
        preferCompletion: payload.pc == null ? true : Boolean(Number(payload.pc)),
        includeConflicts: payload.ic == null ? false : Boolean(Number(payload.ic)),
      };
    } catch {
      return null;
    }
  }

  function shareUrlForPlan() {
    return `${location.origin}${location.pathname}${location.search}${SHARE_HASH_PREFIX}${encodeSharePayload()}`;
  }

  function clearShareHash() {
    if (!(location.hash || '').startsWith(SHARE_HASH_PREFIX)) return;
    history.replaceState(null, '', `${location.pathname}${location.search}`);
  }

  function applySharedPlan(decoded) {
    state.manualRunes = { ...decoded.manualRunes };
    state.pieceOverrides = { ...decoded.pieceOverrides };
    state.classPriority = { ...decoded.classPriority };
    elements.preferCompletion.checked = decoded.preferCompletion;
    elements.includeConflicts.checked = decoded.includeConflicts;

    state.rawText = '';
    state.fileName = 'shared plan';
    state.manualOnly = true;
    state.parsed = engine.createEmptyParsed();
    state.analysis = engine.analyzeInventory(effectiveParsed(), data, analysisOptions());
    elements.analysisPanel.classList.remove('hidden');
    renderRuneInputs();
    renderPriorityGrid();
    setActiveTab('recommended');
    render();
    updateShareButton();
    clearShareHash();
    elements.summaryPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setStatus('Opened shared Sky Sets plan. Load an inventory file anytime to merge with your bags.');
  }

  async function copyShareLink() {
    if (!state.analysis) {
      setStatus('Load an inventory or enter pieces before sharing.');
      return;
    }
    if (!hasShareablePlan()) {
      setStatus('Enter rune counts or load Sky items before sharing.');
      return;
    }
    const url = shareUrlForPlan();
    await navigator.clipboard.writeText(url);
    setStatus('Link copied');
  }

  function tryOpenShareHash() {
    const hash = location.hash || '';
    if (!hash.startsWith(SHARE_HASH_PREFIX)) return false;
    const decoded = decodeSharePayload(hash.slice(SHARE_HASH_PREFIX.length));
    if (!decoded) {
      setStatus('That share link looks invalid.', { error: true });
      clearShareHash();
      return false;
    }
    applySharedPlan(decoded);
    return true;
  }

  const pieceCatalog = engine.buildPieceCatalog(data);
  const SOURCE_ORDER = [
    'Island 2 — Protector of Sky',
    'Island 3 — Gorgalosk',
    'Island 4 — Keeper of Souls',
    'Island 5 — Spiroc Lord',
    'Island 6 — Bazzt Zzzt',
    'Island 6 trash',
    'Island 7 — Sister of the Spire',
    'Island 7 trash',
    'Island 8 — Eye of Veeshan',
    'Island 8 — Eye of Veeshan / Noble Dojorn',
    'Efreeti cycle — Noble Dojorn / Overseer of Air / Hand of Veeshan',
  ];
  const sourceRank = (source) => {
    const index = SOURCE_ORDER.indexOf(source);
    return index >= 0 ? index : SOURCE_ORDER.length + 1;
  };

  const classOrder = new Map(data.classes.map((item, index) => [item.name, index]));
  // Sprite column order matches Spell Bars / class-sprite.png.
  const CLASS_SPRITE_ORDER = [
    'WAR', 'CLR', 'PAL', 'RNG', 'SHD', 'DRU', 'MNK', 'BRD',
    'ROG', 'SHM', 'NEC', 'WIZ', 'MAG', 'ENC', 'BST', 'BER',
  ];
  const evaluatedById = () => new Map((state.analysis?.evaluatedQuests || []).map((quest) => [quest.id, quest]));

  function classIconHtml(abbr, className) {
    const code = String(abbr || '').toUpperCase();
    const spriteIndex = CLASS_SPRITE_ORDER.indexOf(code);
    const ci = spriteIndex >= 0 ? spriteIndex : 0;
    const label = className || code;
    return `<span class="class-icon" data-ci="${ci}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}"></span>`;
  }

  function displayRuneName(name) {
    const match = /^Wind Rune\s+(.+)$/i.exec(String(name || '').trim());
    return match ? `${match[1]} Wind Rune` : name;
  }

  function displayItemName(name) {
    return /^Wind Rune\s+/i.test(String(name || '')) ? displayRuneName(name) : name;
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function itemIconId(name) {
    if (/^Wind Rune\s+/i.test(String(name || ''))) return '966';
    return data.itemIcons?.[name] || data.itemIcons?.[displayItemName(name)] || '';
  }

  function itemIconHtml(name, size = 32) {
    const label = displayItemName(name);
    const initial = escapeHtml((label || '?').charAt(0).toUpperCase());
    const sizeClass = size <= 24 ? 'is-sm' : size <= 28 ? 'is-md' : '';
    const iconId = itemIconId(name);
    if (!iconId) {
      return `<span class="item-icon-fallback ${sizeClass}" aria-hidden="true">${initial}</span>`;
    }
    const src = window.EQLDom
      ? window.EQLDom.iconUrl('items', iconId)
      : `../assets/icons/items/Item_${String(iconId).replace(/\D/g, '') || '0'}.png`;
    return `<img class="item-icon ${sizeClass}" src="${escapeHtml(src)}" alt="" width="${size}" height="${size}" loading="lazy" decoding="async" data-initial="${initial}">`;
  }

  function bindItemIconFallbacks(root = elements.results) {
    if (!root) return;
    root.querySelectorAll('img.item-icon').forEach((img) => {
      if (img.dataset.boundFallback) return;
      img.dataset.boundFallback = '1';
      img.addEventListener('error', () => {
        const fallback = document.createElement('span');
        fallback.className = img.className.replace('item-icon', 'item-icon-fallback');
        fallback.setAttribute('aria-hidden', 'true');
        fallback.textContent = (img.dataset.initial || '?').charAt(0).toUpperCase();
        img.replaceWith(fallback);
      });
    });
  }

  function sortQuests(quests) {
    return [...quests].sort((a, b) =>
      (classOrder.get(a.className) ?? 99) - (classOrder.get(b.className) ?? 99) ||
      a.test.localeCompare(b.test)
    );
  }

  function initializeControls() {
    for (const classInfo of data.classes) {
      const option = document.createElement('option');
      option.value = classInfo.name;
      option.textContent = classInfo.name;
      elements.classFilter.append(option);
    }
    renderPriorityGrid();
    renderRuneInputs();
  }

  function numField(attrs, { compact = false } = {}) {
    if (window.EQLDom?.numFieldHtml) {
      return window.EQLDom.numFieldHtml(attrs, { compact });
    }
    return `<input type="number" ${attrs}>`;
  }

  function renderRuneInputs() {
    elements.runeInputGrid.innerHTML = runeOrder.map((name, index) => {
      const label = displayRuneName(name);
      return `<label class="rune-input-item" title="${escapeHtml(label)}">
        <span class="rune-input-label">${itemIconHtml(name, 24)}<span>${escapeHtml(label)}</span></span>
        ${numField(`min="0" max="99" step="1" inputmode="numeric" value="${state.manualRunes[name]}" data-rune-name="${escapeHtml(name)}" aria-label="${escapeHtml(label)} count" data-rune-index="${index}"`)}
      </label>`;
    }).join('');

    elements.runeInputGrid.querySelectorAll('input[data-rune-name]').forEach((input) => {
      input.addEventListener('focus', () => input.select());
      input.addEventListener('input', () => {
        const value = Math.max(0, Math.min(99, Number.parseInt(input.value || '0', 10) || 0));
        state.manualRunes[input.dataset.runeName] = value;
        if (input.value !== String(value)) input.value = String(value);
        saveStoredRunes();
        recalculate();
      });
    });
    if (window.EQLDom?.bindNumFields) window.EQLDom.bindNumFields(elements.runeInputGrid);
    bindItemIconFallbacks(elements.runeInputGrid);
    renderRuneTotal();
  }

  function renderRuneTotal() {
    const total = Object.values(state.manualRunes).reduce((sum, count) => sum + count, 0);
    elements.runeTotal.textContent = `${total.toLocaleString()} rune${total === 1 ? '' : 's'} entered`;
    elements.runeTotal.classList.toggle('has-counts', total > 0);
  }

  function effectiveParsed() {
    // Currency boxes are absolute totals. A typed 0 means none — even if the export
    // listed a physical Wind Rune row (those are uncommon but used to keep counting).
    const withRunes = engine.withCountOverrides(
      state.parsed,
      state.manualRunes,
      'Inventory > Storage > Currency'
    );
    return engine.withCountOverrides(withRunes, state.pieceOverrides, 'Manual entry');
  }

  function fileOwnedCount(name) {
    return engine.inventoryCount(state.parsed, name);
  }

  function displayedPieceCount(name) {
    if (Object.prototype.hasOwnProperty.call(state.pieceOverrides, name)) {
      return state.pieceOverrides[name];
    }
    return fileOwnedCount(name);
  }

  function setPieceOverride(name, rawValue) {
    const value = Math.max(0, Math.min(99, Number.parseInt(String(rawValue || '0'), 10) || 0));
    const fromFile = fileOwnedCount(name);
    if (value === fromFile && !state.manualOnly) {
      delete state.pieceOverrides[name];
    } else {
      state.pieceOverrides[name] = value;
    }
    return value;
  }

  function renderPriorityGrid() {
    elements.priorityGrid.innerHTML = data.classes.map((classInfo) => `
      <label class="priority-item">
        <span title="${escapeHtml(classInfo.npc)}">${escapeHtml(classInfo.name)}</span>
        <select data-priority-class="${escapeHtml(classInfo.name)}" aria-label="${escapeHtml(classInfo.name)} priority">
          <option value="high" ${state.classPriority[classInfo.name] === 'high' ? 'selected' : ''}>High</option>
          <option value="normal" ${state.classPriority[classInfo.name] === 'normal' ? 'selected' : ''}>Normal</option>
          <option value="low" ${state.classPriority[classInfo.name] === 'low' ? 'selected' : ''}>Low</option>
        </select>
      </label>
    `).join('');

    elements.priorityGrid.querySelectorAll('select[data-priority-class]').forEach((select) => {
      select.addEventListener('change', () => {
        state.classPriority[select.dataset.priorityClass] = select.value;
        recalculate();
      });
    });
  }

  function setStatus(message, { error = false } = {}) {
    if (window.EQLToast) {
      EQLToast.show(message, { error });
    } else if (error) {
      window.alert(message);
    }
  }

  function analyzeText(text, fileName) {
    engine.validateInventoryText(text, fileName);
    state.rawText = text;
    state.fileName = fileName || 'inventory.txt';
    state.manualOnly = false;
    state.parsed = engine.parseInventory(text);
    if (!state.parsed.stats.parsedRows) {
      throw new Error(
        `"${state.fileName}" has no item rows. Choose the inventory export from /outputfile inventory.`
      );
    }
    state.analysis = engine.analyzeInventory(effectiveParsed(), data, analysisOptions());
    elements.analysisPanel.classList.remove('hidden');
    render();
    elements.runePanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setStatus(`Loaded ${state.parsed.stats.parsedRows.toLocaleString()} item rows from ${state.fileName}.`);
  }

  function startManualOnly() {
    state.rawText = '';
    state.fileName = 'manual entry';
    state.manualOnly = true;
    state.parsed = engine.createEmptyParsed();
    state.analysis = engine.analyzeInventory(effectiveParsed(), data, analysisOptions());
    elements.analysisPanel.classList.remove('hidden');
    setActiveTab('overview');
    render();
    elements.resultsPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setStatus('Enter Wind Rune and piece counts. You can still load an inventory file anytime.');
  }

  function analysisOptions() {
    return {
      classPriority: state.classPriority,
      preferClassCompletion: elements.preferCompletion.checked,
      includeRewardConflicts: elements.includeConflicts.checked,
    };
  }

  function recalculate() {
    if (!state.parsed) return;
    const overviewFocus = state.activeTab === 'overview' ? captureOverviewInputFocus() : null;
    const bossFocus = state.activeTab === 'boss' ? captureBossInputFocus() : null;
    state.analysis = engine.analyzeInventory(effectiveParsed(), data, analysisOptions());
    renderRuneTotal();
    renderSummary();
    updateShareButton();
    renderResults();
    if (overviewFocus) restoreOverviewInputFocus(overviewFocus);
    if (bossFocus) restoreBossInputFocus(bossFocus);
  }

  function captureOverviewInputFocus() {
    const el = document.activeElement;
    if (!el || !elements.results?.contains(el)) return null;
    if (el.matches?.('input[data-piece-name]')) {
      return {
        kind: 'piece',
        name: el.dataset.pieceName,
        start: el.selectionStart,
        end: el.selectionEnd,
      };
    }
    if (el.matches?.('input[data-rune-name]')) {
      return {
        kind: 'rune',
        name: el.dataset.runeName,
        start: el.selectionStart,
        end: el.selectionEnd,
      };
    }
    return null;
  }

  function captureBossInputFocus() {
    const el = document.activeElement;
    if (!el || !elements.results?.contains(el) || !el.matches?.('input[data-piece-name]')) return null;
    return {
      name: el.dataset.pieceName,
      start: el.selectionStart,
      end: el.selectionEnd,
    };
  }

  function restoreOverviewInputFocus(focus) {
    if (!focus?.name) return;
    const selector = focus.kind === 'rune'
      ? `input[data-rune-name="${cssAttrEscape(focus.name)}"]`
      : `input[data-piece-name="${cssAttrEscape(focus.name)}"]`;
    const input = elements.results.querySelector(selector);
    if (!input) return;
    input.focus();
    if (typeof focus.start === 'number' && typeof focus.end === 'number') {
      try {
        input.setSelectionRange(focus.start, focus.end);
      } catch {
        /* ignore unsupported selection on number inputs in some browsers */
      }
    }
  }

  function restoreBossInputFocus(focus) {
    if (!focus?.name) return;
    const input = elements.results.querySelector(`input[data-piece-name="${cssAttrEscape(focus.name)}"]`);
    if (!input) return;
    input.focus();
    if (typeof focus.start === 'number' && typeof focus.end === 'number') {
      try {
        input.setSelectionRange(focus.start, focus.end);
      } catch {
        /* ignore */
      }
    }
  }

  function cssAttrEscape(value) {
    if (window.CSS?.escape) return window.CSS.escape(value);
    return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  function syncTopRuneInput(name, value) {
    const top = elements.runeInputGrid?.querySelector(`input[data-rune-name="${cssAttrEscape(name)}"]`);
    if (top && document.activeElement !== top && top.value !== String(value)) {
      top.value = String(value);
    }
  }

  function render() {
    renderSummary();
    renderResults();
    updateShareButton();
  }

  function renderSummary() {
    const analysis = state.analysis;
    const parsed = analysis.parsed;
    const overrideCount = Object.keys(state.pieceOverrides).length;
    elements.fileLabel.textContent = state.manualOnly
      ? `Manual entry · ${overrideCount.toLocaleString()} piece count${overrideCount === 1 ? '' : 's'} set`
      : `${state.fileName} · ${state.parsed.stats.parsedRows.toLocaleString()} item rows${overrideCount ? ` · ${overrideCount} piece override${overrideCount === 1 ? '' : 's'}` : ''}`;
    const detectedRewardCount = analysis.evaluatedQuests.filter((quest) => quest.ownedRewards.length > 0).length;
    const totalTests = analysis.evaluatedQuests.length;
    const completedPct = totalTests > 0 ? Math.round((100 * detectedRewardCount) / totalTests) : 0;
    elements.summaryCards.innerHTML = [
      [analysis.allocation.selected.length, 'Turn-ins you can make together now'],
      [detectedRewardCount, 'Detected set rewards owned'],
      [analysis.near.length, 'Tests missing only one or two pieces'],
      [analysis.loosePieces.filter((piece) => !piece.isRune).length, 'Recognized Sky quest pieces found'],
      [`${completedPct}%`, `${detectedRewardCount} of ${totalTests} class tests completed`],
    ].map(([count, label]) => `<div class="summary-card"><strong>${escapeHtml(String(count))}</strong><span>${escapeHtml(label)}</span></div>`).join('');

    const manualRuneTotal = Object.values(state.manualRunes).reduce((sum, count) => sum + count, 0);
    const needsCurrency = manualRuneTotal === 0;
    elements.summaryPanel.classList.toggle('needs-currency', needsCurrency);
    elements.currencyWarning.classList.toggle('hidden', !needsCurrency);

    if (needsCurrency) {
      elements.workflowMessage.className = 'workflow-message hidden';
      elements.workflowMessage.innerHTML = '';
    } else if (analysis.allocation.selected.length > 0) {
      elements.workflowMessage.className = 'workflow-message ready-message';
      elements.workflowMessage.innerHTML = `<strong>${analysis.allocation.selected.length} turn-in${analysis.allocation.selected.length === 1 ? '' : 's'} can be completed now.</strong><span>Use the Turn In tab. Each listed rune and quest piece is allocated only once.</span>`;
    } else if (analysis.ready.length > 0) {
      elements.workflowMessage.className = 'workflow-message needs-action';
      elements.workflowMessage.innerHTML = '<strong>Complete sets were found, but all are blocked by an owned LORE reward or current settings.</strong><span>Open Overview (Completed) or the optional class-priority section below.</span>';
    } else {
      elements.workflowMessage.className = 'workflow-message neutral-message';
      elements.workflowMessage.innerHTML = '<strong>No complete turn-in set was found yet.</strong><span>Open Overview (Missing) or By boss to see what to farm next.</span>';
    }
  }

  function matchesFilters(quest) {
    const selectedClass = elements.classFilter.value;
    if (selectedClass !== 'all' && quest.className !== selectedClass) return false;
    const query = elements.searchFilter.value.trim().toLocaleLowerCase('en-US');
    if (!query) return true;
    const haystack = [
      quest.className, quest.classAbbr, quest.test, quest.phrase, quest.npc, quest.rune,
      ...quest.items.map((item) => item.name), ...quest.rewards,
    ].join(' ').toLocaleLowerCase('en-US');
    return haystack.includes(query);
  }

  function renderResults() {
    if (!state.analysis) return;
    const tab = state.activeTab;
    if (tab === 'recommended') renderRecommended();
    else if (tab === 'overview') renderOverview();
    else if (tab === 'pieces') renderPieces();
    else if (tab === 'boss') renderByBoss();
    else if (tab === 'runes') renderRunes();
    bindItemIconFallbacks();
  }

  function sectionHeader(title, note, count) {
    return `<div class="section-title"><div><h2>${escapeHtml(title)}</h2><p>${escapeHtml(note)}</p></div><span class="pill">${count}</span></div>`;
  }

  function renderRecommended() {
    const selected = sortQuests(state.analysis.allocation.selected.filter(matchesFilters));
    const blocked = sortQuests(state.analysis.allocation.blocked.filter(matchesFilters));
    let html = sectionHeader(
      'Turn In',
      'Retrieve the listed items, go to the class NPC in the Island 1 quest room, and hand in one complete card at a time.',
      selected.length
    );
    html += selected.length ? `<div class="quest-list">${selected.map((quest) => renderQuestCard(quest, { selected: true, open: true })).join('')}</div>` : emptyState(Object.values(state.manualRunes).every((count) => count === 0) ? 'Enter the Wind Rune counts above. The inventory file does not include Inventory > Storage > Currency.' : 'No complete non-conflicting set was found. Open Overview (Missing) to see what is closest.');
    if (blocked.length) {
      html += `<div style="height:18px"></div>${sectionHeader('Other complete sets', 'These compete with the Turn In batch for one or more runes or quest pieces.', blocked.length)}`;
      html += `<div class="quest-list">${blocked.map((quest) => renderQuestCard(quest, { allocationBlocked: true })).join('')}</div>`;
    }
    elements.results.innerHTML = html;
  }

  function overviewHeader(note, count) {
    const options = [
      ['all', 'All'],
      ['ready', 'Ready'],
      ['missing', 'Missing'],
      ['completed', 'Completed'],
    ];
    const chips = options.map(([id, label]) => {
      const active = state.overviewFilter === id;
      return `<button type="button" class="filter-chip${active ? ' active' : ''}" data-overview-filter="${id}" aria-pressed="${active ? 'true' : 'false'}">${label}</button>`;
    }).join('');
    return `<div class="overview-header">
      <div class="overview-header-text">
        <h2>Overview</h2>
        <p>${escapeHtml(note)}</p>
      </div>
      <div class="overview-header-controls">
        <div class="overview-filter-chips" role="group" aria-label="Overview status filter">${chips}</div>
        <span class="pill">${count}</span>
      </div>
    </div>`;
  }

  function renderOverview() {
    const filter = state.overviewFilter;
    const completed = sortQuests(
      state.analysis.evaluatedQuests.filter((quest) => quest.ownedRewards.length > 0 && matchesFilters(quest))
    );
    const missing = sortQuests(state.analysis.near.filter(matchesFilters));
    const ready = sortQuests(state.analysis.ready.filter(matchesFilters));
    const groupsByClass = new Map();

    const ensureGroup = (quest) => {
      let group = groupsByClass.get(quest.className);
      if (!group) {
        group = { className: quest.className, classAbbr: quest.classAbbr, ready: [], missing: [], completed: [] };
        groupsByClass.set(quest.className, group);
      }
      return group;
    };

    if (filter === 'all' || filter === 'completed') {
      for (const quest of completed) ensureGroup(quest).completed.push(quest);
    }
    if (filter === 'all' || filter === 'missing') {
      for (const quest of missing) ensureGroup(quest).missing.push(quest);
    }
    if (filter === 'all' || filter === 'ready') {
      for (const quest of ready) ensureGroup(quest).ready.push(quest);
    }

    const groups = [...groupsByClass.values()].sort((a, b) =>
      (classOrder.get(a.className) ?? 99) - (classOrder.get(b.className) ?? 99)
    );
    const totalCount = groups.reduce(
      (sum, group) => sum + group.ready.length + group.missing.length + group.completed.length,
      0
    );
    const notes = {
      all: 'Ready turn-ins, nearly complete tests, and owned rewards, grouped by class.',
      ready: 'Tests with every required piece owned and no LORE reward conflict, grouped by class.',
      missing: 'Tests missing one or two required items, grouped by class.',
      completed: 'Sky set rewards found in your inventory, sorted by class.',
    };
    const empties = {
      all: 'No ready, missing, or completed sets match the current filters.',
      ready: 'No ready turn-in tests match the current filters.',
      missing: 'No nearly complete tests match the current filters.',
      completed: 'No Sky set rewards were detected yet.',
    };

    let html = overviewHeader(notes[filter] || notes.all, totalCount);
    if (!totalCount) {
      elements.results.innerHTML = html + emptyState(empties[filter] || empties.all);
      bindOverviewFilter();
      return;
    }

    const selectedIds = state.analysis.allocation.selectedIds;
    const statsByClass = new Map((state.analysis.classStats || []).map((row) => [row.name, row]));
    html += groups.map((group) => {
      const stats = statsByClass.get(group.className);
      const total = stats?.total || 0;
      const owned = stats?.rewardOwned || 0;
      const pct = total > 0 ? Math.round((100 * owned) / total) : 0;
      const missingCount = group.missing.length;
      const rows = [
        ...group.ready.map((quest) => renderReadySetRow(quest, selectedIds.has(quest.id))),
        ...group.missing.map((quest) => renderMissingSetRow(quest)),
        ...group.completed.map((quest) => renderCompletedSetRow(quest)),
      ].join('');
      return `<section class="reward-class-group">
        <h3 class="reward-class-title">
          <span class="class-icon-wrap">${classIconHtml(group.classAbbr, group.className)}</span>
          <span>${escapeHtml(group.className)}</span>
          <span class="pill class-complete-pct" title="${owned} of ${total} set rewards owned">${pct}% complete</span>
          ${missingCount ? `<span class="pill class-missing-count">${missingCount} missing</span>` : ''}
        </h3>
        <div class="detected-reward-list">${rows}</div>
      </section>`;
    }).join('');
    elements.results.innerHTML = html;
    bindOverviewFilter();
    bindOverviewMissingInputs();
  }

  function bindOverviewFilter() {
    elements.results.querySelectorAll('button[data-overview-filter]').forEach((button) => {
      button.addEventListener('click', () => {
        const next = button.dataset.overviewFilter;
        if (!next || next === state.overviewFilter) return;
        state.overviewFilter = next;
        renderResults();
      });
    });
  }

  function bindOverviewMissingInputs() {
    elements.results.querySelectorAll('.near-miss-counts input[data-piece-name]').forEach((input) => {
      input.addEventListener('focus', () => input.select());
      input.addEventListener('input', () => {
        const value = setPieceOverride(input.dataset.pieceName, input.value);
        if (input.value !== String(value)) input.value = String(value);
        recalculate();
      });
    });
    elements.results.querySelectorAll('.near-miss-counts input[data-rune-name]').forEach((input) => {
      input.addEventListener('focus', () => input.select());
      input.addEventListener('input', () => {
        const value = Math.max(0, Math.min(99, Number.parseInt(input.value || '0', 10) || 0));
        state.manualRunes[input.dataset.runeName] = value;
        if (input.value !== String(value)) input.value = String(value);
        saveStoredRunes();
        syncTopRuneInput(input.dataset.runeName, value);
        recalculate();
      });
    });
    if (window.EQLDom?.bindNumFields) window.EQLDom.bindNumFields(elements.results);
  }

  function renderReadySetRow(quest, inBatch) {
    const rewardIcons = quest.rewards.map((name) => itemIconHtml(name, 28)).join('');
    const rewardNames = quest.rewards.map((name) => escapeHtml(name)).join(' + ');
    const statusText = inBatch ? 'in batch' : 'ready';
    return `<div class="detected-reward-row ready-set-row">
      <span class="detected-reward-icons">${rewardIcons}</span>
      <span class="detected-reward-main">
        <strong>${rewardNames}</strong>
        <span class="overview-test">${escapeHtml(quest.test)}</span>
      </span>
      <span class="row-status ready-set-status">${statusText}</span>
    </div>`;
  }

  function renderCompletedSetRow(quest) {
    const rewardIcons = quest.ownedRewards.map((entry) => itemIconHtml(entry.name, 28)).join('');
    const rewardNames = quest.ownedRewards.map((entry) => escapeHtml(entry.name)).join(' + ');
    const locations = quest.ownedRewards
      .map((entry) => escapeHtml(engine.locationText(entry.locations)))
      .filter(Boolean)
      .join('; ');
    return `<div class="detected-reward-row completed-set-row">
      <span class="detected-reward-icons">${rewardIcons}</span>
      <span class="detected-reward-main">
        <strong>${rewardNames}</strong>
        <span class="overview-test test-done">${escapeHtml(quest.test)}</span>
        <span class="reward-location">${locations || 'Location unknown'}</span>
      </span>
      <span class="row-status owned-set-status">owned</span>
    </div>`;
  }

  function renderMissingSetRow(quest) {
    const sourceFor = new Map(quest.items.map((item) => [engine.normalizeItemName(item.name), item.source]));
    const itemLines = quest.missing.map((entry) => {
      const isRune = /^wind rune /i.test(entry.name);
      const label = displayItemName(entry.name);
      const source = isRune ? 'Any Plane of Sky enemy' : (sourceFor.get(entry.key) || '');
      const count = isRune ? (state.manualRunes[entry.name] || 0) : displayedPieceCount(entry.name);
      const field = isRune
        ? numField(
          `min="0" max="99" step="1" inputmode="numeric" value="${count}" data-rune-name="${escapeHtml(entry.name)}" aria-label="${escapeHtml(label)} count"`,
          { compact: true }
        )
        : numField(
          `min="0" max="99" step="1" inputmode="numeric" value="${count}" data-piece-name="${escapeHtml(entry.name)}" aria-label="${escapeHtml(label)} count"`,
          { compact: true }
        );
      return `<div class="near-miss-item-block">
        <div class="near-miss-item">
          <span class="near-miss-item-label">${itemIconHtml(entry.name, 28)}<strong>${escapeHtml(label)}</strong></span>
          <span class="near-miss-counts">${field}</span>
        </div>
        <div class="near-miss-meta">
          <span class="overview-test">${escapeHtml(quest.test)}</span>
          ${source ? `<span class="near-miss-island">${escapeHtml(source)}</span>` : ''}
        </div>
      </div>`;
    }).join('');
    return `<div class="detected-reward-row near-miss-row">
      <div class="near-miss-body">
        <div class="near-miss-items">${itemLines}</div>
      </div>
    </div>`;
  }

  function renderQuestCard(quest, flags = {}) {
    const sourceFor = new Map(quest.items.map((item) => [engine.normalizeItemName(item.name), item.source]));
    const status = quest.rewardConflict
      ? { text: 'reward owned', className: 'conflict' }
      : flags.selected
        ? { text: 'in batch', className: 'ready' }
        : quest.individuallyReady
          ? { text: flags.allocationBlocked ? 'competes' : 'ready', className: 'ready' }
          : { text: `missing ${quest.missing.length}`, className: 'missing' };

    const cardClasses = ['quest-card'];
    if (flags.selected) cardClasses.push('selected');
    if (quest.rewardConflict || flags.conflict) cardClasses.push('conflict');
    else if (flags.near) cardClasses.push('near');

    const resourceRows = quest.resources.map((resource) => {
      const have = resource.count > 0;
      const isRune = /^wind rune /i.test(resource.name);
      const sourceHtml = isRune
        ? `<br><span class="source-note">Any Plane of Sky enemy</span>`
        : (sourceFor.get(resource.key)
          ? `<br><span class="source-note">${escapeHtml(sourceFor.get(resource.key))}</span>`
          : '');
      const locationsHtml = isRune
        ? 'Inventory &gt; Storage &gt; Currency'
        : (have ? escapeHtml(engine.locationText(resource.locations)) : 'Missing');
      return `<div class="resource-row ${have ? 'have' : 'miss'}">
        <span class="mark">${have ? '✓' : '×'}</span>
        ${itemIconHtml(resource.name, 28)}
        <span><strong>${escapeHtml(displayItemName(resource.name))}</strong>${sourceHtml}</span>
        <span class="locations">${locationsHtml}</span>
      </div>`;
    }).join('');

    const rewardConflictText = quest.ownedRewards.length
      ? `<br><span class="source-note">Found: ${quest.ownedRewards.map((entry) => `${escapeHtml(entry.name)} — ${escapeHtml(engine.locationText(entry.locations))}`).join('; ')}</span>`
      : '';
    const allocationText = flags.allocationBlocked && quest.allocationMissing?.length
      ? `<p class="reward-line"><strong>Recommended batch used:</strong> ${escapeHtml(quest.allocationMissing.map((item) => item.name).join(', '))}</p>`
      : '';
    const rewardIcons = quest.rewards.map((name) => itemIconHtml(name, 24)).join('');

    return `<details class="${cardClasses.join(' ')}" ${flags.open ? 'open' : ''}>
      <summary>
        <span class="class-icon-wrap">${classIconHtml(quest.classAbbr, quest.className)}</span>
        <span class="quest-title"><strong>${escapeHtml(quest.className)} — ${escapeHtml(quest.test)}</strong><span>Reward: ${escapeHtml(quest.rewards.join(' + '))}</span></span>
        <span class="status ${status.className}">${escapeHtml(status.text)}</span>
      </summary>
      <div class="quest-body">
        <div class="quest-meta"><span><strong>Take to:</strong> ${escapeHtml(quest.npc)}</span><span><strong>Optional dialogue:</strong> “${escapeHtml(quest.phrase)}”</span></div>
        <div class="resource-list">${resourceRows}</div>
        <p class="reward-line"><span class="reward-icons">${rewardIcons}</span><strong>Reward:</strong> ${escapeHtml(quest.rewards.join(' + '))}${rewardConflictText}</p>
        ${allocationText}
      </div>
    </details>`;
  }

  function renderPieces() {
    const selectedClass = elements.classFilter.value;
    const query = elements.searchFilter.value.trim().toLocaleLowerCase('en-US');
    const pieces = state.analysis.loosePieces.filter((piece) => {
      if (piece.isRune) return false;
      if (selectedClass !== 'all' && !piece.quests.some((quest) => quest.className === selectedClass)) return false;
      const haystack = `${piece.name} ${piece.quests.map((quest) => `${quest.className} ${quest.test}`).join(' ')}`.toLocaleLowerCase('en-US');
      return !query || haystack.includes(query);
    });
    const sorted = sortPieces(pieces);
    elements.results.innerHTML = sectionHeader('Recognized Plane of Sky quest pieces', 'Copies, locations, and every current test that consumes the item.', sorted.length) +
      (sorted.length ? renderPiecesTable(sorted) : emptyState('No recognized quest pieces match the current filters.'));
    bindPiecesSort();
  }

  function questLineHtml(quest, { done = false } = {}) {
    const text = `${escapeHtml(quest.className)} — ${escapeHtml(quest.test)}`;
    return done
      ? `<span class="test-done">${text}</span>`
      : text;
  }

  function pieceQuestLinesHtml(piece, byId) {
    return piece.quests.map((quest) => {
      const done = Boolean(byId.get(quest.id)?.rewardConflict);
      return questLineHtml(quest, { done });
    }).join('<br>');
  }

  function pieceStillNeeded(piece, byId) {
    const incompleteConsumers = piece.quests.filter((quest) => !byId.get(quest.id)?.rewardConflict).length;
    return Math.max(0, incompleteConsumers - (piece.count || 0));
  }

  function pieceIncompleteDemand(piece, byId) {
    return piece.quests.filter((quest) => !byId.get(quest.id)?.rewardConflict).length;
  }

  function bossGroupProgress(rows, byId) {
    let needed = 0;
    let have = 0;
    for (const piece of rows) {
      const demand = pieceIncompleteDemand(piece, byId);
      if (demand < 1) continue;
      const owned = displayedPieceCount(piece.name);
      needed += demand;
      have += Math.min(owned, demand);
    }
    const missing = Math.max(0, needed - have);
    const pct = needed > 0 ? Math.round((100 * have) / needed) : 100;
    return { needed, have, missing, pct };
  }

  function pieceUsedBySortKey(piece, byId) {
    const allDone = piece.quests.length > 0 && piece.quests.every((quest) => byId.get(quest.id)?.rewardConflict);
    if (allDone) return 'done';
    if (!piece.quests.length) return '';
    const first = piece.quests[0];
    return `${first.className} — ${first.test}`;
  }

  function sortPieces(pieces) {
    const byId = evaluatedById();
    const { key, dir } = state.piecesSort;
    const factor = dir === 'desc' ? -1 : 1;
    return [...pieces].sort((a, b) => {
      let cmp = 0;
      if (key === 'count' || key === 'selectedUse') {
        cmp = (a[key] || 0) - (b[key] || 0);
      } else if (key === 'stillNeeded') {
        cmp = pieceStillNeeded(a, byId) - pieceStillNeeded(b, byId);
      } else if (key === 'locations') {
        cmp = engine.locationText(a.locations).localeCompare(engine.locationText(b.locations));
      } else if (key === 'usedBy') {
        const aDone = pieceUsedBySortKey(a, byId) === 'done';
        const bDone = pieceUsedBySortKey(b, byId) === 'done';
        if (aDone !== bDone) return aDone ? -1 : 1;
        cmp = pieceUsedBySortKey(a, byId).localeCompare(pieceUsedBySortKey(b, byId));
      } else {
        cmp = a.name.localeCompare(b.name);
      }
      if (cmp !== 0) return cmp * factor;
      return a.name.localeCompare(b.name);
    });
  }

  function sortHeader(label, key, extraClass = '') {
    const active = state.piecesSort.key === key;
    const aria = active ? (state.piecesSort.dir === 'asc' ? 'ascending' : 'descending') : 'none';
    const arrow = active ? (state.piecesSort.dir === 'asc' ? ' ▲' : ' ▼') : '';
    return `<th class="${extraClass} sortable-th${active ? ' is-sorted' : ''}" data-sort-key="${key}" aria-sort="${aria}" role="columnheader" tabindex="0">${escapeHtml(label)}${arrow}</th>`;
  }

  function renderPiecesTable(pieces) {
    const byId = evaluatedById();
    return `<div class="table-wrap"><table class="data-table"><thead><tr>
      <th class="icon-col"></th>
      ${sortHeader('Item', 'name')}
      ${sortHeader('Owned', 'count', 'count')}
      ${sortHeader('Still needed', 'stillNeeded', 'count')}
      ${sortHeader('Used in batch', 'selectedUse', 'count')}
      ${sortHeader('Locations', 'locations')}
      ${sortHeader('Used by', 'usedBy')}
    </tr></thead><tbody>${pieces.map((piece) => {
      const allDone = piece.quests.length > 0 && piece.quests.every((quest) => byId.get(quest.id)?.rewardConflict);
      const stillNeeded = pieceStillNeeded(piece, byId);
      const usedBy = allDone
        ? '<span class="used-by-done">done</span>'
        : pieceQuestLinesHtml(piece, byId);
      return `
      <tr${allDone ? ' class="piece-all-done"' : ''}>
        <td class="icon-col">${itemIconHtml(piece.name, 28)}</td>
        <td><strong>${escapeHtml(piece.name)}</strong></td>
        <td class="count">${piece.count}</td>
        <td class="count">${stillNeeded}</td>
        <td class="count">${piece.selectedUse}</td>
        <td>${escapeHtml(engine.locationText(piece.locations))}</td>
        <td class="class-links">${usedBy}</td>
      </tr>`;
    }).join('')}</tbody></table></div>`;
  }

  function bindPiecesSort() {
    elements.results.querySelectorAll('th[data-sort-key]').forEach((th) => {
      const activate = () => {
        const key = th.dataset.sortKey;
        if (state.piecesSort.key === key) {
          state.piecesSort.dir = state.piecesSort.dir === 'asc' ? 'desc' : 'asc';
        } else {
          state.piecesSort = { key, dir: 'asc' };
        }
        renderResults();
      };
      th.addEventListener('click', activate);
      th.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          activate();
        }
      });
    });
  }

  function renderByBoss() {
    const selectedClass = elements.classFilter.value;
    const query = elements.searchFilter.value.trim().toLocaleLowerCase('en-US');
    const byId = evaluatedById();
    const pieces = pieceCatalog.filter((piece) => {
      if (selectedClass !== 'all' && !piece.quests.some((quest) => quest.className === selectedClass)) return false;
      const haystack = `${piece.name} ${piece.source} ${piece.quests.map((quest) => `${quest.className} ${quest.test}`).join(' ')}`.toLocaleLowerCase('en-US');
      return !query || haystack.includes(query);
    });

    const groups = new Map();
    for (const piece of pieces) {
      if (!groups.has(piece.source)) groups.set(piece.source, []);
      groups.get(piece.source).push(piece);
    }
    const orderedSources = [...groups.keys()].sort((a, b) =>
      sourceRank(a) - sourceRank(b) || a.localeCompare(b)
    );

    const overrideCount = Object.keys(state.pieceOverrides).length;
    let html = sectionHeader(
      'Pieces by boss',
      state.manualOnly
        ? 'Enter how many of each piece you have. Counts drive the turn-in list without an inventory file.'
        : 'Adjust counts for Storage leftovers or extras. Leaving a box alone keeps the export total.',
      pieces.length
    );
    html += `<div class="boss-toolbar">
      <span class="pill${overrideCount ? ' has-counts' : ''}">${overrideCount.toLocaleString()} override${overrideCount === 1 ? '' : 's'}</span>
      <button type="button" class="sky-btn subtle" id="clearPieceOverrides">Clear piece counts</button>
    </div>`;

    if (!orderedSources.length) {
      elements.results.innerHTML = html + emptyState('No Sky pieces match the current filters.');
      return;
    }

    html += orderedSources.map((source) => {
      const rows = groups.get(source);
      const progress = bossGroupProgress(rows, byId);
      return `<section class="boss-group">
        <h3 class="boss-group-title">
          <span class="boss-group-name">${escapeHtml(source)}</span>
          <span class="pill class-complete-pct" title="${progress.have} of ${progress.needed || rows.length} copies for unfinished tests">${progress.pct}% complete</span>
          ${progress.missing ? `<span class="pill class-missing-count">${progress.missing} missing</span>` : ''}
        </h3>
        <div class="boss-piece-list">${[...rows].sort((a, b) => {
          const aDone = a.quests.length > 0 && a.quests.every((quest) => byId.get(quest.id)?.rewardConflict);
          const bDone = b.quests.length > 0 && b.quests.every((quest) => byId.get(quest.id)?.rewardConflict);
          if (aDone !== bDone) return aDone ? 1 : -1;
          return a.name.localeCompare(b.name);
        }).map((piece) => {
          const allDone = piece.quests.length > 0 && piece.quests.every((quest) => byId.get(quest.id)?.rewardConflict);
          const count = displayedPieceCount(piece.name);
          const demand = pieceIncompleteDemand(piece, byId);
          const short = Math.max(0, demand - count);
          const fromFile = fileOwnedCount(piece.name);
          const overridden = Object.prototype.hasOwnProperty.call(state.pieceOverrides, piece.name);
          const usedBy = pieceQuestLinesHtml(piece, byId);
          const fileHint = !allDone && !state.manualOnly && fromFile > 0
            ? `<span class="boss-file-hint">export ${fromFile}</span>`
            : '';
          const needHint = !allDone && demand > 0
            ? `<span class="boss-copy-need${short > 0 ? ' is-short' : ''}" title="${count} owned of ${demand} needed for unfinished tests">${count}/${demand}</span>`
            : '';
          const countControl = allDone
            ? '<span class="boss-piece-done">done</span>'
            : numField(`min="0" max="99" step="1" inputmode="numeric" value="${count}" data-piece-name="${escapeHtml(piece.name)}" aria-label="${escapeHtml(piece.name)} count"`, { compact: true });
          return `<${allDone ? 'div' : 'label'} class="boss-piece-row${allDone ? ' piece-all-done' : ''}${overridden ? ' is-overridden' : ''}${short > 0 ? ' is-short' : ''}">
            ${itemIconHtml(piece.name, 32)}
            <span class="boss-piece-main">
              <strong>${escapeHtml(piece.name)}</strong>
              <span class="class-links">${usedBy}</span>
            </span>
            <span class="boss-piece-count">
              ${needHint}
              ${fileHint}
              ${countControl}
            </span>
          </${allDone ? 'div' : 'label'}>`;
        }).join('')}</div>
      </section>`;
    }).join('');

    elements.results.innerHTML = html;
    const clearBtn = document.getElementById('clearPieceOverrides');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        state.pieceOverrides = {};
        state.analysis = engine.analyzeInventory(effectiveParsed(), data, analysisOptions());
        renderRuneTotal();
        render();
      });
    }
    elements.results.querySelectorAll('input[data-piece-name]').forEach((input) => {
      input.addEventListener('focus', () => input.select());
      input.addEventListener('input', () => {
        const value = setPieceOverride(input.dataset.pieceName, input.value);
        if (input.value !== String(value)) input.value = String(value);
        recalculate();
      });
    });
    if (window.EQLDom?.bindNumFields) window.EQLDom.bindNumFields(elements.results);
  }

  function renderRunes() {
    const query = elements.searchFilter.value.trim().toLocaleLowerCase('en-US');
    const runes = state.analysis.runeSummary.filter((rune) => !query || rune.name.toLocaleLowerCase('en-US').includes(query));
    const allRuneNames = [...runeOrder];
    const rows = allRuneNames.map((name) => {
      const present = runes.find((rune) => engine.normalizeItemName(rune.name) === engine.normalizeItemName(name));
      const usageCount = data.quests.filter((quest) => quest.rune === name).length;
      return { name, count: present?.count || 0, selectedUse: present?.selectedUse || 0, locations: present?.locations || [], usageCount };
    }).filter((row) => {
      if (!query) return true;
      const display = displayRuneName(row.name).toLocaleLowerCase('en-US');
      return display.includes(query) || row.name.toLocaleLowerCase('en-US').includes(query);
    });
    elements.results.innerHTML = sectionHeader('Wind Rune inventory', 'Totals come from the currency boxes above. A 0 means that rune is not available for turn-ins.', rows.length) +
      `<div class="table-wrap"><table class="data-table"><thead><tr><th class="icon-col"></th><th>Rune</th><th class="count">Owned</th><th class="count">Selected use</th><th class="count">Tests using rune</th></tr></thead><tbody>${rows.map((row) => `
        <tr><td class="icon-col">${itemIconHtml(row.name, 28)}</td><td><strong>${escapeHtml(displayRuneName(row.name))}</strong></td><td class="count">${row.count}</td><td class="count">${row.selectedUse}</td><td class="count">${row.usageCount}</td></tr>
      `).join('')}</tbody></table></div>`;
  }

  function emptyState(message) {
    return `<div class="empty-state">${escapeHtml(message)}</div>`;
  }

  async function readFile(file) {
    if (!file) return;
    try {
      engine.validateSelectedFile(file);
      const text = await file.text();
      analyzeText(text, file.name);
    } catch (error) {
      const detail = String(error?.message || 'Could not read that file.').replace(
        /\s*Nothing was uploaded or saved\.?\s*$/i,
        ''
      );
      setStatus(`${detail} Nothing was uploaded or saved.`, { error: true });
    }
  }

  function replaceFileInput() {
    const fresh = document.createElement('input');
    fresh.id = 'fileInput';
    fresh.type = 'file';
    fresh.accept = '.txt,text/plain';
    fresh.hidden = true;
    elements.fileInput.replaceWith(fresh);
    elements.fileInput = fresh;
    elements.fileInput.addEventListener('change', onFileInputChange);
  }

  function onFileInputChange() {
    const file = elements.fileInput.files?.[0];
    readFile(file).finally(replaceFileInput);
  }

  function setActiveTab(tabName) {
    if (tabName === 'sets' || tabName === 'all' || tabName === 'ready' || tabName === 'near') {
      if (tabName === 'near') state.overviewFilter = 'missing';
      else if (tabName === 'ready') state.overviewFilter = 'ready';
      else if (tabName === 'sets') state.overviewFilter = state.overviewFilter || 'all';
      else state.overviewFilter = 'all';
      tabName = 'overview';
    }
    state.activeTab = tabName;
    elements.tabBar.querySelectorAll('.tab').forEach((button) => button.classList.toggle('active', button.dataset.tab === tabName));
    renderResults();
  }

  function exportReport() {
    if (!state.analysis) return;
    const report = engine.buildTextReport(state.analysis, state.fileName);
    const blob = new Blob([report], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${state.fileName.replace(/\.[^.]+$/, '').replace(/[^a-z0-9_-]+/gi, '_') || 'inventory'}_sky_turnins.txt`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const uploadBtn = document.getElementById('upload-btn');
  if (uploadBtn) {
    uploadBtn.addEventListener('click', () => elements.fileInput.click());
  }
  const manualOnlyBtn = document.getElementById('manual-only-btn');
  if (manualOnlyBtn) {
    manualOnlyBtn.addEventListener('click', startManualOnly);
  }

  elements.fileInput.addEventListener('change', onFileInputChange);
  elements.preferCompletion.addEventListener('change', recalculate);
  elements.includeConflicts.addEventListener('change', recalculate);
  elements.clearRunes.addEventListener('click', () => {
    for (const name of Object.keys(state.manualRunes)) state.manualRunes[name] = 0;
    saveStoredRunes();
    renderRuneInputs();
    recalculate();
  });
  elements.resetPriorities.addEventListener('click', () => {
    state.classPriority = Object.fromEntries(data.classes.map((item) => [item.name, 'normal']));
    renderPriorityGrid();
    recalculate();
  });
  elements.classFilter.addEventListener('change', renderResults);
  elements.searchFilter.addEventListener('input', renderResults);
  elements.tabBar.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-tab]');
    if (button) setActiveTab(button.dataset.tab);
  });

  function updateJumpToTabs() {
    const button = elements.jumpToTabs;
    const tabs = elements.tabBar;
    if (!button || !tabs) return;
    const analysisOpen = elements.analysisPanel && !elements.analysisPanel.classList.contains('hidden');
    if (!analysisOpen) {
      button.hidden = true;
      return;
    }
    const tabsBottom = tabs.getBoundingClientRect().bottom;
    button.hidden = tabsBottom > 72;
  }

  if (elements.jumpToTabs) {
    elements.jumpToTabs.addEventListener('click', () => {
      if (window.EQLToast?.scrollTo) {
        window.EQLToast.scrollTo(elements.tabBar);
      } else {
        elements.tabBar.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
    window.addEventListener('scroll', updateJumpToTabs, { passive: true });
    window.addEventListener('resize', updateJumpToTabs);
  }

  const _showAnalysis = () => {
    updateJumpToTabs();
  };
  const analysisObserver = elements.analysisPanel
    ? new MutationObserver(_showAnalysis)
    : null;
  if (analysisObserver) {
    analysisObserver.observe(elements.analysisPanel, { attributes: true, attributeFilter: ['class'] });
  }
  elements.exportButton.addEventListener('click', exportReport);
  elements.printButton.addEventListener('click', () => {
    setActiveTab('recommended');
    window.print();
  });
  if (elements.shareButton) {
    elements.shareButton.addEventListener('click', () => {
      copyShareLink().catch((error) => setStatus(error?.message || 'Could not copy share link.', { error: true }));
    });
  }

  for (const eventName of ['dragenter', 'dragover']) {
    elements.dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      elements.dropZone.classList.add('dragging', 'dragover');
    });
  }
  for (const eventName of ['dragleave', 'drop']) {
    elements.dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      elements.dropZone.classList.remove('dragging', 'dragover');
    });
  }
  elements.dropZone.addEventListener('drop', (event) => readFile(event.dataTransfer.files[0]));

  window.addEventListener('hashchange', () => {
    tryOpenShareHash();
  });

  loadStoredRunes();
  initializeControls();
  updateShareButton();
  updateJumpToTabs();
  tryOpenShareHash();
})();
