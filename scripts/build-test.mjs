// Builds dist/midway-test.html: a single self-contained page that runs the
// real Midway app code in a generated town, with no server and no network
// access besides one CDN script (Leaflet). Run: node scripts/build-test.mjs
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
app = replaceOnce(app, "map = L.map('map', { zoomControl: false, worldCopyJump: true, preferCanvas: false });",
  "map = L.map('map', { zoomControl: false, zoomAnimation: false, minZoom: 12, maxZoom: 18, maxBounds: __m.demo.bounds, maxBoundsViscosity: 0.9 });", 'map init');
app = app.replace(/ {2}L\.tileLayer\([\s\S]*?\}\)\.addTo\(map\);\n/, '  __m.demo.addBasemap(map);\n  map.attributionControl.setPrefix(false).addAttribution(\'Test town: Port Verity (made up)\');\n');
if (app.includes('tile.openstreetmap.org')) throw new Error('build-test: tile layer not replaced');
app = replaceOnce(app, `      <a class="btn btn-ghost" href="\${links.googleDirections}" target="_blank" rel="noopener">🧭 Directions</a>\n`, '', 'directions link');
app = replaceOnce(app, `      <a class="btn btn-ghost" href="\${links.osm}" target="_blank" rel="noopener">🗺 View on map</a>\n`, '', 'osm link');
app = replaceOnce(app, `      <a class="share-btn" href="\${links.google}" target="_blank" rel="noopener"><span class="ico">🗺</span>Google Maps</a>\n`, '', 'google maps share');
app = replaceOnce(app, `      <a class="share-btn" href="\${links.apple}" target="_blank" rel="noopener"><span class="ico">🍎</span>Apple Maps</a>\n`, '', 'apple maps share');
app = app.replace(/ {6}<button class="share-btn" data-action="calendar">.*\n/, '');
app = app.replaceAll('📍 Use my current location', '🎲 Pick a random address for me');
app = replaceOnce(app, '\nboot();\n', '\nwindow.__midway = { onSignedIn };\nboot();\n', 'boot call');

// ---- page markup
let html = read('public/index.html');
let body = html.slice(html.indexOf('<body>') + 6, html.indexOf('<script src="/vendor/leaflet/leaflet.js">'));
body = body.replaceAll('📍 Use my current location', '🎲 Pick a random address for me');
body = replaceOnce(body, '    </form>\n', `    </form>
      <div class="demo-cta">
        <div class="divider"><span>or</span></div>
        <button class="btn btn-ghost btn-block" type="button" id="demo-login">👥 Try it with a sample group</button>
        <p class="muted small">Test version. Port Verity is a made-up town, and anything you save stays in this browser.</p>
      </div>
`, 'auth form end');
body = replaceOnce(body, 'placeholder="Start typing your address…"', 'placeholder="Try “Hazel Street” or “12 Maple”"', 'home placeholder');

// ---- styles
const css = `${read('node_modules/leaflet/dist/leaflet.css')}\n${read('public/css/styles.css')}
:root { --map-land: #eef0f4; --map-park: #cfe8c9; --map-water: #a9cdf0; --map-road: #ffffff; --map-casing: #d5d8e3; --map-major: #ffe7a8; --map-label: #5d6380; --map-halo: rgba(255,255,255,.85); }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --map-land: #1a1d2e; --map-park: #1f3a2c; --map-water: #1d3557; --map-road: #33384f; --map-casing: #23273a; --map-major: #5a5030; --map-label: #9aa0bd; --map-halo: rgba(15,17,32,.85); } }
:root[data-theme="dark"] { --map-land: #1a1d2e; --map-park: #1f3a2c; --map-water: #1d3557; --map-road: #33384f; --map-casing: #23273a; --map-major: #5a5030; --map-label: #9aa0bd; --map-halo: rgba(15,17,32,.85); }
.basemap-canvas { position: absolute; inset: 0; z-index: 0; pointer-events: none; }
#map { background: var(--map-land); }
.demo-cta { margin-top: 14px; display: grid; gap: 4px; text-align: center; }
.demo-cta .btn-block { margin-top: 0; }
.divider { display: flex; align-items: center; gap: 10px; color: var(--muted); font-size: 12px; margin-bottom: 8px; }
.divider::before, .divider::after { content: ""; flex: 1; height: 1px; background: var(--border); }
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
];
let js = 'const __m = {};\n';
for (const [name, file] of modules) js += wrapModule(name, read(file));
js += `// ---- test-mode wiring
(() => {
  const d = __m.demo;
  __m.api = { api: d.api };
  __m.geocode = { searchAddress: d.searchAddress, reverseGeocode: d.reverseGeocode, currentPosition: d.currentPosition };
  __m.network = { ...__m.network, loadNetwork: d.loadNetwork };
  __m.pois = { ...__m.pois, findPois: d.findPois };
  const baseText = __m.share.shareText;
  __m.share = { ...__m.share, shareText: (p, o) => baseText(p, o).split('\\n').filter((l) => !l.startsWith('https://')).join('\\n') };
})();
`;
js += wrapModule('app', app);
js += `document.getElementById('demo-login').addEventListener('click', async (e) => {
  e.currentTarget.disabled = true;
  try { const { user } = await __m.demo.sampleLogin(); window.__midway.onSignedIn(user); }
  finally { e.currentTarget.disabled = false; }
});
`;
if (js.includes('</script')) throw new Error('build-test: script contains </script');

const out = `<title>Midway</title>
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
fs.writeFileSync(path.join(root, 'dist', 'midway-test.html'), out);
console.log(`dist/midway-test.html written (${(out.length / 1024).toFixed(0)} KB)`);
