/**
 * Site behavior only (chrome is server-rendered).
 * - Ensure directory URLs end with /
 * - Mark internal navigations for site-return (no enter-animation blink)
 * - Prefetch nav targets on hover
 */
(function () {
  const path = location.pathname;
  if (path && !path.endsWith("/")) {
    const last = path.split("/").pop() || "";
    if (!last.includes(".")) {
      location.replace(path + "/" + location.search + location.hash);
      return;
    }
  }

  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function isInternalHref(href) {
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
      return false;
    }
    if (/^https?:/i.test(href)) {
      try {
        const url = new URL(href, location.href);
        return url.origin === location.origin;
      } catch (_error) {
        return false;
      }
    }
    return true;
  }

  function markInternalNav() {
    if (prefersReduced) {
      return;
    }
    try {
      sessionStorage.setItem("eqlfinest-internal-nav", "1");
    } catch (_error) {
      // ignore
    }
  }

  document.addEventListener(
    "click",
    (event) => {
      const link = event.target.closest && event.target.closest("a[href]");
      if (!link || event.defaultPrevented || event.button !== 0) {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      const href = link.getAttribute("href");
      if (!isInternalHref(href)) {
        return;
      }
      markInternalNav();
    },
    true
  );

  const nav = document.querySelector(".site-nav");
  if (!nav) {
    return;
  }

  const prefetched = new Set();
  nav.querySelectorAll("a.site-nav-link").forEach((link) => {
    const href = link.getAttribute("href");
    if (!href || /^https?:/i.test(href)) {
      return;
    }

    link.addEventListener(
      "mouseenter",
      () => {
        if (prefetched.has(href)) {
          return;
        }
        prefetched.add(href);
        try {
          const hint = document.createElement("link");
          hint.rel = "prefetch";
          hint.as = "document";
          hint.href = new URL(href, location.href).href;
          document.head.appendChild(hint);
        } catch (_error) {
          // ignore
        }
      },
      { passive: true }
    );
  });
})();
