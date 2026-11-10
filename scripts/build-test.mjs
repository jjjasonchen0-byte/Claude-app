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
  "map = L.map('map', { zoomControl: false, zoomAnimation: false, zoomSnap: 0.25, minZoom: 12, maxZoom: 18, maxBounds: __m.demo.bounds, maxBoundsViscosity: 0.9 });", 'map init');
app = app.replace(/ {2}L\.tileLayer\([\s\S]*?\}\)\.addTo\(map\);\n/, '  __m.demo.addBasemap(map);\n');
if (app.includes('tile.openstreetmap.org')) throw new Error('build-test: tile layer not replaced');
app = replaceOnce(app, 'map.attributionControl.setPrefix(false);', "map.attributionControl.setPrefix(false).addAttribution('Port Verity is a made-up test town');", 'attribution');
// The town is fictional, so links to real map apps and calendar files are left out.
for (const [from, label] of [
  ['      <a class="btn-text" href="${links.googleDirections}" target="_blank" rel="noopener">Directions</a>\n', 'directions link'],
  ['      <a class="btn-text" href="${links.osm}" target="_blank" rel="noopener">Open in maps</a>\n', 'open in maps link'],
  ['      <button class="btn" data-action="calendar">Calendar</button>\n', 'calendar button'],
  ['      <a class="btn" href="${links.google}" target="_blank" rel="noopener">Google Maps</a>\n', 'google maps button'],
  ['      <a class="btn" href="${links.apple}" target="_blank" rel="noopener">Apple Maps</a>\n', 'apple maps button'],
]) app = replaceOnce(app, from, '', label);

// ---- page markup
const html = read('public/index.html');
let body = html.slice(html.indexOf('<body>') + 6, html.indexOf('<script src="/vendor/leaflet/leaflet.js">'));
body = replaceOnce(body, 'Use my current location', 'Pick a random address', 'locate label');
body = replaceOnce(body, 'placeholder="Your address"', 'placeholder="Try “Hazel Street” or “12 Maple”"', 'home placeholder');
body = replaceOnce(body, '      <p class="intro-foot muted small" id="home-signin-row">', `      <div class="sample">
        <button class="btn btn-block" type="button" id="demo-sample">Try a sample group</button>
        <p class="muted small">Test version. Port Verity is a made-up town, so address search only knows its streets. Everything stays in this browser.</p>
      </div>
      <p class="intro-foot muted small" id="home-signin-row">`, 'sign-in row');

// ---- styles
const tokens = (land, park, water, road, casing, major, label, halo) =>
  `--map-land: ${land}; --map-park: ${park}; --map-water: ${water}; --map-road: ${road}; --map-casing: ${casing}; --map-major: ${major}; --map-label: ${label}; --map-halo: ${halo};`;
const light = tokens('#f3f3f0', '#e1eadb', '#d3e0ea', '#ffffff', '#e4e4df', '#ffffff', '#8a8a84', 'rgba(255,255,255,.9)');
const dark = tokens('#161616', '#1c241d', '#18222c', '#262626', '#1d1d1d', '#333333', '#7d7d78', 'rgba(15,15,15,.9)');
const css = `${read('node_modules/leaflet/dist/leaflet.css')}\n${read('public/css/styles.css')}
:root { ${light} }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { ${dark} } }
:root[data-theme="dark"] { ${dark} }
.basemap-canvas { position: absolute; inset: 0; z-index: 0; pointer-events: none; }
#map { background: var(--map-land); }
.sample { margin-top: 28px; padding-top: 20px; border-top: 1px solid var(--line); display: grid; gap: 8px; }
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
