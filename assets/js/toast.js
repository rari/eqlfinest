(function (global) {
  const TOAST_MS = 3400;
  let toastEl = null;
  let toastTimer = null;

  function prefersReducedMotion() {
    return global.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function ensureToast() {
    if (toastEl) {
      return toastEl;
    }
    toastEl = document.createElement("div");
    toastEl.className = "app-toast is-idle";
    toastEl.setAttribute("role", "status");
    toastEl.setAttribute("aria-live", "polite");
    toastEl.setAttribute("aria-atomic", "true");
    toastEl.setAttribute("aria-hidden", "true");
    document.body.appendChild(toastEl);
    return toastEl;
  }

  function showToast(message, options = {}) {
    const text = String(message || "").trim();
    if (!text) {
      return;
    }
    const error = Boolean(options.error);
    const el = ensureToast();
    el.textContent = text;
    el.classList.toggle("is-error", error);
    if (error) {
      el.setAttribute("role", "alert");
      el.setAttribute("aria-live", "assertive");
    } else {
      el.setAttribute("role", "status");
      el.setAttribute("aria-live", "polite");
    }
    el.setAttribute("aria-hidden", "false");
    el.classList.remove("is-idle", "is-show");
    void el.offsetWidth;
    el.classList.add("is-show");
    global.clearTimeout(toastTimer);
    toastTimer = global.setTimeout(() => {
      el.classList.remove("is-show");
      toastTimer = global.setTimeout(() => {
        el.classList.add("is-idle");
        el.setAttribute("aria-hidden", "true");
      }, 220);
    }, TOAST_MS);
  }

  function scrollToElement(target) {
    if (!target) {
      return;
    }
    const behavior = prefersReducedMotion() ? "auto" : "smooth";
    global.requestAnimationFrame(() => {
      target.scrollIntoView({ behavior, block: "start" });
    });
  }

  global.EQLToast = {
    show: showToast,
    scrollTo: scrollToElement,
    prefersReducedMotion,
  };
})(window);
