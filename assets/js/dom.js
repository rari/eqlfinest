/**
 * Shared DOM helpers for Antonica’s Finest tools.
 * Classic script: attaches window.EQLDom
 */
(function (global) {
  function siteBase() {
    const body = document.body;
    const fromData = (body && body.dataset.base) || "";
    if (fromData) {
      return fromData.replace(/\/?$/, "/");
    }
    const path = location.pathname || "/";
    if (path.indexOf("/eqlfinest/") === 0 || path === "/eqlfinest") {
      return "/eqlfinest/";
    }
    return "/";
  }

  function siteUrl(path) {
    const base = siteBase();
    const clean = String(path || "").replace(/^\//, "");
    return base + clean;
  }

  function digitsOnly(value) {
    return String(value ?? "").replace(/\D/g, "");
  }

  function safeSpellIconFile(idOrFile) {
    const raw = String(idOrFile || "").trim();
    if (/^Spellicon_[A-Za-z0-9]+\.png$/i.test(raw)) {
      return raw;
    }
    const id = digitsOnly(raw) || "0";
    return `Spellicon_${id}.png`;
  }

  function safeItemIconId(iconId) {
    return digitsOnly(iconId) || "0";
  }

  function iconUrl(kind, idOrFile) {
    if (kind === "spells") {
      return siteUrl(`assets/icons/spells/${safeSpellIconFile(idOrFile)}`);
    }
    if (kind === "items") {
      return siteUrl(`assets/icons/items/Item_${safeItemIconId(idOrFile)}.png`);
    }
    return siteUrl("");
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function stepNumberInput(input, dir) {
    if (!input || input.disabled || input.readOnly) return;
    const step = Number(input.step) || 1;
    const min = input.min === "" ? Number.NEGATIVE_INFINITY : Number(input.min);
    const max = input.max === "" ? Number.POSITIVE_INFINITY : Number(input.max);
    const current = Number.parseFloat(String(input.value || "0")) || 0;
    let next = current + dir * step;
    if (Number.isFinite(min)) next = Math.max(min, next);
    if (Number.isFinite(max)) next = Math.min(max, next);
    if (input.step === "1" || input.step === "") {
      next = Math.round(next);
    }
    input.value = String(next);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function bindNumFields(root = document) {
    if (!root || root.dataset.numFieldsBound === "1") return;
    root.dataset.numFieldsBound = "1";
    root.addEventListener("click", (event) => {
      const button = event.target.closest(".num-field-step");
      if (!button || !root.contains(button)) return;
      const field = button.closest(".num-field");
      const input = field && field.querySelector(".num-field-input, input[type='number']");
      if (!input) return;
      event.preventDefault();
      const dir = Number(button.getAttribute("data-dir")) || 0;
      stepNumberInput(input, dir);
      input.focus({ preventScroll: true });
    });
  }

  function numFieldHtml(inputAttrs, { compact = false } = {}) {
    const attrs = String(inputAttrs || "").trim();
    return `<span class="num-field${compact ? " is-compact" : ""}"><input type="number" class="num-field-input" ${attrs}><span class="num-field-steps"><button type="button" class="num-field-step" data-dir="1" tabindex="-1" aria-label="Increase"></button><button type="button" class="num-field-step" data-dir="-1" tabindex="-1" aria-label="Decrease"></button></span></span>`;
  }

  global.EQLDom = {
    siteBase,
    siteUrl,
    iconUrl,
    escapeHtml,
    safeItemIconId,
    safeSpellIconFile,
    stepNumberInput,
    bindNumFields,
    numFieldHtml,
  };
})(window);
