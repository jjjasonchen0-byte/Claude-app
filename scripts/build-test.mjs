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

// ---- app tweaks for the test town
let app = read('public/js/app.js');
app = replaceOnce(app, "map = L.map('map', { zoomControl: false, worldCopyJump: true });",
  "map = L.map('map', { zoomControl: false, zoomSnap: 0.25, zoomDelta: 0.5, wheelPxPerZoomLevel: 80, minZoom: 11, maxZoom: 18, maxBounds: __m.demo.bounds, maxBoundsViscosity: 0.8 });", 'map init');
app = app.replace(/ {2}L\.tileLayer\([\s\S]*?\}\)\.addTo\(map\);\n/, '  __m.demo.addBasemap(map);\n');
if (app.includes('tile.openstreetmap.org')) throw new Error('build-test: tile layer not replaced');
app = replaceOnce(app, 'map.attributionControl.setPrefix(false);', "map.attributionControl.setPrefix(false).addAttribution('Port Verity is a made-up test town');", 'attribution');
// The town is fictional, so links to real map apps and calendar files are left out.
for (const [from, label] of [
  ['      <a class="btn btn-tinted" href="${links.googleDirections}" target="_blank" rel="noopener">Directions</a>\n', 'directions link'],
  ['      <a class="btn btn-tinted" href="${links.osm}" target="_blank" rel="noopener">Open in maps</a>\n', 'open in maps link'],
  ['      <button class="btn btn-tinted" data-action="calendar">Calendar</button>\n', 'calendar button'],
  ['      <a class="btn btn-tinted" href="${links.google}" target="_blank" rel="noopener">Google Maps</a>\n', 'google maps button'],
  ['      <a class="btn btn-tinted" href="${links.apple}" target="_blank" rel="noopener">Apple Maps</a>\n', 'apple maps button'],
]) app = replaceOnce(app, from, '', label);

// ---- page markup
const html = read('public/index.html');
let body = html.slice(html.indexOf('<body>') + 6, html.indexOf('<script src="/vendor/leaflet/leaflet.js">'));
body = replaceOnce(body, 'Use my current location', 'Pick a random address', 'locate label');
body = replaceOnce(body, 'placeholder="Your address"', 'placeholder="Try “Hazel Street” or “12 Maple”"', 'home placeholder');
body = replaceOnce(body, '      <p class="intro-foot" id="home-signin-row">', `      <div class="sample">
        <button class="btn btn-block btn-lg" type="button" id="demo-sample">Try a sample group</button>
        <p class="footnote" style="margin:0 2px">Test version. Port Verity is a made-up town of about 22 × 16 km, so address search only knows its streets. Everything stays in this browser.</p>
      </div>
      <p class="intro-foot" id="home-signin-row">`, 'sign-in row');

// ---- styles
const tokens = (t) => Object.entries(t).map(([k, v]) => `--map-${k}: ${v};`).join(' ');
const light = tokens({ land: '#f6f4ef', park: '#cfe8bf', water: '#a8d4f5', road: '#ffffff', casing: '#e3ded4', major: '#ffe28a', 'major-casing': '#efc65a', label: '#6e6e73', halo: 'rgba(255,255,255,.92)', 'park-label': '#3c7a35', 'water-label': '#3b7bb5' });
const dark = tokens({ land: '#1e1f22', park: '#1f3324', water: '#13304a', road: '#3a3b3f', casing: '#26272a', major: '#6b5a2a', 'major-casing': '#4c4121', label: '#aeaeb2', halo: 'rgba(20,20,22,.9)', 'park-label': '#7cc47a', 'water-label': '#6fb1ea' });
const css = `${read('node_modules/leaflet/dist/leaflet.css')}\n${read('public/css/styles.css')}
:root { ${light} }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { ${dark} } }
:root[data-theme="dark"] { ${dark} }
#map { background: var(--map-land); }
.map-label { pointer-events: none; }
.map-label span { position: absolute; display: block; white-space: nowrap; font: 600 11px/1 var(--font); letter-spacing: 0; color: var(--map-label);
  text-shadow: 0 0 2px var(--map-halo), 0 0 2px var(--map-halo), 0 0 4px var(--map-halo); }
.map-label.hood span { font: 700 12px/1 var(--font-display); letter-spacing: 0.14em; text-transform: uppercase; opacity: 0.8; }
.map-label.park span { color: var(--map-park-label); font-size: 11.5px; }
.map-label.water span { color: var(--map-water-label); font-style: italic; font-size: 12.5px; letter-spacing: 0.02em; }
.map-label.street span { font-weight: 500; font-size: 10.5px; }
.map-label.town span { font: 700 17px/1 var(--font-display); letter-spacing: -0.01em; color: var(--text); }
.map-label.bay span { color: var(--map-water-label); font-style: italic; font-size: 14px; letter-spacing: 0.04em; }
`.replace(/url\(images\/[^)]+\)/g, 'none');

// ---- scripts
const modules = [
  ['geo', 'public/js/geo.js'],
  ['network', 'public/js/network.js'],
  ['meet', 'public/js/meet.js'],
  ['growth', 'public/js/growth.js'],
  ['pois', 'public/js/pois.js'],
  ['share', 'public/js/share.js'],
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
  __m.network = { ...__m.network, loadNetwork: d.loadNetwork };
  __m.pois = { ...__m.pois, findPois: d.findPois };
  const baseText = __m.share.shareText;
  __m.share = { ...__m.share, shareText: (p, o) => baseText(p, o).split('\\n').filter((l) => !l.startsWith('https://')).join('\\n') };
})();
`;
js += wrapModule('api', read('public/js/api.js'));
js += wrapModule('app', app);
js += `document.getElementById('demo-sample').addEventListener('click', async (e) => {
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
<meta name="description" content="Find a fair place to meet: routes grow from every friend's address and meet in the middle.">
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
