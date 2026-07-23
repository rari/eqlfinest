/**
 * Old share links used #b= / #r= on the landing page; send them to the tool routes.
 */
(function redirectLegacyShare() {
  var hash = location.hash || "";
  if (hash.indexOf("#b=") === 0) {
    location.replace("spell-bars/" + hash);
  } else if (hash.indexOf("#r=") === 0) {
    location.replace("traveler/" + hash);
  }
})();
