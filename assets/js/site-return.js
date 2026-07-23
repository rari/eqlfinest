/**
 * Early head script (CSP: external only):
 * - Mark internal navigations (skip enter animations)
 * - Hold hero enter animations until hero-texture.webp is ready
 */
(function () {
  var root = document.documentElement;
  var returning = false;

  try {
    if (sessionStorage.getItem("eqlfinest-internal-nav")) {
      root.classList.add("site-return");
      sessionStorage.removeItem("eqlfinest-internal-nav");
      returning = true;
    }
  } catch (_error) {
    // ignore
  }

  function markReady() {
    root.classList.add("hero-ready");
  }

  // Cached navigations / reduced motion: don't block first paint on the texture.
  if (returning) {
    markReady();
    return;
  }

  var textureUrl = "";
  var scripts = document.getElementsByTagName("script");
  for (var i = scripts.length - 1; i >= 0; i -= 1) {
    var src = scripts[i].src || "";
    var marker = "/assets/js/site-return.js";
    var at = src.indexOf(marker);
    if (at !== -1) {
      textureUrl = src.slice(0, at) + "/assets/img/hero-texture.webp";
      break;
    }
  }

  if (!textureUrl) {
    markReady();
    return;
  }

  var settled = false;
  function finish() {
    if (settled) {
      return;
    }
    settled = true;
    markReady();
  }

  var img = new Image();
  img.onload = finish;
  img.onerror = finish;
  img.src = textureUrl;
  window.setTimeout(finish, 2000);
})();
