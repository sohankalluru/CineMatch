/**
 * CineMatch Constants
 */
window.CineMatch = window.CineMatch || {};
CineMatch.CONSTANTS = {
  // LocalStorage keys
  LS_KEY_API: "cinematch_api_key",
  LS_KEY_USER_IDS: "cinematch_user_ids",
  LS_KEY_CACHE: "cinematch_cache_v1",

  // Stores discovered IMDb IDs by genre, so the pool grows over time and reduces API calls
  // Format: { "CRIME": ["tt....", ...], "DRAMA": [...], ... }
  LS_KEY_DISCOVERED: "cinematch_discovered_v1",

  // UI paging
  SHOW_MORE_STEP: 12,

  // ✅ Capacity target for the active pool (per selected genre set)
  POOL_CAP: 250,

  // ✅ Discovery settings (how aggressively we expand a genre pool per click)
  // NOTE: each "detail fetch" is an OMDb call to getById() (the expensive part)
  DISCOVERY_MAX_NEW_DETAILS: 260,
  DISCOVERY_PAGES_PER_TERM: 5,

  // Keyword seeds per genre (OMDb does not support pure "browse by genre")
  GENRE_KEYWORDS: {
    ACTION: ["action", "mission", "agent", "battle", "warrior"],
    ADVENTURE: ["adventure", "journey", "quest", "treasure", "expedition"],
    ANIMATION: ["animation", "animated", "pixar", "disney", "dreamworks"],
    BIOGRAPHY: ["biography", "biopic", "true story", "life of"],
    COMEDY: ["comedy", "funny", "vacation", "wedding", "party"],
    CRIME: ["crime", "detective", "mafia", "heist", "gangster", "murder", "noir"],
    DRAMA: ["drama", "family", "relationship", "life", "struggle"],
    FAMILY: ["family", "kids", "friendship", "home"],
    FANTASY: ["fantasy", "magic", "dragon", "wizard", "kingdom"],
    HISTORY: ["history", "historical", "empire", "king", "queen"],
    HORROR: ["horror", "haunted", "ghost", "demon", "curse"],
    MUSIC: ["music", "band", "concert", "singer"],
    MYSTERY: ["mystery", "case", "secret", "missing"],
    ROMANCE: ["romance", "love", "valentine", "wedding"],
    "SCI-FI": ["space", "alien", "future", "robot", "sci-fi"],
    THRILLER: ["thriller", "kidnapping", "escape", "hostage"],
    WAR: ["war", "soldier", "battle", "army"],
    WESTERN: ["western", "cowboy", "outlaw", "ranch"]
  },

  // Curated starter IDs (still useful as a baseline + for caching)
  STARTER_IMDB_IDS: [
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
  ],

  // Age rating ordering for comparisons
  MPAA_ORDER: ["G", "PG", "PG-13", "R", "NC-17"],
  TV_ORDER: ["TV-Y", "TV-G", "TV-PG", "TV-14", "TV-MA"]
};
