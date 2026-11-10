# Midway — meet in the middle

Midway helps a group of friends find somewhere that's roughly as close for every one of them, with a press of a button.

1. **Sign in** with an email and password (no verification).
2. **Set your home address.** The map centres on it.
3. **Add friends' addresses**, each with an optional nickname. You can type an address, tap the map, or drag a pin.
4. Press **✨ Find places.** Routes branch out along the real streets from every address, growing at the same rate (an invisible circle measured along the roads). They only grow in directions that lead towards the other addresses. Where the branches meet is the meeting point.
5. A **popup** lists what's nearby, sorted into tabs (Food, Drinks, Fun, Culture, Outdoors, Shopping). Each tab has listings with counts, e.g. `Italian 4`.
6. Pick a listing to **expand the map**: the places appear as numbered, labelled pins. Each pin and list entry can be clicked.
7. Choose a place and **send the location** using the share sheet, WhatsApp, Messages, Email, Telegram, copy, a calendar invite, or Google/Apple Maps.

## Run it

```bash
npm install
npm start            # http://localhost:3000
```

Requires Node 18+. The only dependency is Leaflet, which is served from `node_modules`. Data is stored in `data/db.json`; set `DATA_FILE` to change where. Set `PORT` to change the port.

## Quality-of-life extras

- Toggle friends in or out of a search without deleting them. Rename them inline, and undo a delete.
- Address autocomplete is biased towards your home, with keyboard navigation. "Use my current location" is available too.
- **Two ways to pick the meeting point** (in the menu):
  - *Fairest*: the longest trip is as short as possible.
  - *Least total travel*: the trips add up to the least overall.
- Distance and an estimated travel time for each person, shown by walking, bike, transit or car.
- Sort a category by *closest to the meeting point* or *fairest for everyone*.
- Change the search radius (500 m – 5 km). The search also widens automatically when little is nearby.
- 🎲 Surprise me, ↻ Replay animation, and Skip animation.
- Place details: opening hours, phone, website, dietary and accessibility tags, and dashed lines from everyone.
- **Past meetups** history, plus a calendar (.ics) invite with an optional date and time.
- Light, dark and auto themes. Animation speed setting. Mobile bottom sheet / desktop side panel. Installable PWA manifest.
- If street data can't be downloaded, or the friends are more than about 220 km apart, Midway falls back to an approximate network so it still works.

## How it works

| File | What it does |
| --- | --- |
| `server.js` | Static hosting plus a JSON API for accounts (scrypt-hashed passwords, httpOnly session cookie), saved addresses, settings and history |
| `public/js/network.js` | Downloads the road network from OpenStreetMap (Overpass) and builds a compact graph. The road classes it fetches depend on how spread out the group is |
| `public/js/meet.js` | Runs Dijkstra from every address, each limited to a "towards the others" ellipse corridor (it widens automatically if the roads don't connect). The meeting point is the node that minimises the maximum (or the total) road distance |
| `public/js/growth.js` | Canvas animation of each shortest-path tree, all clipped at one shared radius. Branches stop where they hit another friend's frontier |
| `public/js/pois.js` | Fetches places near the meeting point from Overpass and groups them into tabs and listings (by cuisine and type) |
| `public/js/share.js` | Share text, messaging deep links, map links and the `.ics` invite |

Map data © OpenStreetMap contributors. Tiles, geocoding (Photon / Nominatim) and Overpass are called directly from the browser using the free public instances. These are fine for personal use. For real traffic, point them at your own instances or a commercial provider, as their usage policies ask.

## Tests

```bash
npm test                                   # solver unit tests
NODE_PATH=$(npm root -g) npm run test:e2e  # full browser walkthrough (Playwright; map services mocked)
```
