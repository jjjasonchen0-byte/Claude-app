// Self-contained test mode for Meet: central Sydney, built into the page.
//
// Replaces everything that needs the internet or a server with local
// stand-ins, so the real app code can run inside a sandboxed page:
//   • central Sydney's streets, water, parks and beaches (OpenStreetMap data
//     via OpenFreeMap's vector tiles; see scripts/build-sydney.mjs), drawn as
//     the base map and used for walking, cycling and driving routes
//   • address search and reverse geocoding over its house numbers, streets,
//     suburbs and places
//   • about 6,400 real places: restaurants, cafés, pubs, museums, parks…
//   • accounts, addresses and history kept in this browser's storage
// There are no ratings, photos, reviews or opening hours: these are real
// businesses, and the test version doesn't make any up.
import { SYDNEY } from './sydney-data.js';
import { fromEdgeList, dijkstra } from './graph.js';
import { parsePois } from './pois.js';
import { haversine } from './geo.js';

const BRIDGE = 8, TUNNEL = 16; // flags on a street's kind (0 motorway … 7 footpath)
const CENTER = { lat: -33.8688, lon: 151.2093 };

// Which kinds of street each way of travelling may use.
const table = (ok) => Uint8Array.from({ length: 256 }, (_, k) => (ok(k & 7, k) ? 1 : 0));
const ALLOWED = {
  walk: table((c, k) => c !== 0 && !(k & TUNNEL)),
  bike: table((c, k) => c !== 0 && !(k & TUNNEL)),
  drive: table((c) => c !== 7),
};
const access = (mode) => (mode === 'drive' ? 2 : 1);

// ---------------------------------------------------------------- unpacking

/** base64 of zigzag varints → integers (see packInts in scripts/build-sydney.mjs). */
function unpackInts(b64) {
  const bin = atob(b64);
  const out = [];
  let v = 0, shift = 1;
  for (let i = 0; i < bin.length; i++) {
    const c = bin.charCodeAt(i);
    v += (c & 127) * shift;
    if (c & 128) { shift *= 128; continue; }
    out.push(v % 2 ? -(v + 1) / 2 : v / 2);
    v = 0; shift = 1;
  }
  return out;
}

function unpackPolys(p) {
  const polyCounts = unpackInts(p.polys), ringCounts = unpackInts(p.counts), d = unpackInts(p.data);
  let k = 0, r = 0, lat = 0, lon = 0;
  return polyCounts.map((nRings) => {
    const rings = [];
    for (let j = 0; j < nRings; j++) {
      const ring = [];
      for (let i = ringCounts[r++]; i > 0; i--) { lat += d[k++]; lon += d[k++]; ring.push({ lat: lat / 1e5, lon: lon / 1e5 }); }
      rings.push(ring);
    }
    return rings;
  });
}

// ---------------------------------------------------------------- the city

let city = null;
const CELL = 0.002; // degrees, about 200 m
const cellKey = (lat, lon) => `${Math.floor(lat / CELL)},${Math.floor(lon / CELL)}`;

function ensure() {
  if (city) return city;
  const r = SYDNEY.roads;
  const nd = unpackInts(r.nodes);
  const n = nd.length / 2;
  const lat = new Float64Array(n), lon = new Float64Array(n);
  for (let i = 0, a = 0, b = 0; i < n; i++) { a += nd[2 * i]; b += nd[2 * i + 1]; lat[i] = a / 1e5; lon[i] = b / 1e5; }
  const ed = unpackInts(r.edges);
  const m = ed.length / 2;
  const A = new Int32Array(m), B = new Int32Array(m);
  for (let k = 0, pa = 0; k < m; k++) { pa += ed[2 * k]; A[k] = pa; B[k] = pa + ed[2 * k + 1]; }
  const kinds = Uint8Array.from(atob(r.kinds), (c) => c.charCodeAt(0));
  const edgeName = Int32Array.from(unpackInts(SYDNEY.edgeNames));
  const graph = fromEdgeList(lat, lon, A, B, kinds);

  // Which corners each way of travelling can start from (bit 1: on foot or
  // bike, bit 2: by car): only those in that way's largest connected network.
  // A lane reachable only through a motorway tunnel, or a car park joined to
  // the streets only by a footpath, would otherwise be a dead end.
  const reach = new Uint8Array(n);
  for (const [bit, allowed] of [[1, ALLOWED.walk], [2, ALLOWED.drive]]) {
    const parent = Int32Array.from({ length: n }, (_, i) => i);
    const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
    const touched = new Uint8Array(n);
    for (let k = 0; k < m; k++) {
      if (!allowed[kinds[k]]) continue;
      touched[A[k]] = touched[B[k]] = 1;
      const ra = find(A[k]), rb = find(B[k]);
      if (ra !== rb) parent[ra] = rb;
    }
    const size = new Map();
    for (let i = 0; i < n; i++) if (touched[i]) { const r = find(i); size.set(r, (size.get(r) || 0) + 1); }
    let main = -1, best = 0;
    for (const [r, s] of size) if (s > best) { best = s; main = r; }
    for (let i = 0; i < n; i++) if (touched[i] && find(i) === main) reach[i] |= bit;
  }
  const nodeGrid = new Map();
  for (let i = 0; i < n; i++) {
    const key = cellKey(lat[i], lon[i]);
    if (!nodeGrid.has(key)) nodeGrid.set(key, []);
    nodeGrid.get(key).push(i);
  }
  // Named street segments, for "which street is this on?".
  const streetGrid = new Map();
  for (let k = 0; k < m; k++) {
    // Streets you can stand on: not footpaths or cycleways, motorways or tunnels.
    if (!edgeName[k] || (kinds[k] & 7) === 7 || (kinds[k] & 7) === 0 || kinds[k] & TUNNEL) continue;
    const key = cellKey((lat[A[k]] + lat[B[k]]) / 2, (lon[A[k]] + lon[B[k]]) / 2);
    if (!streetGrid.has(key)) streetGrid.set(key, []);
    streetGrid.get(key).push(k);
  }

  const suburbs = [...SYDNEY.labels.places].map(([name, type, la, lo]) => ({ name, type, lat: la / 1e5, lon: lo / 1e5 }));
  const areas = suburbs.filter((s) => s.type !== 'hood');
  const hood = (la, lo) => {
    let best = null, bd = Infinity;
    for (const s of areas) { const d = (s.lat - la) ** 2 + ((s.lon - lo) * 0.83) ** 2; if (d < bd) { bd = d; best = s; } }
    return best ? best.name : 'Sydney';
  };

  const addresses = [];
  for (let i = 0, la = 0, lo = 0; i < SYDNEY.addresses.length; i++) {
    const [num, street, dla, dlo] = SYDNEY.addresses[i];
    la += dla; lo += dlo;
    addresses.push({ num, street: SYDNEY.names[street - 1], lat: la / 1e5, lon: lo / 1e5 });
  }
  for (const a of addresses) a.hood = hood(a.lat, a.lon);
  const addrGrid = new Map();
  for (const a of addresses) {
    const key = cellKey(a.lat, a.lon);
    if (!addrGrid.has(key)) addrGrid.set(key, []);
    addrGrid.get(key).push(a);
  }

  // One point per street per suburb, for searching by street name.
  const streetPoints = new Map();
  for (let k = 0; k < m; k++) {
    const id = edgeName[k];
    if (!id || (kinds[k] & 7) === 7) continue;
    const la = (lat[A[k]] + lat[B[k]]) / 2, lo = (lon[A[k]] + lon[B[k]]) / 2;
    const key = `${id}|${Math.floor(la / 0.01)},${Math.floor(lo / 0.01)}`;
    if (!streetPoints.has(key)) streetPoints.set(key, { street: SYDNEY.names[id - 1], lat: la, lon: lo });
  }
  for (const s of streetPoints.values()) s.hood = hood(s.lat, s.lon);

  const KEYS = { a: 'amenity', l: 'leisure', t: 'tourism', s: 'shop' };
  const pois = [];
  for (let i = 0, la = 0, lo = 0; i < SYDNEY.pois.length; i++) {
    const [name, key, value, dla, dlo] = SYDNEY.pois[i];
    la += dla; lo += dlo;
    pois.push({ type: 'node', id: i + 1, lat: la / 1e5, lon: lo / 1e5, tags: { name, [KEYS[key]]: value } });
  }

  const box = SYDNEY.box;
  city = {
    graph, kinds, edgeName, A, B, reach, nodeGrid, streetGrid, suburbs, hood, addresses, addrGrid,
    streetPoints: [...streetPoints.values()], pois,
    water: unpackPolys(SYDNEY.water), green: unpackPolys(SYDNEY.green), sand: unpackPolys(SYDNEY.sand),
    bounds: [[box.s - 0.01, box.w - 0.012], [box.n + 0.01, box.e + 0.012]],
  };
  return city;
}

export const warm = ensure;
export function getBounds() { return ensure().bounds; }

/** The nearest street corner that this way of travelling can use. */
function nearestNode(lat, lon, mode = 'walk') {
  const c = ensure();
  const bit = access(mode);
  const cy = Math.floor(lat / CELL), cx = Math.floor(lon / CELL);
  let best = -1, bd = Infinity;
  for (let ring = 0; ring < 40; ring++) {
    for (let y = cy - ring; y <= cy + ring; y++) {
      for (let x = cx - ring; x <= cx + ring; x++) {
        if (Math.max(Math.abs(y - cy), Math.abs(x - cx)) !== ring) continue;
        for (const i of c.nodeGrid.get(`${y},${x}`) || []) {
          if (!(c.reach[i] & bit)) continue;
          const d = (c.graph.lat[i] - lat) ** 2 + ((c.graph.lon[i] - lon) * 0.83) ** 2;
          if (d < bd) { bd = d; best = i; }
        }
      }
    }
    if (best >= 0 && ring >= 1) break;
  }
  return best;
}

/** The named street nearest a point (within `maxM`), or ''. */
function nearestStreet(lat, lon, maxM = 60) {
  const c = ensure();
  const g = c.graph;
  const kx = 111320 * 0.83, ky = 111320;
  let best = '', bd = maxM;
  const cy = Math.floor(lat / CELL), cx = Math.floor(lon / CELL);
  for (let y = cy - 1; y <= cy + 1; y++) {
    for (let x = cx - 1; x <= cx + 1; x++) {
      for (const k of c.streetGrid.get(`${y},${x}`) || []) {
        const a = c.A[k], b = c.B[k];
        const ax = g.lon[a] * kx, ay = g.lat[a] * ky, dx = g.lon[b] * kx - ax, dy = g.lat[b] * ky - ay;
        const px = lon * kx, py = lat * ky, len2 = dx * dx + dy * dy;
        const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
        const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
        if (d < bd) { bd = d; best = SYDNEY.names[c.edgeName[k] - 1]; }
      }
    }
  }
  return best;
}

function nearestAddress(lat, lon, maxM = 120) {
  const c = ensure();
  let best = null, bd = maxM;
  const cy = Math.floor(lat / CELL), cx = Math.floor(lon / CELL);
  for (let y = cy - 1; y <= cy + 1; y++) {
    for (let x = cx - 1; x <= cx + 1; x++) {
      for (const a of c.addrGrid.get(`${y},${x}`) || []) {
        const d = haversine(lat, lon, a.lat, a.lon);
        if (d < bd) { bd = d; best = a; }
      }
    }
  }
  return best;
}

const fmtAddress = (a) => `${a.num} ${a.street}, ${a.hood}`;

// ---------------------------------------------------------------- places of interest

export async function findPois(center, { radius, minResults = 12 } = {}) {
  const c = ensure();
  await new Promise((r) => setTimeout(r, 150));
  const radii = radius ? [radius] : [800, 1800, 4000];
  let pois = [], used = radii[0];
  for (const r of radii) {
    used = r;
    const near = c.pois.filter((el) => haversine(center.lat, center.lon, el.lat, el.lon) <= r);
    for (const el of near) {
      // Street and suburb, worked out once, for the address line.
      if (el.tags['addr:suburb']) continue;
      const street = nearestStreet(el.lat, el.lon, 40);
      if (street) el.tags['addr:street'] = street;
      el.tags['addr:suburb'] = c.hood(el.lat, el.lon);
    }
    pois = parsePois(near, center);
    if (pois.length >= minResults) break;
  }
  return { pois, radius: used };
}

// ---------------------------------------------------------------- geocoding stand-ins

export async function searchAddress(q, { near, limit = 6 } = {}) {
  const c = ensure();
  q = q.trim().toLowerCase();
  if (q.length < 2) return [];
  const numMatch = q.match(/^(\d+[a-z]?)\b\s*/);
  const num = numMatch ? numMatch[1] : null;
  const words = q.replace(/^\d+[a-z]?\b\s*/, '').split(/[\s,]+/).filter(Boolean);
  if (!words.length) return [];
  const hit = (s) => { const t = `${s} sydney nsw`.toLowerCase(); return words.every((w) => t.includes(w)); };
  // Best first: the name exactly as typed, then names starting with it, then
  // names containing it, then the rest; shorter names before longer ones;
  // nearest (to you, or to the city centre) first among equals.
  const from = near || CENTER;
  const typed = (num ? `${num} ` : '') + words.join(' ');
  const score = (r) => {
    const t = r.title.toLowerCase();
    const tier = t === typed ? 0 : t.startsWith(typed) ? 1 : t.includes(typed) ? 2 : 3;
    return tier * 1e7 + (t.length - typed.length) * 2000 + haversine(from.lat, from.lon, r.lat, r.lon) - (r.suburb ? 1000 : 0);
  };
  const matches = [];
  if (!num) {
    for (const s of c.suburbs) {
      if (s.type === 'hood' || !hit(s.name)) continue;
      matches.push({ lat: s.lat, lon: s.lon, address: `${s.name} NSW`, title: s.name, subtitle: 'Suburb, Sydney', suburb: true });
    }
  }
  if (num) {
    for (const a of c.addresses) if (a.num.toLowerCase() === num && hit(`${a.street} ${a.hood}`)) matches.push({ lat: a.lat, lon: a.lon, address: fmtAddress(a), title: `${a.num} ${a.street}`, subtitle: a.hood });
  }
  for (const s of c.streetPoints) {
    if (!hit(`${s.street} ${s.hood}`)) continue;
    // A house number we don't know: the street itself.
    const a = nearestAddress(s.lat, s.lon, 80);
    matches.push({ lat: s.lat, lon: s.lon, address: a && a.street === s.street ? fmtAddress(a) : `${s.street}, ${s.hood}`, title: s.street, subtitle: s.hood });
  }
  for (const p of c.pois) {
    if (!hit(p.tags.name)) continue;
    const street = nearestStreet(p.lat, p.lon, 40);
    const where = c.hood(p.lat, p.lon);
    matches.push({ lat: p.lat, lon: p.lon, address: `${p.tags.name}, ${street ? `${street}, ` : ''}${where}`, title: p.tags.name, subtitle: street ? `${street}, ${where}` : where });
  }
  for (const r of matches) r.score = score(r);
  matches.sort((x, y) => x.score - y.score);
  const seen = new Set();
  const results = [];
  for (const r of matches) {
    const key = `${r.title}|${r.subtitle}`;
    if (seen.has(key)) continue;
    seen.add(key);
    delete r.score; delete r.suburb;
    results.push(r);
    if (results.length >= limit) break;
  }
  return results;
}

export async function reverseGeocode(lat, lon) {
  const c = ensure();
  const a = nearestAddress(lat, lon, 80);
  if (a) return { lat, lon, address: fmtAddress(a), title: `${a.num} ${a.street}`, subtitle: a.hood };
  const street = nearestStreet(lat, lon, 150);
  const where = c.hood(lat, lon);
  return street
    ? { lat, lon, address: `${street}, ${where}`, title: street, subtitle: where }
    : { lat, lon, address: `${where} NSW`, title: where, subtitle: 'Sydney' };
}

/** No GPS in the test version: hand back a random address instead. */
export async function currentPosition() {
  const c = ensure();
  const a = c.addresses[Math.floor(Math.random() * c.addresses.length)];
  return { lat: a.lat, lon: a.lon };
}


// ---------------------------------------------------------------- local "server"

const KEY = 'meet-test-accounts-v1';
let memory = { users: {}, session: null };
function load() {
  try { const raw = localStorage.getItem(KEY); if (raw) memory = JSON.parse(raw); } catch { /* storage blocked: keep in memory */ }
  return memory;
}
function save(db) {
  memory = db;
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* in-memory only */ }
}
async function hash(pw, salt) {
  const data = new TextEncoder().encode(`${salt}:${pw}`);
  try {
    const buf = await crypto.subtle.digest('SHA-256', data);
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch { return `${salt}:${pw.length}:${[...pw].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)}`; }
}
const fail = (status, message) => Object.assign(new Error(message), { status });
const newId = () => Math.random().toString(36).slice(2, 11);
const pub = (u) => ({ id: u.id, email: u.email, name: u.name, home: u.home, places: u.places, history: u.history.slice(0, 50), settings: u.settings });
function me() {
  const db = load();
  const u = db.session && db.users[db.session];
  if (!u) throw fail(401, 'Please sign in');
  return { db, u };
}
const clean = (p) => ({ address: String(p.address || '').slice(0, 300), nickname: String(p.nickname || '').trim().slice(0, 60), lat: Number(p.lat), lon: Number(p.lon), ...(['transit', 'walk', 'bike', 'drive'].includes(p.mode) ? { mode: p.mode } : {}) });

export const api = {
  async me() { try { return { user: pub(me().u) }; } catch { return { user: null }; } },
  async signup(email, password, name) {
    const db = load();
    const e = String(email).trim().toLowerCase();
    if (db.users[e]) throw fail(409, 'An account with that email already exists — try signing in');
    const salt = newId();
    db.users[e] = { id: newId(), email: e, name: String(name || '').trim(), salt, hash: await hash(password, salt), home: null, places: [], history: [], settings: {} };
    db.session = e;
    save(db);
    return { user: pub(db.users[e]) };
  },
  async login(email, password) {
    const db = load();
    const u = db.users[String(email).trim().toLowerCase()];
    if (!u || (await hash(password, u.salt)) !== u.hash) throw fail(401, 'Email or password is incorrect');
    db.session = u.email;
    save(db);
    return { user: pub(u) };
  },
  async logout() { const db = load(); db.session = null; save(db); return { ok: true }; },
  async updateMe(patch) {
    const { db, u } = me();
    if ('name' in patch) u.name = patch.name;
    if ('home' in patch) u.home = patch.home ? clean(patch.home) : null;
    if (patch.settings) u.settings = { ...u.settings, ...patch.settings };
    save(db);
    return { user: pub(u) };
  },
  async addPlace(p) {
    const { db, u } = me();
    const place = { id: newId(), ...clean(p), active: p.active !== false };
    u.places.push(place);
    save(db);
    return { place };
  },
  async updatePlace(id, patch) {
    const { db, u } = me();
    const place = u.places.find((x) => x.id === id);
    if (!place) throw fail(404, 'Address not found');
    if ('address' in patch || 'lat' in patch) Object.assign(place, clean({ ...place, ...patch }));
    if ('nickname' in patch) place.nickname = String(patch.nickname || '').trim().slice(0, 60);
    if ('active' in patch) place.active = !!patch.active;
    if ('mode' in patch) { if (['transit', 'walk', 'bike', 'drive'].includes(patch.mode)) place.mode = patch.mode; else delete place.mode; }
    save(db);
    return { place };
  },
  async deletePlace(id) { const { db, u } = me(); u.places = u.places.filter((x) => x.id !== id); save(db); return { ok: true }; },
  async addHistory(h) {
    const { db, u } = me();
    const entry = { id: newId(), at: Date.now(), name: h.name, category: h.category || '', address: h.address || '', lat: h.lat, lon: h.lon, people: h.people || [] };
    u.history = [entry, ...u.history].slice(0, 50);
    save(db);
    return { entry };
  },
  async deleteHistory(id) { const { db, u } = me(); u.history = u.history.filter((x) => x.id !== id); save(db); return { ok: true }; },
};

// Directions in the test version: real shortest routes over Sydney's streets
// for walking, cycling and driving. There are no timetables, so no public transport.
const SPEED = { walk: 1.35, bike: 4.2, drive: 8.5 }; // m/s
const noTimetables = () => Object.assign(new Error('No timetables in the test version'), { status: 404, friendly: true });

// Shortest-path trees are kept for the last few starting corners: a search
// asks for several routes from the same people to the same meeting point.
const trees = new Map();
function treeFrom(mode, node) {
  const key = `${mode}|${node}`;
  if (!trees.has(key)) {
    if (trees.size >= 16) trees.delete(trees.keys().next().value);
    trees.set(key, dijkstra(ensure().graph, node, ALLOWED[mode]));
  }
  return trees.get(key);
}
const pathTo = (tree, b) => {
  const g = ensure().graph;
  const pts = [];
  for (let v = b; v !== -1; v = tree.parent[v]) pts.push([g.lat[v], g.lon[v]]);
  return pts.reverse();
};
const seconds = (mode, m) => Math.round(m / SPEED[mode] + (mode === 'drive' ? 90 : 0));

/** A route from one place to another, through `via` if given (like the real routing service). */
export async function directions(mode, from, to, { via } = {}) {
  if (mode === 'transit') throw noTimetables();
  const a = nearestNode(from.lat, from.lon, mode), b = nearestNode(to.lat, to.lon, mode);
  let geometry, dist;
  if (via) {
    // From the start to the via corner, then the meeting point's tree read backwards (streets go both ways here).
    const v = nearestNode(via.lat, via.lon, mode);
    const fromA = treeFrom(mode, a), fromB = treeFrom(mode, b);
    if (!Number.isFinite(fromA.dist[v]) || !Number.isFinite(fromB.dist[v])) throw Object.assign(new Error('No route found'), { status: 404 });
    dist = fromA.dist[v] + fromB.dist[v];
    geometry = [...pathTo(fromA, v), ...pathTo(fromB, v).reverse().slice(1)];
  } else {
    const tree = treeFrom(mode, a);
    if (!Number.isFinite(tree.dist[b])) throw Object.assign(new Error('No route found'), { status: 404 });
    dist = tree.dist[b];
    geometry = pathTo(tree, b);
  }
  return { mode, provider: 'test', distance: Math.round(dist), duration: seconds(mode, dist), geometry, alternatives: [] };
}

export async function travelTimes(mode, sources, destinations) {
  if (mode === 'transit') throw noTimetables();
  const g = ensure().graph;
  await new Promise((r) => setTimeout(r, 40));
  const targets = destinations.map((p) => nearestNode(p.lat, p.lon, mode));
  const durations = [], distances = [];
  for (const src of sources) {
    const { dist } = treeFrom(mode, nearestNode(src.lat, src.lon, mode));
    distances.push(targets.map((t) => (Number.isFinite(dist[t]) ? Math.round(dist[t]) : null)));
    durations.push(targets.map((t) => (Number.isFinite(dist[t]) ? seconds(mode, dist[t]) : null)));
  }
  // A spot with no street near it (far out to sea, past the edge of the map) has no snapped position.
  return { durations, distances, destinations: targets.map((t) => (t >= 0 ? [g.lat[t], g.lon[t]] : null)) };
}

/** The streets in an area ({ s, w, n, e }) for the search animation, without footpaths (like the real app's). */
export async function roads(b) {
  const c = ensure();
  const g = c.graph;
  const id = new Int32Array(g.n).fill(-1);
  const lat = [], lon = [], A = [], B = [], kinds = [];
  const inside = (i) => g.lat[i] >= b.s && g.lat[i] <= b.n && g.lon[i] >= b.w && g.lon[i] <= b.e;
  const node = (i) => { if (id[i] < 0) { id[i] = lat.length; lat.push(g.lat[i]); lon.push(g.lon[i]); } return id[i]; };
  for (let k = 0; k < c.A.length; k++) {
    if ((c.kinds[k] & 7) === 7 || (!inside(c.A[k]) && !inside(c.B[k]))) continue;
    A.push(node(c.A[k])); B.push(node(c.B[k])); kinds.push(c.kinds[k]);
  }
  return { lat: Float64Array.from(lat), lon: Float64Array.from(lon), A: Int32Array.from(A), B: Int32Array.from(B), kinds: Uint8Array.from(kinds) };
}

/** A ready-made group: you in Newtown, friends in Pyrmont, Paddington and across the bridge in North Sydney. */
export function sampleGroup() {
  const at = (lat, lon) => { const a = nearestAddress(lat, lon, 400); return a ? { address: fmtAddress(a), lat: a.lat, lon: a.lon } : { address: `${ensure().hood(lat, lon)} NSW`, lat, lon }; };
  return {
    home: { ...at(-33.8975, 151.1790), mode: 'walk' },
    friends: [['Sam', -33.8697, 151.1947], ['Priya', -33.8848, 151.2263], ['Leo', -33.8390, 151.2070]]
      .map(([nickname, lat, lon]) => ({ ...at(lat, lon), nickname, mode: 'walk' })),
  };
}

// ---------------------------------------------------------------- base map

/**
 * Draw Sydney as map tiles (Leaflet GridLayer) in the app's quiet style:
 * pale land, blue harbour, green parks, sand-coloured beaches, white streets
 * and soft yellow main roads. Suburb, water and park names sit in their own
 * pane and appear as you zoom in.
 */
export function addBasemap(map) {
  const c = ensure();
  const g = c.graph;
  const crs = L.CRS.EPSG3857;
  const P0 = (lat, lon) => crs.latLngToPoint(L.latLng(lat, lon), 0);
  const nx = new Float64Array(g.n), ny = new Float64Array(g.n);
  for (let i = 0; i < g.n; i++) { const p = P0(g.lat[i], g.lon[i]); nx[i] = p.x; ny[i] = p.y; }

  // Bucket street segments so each tile only touches nearby streets.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < g.n; i++) {
    if (nx[i] < minX) minX = nx[i]; if (nx[i] > maxX) maxX = nx[i];
    if (ny[i] < minY) minY = ny[i]; if (ny[i] > maxY) maxY = ny[i];
  }
  const cell = (maxX - minX) / 256;
  const buckets = new Map();
  for (let e = 0; e < c.A.length; e++) {
    const a = c.A[e], b = c.B[e];
    const bx0 = Math.floor((Math.min(nx[a], nx[b]) - minX) / cell), bx1 = Math.floor((Math.max(nx[a], nx[b]) - minX) / cell);
    const by0 = Math.floor((Math.min(ny[a], ny[b]) - minY) / cell), by1 = Math.floor((Math.max(ny[a], ny[b]) - minY) / cell);
    for (let bx = bx0; bx <= bx1; bx++) for (let by = by0; by <= by1; by++) {
      const k = bx * 65536 + by;
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push(e);
    }
  }
  const seen = new Int32Array(c.A.length);
  let stamp = 0;
  // Areas, projected once, with a bounding box each to skip ones off the tile.
  const project = (polys) => polys.map((rings) => {
    const pr = rings.map((ring) => ring.map((p) => P0(p.lat, p.lon)));
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of pr[0]) { if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y; }
    return { rings: pr, x0, y0, x1, y1 };
  });
  const water = project(c.water), green = project(c.green), sand = project(c.sand);
  const colors = () => {
    const s = getComputedStyle(document.documentElement);
    const v = (k) => s.getPropertyValue(k).trim();
    return {
      land: v('--map-land'), park: v('--map-park'), water: v('--map-water'), sand: v('--map-sand'), road: v('--map-road'), casing: v('--map-casing'),
      major: v('--map-major'), majorCasing: v('--map-major-casing'), motorway: v('--map-motorway'), motorwayCasing: v('--map-motorway-casing'),
      path: v('--map-path'), label: v('--map-label'), halo: v('--map-halo'), font: s.getPropertyValue('--font'),
    };
  };
  const mppAt0 = 156543.03 * Math.cos((CENTER.lat * Math.PI) / 180);

  function drawTile(canvas, coords) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = 256 * dpr; canvas.height = 256 * dpr;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const z = coords.z, s = 2 ** z, ox = coords.x * 256, oy = coords.y * 256;
    const X = (x) => x * s - ox, Y = (y) => y * s - oy;
    const col = colors();
    const mpp = mppAt0 / s;
    ctx.fillStyle = col.land;
    ctx.fillRect(0, 0, 256, 256);
    const pad = 14 / s;
    const tx0 = ox / s - pad, tx1 = (ox + 256) / s + pad, ty0 = oy / s - pad, ty1 = (oy + 256) / s + pad;
    const fill = (areas, color) => {
      ctx.fillStyle = color;
      for (const a of areas) {
        if (a.x1 < tx0 || a.x0 > tx1 || a.y1 < ty0 || a.y0 > ty1) continue;
        ctx.beginPath();
        for (const ring of a.rings) ring.forEach((p, i) => (i ? ctx.lineTo(X(p.x), Y(p.y)) : ctx.moveTo(X(p.x), Y(p.y))));
        ctx.fill('evenodd');
      }
    };
    fill(green, col.park);
    fill(sand, col.sand);
    fill(water, col.water);

    if (tx1 < minX || tx0 > maxX || ty1 < minY || ty0 > maxY) return;
    stamp++;
    // Tiers: 0 motorway & trunk, 1 primary & secondary, 2 tertiary & minor, 3 service, 4 footpaths.
    const TIER = [0, 0, 1, 1, 2, 2, 3, 4];
    const tiers = [[], [], [], [], []], tunnels = [];
    for (let bx = Math.max(0, Math.floor((tx0 - minX) / cell)); bx <= Math.floor((tx1 - minX) / cell); bx++) {
      for (let by = Math.max(0, Math.floor((ty0 - minY) / cell)); by <= Math.floor((ty1 - minY) / cell); by++) {
        for (const e of buckets.get(bx * 65536 + by) || []) {
          if (seen[e] === stamp) continue;
          seen[e] = stamp;
          if (c.kinds[e] & TUNNEL) tunnels.push(e); else tiers[TIER[c.kinds[e] & 7]].push(e);
        }
      }
    }
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const stroke = (list, width, color, dash = null) => {
      if (!list.length || width <= 0) return;
      ctx.beginPath();
      for (const e of list) { const a = c.A[e], b = c.B[e]; ctx.moveTo(X(nx[a]), Y(ny[a])); ctx.lineTo(X(nx[b]), Y(ny[b])); }
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.setLineDash(dash || []);
      ctx.stroke();
      ctx.setLineDash([]);
    };
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const w = [clamp(26 / mpp, 1.6, 20), clamp(18 / mpp, 1.1, 15), clamp(11 / mpp, 0.6, 11), clamp(7 / mpp, 0.5, 7), clamp(2.5 / mpp, 0.7, 2.5)];
    if (z >= 14) { ctx.globalAlpha = 0.35; stroke(tunnels, w[1], col.casing); ctx.globalAlpha = 1; }
    if (z >= 15.5) stroke(tiers[4], w[4], col.path, [w[4] * 1.5, w[4] * 1.8]);
    if (z >= 15) { stroke(tiers[3], w[3] + 1.2, col.casing); stroke(tiers[3], w[3], col.road); }
    if (z >= 13) {
      if (z >= 14.5) stroke(tiers[2], w[2] + 1.5, col.casing);
      ctx.globalAlpha = z >= 14 ? 1 : 0.8;
      stroke(tiers[2], w[2], z >= 14 ? col.road : col.casing);
      ctx.globalAlpha = 1;
    } else if (z >= 12) {
      ctx.globalAlpha = 0.6; stroke(tiers[2], 0.6, col.casing); ctx.globalAlpha = 1;
    }
    stroke(tiers[1], w[1] + (z >= 13 ? 2 : 1), col.majorCasing);
    stroke(tiers[1], w[1], col.major);
    stroke(tiers[0], w[0] + 2, col.motorwayCasing);
    stroke(tiers[0], w[0], col.motorway);

    // Street names, written along the street, once you're zoomed in.
    if (z >= 16) {
      ctx.font = `500 11px ${col.font}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 3;
      ctx.strokeStyle = col.halo;
      ctx.fillStyle = col.label;
      const done = new Set();
      for (const e of [...tiers[1], ...tiers[2]]) {
        const id = c.edgeName[e];
        if (!id || done.has(id)) continue;
        const a = c.A[e], b = c.B[e];
        const ax = X(nx[a]), ay = Y(ny[a]), bx = X(nx[b]), by = Y(ny[b]);
        const mx = (ax + bx) / 2, my = (ay + by) / 2, len = Math.hypot(bx - ax, by - ay);
        const text = SYDNEY.names[id - 1];
        const tw = ctx.measureText(text).width;
        if (tw + 14 > len) continue;
        let ang = Math.atan2(by - ay, bx - ax);
        if (ang > Math.PI / 2) ang -= Math.PI;
        if (ang < -Math.PI / 2) ang += Math.PI;
        const hx = (tw / 2) * Math.abs(Math.cos(ang)) + 7 * Math.abs(Math.sin(ang)) + 2;
        const hy = (tw / 2) * Math.abs(Math.sin(ang)) + 7 * Math.abs(Math.cos(ang)) + 2;
        if (mx - hx < 0 || mx + hx > 256 || my - hy < 0 || my + hy > 256) continue; // keep labels whole
        done.add(id);
        ctx.save();
        ctx.translate(mx, my);
        ctx.rotate(ang);
        ctx.strokeText(text, 0, 0);
        ctx.fillText(text, 0, 0);
        ctx.restore();
      }
    }
  }

  const Basemap = L.GridLayer.extend({
    createTile(coords) {
      const tile = document.createElement('canvas');
      drawTile(tile, coords);
      return tile;
    },
  });
  const layer = new Basemap({ tileSize: 256, keepBuffer: 4, updateWhenZooming: false, attribution: '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> &copy; <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors' }).addTo(map);

  // Names on the map.
  map.createPane('labels');
  const pane = map.getPane('labels');
  pane.style.zIndex = 380;
  pane.style.pointerEvents = 'none';
  const esc = (t) => String(t).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const label = (l, cls) => L.marker([l.lat, l.lon], {
    pane: 'labels', interactive: false, keyboard: false,
    icon: L.divIcon({ className: `map-label ${cls}`, iconSize: [0, 0], html: `<span style="transform:translate(-50%,-50%)">${esc(l.name)}</span>` }),
  });
  const labels = {
    city: c.suburbs.filter((s) => s.type === 'city' && s.name === 'Sydney'),
    hood: c.suburbs.filter((s) => s.type === 'suburb'),
    small: c.suburbs.filter((s) => s.type === 'hood'),
    water: SYDNEY.labels.water.filter((w) => w[3]).map(([name, la, lo]) => ({ name, lat: la / 1e5, lon: lo / 1e5 })),
    lake: SYDNEY.labels.water.filter((w) => !w[3]).map(([name, la, lo]) => ({ name, lat: la / 1e5, lon: lo / 1e5 })),
    park: c.pois.filter((p) => p.tags.leisure === 'park' || p.tags.leisure === 'garden').map((p) => ({ name: p.tags.name, lat: p.lat, lon: p.lon })),
  };
  const style = { small: 'village', lake: 'water' };
  const groups = Object.fromEntries(Object.entries(labels).map(([k, list]) => [k, L.layerGroup(list.map((l) => label(l, style[k] || k)))]));
  const visible = {
    // Few labels at a time, like Apple Maps: names appear only once there is room for them.
    city: (z) => z < 13.5, hood: (z) => z >= 13 && z < 16, small: (z) => z >= 15.5, water: (z) => z >= 13.75, lake: (z) => z >= 16, park: (z) => z >= 16.25,
  };
  const update = () => {
    const z = map.getZoom();
    for (const [k, grp] of Object.entries(groups)) {
      if (visible[k](z)) { if (!map.hasLayer(grp)) grp.addTo(map); } else if (map.hasLayer(grp)) map.removeLayer(grp);
    }
  };
  map.on('zoomend', update);
  map.whenReady(update);

  const redraw = () => layer.redraw();
  new MutationObserver(redraw).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', redraw);
  return layer;
}

// ---------------------------------------------------------------- ratings, photos and reviews

// The real app shows Tripadvisor ratings, photos and reviews when a key is
// set, and free Wikimedia photos. The places here are real businesses, so the
// test version shows none rather than invent them.
export const rated = {
  async getConfig() { return {}; },
  async ratingsSource() { return null; },
  async rateAll() {},
  async thumbFor(p) { return (p.thumb = null); },
  async detailsFor() { return { source: null, photos: [], reviews: [] }; },
};
