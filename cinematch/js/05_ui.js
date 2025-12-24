/**
 * CineMatch UI Layer
 * ------------------
 * All DOM creation & rendering lives here:
 * - Search results list
 * - Recommendation cards
 * - Show more button
 * - Compact Add Movies styling
 * - Carousel injection + refresh
 */
window.CineMatch = window.CineMatch || {};
CineMatch.UI = (function () {
  const { normalizedRated } = CineMatch.Utils;

  function renderMovieCard(movie, score) {
    const poster = (movie.Poster && movie.Poster !== "N/A") ? movie.Poster : null;

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
    scoreBadge.textContent = `Score: ${score}`;

    topRow.appendChild(title);
    topRow.appendChild(scoreBadge);

    const line1 = document.createElement("div");
    line1.className = "movieLine";
    line1.textContent = `${movie.Year || "—"} • ${normalizedRated(movie.Rated)} • ${movie.Runtime || "—"} • IMDb ${movie.imdbRating || "—"}`;

    const line2 = document.createElement("div");
    line2.className = "movieLine";
    line2.textContent = movie.Genre || "—";

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

  function renderSearchResults(items, onAddClick) {
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
        const ok = await onAddClick(it.imdbID);
        if (!ok) return;
        btn.textContent = "Added ✓";
        btn.disabled = true;
      };

      row.appendChild(meta);
      row.appendChild(btn);
      wrap.appendChild(row);
    });
  }

  function ensureLoadMoreUI(onClick) {
    let wrap = document.getElementById("loadMoreWrap");
    if (wrap) return;

    const resultsEl = document.getElementById("results");
    if (!resultsEl) return;

    wrap = document.createElement("div");
    wrap.id = "loadMoreWrap";
    wrap.className = "loadMoreWrap";

    const btn = document.createElement("button");
    btn.id = "loadMoreBtn";
    btn.className = "btn";
    btn.textContent = "Show more";
    btn.onclick = onClick;

    wrap.appendChild(btn);
    resultsEl.parentElement.appendChild(wrap);
  }

  function makeAddMoviesCardCompact() {
    const searchResults = document.getElementById("searchResults");
    const addMoviesCard = searchResults ? searchResults.closest(".card") : null;
    if (!addMoviesCard) return;

    addMoviesCard.classList.add("compactAddMovies");
    searchResults.classList.add("compactResults");
  }

  function ensureCarouselInsideAddMovies() {
    let section = document.getElementById("myMoviesSection");
    if (section) return;

    const searchResults = document.getElementById("searchResults");
    const addMoviesCard = searchResults ? searchResults.closest(".card") : null;
    if (!addMoviesCard) return;

    section = document.createElement("div");
    section.id = "myMoviesSection";
    section.className = "inlineSection";

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

    addMoviesCard.appendChild(section);
  }

  function bindCarouselButtons() {
    const track = document.getElementById("carouselTrack");
    const prev = document.getElementById("carouselPrev");
    const next = document.getElementById("carouselNext");
    if (!track || !prev || !next) return;

    const scrollAmount = 520;
    prev.onclick = () => track.scrollBy({ left: -scrollAmount, behavior: "smooth" });
    next.onclick = () => track.scrollBy({ left:  scrollAmount, behavior: "smooth" });
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
    sub.textContent = `${movie.Year || "—"} • ${normalizedRated(movie.Rated)}`;

    meta.appendChild(title);
    meta.appendChild(sub);

    card.appendChild(posterWrap);
    card.appendChild(meta);

    card.onclick = () => {
      if (movie.imdbID) window.open(`https://www.imdb.com/title/${movie.imdbID}/`, "_blank", "noreferrer");
    };

    return card;
  }

  async function refreshUserCarousel() {
    ensureCarouselInsideAddMovies();

    const track = document.getElementById("carouselTrack");
    const status = document.getElementById("carouselStatus");
    if (!track || !status) return;

    const userIds = CineMatch.Storage.loadUserIds();
    track.innerHTML = "";

    if (userIds.length === 0) {
      status.textContent = "Add movies using the search above — they’ll show up here.";
      return;
    }

    const apiKey = CineMatch.Storage.loadApiKey();
    const cache = CineMatch.Storage.loadCache();

    if (apiKey) {
      for (const id of userIds) {
        if (!cache[id]) {
          try {
            status.textContent = "Loading your added movies…";
            cache[id] = await CineMatch.OMDb.getById(apiKey, id);
            CineMatch.Storage.saveCache(cache);
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

  return {
    renderMovieCard,
    renderSearchResults,
    ensureLoadMoreUI,
    makeAddMoviesCardCompact,
    ensureCarouselInsideAddMovies,
    bindCarouselButtons,
    refreshUserCarousel
  };
})();
