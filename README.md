# Meet

Find somewhere that's roughly as close for everyone in a group, with a press of a button.

1. **Enter where you're starting from.** No account is needed. The map centres on your address.
2. **Add the people you're meeting**, each with an optional name. You can type an address, tap the map, or drag a dot.
3. Press **Find a place to meet.** Routes branch out along the real streets from every address, all growing at the same rate (an invisible circle measured along the roads). They only grow in directions that lead towards the others. Where they meet is the meeting point.
4. A panel lists what's nearby in tabs (Food, Drinks, Fun, Culture, Outdoors, Shopping). Each tab has listings with counts, e.g. `Italian 4`.
5. Pick a listing to **show those places on the map** as numbered, labelled pins you can click.
6. Choose one and **send the location** by share sheet, WhatsApp, Messages, Email, Telegram, copy, a calendar invite, or Google/Apple Maps.

**Profiles are optional.** Without one, everything is saved in the browser. Signing in or creating a profile (menu → *Sign in or create a profile*) keeps your people and past meetups on every device, and anything you set up as a guest moves into the profile.

The look follows Apple's design language: system font, frosted-glass panels, inset grouped lists, coloured category tiles, iOS-style switches and segmented controls. On phones the panel is a bottom sheet. Drag its handle to resize it, or tap the handle to collapse and expand it.

## Run it

```bash
npm install
npm start            # http://localhost:3000
```

Requires Node 18+. The only dependency is Leaflet, which is served from `node_modules`. Profiles are stored in `data/db.json`; set `DATA_FILE` to change where. Set `PORT` to change the port.

## Test version (no server, no internet)

`node scripts/build-test.mjs` builds `dist/meet-test.html`, a single page that runs the same app code on a made-up island about 220 × 170 km across. Its coastal city, Port Verity (about 22 × 16 km), has districts at different angles, curving streets, a tangled old town, suburbs with dead ends, boulevards, a river with bridges, lakes and parks. Around it are 13 market towns and about 30 villages with their own streets, winding country lanes, A-roads and motorways routed between the towns, forests, lakes and a second river. In total that's about 90,000 street corners and 3,100 places. Street, district, town and forest names appear as you zoom. It's drawn as map tiles, so panning, scroll-wheel zoom and pinch zoom behave like a normal map, and the island is built just after the page appears.

## Extras

- Leave people out of a search without deleting them. Rename them, and undo a delete.
- Address suggestions are biased towards your starting point and work with the keyboard.
- **Two ways to pick the meeting point** (in the menu):
  - *Fairest*: the longest trip is as short as possible.
  - *Least travel*: everyone's trips add up to the least overall.
- Travel time and distance for each person, by walking, bike, transit or car.
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
| `public/js/meet.js` | Runs Dijkstra from every address, each limited to a "towards the others" corridor that widens automatically if roads don't connect. The meeting point is the node that minimises the longest (or total) road distance |
| `public/js/growth.js` | Canvas animation at one shared radius: a pale wash of each person's colour over the streets they can reach, thin lines only along streets that lead somewhere (dead-end twigs are left out), and each person's route once everyone meets |
| `public/js/pois.js` | Fetches places near the meeting point from Overpass and groups them into tabs and listings |
| `public/js/share.js` | Share text, messaging links, map links and the `.ics` invite |

Map data © OpenStreetMap contributors. Tiles, geocoding (Photon / Nominatim) and Overpass use the free public instances, which suit personal use. For real traffic, use your own instances or a commercial provider, as their usage policies ask.

## Tests

```bash
npm test                                   # solver unit tests
NODE_PATH=$(npm root -g) npm run test:e2e  # full browser walkthrough (Playwright; map services mocked)
```
