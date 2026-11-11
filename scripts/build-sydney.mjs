// Builds scripts/sydney/sydney-data.js: central Sydney for the offline test
// version, from OpenFreeMap's vector tiles (OpenMapTiles schema, data
// © OpenStreetMap contributors, ODbL).
//
//   node scripts/build-sydney.mjs [tile cache folder]
//
// Downloads about 50 tiles once (≈8 MB, cached), then extracts:
//   • the street network (with road types, bridges and tunnels) as a graph
//   • water, parks, woods and beaches as polygons for drawing
//   • suburb, water and park names for labels
//   • places (restaurants, cafés, pubs, museums…) and house-number addresses
// and packs them into a few compact strings.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VectorTile } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cacheDir = process.argv[2] || path.join(root, '.cache', 'sydney-tiles');
const outFile = path.join(root, 'scripts', 'sydney', 'sydney-data.js');

// Central Sydney: Pyrmont and Glebe to Bondi, North Sydney and Mosman to Newtown.
const BOX = { w: 151.150, e: 151.290, s: -33.930, n: -33.820 };
const Z = 14, N = 2 ** Z;
const Q = 1e5; // coordinates kept to 1e-5 degrees (about a metre)

// ---------------------------------------------------------------- tiles

const tx = (lon) => Math.floor(((lon + 180) / 360) * N);
const ty = (lat) => { const r = (lat * Math.PI) / 180; return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * N); };

async function tiles() {
  fs.mkdirSync(cacheDir, { recursive: true });
  const list = [];
  for (let x = tx(BOX.w); x <= tx(BOX.e); x++) for (let y = ty(BOX.n); y <= ty(BOX.s); y++) list.push([x, y]);
  let tmpl = null;
  for (const [x, y] of list) {
    const f = path.join(cacheDir, `${x}-${y}.pbf`);
    if (fs.existsSync(f)) continue;
    tmpl ||= (await (await fetch('https://tiles.openfreemap.org/planet')).json()).tiles[0];
    const res = await fetch(tmpl.replace('{z}', Z).replace('{x}', x).replace('{y}', y), { headers: { 'User-Agent': 'Meet test-version builder' } });
    if (!res.ok) throw new Error(`tile ${x},${y}: ${res.status}`);
    fs.writeFileSync(f, Buffer.from(await res.arrayBuffer()));
  }
  return list.map(([x, y]) => ({ x, y, tile: new VectorTile(new PbfReader(fs.readFileSync(path.join(cacheDir, `${x}-${y}.pbf`)))) }));
}

const features = function* (t, layerName) {
  const layer = t.tile.layers[layerName];
  if (!layer) return;
  for (let i = 0; i < layer.length; i++) {
    const f = layer.feature(i);
    yield { props: f.properties, geo: f.toGeoJSON(t.x, t.y, Z).geometry };
  }
};
const linesOf = (g) => (g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : []);
const polysOf = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []);
const pointsOf = (g) => (g.type === 'Point' ? [g.coordinates] : g.type === 'MultiPoint' ? g.coordinates : []);
const inBox = ([lon, lat], pad = 0.004) => lon >= BOX.w - pad && lon <= BOX.e + pad && lat >= BOX.s - pad && lat <= BOX.n + pad;
const q = (v) => Math.round(v * Q);

// ---------------------------------------------------------------- packing

/** Integers → zigzag varints → base64. */
function packInts(ints) {
  const bytes = [];
  for (const v of ints) {
    let z = v >= 0 ? v * 2 : -v * 2 - 1;
    while (z >= 128) { bytes.push((z % 128) | 128); z = Math.floor(z / 128); }
    bytes.push(z);
  }
  return Buffer.from(bytes).toString('base64');
}
/** Rings of [lon, lat] → { counts: [points per ring], data: packed deltas of lat,lon×1e5 }. */
function packRings(rings) {
  const ints = [];
  const counts = [];
  let plat = 0, plon = 0;
  for (const ring of rings) {
    counts.push(ring.length);
    for (const [lon, lat] of ring) {
      const a = q(lat), b = q(lon);
      ints.push(a - plat, b - plon);
      plat = a; plon = b;
    }
  }
  return { counts: packInts(counts), data: packInts(ints) };
}

// ---------------------------------------------------------------- roads

const ROAD = { motorway: 0, trunk: 1, primary: 2, secondary: 3, tertiary: 4, minor: 5, service: 6, path: 7, track: 7, pier: 7 };
const BRIDGE = 8, TUNNEL = 16;

function buildRoads(all) {
  const splitOf = new Map(); // a street segment split in two or more → its parts
  const nodeId = new Map();
  const lat = [], lon = [];
  const node = ([x, y]) => {
    const key = `${q(y)},${q(x)}`;
    let i = nodeId.get(key);
    if (i === undefined) { i = lat.length; nodeId.set(key, i); lat.push(q(y)); lon.push(q(x)); }
    return i;
  };
  const edges = new Map(); // "a,b" (a<b) → kind byte
  for (const t of all) {
    for (const { props, geo } of features(t, 'transportation')) {
      const k = ROAD[props.class];
      if (k === undefined) continue;
      const flags = (props.brunnel === 'bridge' ? BRIDGE : 0) | (props.brunnel === 'tunnel' ? TUNNEL : 0);
      for (const line of linesOf(geo)) {
        if (!line.some((p) => inBox(p))) continue;
        let prev = -1;
        for (const p of line) {
          const i = node(p);
          if (prev >= 0 && prev !== i) {
            const key = prev < i ? `${prev},${i}` : `${i},${prev}`;
            const old = edges.get(key);
            // Keep the more important road type if two lines overlap.
            if (old === undefined || (k | flags) < old) edges.set(key, k | flags);
          }
          prev = i;
        }
      }
    }
  }
  // Streets crossing a tile edge are cut in each tile a little past the edge;
  // where no corner of the street falls in that overlap the two halves don't
  // share a point. Each loose end that lies on the same kind of street a
  // metre away is joined into it, splitting that street segment there.
  {
    const deg = new Int32Array(lat.length);
    for (const key of edges.keys()) { const [a, b] = key.split(',').map(Number); deg[a]++; deg[b]++; }
    const CELL = 300; // 1e-5 degree units: about 30 m
    const grid = new Map();
    const cellsOf = (a, b) => {
      const out = [];
      for (let x = Math.floor(Math.min(lon[a], lon[b]) / CELL); x <= Math.floor(Math.max(lon[a], lon[b]) / CELL); x++) {
        for (let y = Math.floor(Math.min(lat[a], lat[b]) / CELL); y <= Math.floor(Math.max(lat[a], lat[b]) / CELL); y++) out.push(`${x},${y}`);
      }
      return out;
    };
    for (const key of edges.keys()) {
      const [a, b] = key.split(',').map(Number);
      for (const c of cellsOf(a, b)) { if (!grid.has(c)) grid.set(c, []); grid.get(c).push(key); }
    }
    const kx = Math.cos((-33.87 * Math.PI) / 180) * 1.1132, ky = 1.1132; // metres per 1e-5 degree
    let joined = 0;
    for (let n = 0; n < lat.length; n++) {
      if (deg[n] !== 1) continue;
      let best = null, bestD = 1.6;
      const cx = Math.floor(lon[n] / CELL), cy = Math.floor(lat[n] / CELL);
      for (let x = cx - 1; x <= cx + 1; x++) for (let y = cy - 1; y <= cy + 1; y++) {
        for (const key of grid.get(`${x},${y}`) || []) {
          if (!edges.has(key)) continue;
          const [a, b] = key.split(',').map(Number);
          if (a === n || b === n) continue;
          const ax = lon[a] * kx, ay = lat[a] * ky, dx = lon[b] * kx - ax, dy = lat[b] * ky - ay;
          const px = lon[n] * kx, py = lat[n] * ky, len2 = dx * dx + dy * dy;
          const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
          const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
          if (d < bestD) { bestD = d; best = key; }
        }
      }
      if (!best) continue;
      // The loose end's own street type must match (a bridge only joins the bridge).
      let own = null;
      for (const c of [`${Math.floor(lon[n] / CELL)},${Math.floor(lat[n] / CELL)}`]) {
        for (const key of grid.get(c) || []) { const [a, b] = key.split(',').map(Number); if ((a === n || b === n) && edges.has(key)) own = edges.get(key); }
      }
      const kind = edges.get(best);
      if (own !== null && (own & (BRIDGE | TUNNEL)) !== (kind & (BRIDGE | TUNNEL))) continue;
      const [a, b] = best.split(',').map(Number);
      edges.delete(best);
      const parts = [];
      for (const [u, v] of [[a, n], [n, b]]) {
        const key = u < v ? `${u},${v}` : `${v},${u}`;
        edges.set(key, kind);
        parts.push(key);
        for (const c of cellsOf(u, v)) { if (!grid.has(c)) grid.set(c, []); grid.get(c).push(key); }
      }
      splitOf.set(best, parts);
      deg[n] += 2;
      joined++;
    }
    console.log(`joined ${joined} street ends across tile edges`);
  }
  // Map tiles drop the corner where two streets cross when a street is straight
  // there, so the two don't connect and routes take long detours. Give every
  // crossing at street level a corner, and join a street or path that ends on
  // another (within a metre) into it. Bridges, tunnels and motorways only
  // connect at their ends.
  {
    const kx = Math.cos((-33.87 * Math.PI) / 180) * 1.1132, ky = 1.1132; // metres per 1e-5 degree
    const segs = [...edges].map(([key, kind]) => { const [a, b] = key.split(',').map(Number); return { key, a, b, kind, cuts: [] }; });
    const CELL = 300;
    const grid = new Map();
    segs.forEach((g, i) => {
      for (let x = Math.floor(Math.min(lon[g.a], lon[g.b]) / CELL); x <= Math.floor(Math.max(lon[g.a], lon[g.b]) / CELL); x++) {
        for (let y = Math.floor(Math.min(lat[g.a], lat[g.b]) / CELL); y <= Math.floor(Math.max(lat[g.a], lat[g.b]) / CELL); y++) {
          const c = `${x},${y}`;
          if (!grid.has(c)) grid.set(c, []);
          grid.get(c).push(i);
        }
      }
    });
    const P = (i) => [lon[i] * kx, lat[i] * ky];
    const EPS = 1e-6;
    // Where along g the corner n lies, if within a metre of g's middle part.
    const onto = (g, n) => {
      const [ax, ay] = P(g.a), [bx, by] = P(g.b), [px, py] = P(n);
      const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
      if (!len2) return null;
      const t = ((px - ax) * dx + (py - ay) * dy) / len2;
      if (t <= EPS || t >= 1 - EPS) return null;
      return Math.hypot(ax + t * dx - px, ay + t * dy - py) <= 1 ? t : null;
    };
    const apart = (k) => (k & (BRIDGE | TUNNEL)) || (k & 7) === 0;
    let crossings = 0, ends = 0;
    for (const [cell, list] of grid) {
      const [cx0, cy0] = cell.split(',').map(Number);
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const g = segs[list[i]], h = segs[list[j]];
          // Each pair once: in the cell where their boxes start to overlap.
          const ox = Math.max(Math.min(lon[g.a], lon[g.b]), Math.min(lon[h.a], lon[h.b]));
          const oy = Math.max(Math.min(lat[g.a], lat[g.b]), Math.min(lat[h.a], lat[h.b]));
          if (Math.floor(ox / CELL) !== cx0 || Math.floor(oy / CELL) !== cy0) continue;
          if (g.a === h.a || g.a === h.b || g.b === h.a || g.b === h.b) continue;
          // A bridge or tunnel joins only the same kind of crossing at its ends.
          if (((g.kind ^ h.kind) & (BRIDGE | TUNNEL)) === 0) {
            let joined = false;
            for (const [x, y] of [[g, h], [h, g]]) {
              for (const n of [y.a, y.b]) { const t = onto(x, n); if (t !== null) { x.cuts.push([t, n]); joined = true; ends++; } }
            }
            if (joined) continue;
          }
          if (apart(g.kind) || apart(h.kind)) continue;
          const [ax, ay] = P(g.a), [bx, by] = P(g.b), [cx, cy] = P(h.a), [dx, dy] = P(h.b);
          const d = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx);
          if (!d) continue;
          const t = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / d;
          const u = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / d;
          if (t <= EPS || t >= 1 - EPS || u <= EPS || u >= 1 - EPS) continue;
          const n = node([(lon[g.a] + t * (lon[g.b] - lon[g.a])) / Q, (lat[g.a] + t * (lat[g.b] - lat[g.a])) / Q]);
          g.cuts.push([t, n]);
          h.cuts.push([u, n]);
          crossings++;
        }
      }
    }
    for (const g of segs) {
      if (!g.cuts.length) continue;
      edges.delete(g.key);
      const parts = [];
      let prev = g.a;
      for (const [, n] of [...g.cuts.sort((p, r) => p[0] - r[0]), [1, g.b]]) {
        if (n === prev) continue;
        const key = prev < n ? `${prev},${n}` : `${n},${prev}`;
        const old = edges.get(key);
        if (old === undefined || g.kind < old) edges.set(key, g.kind);
        parts.push(key);
        prev = n;
      }
      splitOf.set(g.key, parts);
    }
    console.log(`joined ${crossings} street crossings and ${ends} streets ending on another`);
  }
  // Keep the largest connected network (drops lone footpaths inside buildings and the like).
  const parent = Int32Array.from({ length: lat.length }, (_, i) => i);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  for (const key of edges.keys()) { const [a, b] = key.split(',').map(Number); parent[find(a)] = find(b); }
  const size = new Map();
  for (let i = 0; i < lat.length; i++) { const r = find(i); size.set(r, (size.get(r) || 0) + 1); }
  const ranked = [...size.entries()].sort((a, b) => b[1] - a[1]);
  const main = ranked[0][0];
  if (process.env.DEBUG_SYDNEY) {
    const box = new Map();
    for (let i = 0; i < lat.length; i++) {
      const r = find(i);
      const b = box.get(r) || [Infinity, -Infinity, Infinity, -Infinity];
      box.set(r, [Math.min(b[0], lat[i] / Q), Math.max(b[1], lat[i] / Q), Math.min(b[2], lon[i] / Q), Math.max(b[3], lon[i] / Q)]);
    }
    for (const [r, n] of ranked.slice(0, 8)) console.log('component', n, box.get(r).map((v) => v.toFixed(4)).join(' '));
    console.log('components', ranked.length, 'singletons', ranked.filter(([, n]) => n <= 2).length);
  }
  const keep = new Int32Array(lat.length).fill(-1);
  const order = [];
  for (let i = 0; i < lat.length; i++) if (find(i) === main) order.push(i);
  // Number nodes along a coarse grid so neighbours get close numbers (smaller deltas).
  order.sort((i, j) => (Math.floor(lat[i] / 500) - Math.floor(lat[j] / 500)) || (lon[i] - lon[j]));
  order.forEach((i, n) => { keep[i] = n; });
  const E = [];
  for (const [key, kind] of edges) {
    const [a, b] = key.split(',').map(Number);
    if (keep[a] < 0) continue;
    const x = keep[a], y = keep[b];
    E.push(x < y ? [x, y, kind] : [y, x, kind]);
  }
  E.sort((p, r) => p[0] - r[0] || p[1] - r[1]);
  const nodes = [];
  let plat = 0, plon = 0;
  for (const i of order) { nodes.push(lat[i] - plat, lon[i] - plon); plat = lat[i]; plon = lon[i]; }
  const edgeInts = [];
  let pa = 0;
  for (const [a, b] of E) { edgeInts.push(a - pa, b - a); pa = a; }
  console.log(`roads: ${order.length} corners (of ${lat.length}), ${E.length} street segments`);
  return {
    packed: { nodes: packInts(nodes), edges: packInts(edgeInts), kinds: Buffer.from(E.map((e) => e[2])).toString('base64') },
    // For naming segments and addresses below.
    coord: (n) => [lat[order[n]] / Q, lon[order[n]] / Q],
    edgeList: E,
    nodeKey: (key) => { const i = nodeId.get(key); return i === undefined ? -1 : keep[i]; },
    // The segment between two original corners as it ended up: itself, or the parts it was split into.
    parts: (keyA, keyB) => {
      const a = nodeId.get(keyA), b = nodeId.get(keyB);
      if (a === undefined || b === undefined) return [];
      const out = [];
      const seen = new Set();
      const walk = (key) => {
        if (seen.has(key)) return;
        seen.add(key);
        if (splitOf.has(key) && !edges.has(key)) splitOf.get(key).forEach(walk); else out.push(key);
      };
      walk(a < b ? `${a},${b}` : `${b},${a}`);
      return out.map((key) => key.split(',').map((v) => keep[Number(v)])).filter(([x, y]) => x >= 0 && y >= 0);
    },
  };
}

// ---------------------------------------------------------------- street names

function nameStreets(all, roads) {
  const names = [];
  const nameIdx = new Map();
  const byPair = new Map();
  for (const t of all) {
    for (const { props, geo } of features(t, 'transportation_name')) {
      if (!props.name) continue;
      let id = nameIdx.get(props.name);
      if (id === undefined) { id = names.length + 1; names.push(props.name); nameIdx.set(props.name, id); }
      for (const line of linesOf(geo)) {
        let prev = null;
        for (const [x, y] of line) {
          const key = `${q(y)},${q(x)}`;
          if (prev) for (const [a, b] of roads.parts(prev, key)) byPair.set(a < b ? `${a},${b}` : `${b},${a}`, id);
          prev = key;
        }
      }
    }
  }
  const edgeNames = roads.edgeList.map(([a, b]) => byPair.get(`${a},${b}`) || 0);
  console.log(`street names: ${names.length}, named segments ${edgeNames.filter(Boolean).length}`);
  return { names, edgeNames };
}

// ---------------------------------------------------------------- areas

const ringArea = (ring) => {
  // Rough area in m² (shoelace on a local projection).
  const k = 111320 * Math.cos((-33.87 * Math.PI) / 180);
  let s = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) s += (ring[j][0] * k) * (ring[i][1] * 111320) - (ring[i][0] * k) * (ring[j][1] * 111320);
  return Math.abs(s / 2);
};

/** Douglas–Peucker on [lon, lat] rings, tolerance in metres. */
function simplifyRing(ring, tolM) {
  if (ring.length < 5) return ring;
  const k = 111320 * Math.cos((-33.87 * Math.PI) / 180);
  const P = ring.map(([lon, lat]) => [lon * k, lat * 111320]);
  const keep = new Uint8Array(ring.length);
  keep[0] = keep[ring.length - 1] = 1;
  const stack = [[0, ring.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = P[a], [bx, by] = P[b];
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
    let worst = -1, worstD = tolM * tolM;
    for (let i = a + 1; i < b; i++) {
      const t = len2 ? Math.max(0, Math.min(1, ((P[i][0] - ax) * dx + (P[i][1] - ay) * dy) / len2)) : 0;
      const ex = P[i][0] - (ax + t * dx), ey = P[i][1] - (ay + t * dy);
      const d = ex * ex + ey * ey;
      if (d > worstD) { worstD = d; worst = i; }
    }
    if (worst > 0) { keep[worst] = 1; stack.push([a, worst], [worst, b]); }
  }
  return ring.filter((_, i) => keep[i]);
}

function collectAreas(all, layer, pick, { minArea = 0, tol = 2 } = {}) {
  const out = [];
  for (const t of all) {
    for (const { props, geo } of features(t, layer)) {
      if (!pick(props)) continue;
      for (const poly of polysOf(geo)) {
        if (!poly[0].some((p) => inBox(p, 0.01))) continue;
        if (ringArea(poly[0]) < minArea) continue;
        out.push(poly.map((r) => simplifyRing(r, tol)).filter((r) => r.length >= 4));
      }
    }
  }
  return out;
}
/** Polygons (each a list of rings) → { polys: [rings per polygon], ...packRings }. */
function packPolys(polys) {
  return { polys: packInts(polys.map((p) => p.length)), ...packRings(polys.flat()) };
}

// ---------------------------------------------------------------- places of interest

// OpenMapTiles poi class/subclass → the OpenStreetMap tag Meet sorts by.
const AMENITY = new Set(['restaurant', 'fast_food', 'food_court', 'cafe', 'bar', 'pub', 'biergarten', 'ice_cream', 'cinema', 'nightclub', 'theatre', 'arts_centre', 'library', 'marketplace', 'community_centre', 'karaoke_box', 'bowling_alley']);
const LEISURE = new Set(['park', 'garden', 'playground', 'nature_reserve', 'escape_game', 'amusement_arcade', 'miniature_golf', 'sports_centre', 'fitness_centre', 'ice_rink', 'water_park', 'trampoline_park', 'bowling_alley']);
const TOURISM = new Set(['museum', 'gallery', 'attraction', 'zoo', 'aquarium', 'theme_park', 'viewpoint', 'picnic_site']);
const SHOP = new Set(['mall', 'department_store', 'books', 'bakery', 'pastry', 'games', 'video_games', 'toys', 'music', 'musical_instrument', 'gift', 'clothes', 'shoes', 'coffee', 'tea', 'ice_cream', 'supermarket']);

function tagFor(p) {
  const v = p.subclass || p.class;
  if (p.class === 'beer' || v === 'pub') return ['amenity', 'pub'];
  if (TOURISM.has(v) && !(p.class === 'art_gallery' && v === 'artwork')) return ['tourism', v];
  if (AMENITY.has(v)) return ['amenity', v];
  if (LEISURE.has(v)) return ['leisure', v];
  if (SHOP.has(v)) return ['shop', v];
  return null;
}

function collectPois(all) {
  const seen = new Set();
  const out = [];
  for (const t of all) {
    for (const { props, geo } of features(t, 'poi')) {
      if (!props.name) continue;
      const tag = tagFor(props);
      if (!tag) continue;
      for (const [lon, lat] of pointsOf(geo)) {
        if (!inBox([lon, lat], 0)) continue;
        const key = `${props.name}|${q(lat) >> 4}|${q(lon) >> 4}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push([props.name, tag[0], tag[1], q(lat), q(lon)]);
      }
    }
  }
  out.sort((a, b) => a[3] - b[3] || a[4] - b[4]);
  let plat = 0, plon = 0;
  const packed = out.map(([name, k, v, la, lo]) => { const r = [name, k[0], v, la - plat, lo - plon]; plat = la; plon = lo; return r; });
  console.log(`places: ${out.length}`);
  return packed;
}

// ---------------------------------------------------------------- labels and addresses

function collectLabels(all) {
  const seen = new Set();
  const places = [], water = [];
  for (const t of all) {
    for (const { props, geo } of features(t, 'place')) {
      if (!props.name || !['city', 'town', 'suburb', 'quarter', 'neighbourhood'].includes(props.class)) continue;
      for (const [lon, lat] of pointsOf(geo)) {
        if (!inBox([lon, lat], 0) || seen.has(`p${props.name}`)) continue;
        seen.add(`p${props.name}`);
        places.push([props.name, props.class === 'city' ? 'city' : props.class === 'neighbourhood' ? 'hood' : 'suburb', q(lat), q(lon)]);
      }
    }
    for (const { props, geo } of features(t, 'water_name')) {
      if (!props.name) continue;
      // Bays, coves and the harbour get labels; fountains, pools and ponds don't.
      const big = ['ocean', 'sea', 'bay', 'strait'].includes(props.class);
      if (!big && /fountain|pool|pond|splash|baths|cooling|reflect|basin|wetland/i.test(props.name)) continue;
      const pts = geo.type === 'Point' || geo.type === 'MultiPoint' ? pointsOf(geo) : linesOf(geo).map((l) => l[Math.floor(l.length / 2)]);
      for (const [lon, lat] of pts) {
        if (!inBox([lon, lat], 0) || seen.has(`w${props.name}`)) continue;
        seen.add(`w${props.name}`);
        water.push([props.name, q(lat), q(lon), big ? 1 : 0]);
      }
    }
  }
  console.log(`labels: ${places.length} suburbs and areas, ${water.length} water names`);
  return { places, water };
}

/** House numbers on the nearest named street (within 60 m). */
function collectAddresses(all, roads, streets) {
  // Grid of named segments for nearest-street lookups.
  const CELL = 0.001;
  const grid = new Map();
  roads.edgeList.forEach(([a, b], e) => {
    if (!streets.edgeNames[e]) return;
    const [la, lo] = roads.coord(a), [lb, lob] = roads.coord(b);
    for (let gx = Math.floor(Math.min(lo, lob) / CELL); gx <= Math.floor(Math.max(lo, lob) / CELL); gx++) {
      for (let gy = Math.floor(Math.min(la, lb) / CELL); gy <= Math.floor(Math.max(la, lb) / CELL); gy++) {
        const k = `${gx},${gy}`;
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(e);
      }
    }
  });
  const kx = 111320 * Math.cos((-33.87 * Math.PI) / 180), ky = 111320;
  const nearestStreet = (lat, lon) => {
    let best = 0, bestD = 60;
    const gx = Math.floor(lon / CELL), gy = Math.floor(lat / CELL);
    for (let x = gx - 1; x <= gx + 1; x++) for (let y = gy - 1; y <= gy + 1; y++) {
      for (const e of grid.get(`${x},${y}`) || []) {
        const [a, b] = roads.edgeList[e];
        const [la, lo] = roads.coord(a), [lb, lob] = roads.coord(b);
        const ax = lo * kx, ay = la * ky, dx = lob * kx - ax, dy = lb * ky - ay, px = lon * kx, py = lat * ky;
        const len2 = dx * dx + dy * dy;
        const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
        const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
        if (d < bestD) { bestD = d; best = streets.edgeNames[e]; }
      }
    }
    return best;
  };
  const seen = new Set();
  const out = [];
  for (const t of all) {
    for (const { props, geo } of features(t, 'housenumber')) {
      const num = String(props.housenumber || '').trim();
      if (!/^\d+[A-Za-z]?$/.test(num)) continue;
      for (const [lon, lat] of pointsOf(geo)) {
        if (!inBox([lon, lat], 0)) continue;
        const street = nearestStreet(lat, lon);
        if (!street) continue;
        const key = `${num}|${street}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push([num, street, q(lat), q(lon)]);
      }
    }
  }
  out.sort((a, b) => a[2] - b[2] || a[3] - b[3]);
  let plat = 0, plon = 0;
  const packed = out.map(([num, street, la, lo]) => { const r = [num, street, la - plat, lo - plon]; plat = la; plon = lo; return r; });
  console.log(`addresses: ${out.length}`);
  return packed;
}

// ---------------------------------------------------------------- main

const all = await tiles();
const roads = buildRoads(all);
const streets = nameStreets(all, roads);
const water = collectAreas(all, 'water', (p) => p.class !== 'swimming_pool', { minArea: 400, tol: 3 });
const green = collectAreas(all, 'landcover', (p) => p.class === 'grass' || p.class === 'wood', { minArea: 2500, tol: 3 })
  .concat(collectAreas(all, 'park', () => true, { minArea: 2500, tol: 3 }));
const sand = collectAreas(all, 'landcover', (p) => p.class === 'sand', { minArea: 800, tol: 2 });
console.log(`areas: ${water.length} water, ${green.length} green, ${sand.length} sand`);
const data = {
  source: 'OpenFreeMap © OpenMapTiles, data © OpenStreetMap contributors (ODbL)',
  box: BOX,
  roads: roads.packed,
  names: streets.names,
  edgeNames: packInts(streets.edgeNames),
  water: packPolys(water),
  green: packPolys(green),
  sand: packPolys(sand),
  labels: collectLabels(all),
  pois: collectPois(all),
  addresses: collectAddresses(all, roads, streets),
};
fs.mkdirSync(path.dirname(outFile), { recursive: true });
const js = `// Central Sydney for the offline test version. Generated by scripts/build-sydney.mjs: do not edit.\n// ${data.source}\nexport const SYDNEY = ${JSON.stringify(data)};\n`;
fs.writeFileSync(outFile, js);
console.log(`${path.relative(root, outFile)} written (${(js.length / 1e6).toFixed(2)} MB)`);
