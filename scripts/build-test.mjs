// Builds dist/meet-test.html: a single self-contained page that runs the real
// Meet app code in a generated town, with no server and no network access
// besides one CDN script (Leaflet). Run: node scripts/build-test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

function replaceOnce(src, from, to, label) {
  if (!src.includes(from)) throw new Error(`build-test: could not find ${label}`);
  return src.replace(from, to);
}

// Turn an ES module into a scoped block that registers its exports in __m.
function wrapModule(name, src) {
  const exported = [];
  let body = src.replace(/^import\s*\{([^}]*)\}\s*from\s*'\.\/([\w-]+)\.js';\s*$/gm, (_, names, mod) =>
    `const {${names.replace(/\s+as\s+/g, ': ')}} = __m[${JSON.stringify(mod)}];`);
  body = body.replace(/^export\s+(async\s+function|function|class|const|let)\s+([A-Za-z_$][\w$]*)/gm, (_, kw, id) => {
    exported.push(id);
    return `${kw} ${id}`;
  });
  if (/^\s*(import|export)\b/m.test(body)) throw new Error(`build-test: unhandled import/export in ${name}`);
  return `// ---- ${name}\n(() => {\n${body}\n__m[${JSON.stringify(name)}] = { ${exported.join(', ')} };\n})();\n`;
}

// ---- app tweaks for the test version (central Sydney, built into the page)
let app = read('public/js/app.js');
app = replaceOnce(app, "map = L.map('map', { zoomControl: false, worldCopyJump: true });",
  "map = L.map('map', { zoomControl: false, zoomSnap: 0.25, zoomDelta: 0.5, wheelPxPerZoomLevel: 80, minZoom: 11.5, maxZoom: 19, maxBounds: __m.demo.getBounds(), maxBoundsViscosity: 0.8 });", 'map init');
app = app.replace(/\/\/ basemap:start[\s\S]*?\/\/ basemap:end\n/, 'function addBasemap() { if (!baseLayer) baseLayer = __m.demo.addBasemap(map) || true; }\n');
if (app.includes('basemaps.cartocdn.com')) throw new Error('build-test: base map not replaced');
app = replaceOnce(app, 'map.attributionControl.setPrefix(false);', "map.attributionControl.setPrefix(false).addAttribution('Test version: central Sydney, built into this page');", 'attribution');
// Calendar files can't be saved from inside the test page.
app = replaceOnce(app, '      <button class="btn btn-tinted" data-action="calendar">Calendar</button>\n', '', 'calendar button');
// The test version has no timetables, so start on walking directions.
app = replaceOnce(app, "const DEFAULT_SETTINGS = { mode: 'similar', travel: 'transit',", "const DEFAULT_SETTINGS = { mode: 'similar', travel: 'walk',", 'default travel mode');
// Directions come from the streets built into the page, not the real routing services.
app = replaceOnce(app, '  map.attributionControl.addAttribution(ROUTES_CREDIT);\n', '', 'routing attribution');
app = replaceOnce(app, '    <p class="footnote attrib">${credits}</p>',
  '    <p class="footnote attrib">Test version: routes follow Sydney\'s streets, built into this page. The real app uses live routing and public transport.</p>', 'routing attribution');
if (app.includes('addAttribution(ROUTES_CREDIT)')) throw new Error('build-test: routing attribution left in test build');

// ---- page markup
const html = read('public/index.html');
let body = html.slice(html.indexOf('<body>') + 6, html.indexOf('<script src="/vendor/leaflet/leaflet.js">'));
body = replaceOnce(body, 'Use my current location', 'Pick a random address', 'locate label');
body = replaceOnce(body, 'placeholder="Your address"', 'placeholder="Try “George Street” or “Bondi”"', 'home placeholder');
body = replaceOnce(body, '      <p class="intro-foot" id="home-signin-row">', `      <div class="sample">
        <button class="btn btn-block btn-lg" type="button" id="demo-sample">Try a sample group</button>
        <p class="footnote" style="margin:0 2px">Test version: central Sydney (Pyrmont to Bondi, North Sydney to Newtown) from OpenStreetMap, built into this page. Address search knows its streets, house numbers and places, and routes follow real streets. There's no public transport, ratings or photos here. Everything stays in this browser.</p>
      </div>
      <p class="intro-foot" id="home-signin-row">`, 'sign-in row');

// ---- styles
const tokens = (t) => Object.entries(t).map(([k, v]) => `--map-${k}: ${v};`).join(' ');
// A quiet palette in the spirit of Apple Maps: pale land, white streets, soft greens and blues.
const light = tokens({ sand: '#f4ead0', path: '#d9d4c9', forest: '#dfeed6', motorway: '#fbd38d', 'motorway-casing': '#f0bb6a', land: '#f7f6f2', park: '#d6ecc9', water: '#b4dcf7', road: '#ffffff', casing: '#ebe8e1', major: '#fdf0c4', 'major-casing': '#f0dc9c', label: '#8a8a8e', halo: 'rgba(255,255,255,.95)', 'park-label': '#4f8a48', 'water-label': '#4b88bf' });
const dark = tokens({ sand: '#3b3628', path: '#3d3e42', forest: '#1d2620', motorway: '#6a5232', 'motorway-casing': '#4f3d25', land: '#1f2023', park: '#203024', water: '#152a3d', road: '#36373b', casing: '#28292c', major: '#4f4a3a', 'major-casing': '#3c382c', label: '#98989d', halo: 'rgba(20,20,22,.9)', 'park-label': '#79b378', 'water-label': '#6aa5d9' });
const css = `${read('node_modules/leaflet/dist/leaflet.css')}\n${read('public/css/styles.css')}
:root { ${light} }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { ${dark} } }
:root[data-theme="dark"] { ${dark} }
#map { background: var(--map-water); }
.map-label { pointer-events: none; }
.map-label span { position: absolute; display: block; white-space: nowrap; font: 600 11px/1 var(--font); letter-spacing: 0; color: var(--map-label);
  text-shadow: 0 0 2px var(--map-halo), 0 0 2px var(--map-halo), 0 0 4px var(--map-halo); }
.map-label.hood span { font: 700 12px/1 var(--font-display); letter-spacing: 0.14em; text-transform: uppercase; opacity: 0.8; }
.map-label.park span { color: var(--map-park-label); font-size: 11.5px; }
.map-label.water span { color: var(--map-water-label); font-style: italic; font-size: 12.5px; letter-spacing: 0.02em; }
.map-label.street span { font-weight: 500; font-size: 10.5px; }
.map-label.city span { font: 700 17px/1 var(--font-display); letter-spacing: -0.01em; color: var(--text); }
.map-label.town span { font: 700 14px/1 var(--font-display); letter-spacing: -0.01em; color: var(--text); opacity: 0.85; }
.map-label.village span { font: 600 12px/1 var(--font); color: var(--map-label); }
.map-label.forest span { color: var(--map-park-label); font-style: italic; font-size: 11.5px; opacity: 0.85; }
.map-label.bay span { color: var(--map-water-label); font-style: italic; font-size: 14px; letter-spacing: 0.04em; }
`.replace(/url\(images\/[^)]+\)/g, 'none');

// ---- scripts
const modules = [
  ['geo', 'public/js/geo.js'],
  ['graph', 'public/js/graph.js'],
  ['meetpoint', 'public/js/meetpoint.js'],
  ['flood', 'public/js/flood.js'],
  ['pois', 'public/js/pois.js'],
  ['anchor', 'public/js/anchor.js'],
  ['hours', 'public/js/hours.js'],
  ['rated', 'public/js/rated.js'],
  ['share', 'public/js/share.js'],
  ['directions', 'public/js/directions.js'],
  ['sydney-data', 'scripts/sydney/sydney-data.js'],
  ['demo', 'public/js/demo.js'],
  ['guest', 'public/js/guest.js'],
];
let js = 'const __m = {};\n';
for (const [name, file] of modules) js += wrapModule(name, read(file));
js += `// ---- test-mode wiring: local stand-ins for the server and map services
(() => {
  const d = __m.demo;
  __m.remote = { remote: d.api };
  __m.geocode = { searchAddress: d.searchAddress, reverseGeocode: d.reverseGeocode, currentPosition: d.currentPosition };
  __m.rated = { ...__m.rated, ...d.rated };
  __m.pois = { ...__m.pois, findPois: d.findPois };
  __m.directions = { ...__m.directions, getDirections: d.directions, getTravelTimes: d.travelTimes };
  __m.roads = { loadRoads: d.roads };
})();
`;
js += wrapModule('api', read('public/js/api.js'));
js += wrapModule('app', app);
js += `// Unpack Sydney just after the page first appears, so it's ready when needed.
setTimeout(() => __m.demo.warm(), 120);
document.getElementById('demo-sample').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  btn.disabled = true;
  try {
    const { api, onUser } = window.__meet;
    const g = __m.demo.sampleGroup();
    await api.updateMe({ home: g.home });
    for (const f of g.friends) await api.addPlace(f);
    onUser((await api.me()).user);
  } finally { btn.disabled = false; }
});
`;
if (js.includes('</script')) throw new Error('build-test: script contains </script');

const out = `<title>Meet</title>
<meta name="description" content="Find a fair place to meet: the streets flood out from every friend's address and meet in the middle.">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">
<style>
${css}
</style>
${body.trim()}
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js"></script>
<script>
${js}
</script>
`;
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.rmSync(path.join(root, 'dist', 'midway-test.html'), { force: true });
fs.writeFileSync(path.join(root, 'dist', 'meet-test.html'), out);
console.log(`dist/meet-test.html written (${(out.length / 1024).toFixed(0)} KB)`);
