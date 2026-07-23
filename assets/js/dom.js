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

  global.EQLDom = {
    siteBase,
    siteUrl,
    iconUrl,
    escapeHtml,
    safeItemIconId,
    safeSpellIconFile,
  };
})(window);
