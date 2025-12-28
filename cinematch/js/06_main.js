/**
 * CineMatch Main Controller
 * -------------------------
 * This file wires the UI <-> logic:
 * - Reads preference inputs
 * - Expands pool per selected genre (up to POOL_CAP)
 * - Warms the OMDb cache
 * - Scores + filters movies (includes taste-based boosting from Movie List)
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

  // ---------- Taste Profile (Movie List -> scoring boost) ----------
  function buildTasteProfile(userMovies) {
    const profile = {
      genres: new Map(),
      directors: new Map(),
      actors: new Map()
    };

    for (const m of userMovies) {
      // Genres
      for (const g of U.parseGenres(m.Genre)) {
        profile.genres.set(g, (profile.genres.get(g) || 0) + 1);
      }

      // Directors
      const dirs = (m.Director || "").split(",").map(x => x.trim()).filter(Boolean);
      for (const d of dirs) {
        profile.directors.set(d, (profile.directors.get(d) || 0) + 1);
      }

      // Actors
      const acts = (m.Actors || "").split(",").map(x => x.trim()).filter(Boolean);
      for (const a of acts) {
        profile.actors.set(a, (profile.actors.get(a) || 0) + 1);
      }
    }

    return profile;
  }

  function tasteBoost(movie, profile) {
    if (!profile) return 0;

    const mg = U.parseGenres(movie.Genre);
    const md = (movie.Director || "").split(",").map(x => x.trim()).filter(Boolean);
    const ma = (movie.Actors || "").split(",").map(x => x.trim()).filter(Boolean);

    let boost = 0;

    // Genre overlap (modest)
    let sharedG = 0;
    for (const g of mg) if (profile.genres.has(g)) sharedG++;
    boost += sharedG * 3;

    // Director overlap (strong)
    let sharedD = 0;
    for (const d of md) if (profile.directors.has(d)) sharedD++;
    boost += sharedD * 8;

    // Actor overlap (light)
    let sharedA = 0;
    for (const a of ma) if (profile.actors.has(a)) sharedA++;
    boost += Math.min(sharedA, 3) * 2;

    return boost;
  }

  // ---------- Genre-aware pool expansion (up to POOL_CAP) ----------
  async function buildGenreAwarePoolIds(apiKey, selectedGenres, statusEl) {
    const genresArr = Array.from(selectedGenres || []).map(g => String(g).toUpperCase());
    if (!genresArr.length) {
      // No genres selected => keep original behavior (starter + user)
      return U.buildPoolIds();
    }

    const discovered = S.loadDiscovered();
    const cache = S.loadCache();

    // Start with previously discovered IDs for these genres
    let pool = [];
    for (const g of genresArr) {
      const list = Array.isArray(discovered[g]) ? discovered[g] : [];
      pool.push(...list);
    }
    pool = U.unique(pool);

    // Add starter movies already cached that match (fast path)
    for (const id of C.STARTER_IMDB_IDS) {
      if (pool.length >= C.POOL_CAP) break;
      if (pool.includes(id)) continue;
      const m = cache[id];
      if (!m) continue;
      const mg = U.parseGenres(m.Genre);
      if (mg.some(x => genresArr.includes(x))) pool.push(id);
    }

    // Discover more until we reach POOL_CAP (or we hit our per-click budget)
    let budget = C.DISCOVERY_MAX_NEW_DETAILS;

    // Build a search plan (keywords + pages)
    const plan = [];
    for (const g of genresArr) {
      const terms = C.GENRE_KEYWORDS[g] || [g.toLowerCase()];
      for (const term of terms) {
        for (let page = 1; page <= C.DISCOVERY_PAGES_PER_TERM; page++) {
          plan.push({ term, page });
        }
      }
    }

    // Light shuffle so repeated clicks don’t always fetch the same first-page set
    for (let i = plan.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [plan[i], plan[j]] = [plan[j], plan[i]];
    }

    for (const step of plan) {
      if (pool.length >= C.POOL_CAP) break;
      if (budget <= 0) break;

      U.setStatus(statusEl, `Expanding pool… (${pool.length}/${C.POOL_CAP})`);

      let results = [];
      try {
        results = await CineMatch.OMDb.searchPaged(apiKey, step.term, step.page);
      } catch {
        continue;
      }

      for (const r of results) {
        if (pool.length >= C.POOL_CAP) break;
        if (budget <= 0) break;

        const id = r?.imdbID;
        if (!id || pool.includes(id)) continue;

        // Fetch full details so we can verify genre membership
        try {
          const m = await CineMatch.OMDb.getById(apiKey, id);
          budget--;

          // Cache it immediately so future runs are faster
          cache[id] = m;
          S.saveCache(cache);

          // Verify it matches at least one selected genre
          const mg = U.parseGenres(m.Genre);
          const matches = mg.some(x => genresArr.includes(x));
          if (!matches) continue;

          // Add to pool
          pool.push(id);

          // Persist into discovered lists (for any matching genre)
          for (const g of genresArr) {
            if (mg.includes(g)) {
              if (!Array.isArray(discovered[g])) discovered[g] = [];
              if (!discovered[g].includes(id)) discovered[g].push(id);
            }
          }
        } catch {
          // ignore bad fetches
        }
      }
    }

    // Persist discovered updates
    S.saveDiscovered(discovered);

    // Final safety: return capped pool
    return pool.slice(0, C.POOL_CAP);
  }

  // ---------- Scoring ----------
  function scoreMovie(movie, prefs, tasteProfile) {
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

    // Base scoring (keeps your original behavior)
    const overlapCount = genres.filter(g => prefs.selectedGenres.has(g)).length;
    const overlapScore = prefs.selectedGenres.size === 0 ? 25 : Math.min(50, overlapCount * 20);
    const ratingScore = Math.max(0, Math.min(40, (imdbRating / 10) * 40));

    let runtimeScore = 6;
    if (runtime !== null) {
      const ratio = runtime / prefs.maxRuntime;
      runtimeScore = Math.max(0, Math.min(10, 10 - (ratio * 6)));
    }

    // ✅ Taste-based boost from Movie List (directors/actors/genres)
    const boost = tasteBoost(movie, tasteProfile);

    const score = Math.round((overlapScore + ratingScore + runtimeScore + boost) * 10) / 10;
    return { ok:true, score };
  }

  // ---------- Rendering / pagination ----------
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
      U.setStatus(prefStatus, `Building up to ${C.POOL_CAP} movies for: ${Array.from(selectedGenres).join(", ")}`);
    }

    // ✅ Build pool based on selected genres (up to POOL_CAP)
    const ids = await buildGenreAwarePoolIds(apiKey, selectedGenres, prefStatus);

    const pills = {
      poolSizePill: document.getElementById("poolSizePill"),
      cachedPill: document.getElementById("cachedPill")
    };

    // Warm cache for the pool
    const cache = await CineMatch.OMDb.warmCache(apiKey, ids, prefStatus, pills);

    // ✅ Warm cache for Movie List (taste profile inputs)
    const userIds = S.loadUserIds();
    if (userIds.length) {
      await CineMatch.OMDb.warmCache(apiKey, userIds, prefStatus);
    }

    const cache2 = S.loadCache();

    // Build taste profile from Movie List (if any)
    const userMovies = userIds.map(id => cache2[id]).filter(Boolean);
    const tasteProfile = userMovies.length ? buildTasteProfile(userMovies) : null;

    const prefs = { selectedGenres, minRating, ageRating, maxRuntime };
    const scored = [];

    for (const id of ids) {
      const movie = cache2[id];
      if (!movie) continue;
      if ((movie.Type || "").toLowerCase() && (movie.Type || "").toLowerCase() !== "movie") continue;

      const s = scoreMovie(movie, prefs, tasteProfile);
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
        "THRILLER","WAR","WESTERN"
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
