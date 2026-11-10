// Self-contained test mode for Meet.
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
const COL_NAMES = ['Abbey', 'Bridge', 'Castle', 'Dock', 'Exchange', 'Ferry', 'Granary', 'Harbour', 'Inkwell', 'Jubilee', 'Keel', 'Lantern', 'Mill', 'Navigation', 'Observatory', 'Pier', 'Quay', 'Rope', 'Station', 'Tannery', 'Victoria', 'Wharf', 'Albion', 'Beacon', 'Chapel', 'Drapers', 'Eastgate', 'Foundry', 'Guild', 'Hythe', 'Kiln', 'Lighthouse', 'Market', 'Newgate', 'Orchard', 'Prospect', 'Regent', 'Salt', 'Tower', 'Ulster', 'Vicarage', 'Weaver', 'Anchor', 'Brewer', 'Canal', 'Dyer', 'Elder', 'Fisher', 'Glover', 'Hatter', 'Iron', 'Joiner', 'Kings', 'Lock', 'Mason', 'North', 'Oyster', 'Potter', 'Queens', 'Rope Walk', 'Sail', 'Tide', 'Union', 'Vintner', 'Water'];

// ---------------------------------------------------------------- the town

const W = 22000, H = 16000, S = 125; // metres: about 22 × 16 km, a street every 125 m
const ROW_PREFIX = ['', 'Little ', 'Old '];
const COL_PREFIX = ['', 'New ', 'Upper '];
const HOODS4 = [
  ['Northwood', 'Kingsbury', 'Highfield', 'Fairview', 'Ashby'],
  ['Westwood', 'Old Mill', 'Town Centre', 'Eastbank', 'Millbrook'],
  ['Southgate', 'Riverside', 'Market Quarter', 'Docklands', 'Saltmarsh'],
  ['Seaview', 'Harbour Quarter', 'The Wharf', 'Lighthouse Point', 'Shell Bay'],
];
const PARK_NAMES = ['Westwood Common', 'Castle Gardens', 'Harbour Fields', 'Southfields Park', 'Eastbank Green', 'Kingsbury Heath', 'Lantern Gardens', 'Ashby Meadows', 'Millbrook Park', 'Fairview Rec', 'Oak Hollow', 'Botanic Gardens', 'Saltmarsh Reserve', 'Beacon Hill', 'Orchard Green', 'Quarry Woods', 'Juniper Park'];
const kindOf = (i) => (i % 8 === 4 ? (i % 32 === 20 ? 2 : 1) : 0);
const rowStreet = (r) => `${ROW_PREFIX[Math.floor(r / ROW_NAMES.length)] || ''}${ROW_NAMES[r % ROW_NAMES.length]} ${['Street', 'Road', 'Parkway'][kindOf(r)]}`;
const colStreet = (c) => `${COL_PREFIX[Math.floor(c / COL_NAMES.length)] || ''}${COL_NAMES[c % COL_NAMES.length]} ${['Lane', 'Avenue', 'Boulevard'][kindOf(c)]}`;
const hoodAt = (x, y) => HOODS4[Math.max(0, Math.min(3, Math.floor((H / 2 - y) / (H / 4))))][Math.max(0, Math.min(4, Math.floor((x + W / 2) / (W / 5))))];

function buildTown() {
  const rand = rng(20261110);
  const cols = Math.round(W / S), rows = Math.round(H / S);
  const riverY = (x) => 1100 * Math.sin(x / 4200 + 0.3) + 380 * Math.sin(x / 1300) + 140 * Math.sin(x / 520);
  const coastY = (x) => -H / 2 + 2300 + 650 * Math.sin(x / 3000 + 1) + 280 * Math.sin(x / 1100 + 2);
  const lakes = [
    { x: -6800, y: 4600, rx: 950, ry: 560, name: 'Mirror Lake' },
    { x: 7400, y: 5300, rx: 720, ry: 480, name: 'Heron Lake' },
  ];
  const inEllipse = (e, x, y, k = 1) => ((x - e.x) / (e.rx * k)) ** 2 + ((y - e.y) / (e.ry * k)) ** 2 < 1;
  const inRiver = (x, y) => Math.abs(y - riverY(x)) < 70;
  const isWater = (x, y, m = 0) => Math.abs(y - riverY(x)) < 70 + m || y < coastY(x) + m || lakes.some((l) => inEllipse(l, x, y, 1 + m / 600));
  const parks = [{ x: 1800, y: 2900, rx: 950, ry: 620, name: 'Verity Park' }];
  for (let tries = 0; parks.length < PARK_NAMES.length + 1 && tries < 800; tries++) {
    const p = { x: (rand() - 0.5) * (W - 2400), y: (rand() - 0.5) * (H - 2400), rx: 260 + rand() * 420, ry: 220 + rand() * 320 };
    if (isWater(p.x, p.y, 500)) continue;
    if (parks.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < q.rx + p.rx + 900)) continue;
    p.name = PARK_NAMES[parks.length - 1];
    parks.push(p);
  }
  const inPark = (x, y) => parks.some((p) => inEllipse(p, x, y));

  // Street corners on a gently warped grid.
  const id = (r, c) => r * (cols + 1) + c;
  const n = (rows + 1) * (cols + 1);
  const X = new Float64Array(n), Y = new Float64Array(n), keep = new Uint8Array(n);
  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c <= cols; c++) {
      let x = -W / 2 + c * S, y = -H / 2 + r * S;
      x += 60 * Math.sin(y / 900) + 30 * Math.sin(y / 2300) + (rand() - 0.5) * 26;
      y += 50 * Math.sin(x / 1100) + 25 * Math.sin(x / 3100) + (rand() - 0.5) * 26;
      const i = id(r, c);
      X[i] = x; Y[i] = y;
      keep[i] = !isWater(x, y) && !inPark(x, y) ? 1 : 0;
    }
  }
  const A = [], B = [], kind = [], ename = [], eflag = [];
  const link = (a, b, k, name = '', flag = false) => { A.push(a); B.push(b); kind.push(k); ename.push(name); eflag.push(flag ? 1 : 0); };
  const crossesRiver = (a, b) => Math.sign(Y[a] - riverY(X[a])) !== Math.sign(Y[b] - riverY(X[b]));
  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c <= cols; c++) {
      const a = id(r, c);
      if (!keep[a]) continue;
      if (c < cols) {
        const b = id(r, c + 1), k = kindOf(r);
        if (keep[b] && !crossesRiver(a, b) && (k || rand() > 0.06)) link(a, b, k, rowStreet(r), c % 4 === 2);
      }
      if (r < rows) {
        const k = kindOf(c);
        let r2 = r + 1;
        // Every ninth street crosses the river on a bridge.
        if (c % 9 === 4) while (r2 <= rows && !keep[id(r2, c)] && inRiver(X[id(r2, c)], Y[id(r2, c)])) r2++;
        if (r2 > rows) continue;
        const b = id(r2, c);
        if (!keep[b]) continue;
        const bridge = crossesRiver(a, b);
        if (bridge && c % 9 !== 4) continue;
        if (bridge || k || rand() > 0.08) link(a, b, bridge ? Math.max(1, k) : k, colStreet(c), r % 4 === 2);
      }
    }
  }
  // Two diagonal boulevards.
  const diag = (r0, c0, dr, dc, len, name) => {
    for (let k = 0; k < len; k++) {
      const r = r0 + k * dr, c = c0 + k * dc, r1 = r + dr, c1 = c + dc;
      if (r1 < 0 || r1 > rows || c1 > cols) break;
      const a = id(r, c), b = id(r1, c1);
      if (keep[a] && keep[b] && !crossesRiver(a, b)) link(a, b, 2, name, k % 6 === 3);
    }
  };
  diag(8, 40, 1, 1, 110, 'Grand Boulevard');
  diag(120, 34, -1, 1, 95, 'Crescent Boulevard');

  const lat = new Float64Array(n), lon = new Float64Array(n);
  for (let i = 0; i < n; i++) { const ll = toLL(X[i], Y[i]); lat[i] = ll.lat; lon[i] = ll.lon; }
  const graph = fromEdgeList(lat, lon, A, B, false);

  // Addresses: every street corner gets a house number.
  const deg = new Int32Array(n);
  for (let k = 0; k < A.length; k++) { deg[A[k]]++; deg[B[k]]++; }
  const addresses = [];
  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c <= cols; c++) {
      const i = id(r, c);
      if (!deg[i]) continue;
      const useCol = r % 3 === 1 && kindOf(c) === 0;
      addresses.push({
        node: i, lat: lat[i], lon: lon[i], x: X[i], y: Y[i],
        num: useCol ? r * 2 + 1 : c * 4 + 2 + (r % 2),
        street: useCol ? colStreet(c) : rowStreet(r),
        hood: hoodAt(X[i], Y[i]),
      });
    }
  }

  // Map shapes.
  const ring = (e, k = 1, m = 48) => Array.from({ length: m }, (_, j) => toLL(e.x + e.rx * k * Math.cos((j / m) * 2 * Math.PI), e.y + e.ry * k * Math.sin((j / m) * 2 * Math.PI)));
  const river = [];
  for (let x = -W / 2 - 6000; x <= W / 2 + 6000; x += 50) river.push(toLL(x, riverY(x)));
  const sea = [];
  for (let x = -W / 2 - 60000; x <= W / 2 + 60000; x += 150) sea.push(toLL(x, coastY(x)));
  sea.push(toLL(W / 2 + 60000, -H / 2 - 60000), toLL(-W / 2 - 60000, -H / 2 - 60000));

  // Labels.
  const angle = (ax, ay, bx, by) => {
    let d = (Math.atan2(-(by - ay), bx - ax) * 180) / Math.PI;
    if (d > 90) d -= 180;
    if (d <= -90) d += 180;
    return Math.round(d);
  };
  const hoodLabels = [];
  const sums = new Map();
  for (const a of addresses) {
    const s = sums.get(a.hood) || { x: 0, y: 0, n: 0 };
    s.x += a.x; s.y += a.y; s.n++;
    sums.set(a.hood, s);
  }
  for (const [name, s] of sums) if (s.n > 60) hoodLabels.push({ name, ...toLL(s.x / s.n, s.y / s.n) });
  const streetLabels = [];
  for (let r = 0; r <= rows; r++) {
    if (!kindOf(r)) continue;
    for (let c = 6; c < cols; c += 10) {
      const a = id(r, c), b = id(r, c + 1);
      if (keep[a] && keep[b] && !crossesRiver(a, b)) streetLabels.push({ name: rowStreet(r), ...toLL((X[a] + X[b]) / 2, (Y[a] + Y[b]) / 2), angle: angle(X[a], Y[a], X[b], Y[b]) });
    }
  }
  for (let c = 0; c <= cols; c++) {
    if (!kindOf(c)) continue;
    for (let r = 6; r < rows; r += 10) {
      const a = id(r, c), b = id(r + 1, c);
      if (keep[a] && keep[b] && !crossesRiver(a, b)) streetLabels.push({ name: colStreet(c), ...toLL((X[a] + X[b]) / 2, (Y[a] + Y[b]) / 2), angle: angle(X[a], Y[a], X[b], Y[b]) });
    }
  }
  const waterLabels = [
    ...lakes.map((l) => ({ name: l.name, ...toLL(l.x, l.y) })),
    { name: 'Verity Bay', ...toLL(W * 0.12, -H / 2 + 500) },
    ...[-7000, 0, 7000].map((x) => ({ name: 'River Vere', ...toLL(x, riverY(x)), angle: angle(x - 60, riverY(x - 60), x + 60, riverY(x + 60)) })),
  ];
  const bayLabel = waterLabels.find((l) => l.name === 'Verity Bay');

  // Generous pan limits so the map can sit above a half-height sheet on phones.
  const sw = toLL(-W / 2 - 6000, -H / 2 - 7000), ne = toLL(W / 2 + 6000, H / 2 + 5000);
  return {
    graph, A, B, kind, ename, eflag, addresses, river, sea,
    lakes: lakes.map((l) => ({ ...l, ring: ring(l) })),
    parks: parks.map((p) => ({ name: p.name, center: toLL(p.x, p.y), ring: ring(p, 0.97, 40) })),
    labels: {
      town: [{ name: TOWN, ...toLL(0, H / 2 + 1100) }], bay: [bayLabel], hood: hoodLabels, street: streetLabels,
      water: waterLabels.filter((l) => l !== bayLabel), park: parks.map((p) => ({ name: p.name, ...toLL(p.x, p.y) })),
    },
    bounds: [[sw.lat, sw.lon], [ne.lat, ne.lon]],
    hood: (ll) => hoodAt((ll.lon - CENTER.lon) * M_LON, (ll.lat - CENTER.lat) * M_LAT),
  };
}

const town = buildTown();

// Spatial index so "nearest address" stays fast in a big town.
const CELL = 300;
const addrIndex = new Map();
for (const a of town.addresses) {
  const k = `${Math.floor(a.x / CELL)},${Math.floor(a.y / CELL)}`;
  if (!addrIndex.has(k)) addrIndex.set(k, []);
  addrIndex.get(k).push(a);
}
function nearestAddress(lat, lon) {
  const x = (lon - CENTER.lon) * M_LON, y = (lat - CENTER.lat) * M_LAT;
  const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
  let best = null, bd = Infinity;
  for (let ring = 0; ring < 60; ring++) {
    for (let i = cx - ring; i <= cx + ring; i++) {
      for (let j = cy - ring; j <= cy + ring; j++) {
        if (Math.max(Math.abs(i - cx), Math.abs(j - cy)) !== ring) continue;
        for (const a of addrIndex.get(`${i},${j}`) || []) {
          const d = (a.x - x) ** 2 + (a.y - y) ** 2;
          if (d < bd) { bd = d; best = a; }
        }
      }
    }
    if (best && ring >= 1) break;
  }
  return best || town.addresses[0];
}
const fmtAddress = (a) => `${a.num} ${a.street}, ${a.hood}, ${TOWN}`;

// ---------------------------------------------------------------- places of interest

const NAMES = ['Nova', 'Lumen', 'Bramble', 'Cobalt', 'Saltbox', 'Kettle', 'Marlow', 'Tamsin', 'Indigo', 'Corner', 'Linden', 'Hollis', 'Rosa', 'Marco', 'Luca', 'Nonna', 'Bella', 'Sole', 'Verde', 'Porto', 'Aria', 'Gino', 'Mio', 'Kiku', 'Hana', 'Sora', 'Taj', 'Raja', 'Lotus', 'Saffron', 'Jade', 'Golden', 'Blue', 'Copper', 'Harbour', 'Lantern', 'Anchor', 'Mill', 'Quay', 'Driftwood', 'Tide', 'Ember', 'Juniper', 'Fox', 'Otter', 'Heron', 'Wren', 'Pepper', 'Basil', 'Olive', 'Fig', 'Clove'];
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
    for (let i = 0; i < t.n * 6; i++) {
      let name;
      for (let tries = 0; tries < 8; tries++) { name = pick(t.names).replace('{N}', pick(NAMES)); if (!used.has(name)) break; }
      used.add(name);
      const node = rand() < 0.6 ? pick(busy) : pick(town.addresses).node;
      const lat = g.lat[node] + (rand() - 0.5) * 0.0004;
      const lon = g.lon[node] + (rand() - 0.5) * 0.0005;
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

/** A ready-made group: you plus three friends spread around town. */
export function sampleGroup() {
  const at = (x, y) => { const ll = toLL(x, y); const a = nearestAddress(ll.lat, ll.lon); return { address: fmtAddress(a), lat: a.lat, lon: a.lon }; };
  return {
    home: at(-3600, 2600),
    friends: [['Sam', 3400, 3300], ['Priya', 2600, -2800], ['Leo', -2800, -2400]].map(([nickname, x, y]) => ({ ...at(x, y), nickname })),
  };
}

// ---------------------------------------------------------------- base map

/**
 * Draw the town as real map tiles (Leaflet GridLayer), so panning, wheel and
 * pinch zoom behave like any web map. Street, district, park and water names
 * sit in their own pane and appear as you zoom in.
 */
export function addBasemap(map) {
  const crs = L.CRS.EPSG3857;
  const P0 = (p) => crs.latLngToPoint(L.latLng(p.lat, p.lon), 0);
  const g = town.graph;
  const nx = new Float64Array(g.n), ny = new Float64Array(g.n);
  for (let i = 0; i < g.n; i++) { const p = P0({ lat: g.lat[i], lon: g.lon[i] }); nx[i] = p.x; ny[i] = p.y; }

  // Bucket edges so each tile only touches nearby streets.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let e = 0; e < town.A.length; e++) for (const v of [town.A[e], town.B[e]]) {
    if (nx[v] < minX) minX = nx[v]; if (nx[v] > maxX) maxX = nx[v];
    if (ny[v] < minY) minY = ny[v]; if (ny[v] > maxY) maxY = ny[v];
  }
  const cell = (maxX - minX) / 160;
  const buckets = new Map();
  for (let e = 0; e < town.A.length; e++) {
    const a = town.A[e], b = town.B[e];
    const bx0 = Math.floor((Math.min(nx[a], nx[b]) - minX) / cell), bx1 = Math.floor((Math.max(nx[a], nx[b]) - minX) / cell);
    const by0 = Math.floor((Math.min(ny[a], ny[b]) - minY) / cell), by1 = Math.floor((Math.max(ny[a], ny[b]) - minY) / cell);
    for (let bx = bx0; bx <= bx1; bx++) for (let by = by0; by <= by1; by++) {
      const k = bx * 65536 + by;
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push(e);
    }
  }
  const seen = new Int32Array(town.A.length);
  let stamp = 0;
  const sea = town.sea.map(P0), river = town.river.map(P0);
  const lakes = town.lakes.map((l) => l.ring.map(P0)), parks = town.parks.map((p) => p.ring.map(P0));
  const colors = () => {
    const s = getComputedStyle(document.documentElement);
    const v = (k) => s.getPropertyValue(k).trim();
    return { land: v('--map-land'), park: v('--map-park'), water: v('--map-water'), road: v('--map-road'), casing: v('--map-casing'), major: v('--map-major'), majorCasing: v('--map-major-casing'), label: v('--map-label'), halo: v('--map-halo'), font: s.getPropertyValue('--font') };
  };
  const mppAt0 = 156543.03 * Math.cos((CENTER.lat * Math.PI) / 180);

  function drawTile(canvas, coords) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = 256 * dpr; canvas.height = 256 * dpr;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const z = coords.z, s = 2 ** z, ox = coords.x * 256, oy = coords.y * 256;
    const X = (x) => x * s - ox, Y = (y) => y * s - oy;
    const c = colors();
    const mpp = mppAt0 / s;
    ctx.fillStyle = c.land;
    ctx.fillRect(0, 0, 256, 256);
    const fill = (pts, color) => {
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(X(p.x), Y(p.y)) : ctx.moveTo(X(p.x), Y(p.y))));
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
    };
    parks.forEach((p) => fill(p, c.park));
    fill(sea, c.water);
    lakes.forEach((l) => fill(l, c.water));
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    river.forEach((p, i) => (i ? ctx.lineTo(X(p.x), Y(p.y)) : ctx.moveTo(X(p.x), Y(p.y))));
    ctx.strokeStyle = c.water;
    ctx.lineWidth = Math.max(2.5, 130 / mpp);
    ctx.stroke();

    const pad = 14 / s;
    const x0 = ox / s - pad, x1 = (ox + 256) / s + pad, y0 = oy / s - pad, y1 = (oy + 256) / s + pad;
    if (x1 < minX || x0 > maxX || y1 < minY || y0 > maxY) return;
    stamp++;
    const byKind = [[], [], []];
    for (let bx = Math.max(0, Math.floor((x0 - minX) / cell)); bx <= Math.floor((x1 - minX) / cell); bx++) {
      for (let by = Math.max(0, Math.floor((y0 - minY) / cell)); by <= Math.floor((y1 - minY) / cell); by++) {
        for (const e of buckets.get(bx * 65536 + by) || []) {
          if (seen[e] === stamp) continue;
          seen[e] = stamp;
          byKind[town.kind[e]].push(e);
        }
      }
    }
    const stroke = (list, width, color) => {
      if (!list.length) return;
      ctx.beginPath();
      for (const e of list) {
        const a = town.A[e], b = town.B[e];
        ctx.moveTo(X(nx[a]), Y(ny[a]));
        ctx.lineTo(X(nx[b]), Y(ny[b]));
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.stroke();
    };
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const w0 = clamp(10 / mpp, 0.7, 9), w1 = clamp(15 / mpp, 1.5, 13), w2 = clamp(22 / mpp, 2.2, 18);
    if (z >= 13) {
      if (z >= 15) stroke(byKind[0], w0 + 1.6, c.casing);
      ctx.globalAlpha = z >= 14 ? 1 : 0.75;
      stroke(byKind[0], w0, c.road);
      ctx.globalAlpha = 1;
    }
    stroke(byKind[1], w1 + 2, c.casing);
    stroke(byKind[1], w1, c.road);
    stroke(byKind[2], w2 + 2, c.majorCasing);
    stroke(byKind[2], w2, c.major);

    // Side-street names, written along the street, once you're zoomed right in.
    if (z >= 17) {
      ctx.font = `500 11px ${c.font}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 3;
      ctx.strokeStyle = c.halo;
      ctx.fillStyle = c.label;
      for (const e of byKind[0]) {
        if (!town.eflag[e]) continue;
        const a = town.A[e], b = town.B[e];
        const ax = X(nx[a]), ay = Y(ny[a]), bx = X(nx[b]), by = Y(ny[b]);
        const mx = (ax + bx) / 2, my = (ay + by) / 2, len = Math.hypot(bx - ax, by - ay);
        const text = town.ename[e];
        const tw = ctx.measureText(text).width;
        if (tw + 16 > len) continue;
        let ang = Math.atan2(by - ay, bx - ax);
        if (ang > Math.PI / 2) ang -= Math.PI;
        if (ang < -Math.PI / 2) ang += Math.PI;
        const hx = (tw / 2) * Math.abs(Math.cos(ang)) + 7 * Math.abs(Math.sin(ang)) + 2;
        const hy = (tw / 2) * Math.abs(Math.sin(ang)) + 7 * Math.abs(Math.cos(ang)) + 2;
        if (mx - hx < 0 || mx + hx > 256 || my - hy < 0 || my + hy > 256) continue; // keep labels whole
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
  const layer = new Basemap({ tileSize: 256, keepBuffer: 4, updateWhenZooming: false }).addTo(map);

  // Names on the map.
  map.createPane('labels');
  const pane = map.getPane('labels');
  pane.style.zIndex = 380;
  pane.style.pointerEvents = 'none';
  const label = (l, cls) => L.marker([l.lat, l.lon], {
    pane: 'labels', interactive: false, keyboard: false,
    icon: L.divIcon({ className: `map-label ${cls}`, iconSize: [0, 0], html: `<span style="transform:translate(-50%,-50%) rotate(${l.angle || 0}deg)">${l.name}</span>` }),
  });
  const groups = Object.fromEntries(Object.entries(town.labels).map(([k, list]) => [k, L.layerGroup(list.map((l) => label(l, k)))]));
  const visible = { town: (z) => z < 12.25, bay: () => true, hood: (z) => z >= 12.25 && z < 15.5, water: (z) => z >= 12, park: (z) => z >= 13.5, street: (z) => z >= 15.5 };
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
}

export const bounds = town.bounds;
export const townCenter = CENTER;
