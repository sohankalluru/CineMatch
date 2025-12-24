/**
 * CineMatch Utilities
 * -------------------
 * Pure helper functions: parsing, normalization, rating checks, etc.
 */
window.CineMatch = window.CineMatch || {};
CineMatch.Utils = (function () {
  const C = CineMatch.CONSTANTS;

  function setStatus(el, msg, isError=false) {
    if (!el) return;
    el.textContent = msg;
    el.style.color = isError ? "#ff9aa6" : "";
  }

  function unique(arr) { return Array.from(new Set(arr)); }

  function parseRuntimeMinutes(runtimeStr) {
    if (!runtimeStr) return null;
    const m = runtimeStr.match(/(\d+)\s*min/i);
    return m ? Number(m[1]) : null;
  }

  function parseGenres(genreStr) {
    if (!genreStr) return [];
    return genreStr.split(",").map(s => s.trim().toUpperCase()).filter(Boolean);
  }

  function normalizedRated(ratedRaw) {
    const r = (ratedRaw || "").trim();
    if (!r) return "NOT-RATED";
    const upper = r.toUpperCase();
    if (upper === "N/A") return "NOT-RATED";
    if (upper.includes("NOT RATED") || upper.includes("UNRATED")) return "NOT-RATED";
    return upper;
  }

  function normalizeAgePref(value) { return (value || "ANY").toUpperCase().trim(); }

  function ratingAllowed(movieRatedRaw, prefRaw) {
    const movieRated = normalizedRated(movieRatedRaw);
    const pref = normalizeAgePref(prefRaw);

    if (pref === "ANY") return true;
    if (pref === "NOT-RATED") return movieRated === "NOT-RATED";

    const movieIsMpaa = C.MPAA_ORDER.includes(movieRated);
    const movieIsTv = C.TV_ORDER.includes(movieRated);
    const prefIsMpaa = C.MPAA_ORDER.includes(pref);
    const prefIsTv = C.TV_ORDER.includes(pref);

    if (prefIsMpaa && movieIsMpaa) return C.MPAA_ORDER.indexOf(movieRated) <= C.MPAA_ORDER.indexOf(pref);
    if (prefIsTv && movieIsTv) return C.TV_ORDER.indexOf(movieRated) <= C.TV_ORDER.indexOf(pref);

    return movieRated === pref;
  }

  function buildPoolIds() {
    const userIds = CineMatch.Storage.loadUserIds();
    return unique([...C.STARTER_IMDB_IDS, ...userIds]).filter(Boolean);
  }

  return {
    setStatus, unique, parseRuntimeMinutes, parseGenres,
    normalizedRated, normalizeAgePref, ratingAllowed, buildPoolIds
  };
})();
