/**
 * CineMatch Storage Layer
 * -----------------------
 * All localStorage reads/writes live here.
 */
window.CineMatch = window.CineMatch || {};
CineMatch.Storage = (function () {
  const C = CineMatch.CONSTANTS;

  function loadApiKey() { return localStorage.getItem(C.LS_KEY_API) || ""; }
  function saveApiKey(key) { localStorage.setItem(C.LS_KEY_API, (key || "").trim()); }

  function loadUserIds() {
    try { return JSON.parse(localStorage.getItem(C.LS_KEY_USER_IDS) || "[]"); }
    catch { return []; }
  }
  function saveUserIds(ids) {
    localStorage.setItem(C.LS_KEY_USER_IDS, JSON.stringify(ids || []));
  }

  function loadCache() {
    try { return JSON.parse(localStorage.getItem(C.LS_KEY_CACHE) || "{}"); }
    catch { return {}; }
  }
  function saveCache(cacheObj) {
    localStorage.setItem(C.LS_KEY_CACHE, JSON.stringify(cacheObj || {}));
  }

  function clearCache() { localStorage.removeItem(C.LS_KEY_CACHE); }

  return { loadApiKey, saveApiKey, loadUserIds, saveUserIds, loadCache, saveCache, clearCache };
})();
