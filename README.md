CineMatch
A lightweight movie recommendation web app using the OMDb API.

Run
Open index.html in your browser.
Paste your OMDb API key in Setup and click Save Key.
Pick preferences and click Get Recommendations.
Use Add Movies to expand your personal pool; your movies show up in the carousel.
Project Structure
index.html -> page layout (unchanged except script tags)
styles.css -> styling
js/01_constants.js -> constants + starter IMDb IDs
js/02_storage.js -> localStorage (key, cache, user list)
js/03_utils.js -> parsing + rating logic
js/04_omdb.js -> OMDb API calls + cache warming
js/05_ui.js -> DOM rendering + carousel + compact Add Movies
js/06_main.js -> app flow (init, search, recommend, show more)
Where to edit later
UI/layout tweaks: styles.css or js/05_ui.js
Recommendation logic/scoring: js/06_main.js
API changes: js/04_omdb.js
