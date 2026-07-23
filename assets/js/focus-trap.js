(function (global) {
  const FOCUSABLE =
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  let activeRoot = null;
  let previousFocus = null;
  let onEscapeHandler = null;
  let keydownHandler = null;

  function focusables(root) {
    return [...root.querySelectorAll(FOCUSABLE)].filter(
      (el) => !el.hasAttribute("disabled") && el.getAttribute("aria-hidden") !== "true"
    );
  }

  function deactivate() {
    if (keydownHandler) {
      document.removeEventListener("keydown", keydownHandler, true);
      keydownHandler = null;
    }
    onEscapeHandler = null;
    activeRoot = null;
    const restore = previousFocus;
    previousFocus = null;
    if (restore && typeof restore.focus === "function") {
      try {
        restore.focus();
      } catch (_error) {
        // Element may have been removed.
      }
    }
  }

  function activate(root, options = {}) {
    if (!root) {
      return;
    }
    if (activeRoot) {
      deactivate();
    }
    previousFocus =
      options.returnFocus !== undefined
        ? options.returnFocus
        : document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
    activeRoot = root;
    onEscapeHandler = typeof options.onEscape === "function" ? options.onEscape : null;

    keydownHandler = (event) => {
      if (!activeRoot) {
        return;
      }
      if (event.key === "Escape" && onEscapeHandler) {
        event.preventDefault();
        onEscapeHandler();
        return;
      }
      if (event.key !== "Tab") {
        return;
      }
      const nodes = focusables(activeRoot);
      if (!nodes.length) {
        event.preventDefault();
        return;
      }
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey) {
        if (document.activeElement === first || !activeRoot.contains(document.activeElement)) {
          event.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", keydownHandler, true);

    const preferred =
      options.initialFocus ||
      root.querySelector("[data-autofocus]") ||
      focusables(root)[0] ||
      null;
    global.requestAnimationFrame(() => {
      if (preferred && typeof preferred.focus === "function") {
        preferred.focus();
      }
    });
  }

  global.EQLFocusTrap = {
    activate,
    deactivate,
  };
})(window);
