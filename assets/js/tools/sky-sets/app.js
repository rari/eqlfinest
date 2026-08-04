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
    classFilter: document.getElementById('classFilter'),
    searchFilter: document.getElementById('searchFilter'),
    results: document.getElementById('results'),
    printButton: document.getElementById('printButton'),
    exportButton: document.getElementById('exportButton'),
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
    classPriority: Object.fromEntries(data.classes.map((item) => [item.name, 'normal'])),
    manualRunes: Object.fromEntries(runeOrder.map((name) => [name, 0])),
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

  function renderRuneInputs() {
    elements.runeInputGrid.innerHTML = runeOrder.map((name, index) => {
      const label = displayRuneName(name);
      return `<label class="rune-input-item" title="${escapeHtml(label)}">
        <span>${escapeHtml(label)}</span>
        <input type="number" min="0" max="99" step="1" inputmode="numeric" value="${state.manualRunes[name]}" data-rune-name="${escapeHtml(name)}" aria-label="${escapeHtml(label)} count" data-rune-index="${index}">
      </label>`;
    }).join('');

    elements.runeInputGrid.querySelectorAll('input[data-rune-name]').forEach((input) => {
      input.addEventListener('focus', () => input.select());
      input.addEventListener('input', () => {
        const value = Math.max(0, Math.min(99, Number.parseInt(input.value || '0', 10) || 0));
        state.manualRunes[input.dataset.runeName] = value;
        if (input.value !== String(value)) input.value = String(value);
        recalculate();
      });
    });
    renderRuneTotal();
  }

  function renderRuneTotal() {
    const total = Object.values(state.manualRunes).reduce((sum, count) => sum + count, 0);
    elements.runeTotal.textContent = `${total.toLocaleString()} rune${total === 1 ? '' : 's'} entered`;
    elements.runeTotal.classList.toggle('has-counts', total > 0);
  }

  function effectiveParsed() {
    return engine.withManualCounts(state.parsed, state.manualRunes);
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

  function analysisOptions() {
    return {
      classPriority: state.classPriority,
      preferClassCompletion: elements.preferCompletion.checked,
      includeRewardConflicts: elements.includeConflicts.checked,
    };
  }

  function recalculate() {
    if (!state.parsed) return;
    state.analysis = engine.analyzeInventory(effectiveParsed(), data, analysisOptions());
    renderRuneTotal();
    render();
  }

  function render() {
    renderSummary();
    renderResults();
  }

  function renderSummary() {
    const analysis = state.analysis;
    const parsed = analysis.parsed;
    elements.fileLabel.textContent = `${state.fileName} · ${parsed.stats.parsedRows.toLocaleString()} item rows`;
    elements.summaryCards.innerHTML = [
      [analysis.allocation.selected.length, 'Turn-ins you can make together now'],
      [analysis.ready.length, 'Complete sets before shared-piece allocation'],
      [analysis.near.length, 'Tests missing only one or two pieces'],
      [analysis.loosePieces.filter((piece) => !piece.isRune).length, 'Recognized Sky quest pieces found'],
    ].map(([count, label]) => `<div class="summary-card"><strong>${count}</strong><span>${escapeHtml(label)}</span></div>`).join('');

    const manualRuneTotal = Object.values(state.manualRunes).reduce((sum, count) => sum + count, 0);
    const needsCurrency = manualRuneTotal === 0;
    elements.summaryPanel.classList.toggle('needs-currency', needsCurrency);
    elements.currencyWarning.classList.toggle('hidden', !needsCurrency);

    if (needsCurrency) {
      elements.workflowMessage.className = 'workflow-message hidden';
      elements.workflowMessage.innerHTML = '';
    } else if (analysis.allocation.selected.length > 0) {
      elements.workflowMessage.className = 'workflow-message ready-message';
      elements.workflowMessage.innerHTML = `<strong>${analysis.allocation.selected.length} turn-in${analysis.allocation.selected.length === 1 ? '' : 's'} can be completed now.</strong><span>Use the Turn in now tab. Each listed rune and quest piece is allocated only once.</span>`;
    } else if (analysis.ready.length > 0) {
      elements.workflowMessage.className = 'workflow-message needs-action';
      elements.workflowMessage.innerHTML = '<strong>Complete sets were found, but all are blocked by an owned LORE reward or current settings.</strong><span>Open All complete sets or the optional class-priority section below.</span>';
    } else {
      elements.workflowMessage.className = 'workflow-message neutral-message';
      elements.workflowMessage.innerHTML = '<strong>No complete turn-in set was found yet.</strong><span>Open Missing 1–2 pieces to see the shortest shopping or looting list.</span>';
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
    else if (tab === 'ready') renderAllReady();
    else if (tab === 'near') renderNear();
    else if (tab === 'all') renderAllTests();
    else if (tab === 'pieces') renderPieces();
    else if (tab === 'runes') renderRunes();
  }

  function sectionHeader(title, note, count) {
    return `<div class="section-title"><div><h2>${escapeHtml(title)}</h2><p>${escapeHtml(note)}</p></div><span class="pill">${count}</span></div>`;
  }

  function renderRecommended() {
    const selected = sortQuests(state.analysis.allocation.selected.filter(matchesFilters));
    const blocked = sortQuests(state.analysis.allocation.blocked.filter(matchesFilters));
    let html = sectionHeader(
      'Turn in now',
      'Retrieve the listed items, go to the class NPC in the Island 1 quest room, and hand in one complete card at a time.',
      selected.length
    );
    html += selected.length ? `<div class="quest-list">${selected.map((quest) => renderQuestCard(quest, { selected: true, open: true })).join('')}</div>` : emptyState(Object.values(state.manualRunes).every((count) => count === 0) ? 'Enter the Wind Rune counts above. The inventory file does not include Inventory > Storage > Currency.' : 'No complete non-conflicting set was found. Open Missing 1–2 pieces to see what is closest.');
    if (blocked.length) {
      html += `<div style="height:18px"></div>${sectionHeader('Other complete sets', 'These compete with the Turn in now batch for one or more runes or quest pieces.', blocked.length)}`;
      html += `<div class="quest-list">${blocked.map((quest) => renderQuestCard(quest, { allocationBlocked: true })).join('')}</div>`;
    }
    elements.results.innerHTML = html;
  }

  function renderAllReady() {
    const ready = sortQuests(state.analysis.ready.filter(matchesFilters));
    const conflicts = sortQuests(state.analysis.conflicts.filter(matchesFilters));
    let html = sectionHeader('All individually complete tests', 'Each row has all required pieces before shared-item allocation.', ready.length);
    html += ready.length ? `<div class="quest-list">${ready.map((quest) => renderQuestCard(quest, { selected: state.analysis.allocation.selectedIds.has(quest.id) })).join('')}</div>` : emptyState('No complete tests match the current filters.');
    if (conflicts.length) {
      html += `<div style="height:18px"></div>${sectionHeader('Reward already present', 'The required pieces are present, but at least one reward name was found in the inventory export.', conflicts.length)}`;
      html += `<div class="quest-list">${conflicts.map((quest) => renderQuestCard(quest, { conflict: true })).join('')}</div>`;
    }
    elements.results.innerHTML = html;
  }

  function renderNear() {
    const quests = sortQuests(state.analysis.near.filter(matchesFilters));
    elements.results.innerHTML = sectionHeader('Nearly complete tests', 'Missing one or two required items.', quests.length) +
      (quests.length ? `<div class="quest-list">${quests.map((quest) => renderQuestCard(quest, { near: true })).join('')}</div>` : emptyState('No nearly complete tests match the current filters.'));
  }

  function renderAllTests() {
    const quests = sortQuests(state.analysis.evaluatedQuests.filter(matchesFilters));
    elements.results.innerHTML = sectionHeader('All Plane of Sky tests', 'Current EQL pairings for all 16 classes.', quests.length) +
      (quests.length ? `<div class="quest-list">${quests.map((quest) => renderQuestCard(quest, {
        selected: state.analysis.allocation.selectedIds.has(quest.id),
        conflict: quest.rewardConflict,
        near: !quest.individuallyReady && quest.missing.length <= 2,
      })).join('')}</div>` : emptyState('No tests match the current filters.'));
  }

  function renderQuestCard(quest, flags = {}) {
    const sourceFor = new Map(quest.items.map((item) => [engine.normalizeItemName(item.name), item.source]));
    const status = quest.rewardConflict
      ? { text: 'reward owned', className: 'conflict' }
      : flags.selected
        ? { text: 'turn in now', className: 'ready' }
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

    return `<details class="${cardClasses.join(' ')}" ${flags.open ? 'open' : ''}>
      <summary>
        <span class="class-icon-wrap">${classIconHtml(quest.classAbbr, quest.className)}</span>
        <span class="quest-title"><strong>${escapeHtml(quest.className)} — ${escapeHtml(quest.test)}</strong><span>Reward: ${escapeHtml(quest.rewards.join(' + '))}</span></span>
        <span class="status ${status.className}">${escapeHtml(status.text)}</span>
      </summary>
      <div class="quest-body">
        <div class="quest-meta"><span><strong>Take to:</strong> ${escapeHtml(quest.npc)}</span><span><strong>Optional dialogue:</strong> “${escapeHtml(quest.phrase)}”</span></div>
        <div class="resource-list">${resourceRows}</div>
        <p class="reward-line"><strong>Reward:</strong> ${escapeHtml(quest.rewards.join(' + '))}${rewardConflictText}</p>
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
    elements.results.innerHTML = sectionHeader('Recognized Plane of Sky quest pieces', 'Copies, locations, and every current test that consumes the item.', pieces.length) +
      (pieces.length ? renderPiecesTable(pieces) : emptyState('No recognized quest pieces match the current filters.'));
  }

  function renderPiecesTable(pieces) {
    const byId = evaluatedById();
    return `<div class="table-wrap"><table class="data-table"><thead><tr><th>Item</th><th class="count">Owned</th><th class="count">Used in batch</th><th>Locations</th><th>Used by</th></tr></thead><tbody>${pieces.map((piece) => {
      const allDone = piece.quests.length > 0 && piece.quests.every((quest) => byId.get(quest.id)?.rewardConflict);
      const usedBy = allDone
        ? '<span class="used-by-done">done</span>'
        : piece.quests.map((quest) => `${escapeHtml(quest.className)} — ${escapeHtml(quest.test)}`).join('<br>');
      return `
      <tr${allDone ? ' class="piece-all-done"' : ''}>
        <td><strong>${escapeHtml(piece.name)}</strong></td>
        <td class="count">${piece.count}</td>
        <td class="count">${piece.selectedUse}</td>
        <td>${escapeHtml(engine.locationText(piece.locations))}</td>
        <td class="class-links">${usedBy}</td>
      </tr>`;
    }).join('')}</tbody></table></div>`;
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
    elements.results.innerHTML = sectionHeader('Wind Rune inventory', 'Counts from Inventory > Storage > Currency are entered manually above; physical rune rows are added when present.', rows.length) +
      `<div class="table-wrap"><table class="data-table"><thead><tr><th>Rune</th><th class="count">Owned</th><th class="count">Selected use</th><th>Locations</th><th class="count">Tests using rune</th></tr></thead><tbody>${rows.map((row) => `
        <tr><td><strong>${escapeHtml(displayRuneName(row.name))}</strong></td><td class="count">${row.count}</td><td class="count">${row.selectedUse}</td><td>${row.count ? escapeHtml(engine.locationText(row.locations)) : '—'}</td><td class="count">${row.usageCount}</td></tr>
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

  elements.fileInput.addEventListener('change', onFileInputChange);
  elements.preferCompletion.addEventListener('change', recalculate);
  elements.includeConflicts.addEventListener('change', recalculate);
  elements.clearRunes.addEventListener('click', () => {
    for (const name of Object.keys(state.manualRunes)) state.manualRunes[name] = 0;
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
  elements.exportButton.addEventListener('click', exportReport);
  elements.printButton.addEventListener('click', () => {
    setActiveTab('recommended');
    window.print();
  });

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

  initializeControls();
})();
