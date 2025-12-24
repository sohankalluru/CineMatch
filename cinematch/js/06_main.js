/**
 * CineMatch Main Controller
 * -------------------------
 * This file wires the UI <-> logic:
 * - Reads preference inputs
 * - Warms the OMDb cache
 * - Scores + filters movies
 * - Renders recommendations with "Show more"
 * - Manages key saving + searching + carousel refresh
 */
window.CineMatch = window.CineMatch || {};
(function () {
  const C  = CineMatch.CONSTANTS;
  const U  = CineMatch.Utils;
  const S  = CineMatch.Storage;
  const UI = CineMatch.UI;

  // Internal state for pagination
  let lastScoredList = [];
  let visibleCount = 0;

  function collectAllGenresFromCache(cacheObj) {
    const all = [];
    Object.values(cacheObj).forEach(m => {
      if (m && m.Genre) all.push(...U.parseGenres(m.Genre));
    });
    return U.unique(all).sort();
  }

  function fillGenreSelect(genres) {
    const sel = document.getElementById("genreSelect");
    if (!sel) return;
    if (sel.options && sel.options.length > 0) return; // keep user's existing select
    sel.innerHTML = "";
    genres.forEach(g => {
      const opt = document.createElement("option");
      opt.value = g;
      opt.textContent = g;
      sel.appendChild(opt);
    });
  }

  function scoreMovie(movie, prefs) {
    const genres = U.parseGenres(movie.Genre);
    const runtime = U.parseRuntimeMinutes(movie.Runtime);
    const imdbRating = Number(movie.imdbRating || 0);

    // Filters first (fast exits)
    if (prefs.selectedGenres.size > 0) {
      const overlap = genres.filter(g => prefs.selectedGenres.has(g));
      if (overlap.length === 0) return { ok:false, score:0 };
    }
    if (imdbRating < prefs.minRating) return { ok:false, score:0 };
    if (!U.ratingAllowed(movie.Rated, prefs.ageRating)) return { ok:false, score:0 };
    if (runtime !== null && runtime > prefs.maxRuntime) return { ok:false, score:0 };

    // Scoring (same behavior as the single-file version)
    const overlapCount = genres.filter(g => prefs.selectedGenres.has(g)).length;
    const overlapScore = prefs.selectedGenres.size === 0 ? 25 : Math.min(50, overlapCount * 20);
    const ratingScore = Math.max(0, Math.min(40, (imdbRating / 10) * 40));

    let runtimeScore = 6;
    if (runtime !== null) {
      const ratio = runtime / prefs.maxRuntime;
      runtimeScore = Math.max(0, Math.min(10, 10 - (ratio * 6)));
    }

    const score = Math.round((overlapScore + ratingScore + runtimeScore) * 10) / 10;
    return { ok:true, score };
  }

  function showMore() {
    const resultsEl = document.getElementById("results");
    const btn = document.getElementById("loadMoreBtn");
    if (!resultsEl || !btn) return;

    const next = Math.min(lastScoredList.length, visibleCount + C.SHOW_MORE_STEP);
    for (let i = visibleCount; i < next; i++) {
      const item = lastScoredList[i];
      resultsEl.appendChild(UI.renderMovieCard(item.movie, item.score));
    }
    visibleCount = next;

    if (visibleCount >= lastScoredList.length) {
      btn.style.display = "none";
    } else {
      btn.style.display = "inline-flex";
      btn.textContent = `Show more (${lastScoredList.length - visibleCount} left)`;
    }
  }

  async function runRecommendations() {
    const prefStatus = document.getElementById("prefStatus");
    const resultsEl = document.getElementById("results");
    if (!resultsEl) return;

    resultsEl.innerHTML = "";

    const apiKey = S.loadApiKey();
    if (!apiKey) {
      U.setStatus(prefStatus, "Add your OMDb API key first (Setup section).", true);
      return;
    }

    const genreSelect = document.getElementById("genreSelect");
    const selectedGenres = new Set(
      genreSelect ? Array.from(genreSelect.selectedOptions).map(o => o.value) : []
    );

    const minRating = Number(document.getElementById("minRating")?.value || 0);
    const ageRating = U.normalizeAgePref(document.getElementById("ageRating")?.value);
    const maxRuntime = Number(document.getElementById("maxRuntime")?.value || 999);

    if (selectedGenres.size === 0) {
      U.setStatus(prefStatus, "No genres selected — browsing the pool. (Select genres for better matches.)");
    } else {
      U.setStatus(prefStatus, `Finding matches for: ${Array.from(selectedGenres).join(", ")}`);
    }

    const ids = U.buildPoolIds();
    const pills = {
      poolSizePill: document.getElementById("poolSizePill"),
      cachedPill: document.getElementById("cachedPill")
    };

    const cache = await CineMatch.OMDb.warmCache(apiKey, ids, prefStatus, pills);

    const prefs = { selectedGenres, minRating, ageRating, maxRuntime };
    const scored = [];

    for (const id of ids) {
      const movie = cache[id];
      if (!movie) continue;
      if ((movie.Type || "").toLowerCase() && (movie.Type || "").toLowerCase() !== "movie") continue;

      const s = scoreMovie(movie, prefs);
      if (s.ok) scored.push({ movie, score: s.score });
    }

    scored.sort((a,b) => b.score - a.score);

    if (!scored.length) {
      resultsEl.innerHTML =
        `<div class="muted">No matches found. Try setting Age Rating to “Any”, lowering minimum rating, or increasing max runtime.</div>`;
      document.getElementById("loadMoreWrap")?.remove();
      return;
    }

    lastScoredList = scored;
    visibleCount = 0;

    UI.ensureLoadMoreUI(showMore);
    showMore();

    U.setStatus(prefStatus, `Found ${scored.length} matching movies from a pool of ${ids.length}.`);
  }

  async function handleSearch() {
    const setupStatus = document.getElementById("setupStatus");
    const searchTitle = document.getElementById("searchTitle");
    const apiKey = S.loadApiKey();

    if (!apiKey) {
      U.setStatus(setupStatus, "Save your OMDb API key first.", true);
      return;
    }

    const title = (searchTitle?.value || "").trim();
    if (!title) return;

    try {
      U.setStatus(setupStatus, "Searching…");
      const items = await CineMatch.OMDb.searchByTitle(apiKey, title);

      UI.renderSearchResults(items, async (imdbID) => {
        if (!imdbID) return false;
        const current = S.loadUserIds();
        if (current.includes(imdbID)) return false;

        current.push(imdbID);
        S.saveUserIds(current);
        await UI.refreshUserCarousel();
        return true;
      });

      U.setStatus(setupStatus, `Found ${items.length} result(s).`);
    } catch (e) {
      U.setStatus(setupStatus, `Search failed: ${e.message}`, true);
    }
  }

  async function init() {
    // Hide “# of Results” field if it exists (you asked to remove it)
    const rc = document.getElementById("resultCount");
    const rcField = rc ? rc.closest(".field") : null;
    if (rcField) rcField.style.display = "none";

    // Fill genres (from cache if available, otherwise a solid default list)
    const cache = S.loadCache();
    let genres = collectAllGenresFromCache(cache);
    if (!genres.length) {
      genres = [
        "ACTION","ADVENTURE","ANIMATION","BIOGRAPHY","COMEDY","CRIME","DRAMA",
        "FAMILY","FANTASY","HISTORY","HORROR","MYSTERY","ROMANCE","SCI-FI",
        "THRILLER","WAR"
      ];
    }
    fillGenreSelect(genres);

    // Setup section wiring
    const apiKeyInput = document.getElementById("apiKeyInput");
    const saveKeyBtn = document.getElementById("saveKeyBtn");
    const clearCacheBtn = document.getElementById("clearCacheBtn");
    const setupStatus = document.getElementById("setupStatus");

    if (apiKeyInput) apiKeyInput.value = S.loadApiKey();
    U.setStatus(setupStatus, apiKeyInput?.value ? "API key loaded." : "No API key saved yet.");

    if (saveKeyBtn && apiKeyInput) {
      saveKeyBtn.onclick = async () => {
        const key = apiKeyInput.value.trim();
        if (!key) {
          U.setStatus(setupStatus, "Please enter an API key.", true);
          return;
        }
        S.saveApiKey(key);
        U.setStatus(setupStatus, "Saved.");
        await UI.refreshUserCarousel();
      };
    }

    if (clearCacheBtn) {
      clearCacheBtn.onclick = async () => {
        S.clearCache();
        U.setStatus(setupStatus, "Cache cleared.");
        const cachedPill = document.getElementById("cachedPill");
        if (cachedPill) cachedPill.textContent = "Cached: —";
        await UI.refreshUserCarousel();
      };
    }

    // Buttons wiring
    const searchBtn = document.getElementById("searchBtn");
    const recommendBtn = document.getElementById("recommendBtn");
    if (searchBtn) searchBtn.onclick = handleSearch;
    if (recommendBtn) recommendBtn.onclick = runRecommendations;

    // UI-only enhancements (no functional changes)
    UI.makeAddMoviesCardCompact();
    UI.ensureCarouselInsideAddMovies();
    UI.bindCarouselButtons();
    await UI.refreshUserCarousel();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
