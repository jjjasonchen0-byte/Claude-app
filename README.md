# Meet

Find somewhere that's roughly as close for everyone in a group, with a press of a button.

1. **Enter where you're starting from.** No account is needed. The map centres on your address.
2. **Add the people you're meeting**, each with an optional name. You can type an address, tap the map, or drag a dot. Everyone has their own **way of travelling** (public transport, walk, bike or drive): tap the pill next to a name to change it. It's remembered.
3. Press **Find a place to meet.** Routes grow along the real streets from every address, each at that person's travel speed, so the meeting point is fair in **travel time**: someone driving is asked to go further than someone walking. Each person gets a main route and a few alternatives, and every step of every route moves towards the meeting point, the spot where everyone's routes arrive together.
4. A panel lists what's nearby in tabs (Food, Drinks, Fun, Culture, Outdoors, Shopping). Each tab has listings with counts, e.g. `Italian 4`.
5. Pick a listing to **show those places on the map** as numbered, labelled pins you can click.
6. Open a place to see **real directions for everyone, each in their own way of travelling**: public transport (lines in their official colours, times, changes, walking legs, with *Leave now* or *Arrive by*), walking, cycling or driving. Each route is drawn on the map; tap a person for the step-by-step journey or to open it in Google Maps or Apple Maps. The Transit / Walk / Bike / Drive bar sets everyone at once. You can also open the meeting point itself.
7. Choose one and **send the location** by share sheet, WhatsApp, Messages, Email, Telegram, copy, a calendar invite, or Google/Apple Maps.

**Profiles are optional.** Without one, everything is saved in the browser. Signing in or creating a profile (menu → *Sign in or create a profile*) keeps your people and past meetups on every device, and anything you set up as a guest moves into the profile.

The look follows Apple's design language: system font, frosted-glass panels, inset grouped lists, coloured category tiles, iOS-style switches and segmented controls. On phones the panel is a bottom sheet. Drag its handle to resize it, or tap the handle to collapse and expand it.

## Run it

```bash
npm install
MEET_CONTACT="you@example.com" npm start      # http://localhost:3000
```

Requires Node 18+. The only dependency is Leaflet, which is served from `node_modules`. Profiles are stored in `data/db.json`; set `DATA_FILE` to change where. Set `PORT` to change the port.

To use it on your phone, deploy it anywhere that runs Node or Docker (for example Render, Railway or Fly.io) and open the HTTPS address it gives you; your phone's location button needs HTTPS. A `Dockerfile` is included:

```bash
docker build -t meet . && docker run -p 3000:3000 -e MEET_CONTACT="you@example.com" -v meet-data:/app/data meet
```

### Real-world data and the rules that come with it

Everything comes from free, open services. Each asks for light, fair use:

| What | Service | Notes |
| --- | --- | --- |
| Map tiles | OpenStreetMap | [Tile usage policy](https://operations.osmfoundation.org/policies/tiles/). For heavy use, switch to a commercial tile provider |
| Address search | Photon (komoot), Nominatim fallback | Called from the browser |
| Streets and places | Overpass API (overpass-api.de, with two mirrors) | Called from the browser. Public Overpass servers sometimes refuse cloud servers or are busy; the app then falls back to approximate streets and lets you open the meeting point directly |
| Walk / bike / drive directions | [FOSSGIS OSRM](https://routing.openstreetmap.de/about.html) | Relayed and cached by the Meet server |
| Public transport | [Transitous](https://transitous.org/api/) (MOTIS 2) | Relayed and cached by the Meet server |

**Transitous has conditions you need to meet:** the app must be **open source** (published under an open-source licence), **non-commercial**, light on their servers (the server caps public-transport searches at `TRANSIT_DAILY_LIMIT`, default 600 a day, below their ~720/day guideline), it must identify itself with a way to contact you (set `MEET_CONTACT` to a website or email address; it goes in the `User-Agent`), and it must credit them visibly (the app links to their data sources on the map and under each set of directions). Consider [donating](https://transitous.org/donate/) if you use it a lot.

The browser asks the Meet server for directions (`/api/directions`, `/api/traveltimes`), which trims the responses for phones (a public-transport answer drops from about 150 KB to about 35 KB), caches them and rate-limits each visitor. If there's no server, the browser calls the services directly.

## Test version (no server, no internet)

`node scripts/build-test.mjs` builds `dist/meet-test.html`, a single page that runs the same app code on a made-up island about 220 × 170 km across. Its coastal city, Port Verity (about 22 × 16 km), has districts at different angles, curving streets, a tangled old town, suburbs with dead ends, boulevards, a river with bridges, lakes and parks. Around it are 13 market towns and about 30 villages with their own streets, winding country lanes, A-roads and motorways routed between the towns, forests, lakes and a second river. In total that's about 90,000 street corners and 3,100 places. Street, district, town and forest names appear as you zoom. It's drawn as map tiles, so panning, scroll-wheel zoom and pinch zoom behave like a normal map, and the island is built just after the page appears.

## Extras

- Leave people out of a search without deleting them. Rename them, and undo a delete.
- Address suggestions are biased towards your starting point and work with the keyboard.
- **Two ways to pick the meeting point** (in the menu):
  - *Fairest*: the longest trip is as short as possible.
  - *Least travel*: everyone's trips add up to the least overall.
- Travel time and distance for each person in their own mode. The menu sets the default mode for people you add.
- Sort a category by *nearest* to the meeting point or *fairest* for everyone.
- Search radius from 500 m to 5 km. The search also widens automatically when little is nearby.
- Surprise me, Replay, and Skip animation.
- Past meetups, light/dark/auto themes, animation speed, and an installable web-app manifest.
- If street data can't be downloaded, or the group is more than about 220 km apart, Meet uses an approximate network and says so.

## How it works

| File | What it does |
| --- | --- |
| `server.js` | Static hosting plus a JSON API for optional profiles (scrypt-hashed passwords, httpOnly session cookie), saved addresses, settings and history |
| `public/js/api.js` | One data API for the app: guest storage (`guest.js`) until someone signs in, then the server (`remote.js`), moving guest data across |
| `public/js/network.js` | Downloads the road network from OpenStreetMap (Overpass) and builds a compact graph. The road classes it fetches depend on how spread out the group is |
| `public/js/meet.js` | Runs Dijkstra from every address, each limited to a "towards the others" corridor that widens automatically if roads don't connect. The meeting point is the node that minimises the longest (or total) road distance. `routeBundle` then finds up to four different routes per person in which every step moves closer to the meeting point |
| `public/js/growth.js` | Canvas animation: each person's routes grow at one shared rate (an invisible circle measured along the roads), a main route plus faint alternatives, with nothing branching away from the meeting point. When everyone arrives the alternatives fade and the main routes stay. It scales with the map while zooming |
| `public/js/pois.js` | Fetches places near the meeting point from Overpass and groups them into tabs and listings |
| `public/js/directions.js` | Real directions: request URLs and response normalisers for FOSSGIS OSRM (walk, bike, drive, and travel-time tables) and Transitous (public transport itineraries with lines, colours, times and walking legs), a polyline decoder, and the browser client that uses the Meet server or calls the services directly |
| `public/js/share.js` | Share text, messaging links, map links and the `.ics` invite |

Map data © OpenStreetMap contributors. Routing by FOSSGIS OSRM. Public transport by Transitous and [its data sources](https://transitous.org/sources/).

## Tests

```bash
npm test                                   # solver and directions unit tests (directions use trimmed real London responses)
NODE_PATH=$(npm root -g) npm run test:e2e  # full browser walkthrough (Playwright; map services mocked)
```
