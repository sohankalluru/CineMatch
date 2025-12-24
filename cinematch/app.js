/* CineMatch — OMDb-based recommender (client-side)
   - Starter pool + user-added pool (localStorage)
   - OMDb search + caching
   - Recommendations with Show More (no "# results" field)
   - Age rating as "maximum allowed" (PG-13 allows G/PG/PG-13)
   - Injected "My Added Movies" carousel (no index.html changes)
   - FINAL: Make Add Movies card compact (no blank space)
*/

const LS_KEY_API = "cinematch_api_key";
const LS_KEY_USER_IDS = "cinematch_user_ids";
const LS_KEY_CACHE = "cinematch_cache_v1";

const SHOW_MORE_STEP = 12;

const STARTER_IMDB_IDS = [
  "tt0111161","tt0068646","tt0468569","tt0137523","tt0109830",
  "tt0120737","tt1375666","tt0167260","tt0816692","tt0133093",
  "tt0108052","tt0080684","tt0110912","tt0120815","tt0099685",
  "tt0076759","tt0317248","tt0114369","tt0102926","tt0047478",
  "tt0088763","tt0050083","tt0120689","tt0172495","tt0209144",
  "tt0245429","tt0118799","tt0361748","tt6751668","tt0120586",
  "tt0407887","tt0038650","tt1345836","tt0482571","tt0082971",
  "tt4154796","tt0110413","tt1853728","tt1675434","tt0435761",
  "tt0848228","tt3896198","tt0903624","tt1877830","tt2380307",
  "tt7286456","tt2582802","tt4633694","tt5074352","tt1392190",
  "tt0266543","tt0090605","tt0110357","tt0103064","tt0095327",
  "tt0062622","tt0087843","tt0086190","tt0167404"
];

const MPAA_ORDER = ["G", "PG", "PG-13", "R", "NC-17"];
const TV_ORDER = ["TV-Y", "TV-G", "TV-PG", "TV-14", "TV-MA"];

let lastScoredList = [];
let visibleCount = 0;

// ---------- helpers ----------
const NORMALIZED_RATED = (ratedRaw) => {
  const r = (ratedRaw || "").trim();
  if (!r) return "NOT-RATED";
  const upper = r.toUpperCase();
  if (upper === "N/A") return "NOT-RATED";
  if (upper.includes("NOT RATED") || upper.includes("UNRATED")) return "NOT-RATED";
  return upper;
};

function loadApiKey() { return localStorage.getItem(LS_KEY_API) || ""; }
function saveApiKey(key) { localStorage.setItem(LS_KEY_API, key.trim()); }

function loadUserIds() {
  try { return JSON.parse(localStorage.getItem(LS_KEY_USER_IDS) || "[]"); }
  catch { return []; }
}
function saveUserIds(ids) {
  localStorage.setItem(LS_KEY_USER_IDS, JSON.stringify(ids));
}

function loadCache() {
  try { return JSON.parse(localStorage.getItem(LS_KEY_CACHE) || "{}"); }
  catch { return {}; }
}
function saveCache(cacheObj) {
  localStorage.setItem(LS_KEY_CACHE, JSON.stringify(cacheObj));
}

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

function buildPoolIds() {
  const userIds = loadUserIds();
  return unique([...STARTER_IMDB_IDS, ...userIds]).filter(Boolean);
}

function normalizeAgePref(value) {
  return (value || "ANY").toUpperCase().trim();
}

function ratingAllowed(movieRatedRaw, prefRaw) {
  const movieRated = NORMALIZED_RATED(movieRatedRaw);
  const pref = (prefRaw || "ANY").toUpperCase().trim();

  if (pref === "ANY") return true;
  if (pref === "NOT-RATED") return movieRated === "NOT-RATED";

  const movieIsMpaa = MPAA_ORDER.includes(movieRated);
  const movieIsTv = TV_ORDER.includes(movieRated);
  const prefIsMpaa = MPAA_ORDER.includes(pref);
  const prefIsTv = TV_ORDER.includes(pref);

  if (prefIsMpaa && movieIsMpaa) {
    return MPAA_ORDER.indexOf(movieRated) <= MPAA_ORDER.indexOf(pref);
  }
  if (prefIsTv && movieIsTv) {
    return TV_ORDER.indexOf(movieRated) <= TV_ORDER.indexOf(pref);
  }
  return movieRated === pref;
}

// ---------- OMDb calls ----------
async function omdbGetById(apiKey, imdbID) {
  const url = `https://www.omdbapi.com/?apikey=${encodeURIComponent(apiKey)}&i=${encodeURIComponent(imdbID)}&plot=short&r=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data.Response === "False") throw new Error(data.Error || "OMDb error");
  return data;
}

async function omdbSearchByTitle(apiKey, title) {
  const url = `https://www.omdbapi.com/?apikey=${encodeURIComponent(apiKey)}&s=${encodeURIComponent(title)}&type=movie&r=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data.Response === "False") return [];
  return data.Search || [];
}

async function warmCache(apiKey, ids, statusEl, pills) {
  const cache = loadCache();

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    if (!cache[id]) {
      try {
        setStatus(statusEl, `Fetching movie details… (${i + 1}/${ids.length})`);
        cache[id] = await omdbGetById(apiKey, id);
        saveCache(cache);
      } catch {
        // skip broken IDs
      }
    }
  }

  if (pills?.cachedPill) pills.cachedPill.textContent = `Cached: ${Object.keys(cache).length}`;
  if (pills?.poolSizePill) pills.poolSizePill.textContent = `Pool: ${ids.length}`;
  return cache;
}

// ---------- Genres UI ----------
function collectAllGenresFromCache(cacheObj) {
  const all = [];
  Object.values(cacheObj).forEach(m => {
    if (m && m.Genre) all.push(...parseGenres(m.Genre));
  });
  return unique(all).sort();
}

function fillGenreSelect(genres) {
  const sel = document.getElementById("genreSelect");
  if (!sel) return;
  if (sel.options && sel.options.length > 0) return;

  sel.innerHTML = "";
  genres.forEach(g => {
    const opt = document.createElement("option");
    opt.value = g;
    opt.textContent = g;
    sel.appendChild(opt);
  });
}

// ---------- Scoring / Rendering ----------
function scoreMovie(movie, prefs) {
  const genres = parseGenres(movie.Genre);
  const runtime = parseRuntimeMinutes(movie.Runtime);
  const imdbRating = Number(movie.imdbRating || 0);

  if (prefs.selectedGenres.size > 0) {
    const overlap = genres.filter(g => prefs.selectedGenres.has(g));
    if (overlap.length === 0) return { ok:false, score:0 };
  }

  if (imdbRating < prefs.minRating) return { ok:false, score:0 };
  if (!ratingAllowed(movie.Rated, prefs.ageRating)) return { ok:false, score:0 };
  if (runtime !== null && runtime > prefs.maxRuntime) return { ok:false, score:0 };

  const overlapCount = genres.filter(g => prefs.selectedGenres.has(g)).length;
  const overlapScore = prefs.selectedGenres.size === 0 ? 25 : Math.min(50, overlapCount * 20);
  const ratingScore = Math.max(0, Math.min(40, (imdbRating / 10) * 40));

  let runtimeScore = 6;
  if (runtime !== null) {
    const ratio = runtime / prefs.maxRuntime;
    runtimeScore = Math.max(0, Math.min(10, 10 - (ratio * 6)));
  }

  return { ok:true, score: Math.round((overlapScore + ratingScore + runtimeScore) * 10) / 10 };
}

function renderMovieCard(movie, scoreObj) {
  const poster = (movie.Poster && movie.Poster !== "N/A") ? movie.Poster : null;
  const genres = movie.Genre || "—";
  const runtime = movie.Runtime || "—";
  const rated = NORMALIZED_RATED(movie.Rated);
  const rating = movie.imdbRating || "—";
  const year = movie.Year || "—";

  const div = document.createElement("div");
  div.className = "cardMovie";

  const posterDiv = document.createElement("div");
  posterDiv.className = "poster";
  if (poster) {
    const img = document.createElement("img");
    img.src = poster;
    img.alt = `${movie.Title} poster`;
    posterDiv.appendChild(img);
  } else {
    posterDiv.textContent = "No poster";
  }

  const body = document.createElement("div");
  body.className = "movieBody";

  const topRow = document.createElement("div");
  topRow.style.display = "flex";
  topRow.style.gap = "8px";
  topRow.style.alignItems = "center";

  const title = document.createElement("div");
  title.className = "movieTitle";
  title.textContent = movie.Title || "Untitled";

  const scoreBadge = document.createElement("span");
  scoreBadge.className = "badge score";
  scoreBadge.textContent = `Score: ${scoreObj.score}`;

  topRow.appendChild(title);
  topRow.appendChild(scoreBadge);

  const line1 = document.createElement("div");
  line1.className = "movieLine";
  line1.textContent = `${year} • ${rated} • ${runtime} • IMDb ${rating}`;

  const line2 = document.createElement("div");
  line2.className = "movieLine";
  line2.textContent = genres;

  const badges = document.createElement("div");
  badges.className = "badges";

  const idBadge = document.createElement("span");
  idBadge.className = "badge";
  idBadge.textContent = movie.imdbID || "—";

  const imdbLink = document.createElement("a");
  imdbLink.className = "badge";
  imdbLink.href = movie.imdbID ? `https://www.imdb.com/title/${movie.imdbID}/` : "#";
  imdbLink.target = "_blank";
  imdbLink.rel = "noreferrer";
  imdbLink.textContent = "IMDb";

  badges.appendChild(idBadge);
  badges.appendChild(imdbLink);

  body.appendChild(topRow);
  body.appendChild(line1);
  body.appendChild(line2);
  body.appendChild(badges);

  div.appendChild(posterDiv);
  div.appendChild(body);

  return div;
}

// ---------- Injected Carousel UI ----------
function ensureCarouselSection() {
  let section = document.getElementById("myMoviesSection");
  if (section) return carouselElements();

  // Put carousel INSIDE the Add Movies card so it doesn't create a new grid row
  const searchResults = document.getElementById("searchResults");
  const addMoviesCard = searchResults ? searchResults.closest(".card") : null;

  section = document.createElement("div");
  section.id = "myMoviesSection";
  section.className = "inlineSection"; // NEW class (styled in CSS)

  section.innerHTML = `
    <div class="row between center">
      <div>
        <h3 class="inlineTitle">My Added Movies</h3>
        <div class="muted" id="carouselStatus">Movies you add will appear here.</div>
      </div>

      <div class="row center" style="gap:8px;">
        <button class="btn smallBtn" id="carouselPrev" type="button">◀</button>
        <button class="btn smallBtn" id="carouselNext" type="button">▶</button>
      </div>
    </div>

    <div class="carousel" aria-label="My Added Movies Carousel">
      <div class="carouselTrack" id="carouselTrack"></div>
    </div>
  `;

  if (addMoviesCard) {
    addMoviesCard.appendChild(section);
  } else {
    // fallback (if Add Movies card not found)
    const container = document.querySelector(".container") || document.body;
    container.appendChild(section);
  }

  return carouselElements();
}


function carouselElements() {
  return {
    track: document.getElementById("carouselTrack"),
    status: document.getElementById("carouselStatus"),
    prev: document.getElementById("carouselPrev"),
    next: document.getElementById("carouselNext")
  };
}

function renderCarouselItem(movie) {
  const card = document.createElement("div");
  card.className = "carouselItem";

  const posterWrap = document.createElement("div");
  posterWrap.className = "carouselPoster";

  const poster = (movie.Poster && movie.Poster !== "N/A") ? movie.Poster : null;
  if (poster) {
    const img = document.createElement("img");
    img.src = poster;
    img.alt = `${movie.Title} poster`;
    posterWrap.appendChild(img);
  } else {
    posterWrap.textContent = "No poster";
  }

  const meta = document.createElement("div");
  meta.className = "carouselMeta";

  const title = document.createElement("div");
  title.className = "carouselTitle";
  title.textContent = movie.Title || "Untitled";

  const sub = document.createElement("div");
  sub.className = "carouselSub";
  sub.textContent = `${movie.Year || "—"} • ${NORMALIZED_RATED(movie.Rated)}`;

  meta.appendChild(title);
  meta.appendChild(sub);

  card.appendChild(posterWrap);
  card.appendChild(meta);

  card.onclick = () => {
    if (movie.imdbID) window.open(`https://www.imdb.com/title/${movie.imdbID}/`, "_blank", "noreferrer");
  };

  return card;
}

function bindCarouselButtons() {
  const { track, prev, next } = carouselElements();
  if (!track || !prev || !next) return;

  const scrollAmount = 520;
  prev.onclick = () => track.scrollBy({ left: -scrollAmount, behavior: "smooth" });
  next.onclick = () => track.scrollBy({ left:  scrollAmount, behavior: "smooth" });
}

async function refreshUserCarousel() {
  ensureCarouselSection();
  const { track, status } = carouselElements();
  if (!track || !status) return;

  const userIds = loadUserIds();
  track.innerHTML = "";

  if (userIds.length === 0) {
    status.textContent = "Add movies using the search above — they’ll show up here.";
    return;
  }

  const apiKey = loadApiKey();
  const cache = loadCache();

  if (apiKey) {
    for (const id of userIds) {
      if (!cache[id]) {
        try {
          status.textContent = "Loading your added movies…";
          cache[id] = await omdbGetById(apiKey, id);
          saveCache(cache);
        } catch {}
      }
    }
  }

  const movies = userIds.map(id => cache[id]).filter(Boolean);
  if (!movies.length) {
    status.textContent = apiKey
      ? "Couldn’t load details for your saved movies yet. Try again or clear cache."
      : "Save your OMDb key to load posters for your added movies.";
    return;
  }

  movies.forEach(m => track.appendChild(renderCarouselItem(m)));
  status.textContent = `Showing ${movies.length} added movie(s).`;
}

// ---------- FINAL: make Add Movies compact ----------
function makeAddMoviesCardCompact() {
  const searchResults = document.getElementById("searchResults");
  const addMoviesCard = searchResults ? searchResults.closest(".card") : null;
  if (!addMoviesCard) return;

  addMoviesCard.classList.add("compactAddMovies");
  searchResults.classList.add("compactResults");
}

// ---------- Add Movies search ----------
function renderSearchResults(items) {
  const wrap = document.getElementById("searchResults");
  if (!wrap) return;
  wrap.innerHTML = "";

  if (!items.length) {
    wrap.innerHTML = `<div class="muted">No results found.</div>`;
    return;
  }

  items.slice(0, 8).forEach(it => {
    const row = document.createElement("div");
    row.className = "searchItem";

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.innerHTML = `
      <div class="title">${it.Title || "—"}</div>
      <div class="small">${it.Year || "—"} • ${it.Type || "movie"} • ${it.imdbID || "—"}</div>
    `;

    const btn = document.createElement("button");
    btn.className = "btn";
    btn.textContent = "Add to My Pool";

    btn.onclick = async () => {
      const id = it.imdbID;
      if (!id) return;

      const current = loadUserIds();
      if (!current.includes(id)) {
        current.push(id);
        saveUserIds(current);
        btn.textContent = "Added ✓";
        btn.disabled = true;
        await refreshUserCarousel();
      } else {
        btn.textContent = "Already Added";
        btn.disabled = true;
      }
    };

    row.appendChild(meta);
    row.appendChild(btn);
    wrap.appendChild(row);
  });
}

// ---------- Show more ----------
function ensureLoadMoreUI() {
  let wrap = document.getElementById("loadMoreWrap");
  if (wrap) return wrap;

  const resultsEl = document.getElementById("results");
  if (!resultsEl) return null;

  wrap = document.createElement("div");
  wrap.id = "loadMoreWrap";
  wrap.className = "loadMoreWrap";

  const btn = document.createElement("button");
  btn.id = "loadMoreBtn";
  btn.className = "btn";
  btn.textContent = "Show more";
  btn.onclick = () => showMore();

  wrap.appendChild(btn);
  resultsEl.parentElement.appendChild(wrap);
  return wrap;
}

function showMore() {
  const resultsEl = document.getElementById("results");
  const btn = document.getElementById("loadMoreBtn");
  if (!resultsEl || !btn) return;

  const next = Math.min(lastScoredList.length, visibleCount + SHOW_MORE_STEP);
  for (let i = visibleCount; i < next; i++) {
    const item = lastScoredList[i];
    resultsEl.appendChild(renderMovieCard(item.movie, { score: item.score }));
  }
  visibleCount = next;

  if (visibleCount >= lastScoredList.length) {
    btn.style.display = "none";
  } else {
    btn.style.display = "inline-flex";
    btn.textContent = `Show more (${lastScoredList.length - visibleCount} left)`;
  }
}

// ---------- main run ----------
async function runRecommendations() {
  const prefStatus = document.getElementById("prefStatus");
  const resultsEl = document.getElementById("results");
  if (!resultsEl) return;

  resultsEl.innerHTML = "";

  const apiKey = loadApiKey();
  if (!apiKey) {
    setStatus(prefStatus, "Add your OMDb API key first (Setup section).", true);
    return;
  }

  const genreSelect = document.getElementById("genreSelect");
  const selectedGenres = new Set(
    genreSelect ? Array.from(genreSelect.selectedOptions).map(o => o.value) : []
  );

  const minRating = Number(document.getElementById("minRating")?.value || 0);
  const ageRating = normalizeAgePref(document.getElementById("ageRating")?.value);
  const maxRuntime = Number(document.getElementById("maxRuntime")?.value || 999);

  if (selectedGenres.size === 0) {
    setStatus(prefStatus, "No genres selected — browsing the pool. (Select genres for better matches.)");
  } else {
    setStatus(prefStatus, `Finding matches for: ${Array.from(selectedGenres).join(", ")}`);
  }

  const ids = buildPoolIds();
  const pills = {
    poolSizePill: document.getElementById("poolSizePill"),
    cachedPill: document.getElementById("cachedPill")
  };

  const cache = await warmCache(apiKey, ids, prefStatus, pills);

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

  ensureLoadMoreUI();
  showMore();

  setStatus(prefStatus, `Found ${scored.length} matching movies from a pool of ${ids.length}.`);
}

// ---------- init ----------
function init() {
  // Hide "# of Results" field if it exists in your HTML
  const rc = document.getElementById("resultCount");
  const rcField = rc ? rc.closest(".field") : null;
  if (rcField) rcField.style.display = "none";

  const apiKeyInput = document.getElementById("apiKeyInput");
  const saveKeyBtn = document.getElementById("saveKeyBtn");
  const clearCacheBtn = document.getElementById("clearCacheBtn");
  const setupStatus = document.getElementById("setupStatus");

  const searchTitle = document.getElementById("searchTitle");
  const searchBtn = document.getElementById("searchBtn");
  const recommendBtn = document.getElementById("recommendBtn");

  // Ensure genres exist
  const cache = loadCache();
  let genres = collectAllGenresFromCache(cache);
  if (!genres.length) {
    genres = [
      "ACTION","ADVENTURE","ANIMATION","BIOGRAPHY","COMEDY","CRIME","DRAMA",
      "FAMILY","FANTASY","HISTORY","HORROR","MYSTERY","ROMANCE","SCI-FI",
      "THRILLER","WAR"
    ];
  }
  fillGenreSelect(genres);

  // Load key into input
  if (apiKeyInput) apiKeyInput.value = loadApiKey();
  setStatus(setupStatus, apiKeyInput?.value ? "API key loaded." : "No API key saved yet.");

  if (saveKeyBtn && apiKeyInput) {
    saveKeyBtn.onclick = async () => {
      const key = apiKeyInput.value.trim();
      if (!key) {
        setStatus(setupStatus, "Please enter an API key.", true);
        return;
      }
      saveApiKey(key);
      setStatus(setupStatus, "Saved.");
      await refreshUserCarousel();
    };
  }

  if (clearCacheBtn) {
    clearCacheBtn.onclick = async () => {
      localStorage.removeItem(LS_KEY_CACHE);
      setStatus(setupStatus, "Cache cleared.");
      const cachedPill = document.getElementById("cachedPill");
      if (cachedPill) cachedPill.textContent = "Cached: —";
      await refreshUserCarousel();
    };
  }

  if (searchBtn && searchTitle) {
    searchBtn.onclick = async () => {
      const apiKey = loadApiKey();
      if (!apiKey) {
        setStatus(setupStatus, "Save your OMDb API key first.", true);
        return;
      }
      const title = searchTitle.value.trim();
      if (!title) return;

      try {
        setStatus(setupStatus, "Searching…");
        const items = await omdbSearchByTitle(apiKey, title);
        renderSearchResults(items);
        setStatus(setupStatus, `Found ${items.length} result(s).`);
      } catch (e) {
        setStatus(setupStatus, `Search failed: ${e.message}`, true);
      }
    };
  }

  if (recommendBtn) recommendBtn.onclick = runRecommendations;

  // Carousel + compact card (no HTML changes)
  ensureCarouselSection();
  bindCarouselButtons();
  makeAddMoviesCardCompact();
  refreshUserCarousel();
}

document.addEventListener("DOMContentLoaded", init);
