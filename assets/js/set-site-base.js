/**
 * 404 pages may be served at unknown paths; set <base> so relative links resolve
 * to the project root (/eqlfinest/ on GitHub Pages, / locally).
 */
(function setSiteBase() {
  var path = location.pathname || "/";
  var root =
    path.indexOf("/eqlfinest/") === 0 || path === "/eqlfinest" ? "/eqlfinest/" : "/";
  var base = document.createElement("base");
  base.href = location.origin + root;
  document.head.prepend(base);
})();
