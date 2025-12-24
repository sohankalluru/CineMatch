/**
 * CineMatch OMDb API Layer
 * ------------------------
 * All fetch() calls live here.
 * Includes warming + caching so the UI stays fast.
 */
window.CineMatch = window.CineMatch || {};
CineMatch.OMDb = (function () {
  const { setStatus } = CineMatch.Utils;

  async function getById(apiKey, imdbID) {
    const url = `https://www.omdbapi.com/?apikey=${encodeURIComponent(apiKey)}&i=${encodeURIComponent(imdbID)}&plot=short&r=json`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.Response === "False") throw new Error(data.Error || "OMDb error");
    return data;
  }

  async function searchByTitle(apiKey, title) {
    const url = `https://www.omdbapi.com/?apikey=${encodeURIComponent(apiKey)}&s=${encodeURIComponent(title)}&type=movie&r=json`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.Response === "False") return [];
    return data.Search || [];
  }

  async function warmCache(apiKey, ids, statusEl, pills) {
    const cache = CineMatch.Storage.loadCache();

    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      if (!cache[id]) {
        try {
          setStatus(statusEl, `Fetching movie details… (${i + 1}/${ids.length})`);
          cache[id] = await getById(apiKey, id);
          CineMatch.Storage.saveCache(cache);
        } catch {}
      }
    }

    if (pills?.cachedPill) pills.cachedPill.textContent = `Cached: ${Object.keys(cache).length}`;
    if (pills?.poolSizePill) pills.poolSizePill.textContent = `Pool: ${ids.length}`;

    return cache;
  }

  return { getById, searchByTitle, warmCache };
})();
