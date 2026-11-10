// Self-contained test mode for Midway.
//
// Replaces everything that needs the internet or a server with local
// stand-ins, so the real app code can run inside a sandboxed page:
//   • a generated town ("Port Verity") with streets, a river, bridges and parks,
//     drawn as the base map and used as the road network
//   • address search / reverse geocoding over the town's street addresses
//   • ~380 places of interest, tagged like OpenStreetMap data
//   • accounts, addresses and history kept in this browser's storage
import { fromEdgeList, rng } from './network.js';
import { parsePois } from './pois.js';
import { haversine } from './geo.js';

const TOWN = 'Port Verity';
const CENTER = { lat: 40.0, lon: -40.0 }; // fictional town in open sea
const M_LAT = 111320;
const M_LON = 111320 * Math.cos((CENTER.lat * Math.PI) / 180);
const toLL = (x, y) => ({ lat: CENTER.lat + y / M_LAT, lon: CENTER.lon + x / M_LON });

const ROW_NAMES = ['Ash', 'Birch', 'Cedar', 'Dover', 'Elm', 'Fern', 'Garnet', 'Hazel', 'Iris', 'Juniper', 'Kestrel', 'Larch', 'Maple', 'Nettle', 'Oak', 'Poplar', 'Quarry', 'Rowan', 'Sorrel', 'Thistle', 'Upton', 'Vale', 'Willow', 'Yarrow', 'Alder', 'Bramble', 'Clover', 'Daisy', 'Ember', 'Foxglove', 'Gorse', 'Heather', 'Ivy', 'Jasmine', 'Kingfisher', 'Lavender', 'Meadow', 'Nightingale', 'Orchard', 'Primrose', 'Quince', 'Robin', 'Saffron', 'Tansy', 'Union', 'Violet', 'Wren', 'Yew', 'Acorn', 'Bluebell'];
const COL_NAMES = ['Abbey', 'Bridge', 'Castle', 'Dock', 'Exchange', 'Ferry', 'Granary', 'Harbour', 'Inkwell', 'Jubilee', 'Keel', 'Lantern', 'Mill', 'Navigation', 'Observatory', 'Pier', 'Quay', 'Rope', 'Station', 'Tannery', 'Victoria', 'Wharf', 'Albion', 'Beacon', 'Chapel', 'Drapers', 'Eastgate', 'Foundry', 'Guild', 'Hythe', 'Kiln', 'Lighthouse', 'Market', 'Newgate', 'Orchard', 'Prospect', 'Regent', 'Salt', 'Tower', 'Upper', 'Vicarage', 'Weaver', 'Anchor', 'Brewer', 'Canal', 'Dyer', 'Elder', 'Fisher', 'Glover', 'Hatter', 'Iron', 'Joiner', 'Kings', 'Lock', 'Mason', 'North', 'Oyster', 'Potter', 'Queens', 'Rope Walk', 'Sail', 'Tide', 'Union', 'Vintner', 'Water'];
const HOODS = [['Westwood', 'Northgate', 'Highfield'], ['Old Mill', 'Town Centre', 'Eastbank'], ['Southfields', 'Riverside', 'Harbour Quarter']];

// ---------------------------------------------------------------- the town

function buildTown() {
  const rand = rng(20261110);
  const W = 7600, H = 5600, S = 118;
  const cols = Math.round(W / S), rows = Math.round(H / S);
  const riverY = (x) => -350 + 650 * Math.sin(x / 1900 + 0.4) + 220 * Math.sin(x / 640);
  const parks = [
    { x: -2300, y: 1500, rx: 520, ry: 360, name: 'Westwood Common' },
    { x: 1200, y: 1700, rx: 380, ry: 300, name: 'Castle Gardens' },
    { x: 2700, y: -1700, rx: 560, ry: 340, name: 'Harbour Fields' },
    { x: -800, y: -1900, rx: 420, ry: 300, name: 'Southfields Park' },
    { x: 3000, y: 900, rx: 300, ry: 260, name: 'Eastbank Green' },
  ];
  const inPark = (x, y) => parks.find((p) => ((x - p.x) / p.rx) ** 2 + ((y - p.y) / p.ry) ** 2 < 1);
  const bridgeCols = new Set();
  for (let c = 4; c < cols; c += 9) bridgeCols.add(c);

  // Node positions on a gently warped grid.
  const id = (r, c) => r * (cols + 1) + c;
  const n = (rows + 1) * (cols + 1);
  const X = new Float64Array(n), Y = new Float64Array(n), keep = new Uint8Array(n);
  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c <= cols; c++) {
      let x = -W / 2 + c * S, y = -H / 2 + r * S;
      x += 45 * Math.sin(y / 800) + (rand() - 0.5) * 26;
      y += 35 * Math.sin(x / 950) + (rand() - 0.5) * 26;
      const i = id(r, c);
      X[i] = x; Y[i] = y;
      keep[i] = Math.abs(y - riverY(x)) > 70 && !inPark(x, y) ? 1 : 0;
    }
  }
  const art = (r, c, dir) => (dir === 'row' ? r % 8 === 4 : c % 8 === 4);
  const A = [], B = [], kind = [];
  const link = (a, b, k) => { A.push(a); B.push(b); kind.push(k); };
  const crossesRiver = (a, b) => Math.sign(Y[a] - riverY(X[a])) !== Math.sign(Y[b] - riverY(X[b]));
  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c <= cols; c++) {
      const a = id(r, c);
      if (!keep[a]) continue;
      if (c < cols) {
        const b = id(r, c + 1);
        const major = art(r, c, 'row');
        if (keep[b] && !crossesRiver(a, b) && (major || rand() > 0.06)) link(a, b, major ? 1 : 0);
      }
      if (r < rows) {
        const major = art(r, c, 'col');
        let r2 = r + 1;
        // Bridges carry a few streets over the river.
        if (bridgeCols.has(c)) while (r2 <= rows && !keep[id(r2, c)] && Math.abs(Y[id(r2, c)] - riverY(X[id(r2, c)])) <= 70) r2++;
        if (r2 > rows) continue;
        const b = id(r2, c);
        if (!keep[b]) continue;
        const bridge = crossesRiver(a, b);
        if (bridge && !bridgeCols.has(c)) continue;
        if (bridge || major || rand() > 0.08) link(a, b, bridge || major ? 1 : 0);
      }
    }
  }
  // A diagonal boulevard through the centre.
  for (let k = 0; k < Math.min(rows, cols) - 2; k++) {
    const r = 3 + k, c = 18 + k;
    if (r + 1 > rows || c + 1 > cols) break;
    const a = id(r, c), b = id(r + 1, c + 1);
    if (keep[a] && keep[b] && !crossesRiver(a, b)) link(a, b, 1);
  }

  const lat = new Float64Array(n), lon = new Float64Array(n);
  for (let i = 0; i < n; i++) { const ll = toLL(X[i], Y[i]); lat[i] = ll.lat; lon[i] = ll.lon; }
  const graph = fromEdgeList(lat, lon, A, B, false);

  // Addresses: every street corner is a house number on its east-west street.
  const rowStreet = (r) => `${ROW_NAMES[r % ROW_NAMES.length]} ${r % 8 === 4 ? 'Road' : 'Street'}`;
  const colStreet = (c) => `${COL_NAMES[c % COL_NAMES.length]} ${c % 8 === 4 ? 'Avenue' : 'Lane'}`;
  const hood = (x, y) => HOODS[y > 900 ? 0 : y < -900 ? 2 : 1][x < -1300 ? 0 : x > 1300 ? 2 : 1];
  const deg = new Int32Array(n);
  for (let k = 0; k < A.length; k++) { deg[A[k]]++; deg[B[k]]++; }
  const addresses = [];
  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c <= cols; c++) {
      const i = id(r, c);
      if (!deg[i]) continue;
      const useCol = r % 3 === 1 && c % 8 !== 4;
      addresses.push({
        node: i, lat: lat[i], lon: lon[i],
        num: useCol ? r * 2 + 1 : c * 4 + 2 + (r % 2),
        street: useCol ? colStreet(c) : rowStreet(r),
        hood: hood(X[i], Y[i]),
      });
    }
  }

  // Base-map geometry.
  const river = [];
  for (let x = -W / 2 - 600; x <= W / 2 + 600; x += 60) river.push(toLL(x, riverY(x)));
  const parkPolys = parks.map((p) => ({
    name: p.name, center: toLL(p.x, p.y),
    ring: Array.from({ length: 40 }, (_, k) => toLL(p.x + p.rx * 0.98 * Math.cos((k / 40) * 2 * Math.PI), p.y + p.ry * 0.98 * Math.sin((k / 40) * 2 * Math.PI))),
  }));
  const labels = [];
  HOODS.forEach((row, ri) => row.forEach((name, ci) => labels.push({ name, ...toLL((ci - 1) * 2500, (1 - ri) * 1900 + (ri === 1 ? 300 : 0)) })));
  const sw = toLL(-W / 2 - 900, -H / 2 - 900), ne = toLL(W / 2 + 900, H / 2 + 900);
  return { graph, A, B, kind, addresses, river, parks: parkPolys, labels, bounds: [[sw.lat, sw.lon], [ne.lat, ne.lon]], hood: (ll) => hood((ll.lon - CENTER.lon) * M_LON, (ll.lat - CENTER.lat) * M_LAT) };
}

const town = buildTown();

function nearestAddress(lat, lon) {
  let best = town.addresses[0], bd = Infinity;
  for (const a of town.addresses) {
    const d = (a.lat - lat) ** 2 + ((a.lon - lon) * 0.766) ** 2;
    if (d < bd) { bd = d; best = a; }
  }
  return best;
}
const fmtAddress = (a) => `${a.num} ${a.street}, ${a.hood}, ${TOWN}`;

// ---------------------------------------------------------------- places of interest

const NAMES = ['Rosa', 'Marco', 'Luca', 'Nonna', 'Bella', 'Sole', 'Verde', 'Porto', 'Aria', 'Gino', 'Mio', 'Kiku', 'Hana', 'Sora', 'Taj', 'Raja', 'Lotus', 'Saffron', 'Jade', 'Golden', 'Blue', 'Copper', 'Harbour', 'Lantern', 'Anchor', 'Mill', 'Quay', 'Driftwood', 'Tide', 'Ember', 'Juniper', 'Fox', 'Otter', 'Heron', 'Wren', 'Pepper', 'Basil', 'Olive', 'Fig', 'Clove'];
const TYPES = [
  { n: 22, tags: { amenity: 'restaurant', cuisine: 'italian' }, names: ['Trattoria {N}', 'Osteria {N}', 'Pasta {N}', "{N}'s Kitchen", 'Casa {N}'] },
  { n: 14, tags: { amenity: 'restaurant', cuisine: 'pizza' }, names: ['Pizzeria {N}', '{N} Pizza Co.', 'Slice of {N}'] },
  { n: 12, tags: { amenity: 'restaurant', cuisine: 'japanese' }, names: ['{N} Izakaya', 'Sushi {N}', '{N} Ramen Bar'] },
  { n: 9, tags: { amenity: 'restaurant', cuisine: 'sushi' }, names: ['{N} Sushi', 'Maki {N}'] },
  { n: 13, tags: { amenity: 'restaurant', cuisine: 'chinese' }, names: ['{N} Dragon', 'Golden {N}', '{N} Dumpling House'] },
  { n: 13, tags: { amenity: 'restaurant', cuisine: 'indian' }, names: ['{N} Tandoor', 'Spice of {N}', '{N} Curry House'] },
  { n: 9, tags: { amenity: 'restaurant', cuisine: 'thai' }, names: ['{N} Thai', 'Bangkok {N}'] },
  { n: 9, tags: { amenity: 'restaurant', cuisine: 'mexican' }, names: ['Taqueria {N}', '{N} Cantina'] },
  { n: 7, tags: { amenity: 'restaurant', cuisine: 'korean' }, names: ['{N} BBQ House', 'Seoul {N}'] },
  { n: 7, tags: { amenity: 'restaurant', cuisine: 'vietnamese' }, names: ['Pho {N}', '{N} Banh Mi'] },
  { n: 8, tags: { amenity: 'restaurant', cuisine: 'greek' }, names: ['{N} Taverna', 'Olive & {N}'] },
  { n: 6, tags: { amenity: 'restaurant', cuisine: 'french' }, names: ['Bistro {N}', 'Chez {N}'] },
  { n: 8, tags: { amenity: 'restaurant', cuisine: 'seafood' }, names: ['The {N} Oyster', '{N} Fish Bar'] },
  { n: 5, tags: { amenity: 'restaurant', cuisine: 'steak_house' }, names: ['{N} Grill', 'The {N} Steakhouse'] },
  { n: 6, tags: { amenity: 'restaurant', cuisine: 'vegan', 'diet:vegan': 'only' }, names: ['{N} Greens', 'Leaf & {N}'] },
  { n: 12, tags: { amenity: 'fast_food', cuisine: 'burger' }, names: ['{N} Burgers', 'Smash {N}'] },
  { n: 7, tags: { amenity: 'fast_food', cuisine: 'chicken' }, names: ['{N} Fried Chicken', 'Cluck {N}'] },
  { n: 6, tags: { amenity: 'fast_food', cuisine: 'kebab' }, names: ['{N} Kebab', 'Grill {N}'] },
  { n: 9, tags: { shop: 'bakery' }, names: ['{N} Bakery', 'Crumb & {N}', '{N} Bakehouse'] },
  { n: 26, tags: { amenity: 'cafe' }, names: ['{N} Coffee', 'Café {N}', '{N} Roasters', 'The {N} Cup'] },
  { n: 7, tags: { amenity: 'cafe', cuisine: 'bubble_tea' }, names: ['{N} Bubble Tea', 'Boba {N}'] },
  { n: 6, tags: { amenity: 'ice_cream' }, names: ['{N} Gelato', 'Scoops {N}'] },
  { n: 14, tags: { amenity: 'pub' }, names: ['The {N} Arms', 'The {N} & Crown', 'The Old {N}'] },
  { n: 12, tags: { amenity: 'bar' }, names: ['{N} Bar', 'The {N} Room'] },
  { n: 5, tags: { amenity: 'bar', bar: 'cocktail' }, names: ['{N} Cocktail Club', 'Velvet {N}'] },
  { n: 3, tags: { amenity: 'cinema' }, names: ['{N} Picturehouse', 'The {N} Cinema'] },
  { n: 3, tags: { amenity: 'bowling_alley' }, names: ['{N} Lanes', 'Strike {N}'] },
  { n: 3, tags: { leisure: 'escape_game' }, names: ['Escape {N}', 'The {N} Puzzle Rooms'] },
  { n: 3, tags: { leisure: 'amusement_arcade' }, names: ['{N} Arcade', 'Pixel {N}'] },
  { n: 2, tags: { leisure: 'miniature_golf' }, names: ['{N} Crazy Golf'] },
  { n: 6, tags: { leisure: 'sports_centre' }, names: ['{N} Leisure Centre', '{N} Climbing Wall'] },
  { n: 2, tags: { amenity: 'nightclub' }, names: ['Club {N}'] },
  { n: 4, tags: { tourism: 'museum' }, names: ['{N} Maritime Museum', 'Museum of {N}', '{N} House Museum'] },
  { n: 5, tags: { tourism: 'gallery' }, names: ['{N} Gallery', 'The {N} Studio'] },
  { n: 3, tags: { amenity: 'theatre' }, names: ['{N} Playhouse', 'The {N} Theatre'] },
  { n: 3, tags: { amenity: 'library' }, names: ['{N} Library'] },
  { n: 8, tags: { leisure: 'playground' }, names: ['{N} Playground'] },
  { n: 4, tags: { tourism: 'viewpoint' }, names: ['{N} Lookout', '{N} Point'] },
  { n: 3, tags: { shop: 'mall' }, names: ['{N} Shopping Centre', 'The {N} Arcade Mall'] },
  { n: 5, tags: { shop: 'books' }, names: ['{N} Books', 'Chapter & {N}'] },
  { n: 3, tags: { shop: 'games' }, names: ['{N} Board Games'] },
  { n: 6, tags: { shop: 'clothes' }, names: ['{N} & Co.', '{N} Vintage'] },
  { n: 2, tags: { amenity: 'marketplace' }, names: ['{N} Market'] },
];
const HOURS = ['Mo-Su 08:00-22:00', 'Mo-Fr 07:30-18:00; Sa-Su 09:00-17:00', 'Tu-Su 12:00-23:00', 'Mo-Su 11:00-23:30', 'Mo-Sa 10:00-19:00', 'We-Su 17:00-01:00'];

function buildPoiElements() {
  const rand = rng(77);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  // Busier along main roads and near the centre.
  const busy = [];
  for (let k = 0; k < town.A.length; k++) if (town.kind[k]) busy.push(town.A[k]);
  const g = town.graph;
  const els = [];
  let nid = 1;
  const used = new Set();
  for (const t of TYPES) {
    for (let i = 0; i < t.n; i++) {
      let name;
      for (let tries = 0; tries < 8; tries++) { name = pick(t.names).replace('{N}', pick(NAMES)); if (!used.has(name)) break; }
      used.add(name);
      const node = rand() < 0.6 ? pick(busy) : Math.floor(rand() * g.n);
      if (!(g.adjStart[node + 1] > g.adjStart[node])) { i--; continue; }
      const lat = g.lat[node] + (rand() - 0.5) * 0.0005;
      const lon = g.lon[node] + (rand() - 0.5) * 0.0007;
      const addr = nearestAddress(lat, lon);
      els.push({
        type: 'node', id: nid++, lat, lon,
        tags: {
          name, ...t.tags,
          'addr:housenumber': String(addr.num), 'addr:street': addr.street, 'addr:suburb': addr.hood,
          opening_hours: t.tags.leisure === 'playground' || t.tags.tourism === 'viewpoint' ? '24/7' : pick(HOURS),
          ...(rand() < 0.4 ? { website: `${name.toLowerCase().replace(/[^a-z]+/g, '')}.example` } : {}),
          ...(rand() < 0.3 ? { outdoor_seating: 'yes' } : {}),
          ...(rand() < 0.5 ? { wheelchair: 'yes' } : {}),
        },
      });
    }
  }
  // Parks are places too.
  town.parks.forEach((p, i) => els.push({ type: 'way', id: 50000 + i, center: p.center, tags: { name: p.name, leisure: i === 1 ? 'garden' : 'park', opening_hours: '24/7' } }));
  return els;
}
const poiElements = buildPoiElements();

export async function findPois(center, { radius, minResults = 12 } = {}) {
  await new Promise((r) => setTimeout(r, 250));
  const radii = radius ? [radius] : [800, 1800, 4000];
  let pois = [], used = radii[0];
  for (const r of radii) {
    used = r;
    const near = poiElements.filter((el) => {
      const p = el.center || el;
      return haversine(center.lat, center.lon, p.lat, p.lon) <= r;
    });
    pois = parsePois(near, center);
    if (pois.length >= minResults) break;
  }
  return { pois, radius: used };
}

// ---------------------------------------------------------------- geocoding stand-ins

export async function searchAddress(q, { near, limit = 6 } = {}) {
  q = q.trim().toLowerCase();
  if (q.length < 2) return [];
  const numMatch = q.match(/^(\d+)\s*/);
  const num = numMatch ? Number(numMatch[1]) : null;
  const words = q.replace(/^\d+\s*/, '').split(/[\s,]+/).filter((w) => w && w !== TOWN.toLowerCase());
  if (!words.length) return [];
  const hit = (s) => words.every((w) => s.toLowerCase().includes(w));
  const results = [];
  const byStreet = new Map();
  for (const a of town.addresses) {
    if (!hit(`${a.street} ${a.hood}`)) continue;
    const key = `${a.street}|${a.hood}`;
    const cur = byStreet.get(key);
    const score = num != null ? Math.abs(a.num - num) : Math.abs(a.lon - CENTER.lon);
    if (!cur || score < cur.score) byStreet.set(key, { a, score });
  }
  for (const { a } of byStreet.values()) {
    results.push({ lat: a.lat, lon: a.lon, address: fmtAddress(a), title: `${a.num} ${a.street}`, subtitle: `${a.hood}, ${TOWN}` });
  }
  for (const el of poiElements) {
    if (!hit(el.tags.name)) continue;
    const p = el.center || el;
    results.push({ lat: p.lat, lon: p.lon, address: `${el.tags.name}, ${el.tags['addr:suburb'] || town.hood(p)}, ${TOWN}`, title: el.tags.name, subtitle: `${el.tags['addr:street'] ? `${el.tags['addr:housenumber']} ${el.tags['addr:street']}, ` : ''}${TOWN}` });
  }
  if (near) results.sort((x, y) => haversine(near.lat, near.lon, x.lat, x.lon) - haversine(near.lat, near.lon, y.lat, y.lon));
  return results.slice(0, limit);
}

export async function reverseGeocode(lat, lon) {
  const a = nearestAddress(lat, lon);
  return { lat, lon, address: fmtAddress(a), title: `${a.num} ${a.street}`, subtitle: `${a.hood}, ${TOWN}` };
}

/** No GPS in the test town: hand back a random address instead. */
export async function currentPosition() {
  const a = town.addresses[Math.floor(Math.random() * town.addresses.length)];
  return { lat: a.lat, lon: a.lon };
}

export async function loadNetwork(points, { onStatus = () => {} } = {}) {
  onStatus('Reading the streets of Port Verity…');
  await new Promise((r) => setTimeout(r, 350));
  return { graph: town.graph, source: 'osm' };
}

// ---------------------------------------------------------------- local "server"

const KEY = 'midway-test-v1';
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
const clean = (p) => ({ address: String(p.address || '').slice(0, 300), nickname: String(p.nickname || '').trim().slice(0, 60), lat: Number(p.lat), lon: Number(p.lon) });

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

/** A ready-made account: you plus three friends spread around town. */
export async function sampleLogin() {
  const email = 'sample@midway.test', password = 'midway-sample';
  const db = load();
  if (!db.users[email]) {
    const at = (x, y) => { const ll = toLL(x, y); const a = nearestAddress(ll.lat, ll.lon); return { address: fmtAddress(a), lat: a.lat, lon: a.lon }; };
    await api.signup(email, password, 'Alex');
    await api.updateMe({ home: at(-2700, 1100) });
    for (const [nickname, x, y] of [['Sam', 2900, 1600], ['Priya', 2300, -2100], ['Leo', -1600, -1900]]) {
      await api.addPlace({ ...at(x, y), nickname });
    }
  }
  return api.login(email, password);
}

// ---------------------------------------------------------------- base map

/** Draw the town (land, parks, river, streets, district names) under Leaflet's panes. */
export function addBasemap(map) {
  const canvas = document.createElement('canvas');
  canvas.className = 'basemap-canvas';
  map.getContainer().prepend(canvas);
  const ctx = canvas.getContext('2d');
  const crs = L.CRS.EPSG3857;
  const P = (ll) => crs.latLngToPoint(L.latLng(ll.lat, ll.lon), 0);
  const g = town.graph;
  const nodes = new Float64Array(g.n * 2);
  for (let i = 0; i < g.n; i++) { const p = P({ lat: g.lat[i], lon: g.lon[i] }); nodes[i * 2] = p.x; nodes[i * 2 + 1] = p.y; }
  const river = town.river.map(P);
  const parks = town.parks.map((p) => ({ ...p, ring: p.ring.map(P), c: P(p.center) }));
  const labels = town.labels.map((l) => ({ ...l, p: P(l) }));
  let dpr = 1;
  const css = () => {
    const s = getComputedStyle(document.documentElement);
    const v = (k) => s.getPropertyValue(k).trim();
    return { land: v('--map-land'), park: v('--map-park'), water: v('--map-water'), road: v('--map-road'), casing: v('--map-casing'), major: v('--map-major'), label: v('--map-label'), halo: v('--map-halo') };
  };
  function resize() {
    const size = map.getSize();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size.x * dpr; canvas.height = size.y * dpr;
    canvas.style.width = `${size.x}px`; canvas.style.height = `${size.y}px`;
    draw();
  }
  function draw() {
    if (!map._loaded) return; // no view yet
    const c = css();
    const z = map.getZoom();
    const s = 2 ** z;
    const o = map.getPixelBounds().min;
    const tx = (x) => x * s - o.x, ty = (y) => y * s - o.y;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = c.land;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.fillStyle = c.park;
    for (const p of parks) {
      ctx.beginPath();
      p.ring.forEach((q, i) => (i ? ctx.lineTo(tx(q.x), ty(q.y)) : ctx.moveTo(tx(q.x), ty(q.y))));
      ctx.fill();
    }
    ctx.strokeStyle = c.water;
    ctx.lineWidth = Math.max(6, 120 / (156543 * Math.cos((CENTER.lat * Math.PI) / 180) / s));
    ctx.beginPath();
    river.forEach((q, i) => (i ? ctx.lineTo(tx(q.x), ty(q.y)) : ctx.moveTo(tx(q.x), ty(q.y))));
    ctx.stroke();
    const mpp = 156543 * Math.cos((CENTER.lat * Math.PI) / 180) / s; // metres per pixel
    const minorW = Math.max(1, Math.min(7, 9 / mpp)), majorW = Math.max(2, Math.min(12, 16 / mpp));
    const pass = (k, width, color) => {
      ctx.beginPath();
      for (let e = 0; e < town.A.length; e++) {
        if (town.kind[e] !== k) continue;
        const a = town.A[e], b = town.B[e];
        ctx.moveTo(tx(nodes[a * 2]), ty(nodes[a * 2 + 1]));
        ctx.lineTo(tx(nodes[b * 2]), ty(nodes[b * 2 + 1]));
      }
      ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
    };
    if (z >= 15) pass(0, minorW + 1.5, c.casing);
    pass(0, minorW, c.road);
    pass(1, majorW + 2, c.casing);
    pass(1, majorW, c.major);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const text = (str, x, y, size, weight) => {
      ctx.font = `${weight} ${size}px ui-sans-serif, system-ui, sans-serif`;
      ctx.lineWidth = 4; ctx.strokeStyle = c.halo; ctx.strokeText(str, x, y);
      ctx.fillStyle = c.label; ctx.fillText(str, x, y);
    };
    if (z <= 15) for (const l of labels) text(l.name.toUpperCase(), tx(l.p.x), ty(l.p.y), 12, 700);
    if (z >= 14) for (const p of parks) text(p.name, tx(p.c.x), ty(p.c.y), 11, 600);
  }
  map.on('move zoom viewreset', draw);
  map.on('resize', resize);
  new MutationObserver(draw).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', draw);
  resize();
  map.whenReady(resize);
}

export const bounds = town.bounds;
export const townCenter = CENTER;
