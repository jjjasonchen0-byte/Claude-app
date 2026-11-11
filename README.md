# Meet

Find somewhere that's roughly as close for everyone in a group, with a press of a button.

1. **Enter where you're starting from.** No account is needed. The map centres on your address.
2. **Add the people you're meeting**, each with an optional name. You can type an address, tap the map, or drag a dot. Everyone has their own **way of travelling** (public transport, walk, bike or drive): tap the pill next to a name to change it. It's remembered.
3. Press **Find a place to meet.** Meet asks a routing service for real travel times from everyone to a grid of spots around the group, keeps the best one and zooms in around it, so everyone's **travel times are as similar as possible**: someone driving is asked to go further than someone walking. For public transport the two best spots are checked against real timetables. Then the routes **race**: each person gets several real routes that all head towards the meeting point (their best route, the routing service's alternatives, and routes through points to either side). They grow together on one shared clock at that person's speed, with a dot at each tip. The first to arrive is picked: it flashes bold and the others fade.
4. A panel lists what's nearby in tabs (Food, Drinks, Fun, Culture, Outdoors, Shopping). Each tab has listings with counts, e.g. `Italian 4`.
5. Pick a listing to see the places **with a photo, rating, opening status and address**, and as numbered pins on the map. Sort by nearest, fairest for everyone, or top rated.
6. Open a place for a **full page like a search result**: photos (tap to view full screen), rating with a breakdown, reviews, opening hours, phone, website and menu, what it offers (outdoor seating, takeaway, step-free…), and **real directions for everyone, each in their own way of travelling**: public transport (lines in their official colours, times, changes, walking legs, with *Leave now* or *Arrive by*), walking, cycling or driving.
7. **Send the location** by share sheet, WhatsApp, Messages, Email, Telegram, copy, a calendar invite, or Google/Apple Maps.

**Profiles are optional.** Without one, everything is saved in the browser. Signing in or creating a profile (menu → *Sign in or create a profile*) keeps your people and past meetups on every device, and anything you set up as a guest moves into the profile.

The look follows Apple's design language: a quiet map with white streets and no shop icons, system font, frosted-glass panels, inset grouped lists, coloured category tiles, iOS-style switches and segmented controls. On phones the panel is a bottom sheet. Drag its handle to resize it, or tap the handle to collapse and expand it.

## Run it

```bash
npm install
MEET_CONTACT="you@example.com" npm start      # http://localhost:3000
```

Requires Node 20.3+. Dependencies are Leaflet and MapLibre (for the map), served from `node_modules`. Profiles are stored in `data/db.json`; set `DATA_FILE` to change where. Set `PORT` to change the port.

### Settings

| Variable | What it does |
| --- | --- |
| `MEET_CONTACT` | Your email or website, sent to the routing services so they can reach you (Transitous requires it) |
| `TRIPADVISOR_API_KEY` | Optional. Turns on Tripadvisor ratings, photos and reviews (see below) |
| `TRIPADVISOR_DAILY_LIMIT` | Most Tripadvisor "billable entities" Meet uses per day (default 150) |
| `TRANSIT_DAILY_LIMIT` | Most public-transport searches per day (default 600) |
| `PORT`, `DATA_FILE` | Port and profile storage file |

### Put it online (for your phone)

Your phone's location button needs an `https://` address, so host it. The repo includes a `render.yaml`, so on [Render](https://render.com) it takes a few clicks:

1. Sign up at render.com with your GitHub account and allow it to see this repository.
2. In the Render dashboard choose **New → Blueprint**, then pick this repository.
3. When asked for **MEET_CONTACT**, enter your email or website. Leave **TRIPADVISOR_API_KEY** empty unless you have one. Click **Apply**.
4. After a few minutes Render shows an address like `https://meet-xxxx.onrender.com`. Open it on your phone.

The free plan pauses when idle (the first visit then takes about a minute) and doesn't keep files between restarts. Guest data lives in each browser, so that's fine, but saved profiles would be lost; pick a paid plan with a disk if you want profiles to last.

Any host that runs Node or Docker works too (Railway, Fly.io…). A `Dockerfile` is included:

```bash
docker build -t meet . && docker run -p 3000:3000 -e MEET_CONTACT="you@example.com" -v meet-data:/app/data meet
```

### Ratings, photos and reviews (Tripadvisor, optional)

Without a key, places show their opening status, address and details from OpenStreetMap, plus free photos from Wikimedia Commons for places that OpenStreetMap links to Wikidata or Commons (mostly museums, parks and landmarks). Restaurants rarely have those, so they show a coloured category picture instead.

With a Tripadvisor key, lists show each place's **photo and rating**, and the place page adds **up to 12 photos, recent reviews, a rating breakdown, ranking, price level and contact details**.

Tripadvisor's API is now called **Terra** ([docs](https://docs.terra.tripadvisor.com)); the older Content API is deprecated. Things to know before you sign up:

- **It is pay-per-use after a one-time free allowance.** Your account gets 1,000 free "billable entities" once (not each month), then about $0.009–$0.015 each. A place in a search result counts once; a photos or reviews request counts once per place. In Meet, a list of 10 restaurants costs roughly 10–30 the first time (finding them on Tripadvisor) plus 10 for their photos; opening a place costs 3. So the free allowance covers a few dozen meetups.
- `TRIPADVISOR_DAILY_LIMIT` (default 150 a day, about $2) stops spending; when it's reached, ratings pause until the next day and the app carries on without them.
- **Places must be on your allowlist** before Tripadvisor returns their photos or reviews. Meet adds them for you through the allowlist API (this is free).
- **No caching is allowed** except Tripadvisor's location IDs. Meet remembers which Tripadvisor ID belongs to which OpenStreetMap place (so it doesn't search again) and nothing else.
- Show their branding: Meet credits Tripadvisor under lists and reviews, uses their rating image when the API provides one, and links to the place on Tripadvisor. Check their [brand guidelines](https://docs.terra.tripadvisor.com/docs/display-requirements.md) before going public.

To turn it on: create an account at [terra.tripadvisor.com](https://terra.tripadvisor.com), create an API key, and add it as `TRIPADVISOR_API_KEY` (on Render: your service → **Environment** → **Add Environment Variable**). The key stays on the server; the browser never sees it. The integration was written against Tripadvisor's published API reference and tested with stand-in responses, since no key was available; check a few places after you add yours.

### Real-world data and the rules that come with it

Everything else comes from free, open services. Each asks for light, fair use:

| What | Service | Notes |
| --- | --- | --- |
| Map | [OpenFreeMap](https://openfreemap.org) (OpenStreetMap data), drawn with MapLibre | Free, no key, no limits; attribution required (shown on the map). Devices without WebGL get standard [OpenStreetMap tiles](https://operations.osmfoundation.org/policies/tiles/) |
| Address search | Photon (komoot), Nominatim fallback | Called from the browser |
| Places | Overpass API (OpenStreetMap), with Photon racing it | Called from the browser. If Overpass hasn't answered within about 2 seconds, Photon is asked too and whichever is ready first is used (Photon groups by type, e.g. Restaurants or Cafés, rather than by cuisine) |
| Photos (free) | Wikidata and Wikimedia Commons | Called from the browser; each photo's author and licence is shown in the photo viewer |
| Walk / bike / drive travel times and routes | [FOSSGIS OSRM](https://routing.openstreetmap.de/about.html) | Relayed and cached by the Meet server. If it hasn't answered in 1 s, and again at 3.5 s, the server asks once more and uses the first answer (it sometimes stalls for ~10 s). Each search asks for up to 5 routes per person walking, cycling or driving, for the route race |
| Public transport | [Transitous](https://transitous.org/api/) (MOTIS 2) | Relayed and cached by the Meet server, never sent twice |

**Transitous has conditions you need to meet:** the app must be **open source** (published under an open-source licence), **non-commercial**, light on their servers (the server caps public-transport searches at `TRANSIT_DAILY_LIMIT`, default 600 a day, below their ~720/day guideline), it must identify itself with a way to contact you (set `MEET_CONTACT` to a website or email address; it goes in the `User-Agent`), and it must credit them visibly (the app links to their data sources on the map and under each set of directions). Consider [donating](https://transitous.org/donate/) if you use it a lot. Each search uses up to two public-transport requests per person on public transport to check the best spots.

The browser asks the Meet server for directions (`/api/directions`, `/api/traveltimes`), which trims and simplifies the responses for phones, caches them and rate-limits each visitor. If there's no server, the browser calls the services directly. The server also sends its files compressed (the map library is about 1 MB raw, 260 KB compressed).

## Test version (no server, no internet)

`node scripts/build-test.mjs` builds `dist/meet-test.html`, a single page (about 2.5 MB) that runs the same app code on **central Sydney** built into the page: Pyrmont and Glebe to Bondi, North Sydney and Mosman to Newtown. That's about 150,000 street corners (every road, lane and footpath, so walking routes cross the Harbour Bridge and follow the foreshore), the harbour, bays, parks and beaches, 115 suburbs, about 21,000 house-number addresses and 6,400 real places: restaurants, cafés, pubs, bars, museums, parks and shops. Address search knows the streets, house numbers, suburbs and places. Walking, cycling and driving routes follow real streets (no walking on motorways, no driving on footpaths); there's no public transport. Because these are real businesses, the test version shows **no ratings, photos or reviews** rather than make any up.

The Sydney data comes from OpenStreetMap via [OpenFreeMap](https://openfreemap.org)'s vector tiles (© OpenStreetMap contributors, ODbL; © OpenMapTiles), credited on the map. `node scripts/build-sydney.mjs` rebuilds it (`scripts/sydney/sydney-data.js`): it downloads about 50 tiles once (8 MB, cached in `.cache/`), joins streets cut at tile edges, keeps the connected street network, and packs everything into compact strings. It needs the dev dependencies (`npm install`).

## Extras

- Leave people out of a search without deleting them. Rename them, and undo a delete.
- Address suggestions are biased towards your starting point and work with the keyboard.
- **Two ways to pick the meeting point** (in the menu; changing it looks again straight away):
  - *Similar times* (default): everyone's trip takes about as long. To even things out, the longest trip may grow by up to 30% (or 5 minutes) over the shortest it could be. People travelling very differently (one walking, one driving) can't always be evened out; the results show the range, e.g. "35–42 min".
  - *Least travel*: everyone's trips add up to the least overall.
- Travel time and distance for each person in their own mode. The menu sets the default mode for people you add.
- Opening hours read from OpenStreetMap: "Open · Closes 22:00", "Closes soon", "Closed · Opens Tue 09:00", and a weekly table.
- Search radius from 500 m to 5 km, drawn as a circle around the meeting point when you pick one. The search also widens automatically when little is nearby.
- Replay and Skip animation.
- Past meetups, light/dark/auto themes (the map follows), animation speed, and an installable web-app manifest.
- If the routing service can't be reached, Meet picks the spot from distances and says it's an estimate.

## How it works

| File | What it does |
| --- | --- |
| `server.js` | Static hosting (compressed), a JSON API for optional profiles (scrypt-hashed passwords, httpOnly session cookie), saved addresses, settings and history, and relays for directions and ratings |
| `lib/tripadvisor.js` | Tripadvisor Terra client: matches places by name and distance, keeps the allowlist up to date, batches rating lookups, and enforces the daily limit |
| `public/js/api.js` | One data API for the app: guest storage (`guest.js`) until someone signs in, then the server (`remote.js`), moving guest data across |
| `public/js/meetpoint.js` | Finds the meeting point from travel-time tables: a 7 × 7 grid over the group, then finer grids around the best spot, one request per way of travelling each round; public transport checked against timetables |
| `public/js/growth.js` | Canvas animation that races everyone's routes on one shared clock and picks the first to arrive (walking parts of the chosen route dotted); it scales with the map while zooming |
| `public/js/branches.js` | Extra routes for the race: points to either side of the way there, and which routes keep heading to the meeting point, aren't much slower and aren't copies |
| `public/js/pois.js` | Places near the meeting point from Overpass, raced against Photon, grouped into tabs and listings |
| `public/js/rated.js` | Ratings, photos and reviews: Tripadvisor through the server, free photos from Wikimedia |
| `public/js/hours.js` | Reads OpenStreetMap opening hours: open now, closing soon, next opening, weekly table |
| `public/js/match.js` | Decides whether two listings are the same place (similar names, close together) |
| `public/js/directions.js` | Real directions: request URLs and response normalisers for FOSSGIS OSRM (routes with alternatives, travel-time tables) and Transitous (itineraries with lines, colours, times and walking legs), and the browser client |
| `public/js/share.js` | Share text, messaging links, map links and the `.ics` invite |
| `public/js/demo.js`, `graph.js` | The test version's stand-ins: central Sydney's streets as a graph (routes by way of travelling), address search, places and the drawn map |
| `scripts/build-sydney.mjs` | Builds the Sydney data for the test version from OpenFreeMap vector tiles |

Map © OpenFreeMap, © OpenMapTiles, data © OpenStreetMap contributors. Routing by FOSSGIS OSRM. Public transport by Transitous and [its data sources](https://transitous.org/sources/). Ratings, photos and reviews (when enabled) by Tripadvisor.

## Licence

MIT, see [LICENSE](LICENSE).

## Tests

```bash
npm test                                   # unit tests: meeting point, places, opening hours, matching, photos, Tripadvisor, directions
NODE_PATH=$(npm root -g) npm run test:e2e  # full browser walkthrough (Playwright; map services mocked)
```
