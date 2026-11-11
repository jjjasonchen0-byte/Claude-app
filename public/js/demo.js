// Self-contained test mode for Meet.
//
// Replaces everything that needs the internet or a server with local
// stand-ins, so the real app code can run inside a sandboxed page:
//   • a generated town ("Port Verity") with streets, a river, bridges and parks,
//     drawn as the base map and used as the road network
//   • address search / reverse geocoding over the town's street addresses
//   • ~380 places of interest, tagged like OpenStreetMap data
//   • accounts, addresses and history kept in this browser's storage
import { fromEdgeList, rng, dijkstra } from './graph.js';
import { parsePois } from './pois.js';
import { haversine } from './geo.js';

const TOWN = 'Port Verity';
const CENTER = { lat: 40.0, lon: -40.0 }; // a fictional island in the open Atlantic
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
  const riverY = (x) => 1100 * Math.sin(x / 4200 + 0.3) + 430 * Math.sin(x / 1500 + 1.1) + 170 * Math.sin(x / 610) + 55 * Math.sin(x / 240 + 2);
  const far = (x) => { const t = Math.min(1, Math.max(0, (Math.abs(x) - 16000) / 24000)); return t * t * (3 - 2 * t); };
  const coastY = (x) => -H / 2 + 2300 + 650 * Math.sin(x / 3000 + 1) + 300 * Math.sin(x / 1100 + 2) + 120 * Math.sin(x / 430 + 0.5) + 45 * Math.sin(x / 170)
    + far(x) * (4200 * Math.sin(x / 19000 + 0.7) + 1800 * Math.sin(x / 7300 + 1.9) - 1500);

  // Irregular "blob" outlines for parks and lakes: an ellipse with wobbles.
  const blobR = (e, ang) => 1 + 0.16 * Math.sin(3 * ang + e.p1) + 0.09 * Math.sin(5 * ang + e.p2) + 0.05 * Math.sin(8 * ang + e.p3);
  const inBlob = (e, x, y, k = 1) => {
    const dx = (x - e.x) / e.rx, dy = (y - e.y) / e.ry;
    return dx * dx + dy * dy < (blobR(e, Math.atan2(dy, dx)) * k) ** 2;
  };
  const wobble = (e) => Object.assign(e, { p1: rand() * 6.28, p2: rand() * 6.28, p3: rand() * 6.28 });
  const lakes = [
    wobble({ x: -6800, y: 4600, rx: 950, ry: 560, name: 'Mirror Lake' }),
    wobble({ x: 7400, y: 5300, rx: 720, ry: 480, name: 'Heron Lake' }),
  ];
  const inRiver = (x, y) => Math.abs(y - riverY(x)) < 70;
  const isWater = (x, y, m = 0) => Math.abs(y - riverY(x)) < 70 + m || y < coastY(x) + m || lakes.some((l) => inBlob(l, x, y, 1 + m / 600));
  const parks = [wobble({ x: 1800, y: 2900, rx: 950, ry: 620, name: 'Verity Park' })];
  for (let tries = 0; parks.length < PARK_NAMES.length + 1 && tries < 900; tries++) {
    const p = { x: (rand() - 0.5) * (W - 2400), y: (rand() - 0.5) * (H - 2400), rx: 200 + rand() * 520, ry: 170 + rand() * 380 };
    if (isWater(p.x, p.y, 500)) continue;
    if (parks.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < q.rx + p.rx + 700)) continue;
    p.name = PARK_NAMES[parks.length - 1];
    parks.push(wobble(p));
  }
  const inPark = (x, y) => parks.some((p) => inBlob(p, x, y));

  // Districts, each with its own street angle and character:
  //   old    — tangled lanes with diagonal shortcuts
  //   grid   — regular blocks
  //   suburb — long blocks and dead ends
  //   garden — long blocks the other way, curving closes
  const districts = [];
  for (let k = 0; k < 13; k++) {
    districts.push({ x: (rand() - 0.5) * W * 0.95, y: (rand() - 0.5) * H * 0.95, a: (rand() - 0.5) * 0.62, type: ['grid', 'suburb', 'garden', 'grid', 'suburb'][Math.floor(rand() * 5)] });
  }
  districts.reduce((best, d) => (Math.hypot(d.x, d.y - 900) < Math.hypot(best.x, best.y - 900) ? d : best)).type = 'old';
  const districtAt = (x, y) => districts.reduce((best, d) => ((d.x - x) ** 2 + (d.y - y) ** 2 < (best.x - x) ** 2 + (best.y - y) ** 2 ? d : best));

  // Smooth random warping (a few long waves in random directions) on top of
  // blended district rotations, so streets curve and blocks vary in size.
  const waves = [[9000, 300], [5200, 150], [2600, 60], [1300, 22]].map(([L, A]) => {
    const t = rand() * Math.PI * 2, u = rand() * Math.PI * 2, k = (2 * Math.PI) / L;
    return { kx: k * Math.cos(t), ky: k * Math.sin(t), ux: A * Math.cos(u), uy: A * Math.sin(u), ph: rand() * 6.28 };
  });
  const SIG2 = 2 * 3300 * 3300;
  const place = (x0, y0) => {
    let sw = 0, sx = 0, sy = 0;
    for (const d of districts) {
      const w = Math.exp(-((x0 - d.x) ** 2 + (y0 - d.y) ** 2) / SIG2) + 1e-12;
      const ca = Math.cos(d.a), sa = Math.sin(d.a), dx = x0 - d.x, dy = y0 - d.y;
      sx += w * (d.x + ca * dx - sa * dy);
      sy += w * (d.y + sa * dx + ca * dy);
      sw += w;
    }
    let x = sx / sw, y = sy / sw;
    for (const v of waves) {
      const s = Math.sin(x0 * v.kx + y0 * v.ky + v.ph);
      x += v.ux * s;
      y += v.uy * s;
    }
    return [x, y];
  };

  // Street corners.
  const id = (r, c) => r * (cols + 1) + c;
  const n = (rows + 1) * (cols + 1);
  const X = new Float64Array(n), Y = new Float64Array(n), keep = new Uint8Array(n);
  const dist = new Array(n);
  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c <= cols; c++) {
      const x0 = -W / 2 + c * S, y0 = -H / 2 + r * S;
      const dd = districtAt(x0, y0);
      let [x, y] = place(x0, y0);
      const j = dd.type === 'old' ? 40 : 20;
      x += (rand() - 0.5) * j;
      y += (rand() - 0.5) * j;
      const i = id(r, c);
      X[i] = x; Y[i] = y; dist[i] = dd;
      keep[i] = !isWater(x, y) && !inPark(x, y) ? 1 : 0;
    }
  }
  const A = [], B = [], kind = [], ename = [], eflag = [];
  const hName = new Array(n), vName = new Array(n), wName = new Array(n);
  const link = (a, b, k, name = '', flag = false) => { A.push(a); B.push(b); kind.push(k); ename.push(name); eflag.push(flag ? 1 : 0); };
  const crossesRiver = (a, b) => Math.sign(Y[a] - riverY(X[a])) !== Math.sign(Y[b] - riverY(X[b]));
  const keepH = { old: (r) => rand() > 0.16, grid: () => rand() > 0.05, suburb: (r) => r % 2 === 0 && rand() > 0.22, garden: () => rand() > 0.12 };
  const keepV = { old: () => rand() > 0.16, grid: () => rand() > 0.07, suburb: () => rand() > 0.12, garden: (c) => c % 2 === 0 && rand() > 0.18 };
  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c <= cols; c++) {
      const a = id(r, c);
      if (!keep[a]) continue;
      const type = dist[a].type;
      if (c < cols) {
        const b = id(r, c + 1), k = kindOf(r);
        if (keep[b] && !crossesRiver(a, b) && (k || keepH[type](r))) {
          link(a, b, k, rowStreet(r), c % 4 === 2);
          hName[a] = hName[b] = rowStreet(r);
        }
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
        if (bridge || k || keepV[type](c)) {
          link(a, b, bridge ? Math.max(1, k) : k, colStreet(c), r % 4 === 2);
          vName[a] = vName[b] = colStreet(c);
        }
      }
      // Old-town shortcuts cut across blocks.
      if (type === 'old' && r < rows && c < cols && rand() < 0.3) {
        const flip = rand() < 0.5;
        const p = flip ? id(r, c + 1) : a, q = flip ? id(r + 1, c) : id(r + 1, c + 1);
        if (keep[p] && keep[q] && !crossesRiver(p, q)) {
          const name = `${ROW_NAMES[(r * 7 + c * 3) % ROW_NAMES.length]} Walk`;
          link(p, q, 0, name, (r + c) % 3 === 0);
          wName[p] = wName[p] || name;
          wName[q] = wName[q] || name;
        }
      }
    }
  }
  // Two diagonal boulevards.
  const diag = (r0, c0, dr, dc, len, name) => {
    for (let k = 0; k < len; k++) {
      const r = r0 + k * dr, c = c0 + k * dc, r1 = r + dr, c1 = c + dc;
      if (r1 < 0 || r1 > rows || c1 > cols) break;
      const a = id(r, c), b = id(r1, c1);
      if (keep[a] && keep[b] && !crossesRiver(a, b)) {
        link(a, b, 2, name, k % 6 === 3);
        wName[a] = wName[a] || name;
        wName[b] = wName[b] || name;
      }
    }
  };
  diag(8, 40, 1, 1, 110, 'Grand Boulevard');
  diag(120, 34, -1, 1, 95, 'Crescent Boulevard');

  const lat = new Float64Array(n), lon = new Float64Array(n);
  for (let i = 0; i < n; i++) { const ll = toLL(X[i], Y[i]); lat[i] = ll.lat; lon[i] = ll.lon; }

  // Addresses: every street corner gets a house number on a street it's on.
  const addresses = [];
  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c <= cols; c++) {
      const i = id(r, c);
      if (!hName[i] && !vName[i] && !wName[i]) continue;
      const preferCol = r % 3 === 1 && kindOf(c) === 0;
      let street, num;
      if (vName[i] && (preferCol || !hName[i])) { street = vName[i]; num = r * 2 + 1; }
      else if (hName[i]) { street = hName[i]; num = c * 4 + 2 + (r % 2); }
      else { street = wName[i]; num = (r + c) * 2 + 1; }
      addresses.push({ node: i, lat: lat[i], lon: lon[i], x: X[i], y: Y[i], num, street, hood: hoodAt(X[i], Y[i]) });
    }
  }

  // Map shapes.
  const ring = (e, k = 1, m = 64) => Array.from({ length: m }, (_, j) => {
    const ang = (j / m) * 2 * Math.PI, rr = blobR(e, ang) * k;
    return toLL(e.x + e.rx * rr * Math.cos(ang), e.y + e.ry * rr * Math.sin(ang));
  });

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
    X, Y, A, B, kind, ename, eflag, addresses, riverY, coastY, blobR,
    lakes: lakes.map((l) => ({ ...l, ring: ring(l) })),
    parks: parks.map((p) => ({ name: p.name, center: toLL(p.x, p.y), ring: ring(p, 0.97) })),
    labels: {
      city: [{ name: TOWN, ...toLL(0, H / 2 + 1100) }], bay: [bayLabel], hood: hoodLabels, street: streetLabels,
      water: waterLabels.filter((l) => l !== bayLabel), park: parks.map((p) => ({ name: p.name, ...toLL(p.x, p.y) })),
    },
    bounds: [[sw.lat, sw.lon], [ne.lat, ne.lon]],
    hood: (ll) => hoodAt((ll.lon - CENTER.lon) * M_LON, (ll.lat - CENTER.lat) * M_LAT),
  };
}

// ---------------------------------------------------------------- the region around the city

const RX0 = -110000, RX1 = 110000, RY0 = -40000, RY1 = 130000; // about 220 × 170 km
const SETTLEMENT_NAMES = ['Ashcombe', 'Bramley', 'Calder', 'Dunmore', 'Elmstead', 'Fenwick', 'Glenhaven', 'Hartwell', 'Ivybridge', 'Kelso', 'Larkhill', 'Marston', 'Northam', 'Oakhurst', 'Pembury', 'Quenby', 'Redfield', 'Selsey', 'Thornbury', 'Upwood', 'Westerley', 'Yarnton', 'Alderley', 'Brockwell', 'Coldharbour', 'Downley', 'Eastleigh', 'Foxholes', 'Greystone', 'Hollins', 'Kingsmere', 'Littlecote', 'Millhaven', 'Netherby', 'Overton', 'Pinewood', 'Rushden', 'Stonebridge', 'Tilford', 'Wexcombe', 'Amberley', 'Burwell', 'Cranbrook', 'Ditchling', 'Easton'];
const FOREST_NAMES = ['Ashdown Forest', 'Bracken Wood', 'Cold Ash Woods', 'Deepdene Forest', 'Elder Wood', 'Fernhill Forest', 'Gallows Wood', 'Hazelhurst', 'Ironwood', 'Kingswood', 'Long Copse', 'Moorland Forest', 'Nettlebed Wood', 'Oakhanger Woods'];
const LAKE_NAMES = ['Lake Calder', 'Silver Mere', 'Swanwater', 'Long Water', 'Kestrel Mere', 'Blackwater', 'Linnet Lake', 'Stillwater', 'Moor Pool', 'Teal Lake', 'Glass Lake', 'Reedmere', 'Coot Pond', 'Otter Lake'];

function buildRegion(city) {
  const rand = rng(424242);
  const { riverY, coastY, blobR } = city;
  const xs = Array.from(city.X), ys = Array.from(city.Y);
  const A = city.A.slice(), B = city.B.slice(), kind = city.kind.slice(), ename = city.ename.slice(), eflag = city.eflag.slice();
  const addNode = (x, y) => { xs.push(x); ys.push(y); return xs.length - 1; };
  const link = (a, b, k, name = '', flag = false) => { A.push(a); B.push(b); kind.push(k); ename.push(name); eflag.push(flag ? 1 : 0); };
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];

  // A second river, the Ash, flows south into the Vere east of the city.
  const ashX = (y) => 38000 + 3200 * Math.sin(y / 9000 + 0.4) + 1300 * Math.sin(y / 2700 + 1.3) + 400 * Math.sin(y / 900);
  const inVere = (x, y) => Math.abs(y - riverY(x)) < 70;
  const inAsh = (x, y) => y > riverY(x) && Math.abs(x - ashX(y)) < 55;
  const blob = (e, x, y, k = 1) => {
    const dx = (x - e.x) / e.rx, dy = (y - e.y) / e.ry;
    if (dx > 1.4 * k || dx < -1.4 * k || dy > 1.4 * k || dy < -1.4 * k) return false;
    return dx * dx + dy * dy < (blobR(e, Math.atan2(dy, dx)) * k) ** 2;
  };
  const wobble = (e) => Object.assign(e, { p1: rand() * 6.28, p2: rand() * 6.28, p3: rand() * 6.28 });
  const inCityZone = (x, y, m = 0) => Math.abs(x) < W / 2 + m && y < H / 2 + m && y > -H / 2 - 4000;
  const lakes = [];
  // The region is an island: a rounded, wobbly outline, cut by the city's coast in the south.
  const IC = { x: 0, y: 44000, ax: 108000, ay: 84000, p: 3.2 };
  const ip = [rand() * 6.28, rand() * 6.28, rand() * 6.28, rand() * 6.28];
  const edgeR = (phi) => 1 + 0.05 * Math.sin(3 * phi + ip[0]) + 0.035 * Math.sin(7 * phi + ip[1]) + 0.018 * Math.sin(13 * phi + ip[2]) + 0.008 * Math.sin(29 * phi + ip[3]);
  const islandNorm = (x, y) => {
    const u = (x - IC.x) / IC.ax, v = (y - IC.y) / IC.ay;
    return [(Math.abs(u) ** IC.p + Math.abs(v) ** IC.p) ** (1 / IC.p), Math.atan2(v, u)];
  };
  const onIsland = (x, y, m = 0) => {
    const [r, phi] = islandNorm(x, y);
    return r < edgeR(phi) - m / IC.ay;
  };
  const isSea = (x, y) => y < coastY(x) || !onIsland(x, y);
  const isRiver = (x, y) => inVere(x, y) || inAsh(x, y);
  const isWater = (x, y) => isSea(x, y) || isRiver(x, y) || lakes.some((l) => blob(l, x, y));
  const randLand = (m) => {
    for (let t = 0; t < 200; t++) {
      const x = RX0 + 4000 + rand() * (RX1 - RX0 - 8000), y = RY0 + rand() * (RY1 - RY0 - 4000);
      if (y > coastY(x) + m && onIsland(x, y, m) && !isRiver(x, y) && !inCityZone(x, y, m)) return [x, y];
    }
    return null;
  };

  // Lakes and forests.
  for (let t = 0; lakes.length < LAKE_NAMES.length && t < 400; t++) {
    const p = randLand(3000);
    if (!p) continue;
    const l = wobble({ x: p[0], y: p[1], rx: 500 + rand() * 1800, ry: 350 + rand() * 1100 });
    if (Math.abs(l.y - riverY(l.x)) < 3000 || Math.abs(l.x - ashX(l.y)) < 3000) continue;
    if (lakes.some((o) => Math.hypot(o.x - l.x, o.y - l.y) < 9000)) continue;
    l.name = LAKE_NAMES[lakes.length];
    lakes.push(l);
  }
  const forests = [];
  for (let t = 0; forests.length < 75 && t < 600; t++) {
    const p = randLand(2500);
    if (!p) continue;
    const f = wobble({ x: p[0], y: p[1], rx: 900 + rand() * 4200, ry: 700 + rand() * 3000 });
    if (lakes.some((l) => blob(l, f.x, f.y, 1.5))) continue;
    forests.push(f);
  }
  forests.sort((a, b) => b.rx * b.ry - a.rx * a.ry);
  forests.slice(0, FOREST_NAMES.length).forEach((f, i) => { f.name = FOREST_NAMES[i]; });

  // Market towns and villages, each a small street grid at its own angle.
  const names = SETTLEMENT_NAMES.slice().sort(() => rand() - 0.5);
  const settlements = [];
  const plan = [...Array(13).fill('town'), ...Array(32).fill('village')];
  for (const type of plan) {
    for (let t = 0; t < 400; t++) {
      const R = type === 'town' ? 1300 + rand() * 1700 : 350 + rand() * 450;
      const p = randLand(R + 4000);
      if (!p) continue;
      const [x, y] = p;
      if (isWater(x, y) || Math.abs(y - riverY(x)) < R + 300 || Math.abs(x - ashX(y)) < R + 300) continue;
      if (lakes.some((l) => blob(l, x, y, 1 + (R + 600) / Math.min(l.rx, l.ry)))) continue;
      if (settlements.some((s) => Math.hypot(s.x - x, s.y - y) < (s.type === 'town' && type === 'town' ? 16000 : s.R + R + 5000))) continue;
      settlements.push(wobble({ name: names[settlements.length], type, x, y, R, rx: R, ry: R, a: (rand() - 0.5) * 1.4, nodes: [] }));
      break;
    }
  }
  const nodeStreet = new Map(); // node -> { street, num, hood, city }
  const ROAD_KINDS = ['Street', 'Road', 'Close', 'Way', 'Gardens', 'Drive'];
  settlements.forEach((s, si) => {
    const sp = s.type === 'town' ? 135 : 120;
    const n = Math.ceil((s.R * 1.35) / sp);
    const ca = Math.cos(s.a), sa = Math.sin(s.a);
    const grid = new Map();
    const ph = rand() * 6.28;
    for (let j = -n; j <= n; j++) {
      for (let i = -n; i <= n; i++) {
        let lx = i * sp, ly = j * sp;
        lx += 28 * Math.sin(ly / 420 + ph) + (rand() - 0.5) * 22;
        ly += 22 * Math.sin(lx / 510 + ph) + (rand() - 0.5) * 22;
        const x = s.x + ca * lx - sa * ly, y = s.y + sa * lx + ca * ly;
        if (!blob(s, x, y) || isWater(x, y)) continue;
        const id = addNode(x, y);
        grid.set(`${i},${j}`, id);
        s.nodes.push(id);
      }
    }
    const rowName = (j) => (j === 0 ? 'High Street' : `${ROW_NAMES[(j + n + si * 7) % ROW_NAMES.length]} ${ROAD_KINDS[(j + si) % ROAD_KINDS.length]}`);
    const colName = (i) => (i === 0 ? (s.type === 'town' ? 'Station Road' : 'Church Lane') : `${COL_NAMES[(i + n + si * 5) % COL_NAMES.length]} Lane`);
    const keepP = s.type === 'town' ? 0.88 : 0.8;
    for (let j = -n; j <= n; j++) {
      for (let i = -n; i <= n; i++) {
        const a = grid.get(`${i},${j}`);
        if (a === undefined) continue;
        const right = grid.get(`${i + 1},${j}`), up = grid.get(`${i},${j + 1}`);
        if (right !== undefined && !isWater((xs[a] + xs[right]) / 2, (ys[a] + ys[right]) / 2) && (j === 0 || rand() < keepP)) {
          link(a, right, j === 0 ? 1 : 0, rowName(j), ((i % 4) + 4) % 4 === 2);
          if (!nodeStreet.has(a)) nodeStreet.set(a, { street: rowName(j), num: (i + n) * 4 + 2 });
          if (!nodeStreet.has(right)) nodeStreet.set(right, { street: rowName(j), num: (i + n + 1) * 4 + 2 });
        }
        if (up !== undefined && !isWater((xs[a] + xs[up]) / 2, (ys[a] + ys[up]) / 2) && (i === 0 || rand() < keepP)) {
          link(a, up, i === 0 ? 1 : 0, colName(i), ((j % 4) + 4) % 4 === 2);
          if (!nodeStreet.has(a)) nodeStreet.set(a, { street: colName(i), num: (j + n) * 2 + 1 });
          if (!nodeStreet.has(up)) nodeStreet.set(up, { street: colName(i), num: (j + n + 1) * 2 + 1 });
        }
      }
    }
  });

  // Country roads: a loose network of lanes, A-roads and motorways that
  // links the city, towns and villages. Lanes wiggle and only bridge rivers sometimes.
  const G = 2600;
  const gcols = Math.ceil((RX1 - RX0) / G), grows = Math.ceil((RY1 - RY0) / G);
  const jx = new Float64Array((gcols + 1) * (grows + 1)), jy = new Float64Array(jx.length);
  const jstate = new Int32Array(jx.length); // >=0 node, -1 none, -2 city, -3-k settlement k
  const gid = (r, c) => r * (gcols + 1) + c;
  for (let r = 0; r <= grows; r++) {
    for (let c = 0; c <= gcols; c++) {
      const x = RX0 + c * G + (rand() - 0.5) * 1400, y = RY0 + r * G + (rand() - 0.5) * 1400;
      const k = gid(r, c);
      jx[k] = x; jy[k] = y;
      if (inCityZone(x, y, 1200) && !isSea(x, y)) { jstate[k] = -2; continue; }
      if (isWater(x, y)) { jstate[k] = -1; continue; }
      const s = settlements.findIndex((q) => Math.hypot(q.x - x, q.y - y) < q.R + 500);
      jstate[k] = s >= 0 ? -3 - s : addNode(x, y);
    }
  }
  const nearestOf = (list, x, y) => {
    let best = -1, bd = Infinity;
    for (const v of list) {
      const d = (xs[v] - x) ** 2 + (ys[v] - y) ** 2;
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  };
  const cityEdgeNodes = city.addresses.filter((a) => Math.abs(a.x) > W / 2 - 1500 || a.y > H / 2 - 1500 || Math.abs(a.x) > W / 2 - 4000).map((a) => a.node);
  // Every country road starts as a lane; A-roads and motorways are picked later
  // along the lanes that actually join the towns.
  const roadOf = (r, c) => [1, `${ROW_NAMES[(r * 3 + c * 7) % ROW_NAMES.length]} Lane`];
  const lane = (a, b, k, name) => {
    const ax = xs[a], ay = ys[a], bx = xs[b], by = ys[b];
    const len = Math.hypot(bx - ax, by - ay);
    if (len < 1) return false;
    const m = Math.max(1, Math.round(len / 320));
    const nx = -(by - ay) / len, ny = (bx - ax) / len;
    const curve = k === 3 ? 0.06 : 0.2;
    const a1 = (rand() - 0.5) * curve * len, a2 = (rand() - 0.5) * curve * 0.4 * len;
    const pts = [];
    let crosses = false;
    for (let i = 0; i <= m * 2; i++) {
      const t = i / (m * 2), off = a1 * Math.sin(Math.PI * t) + a2 * Math.sin(2 * Math.PI * t);
      const x = ax + (bx - ax) * t + nx * off, y = ay + (by - ay) * t + ny * off;
      if (i > 0 && i < m * 2 && (isSea(x, y) || lakes.some((l) => blob(l, x, y)))) return false;
      if (isRiver(x, y)) crosses = true;
      if (i % 2 === 0) pts.push([x, y]);
    }
    if (crosses && k < 2 && rand() > 0.5) return false; // only some lanes get a bridge
    let prev = a;
    for (let i = 1; i < pts.length; i++) {
      const v = i === pts.length - 1 ? b : addNode(pts[i][0], pts[i][1]);
      link(prev, v, crosses ? Math.max(k, 1) : k, name, i === Math.floor(pts.length / 2));
      prev = v;
    }
    return true;
  };
  const target = (state, x, y) => {
    if (state >= 0) return state;
    if (state === -2) return nearestOf(cityEdgeNodes, x, y);
    if (state <= -3) return nearestOf(settlements[-3 - state].nodes, x, y);
    return -1;
  };
  const junctionNames = new Map();
  for (let r = 0; r <= grows; r++) {
    for (let c = 0; c <= gcols; c++) {
      const k = gid(r, c);
      for (const [r2, c2, horizontal] of [[r, c + 1, true], [r + 1, c, false]]) {
        if (r2 > grows || c2 > gcols) continue;
        const k2 = gid(r2, c2);
        const sa = jstate[k], sb = jstate[k2];
        if (sa === -1 || sb === -1) continue;
        if (sa < 0 && sb < 0) continue; // both inside a settlement / the city
        const [kindK, name] = roadOf(r, c);
        if (sa >= 0 && sb >= 0 && kindK === 1 && rand() > 0.8) continue;
        const a = target(sa, jx[k2], jy[k2]), b = target(sb, jx[k], jy[k]);
        if (a < 0 || b < 0 || a === b) continue;
        if (lane(a, b, kindK, name)) {
          if (sa >= 0 && !junctionNames.has(sa)) junctionNames.set(sa, name);
          if (sb >= 0 && !junctionNames.has(sb)) junctionNames.set(sb, name);
        }
      }
      // An occasional diagonal lane.
      if (r < grows && c < gcols && rand() < 0.1) {
        const k2 = gid(r + 1, c + 1);
        if (jstate[k] >= 0 && jstate[k2] >= 0) lane(jstate[k], jstate[k2], 1, `${ROW_NAMES[(r + c * 11) % ROW_NAMES.length]} Lane`);
      }
    }
  }

  // Graph and addresses.
  const n = xs.length;
  const lat = new Float64Array(n), lon = new Float64Array(n);
  for (let i = 0; i < n; i++) { const ll = toLL(xs[i], ys[i]); lat[i] = ll.lat; lon[i] = ll.lon; }
  const graph = fromEdgeList(lat, lon, A, B, false);

  // Road hierarchy: A-roads join the city to each town and each town to its
  // two nearest neighbours; motorways run from the city towards the far
  // corners. They follow the winding lanes, so they look like real roads.
  const n0 = city.X.length;
  const KEY = 1 << 20;
  const edgeAt = new Map();
  for (let e = 0; e < A.length; e++) edgeAt.set(Math.min(A[e], B[e]) * KEY + Math.max(A[e], B[e]), e);
  const upgrade = (parent, to, k, name) => {
    for (let v = to; parent[v] >= 0; v = parent[v]) {
      const u = parent[v];
      if (u < n0 && v < n0) continue; // leave the city's own streets alone
      const e = edgeAt.get(Math.min(u, v) * KEY + Math.max(u, v));
      if (e !== undefined && kind[e] < k) { kind[e] = k; ename[e] = name; }
    }
  };
  const nearestNodeTo = (list, x, y) => nearestOf(list, x, y);
  const towns = settlements.filter((t) => t.type === 'town' && t.nodes.length);
  const townNode = new Map(towns.map((t) => [t, nearestNodeTo(t.nodes, t.x, t.y)]));
  const cityGate = nearestNodeTo(cityEdgeNodes, 0, H / 2);
  const fromCity = dijkstra(graph, cityGate);
  let road = 10;
  const motorways = [
    ['M1', towns.reduce((a, b) => (b.y > a.y ? b : a))],
    ['M5', towns.reduce((a, b) => (b.x < a.x ? b : a))],
    ['M11', towns.reduce((a, b) => (b.x > a.x ? b : a))],
  ];
  for (const t of towns) upgrade(fromCity.parent, townNode.get(t), 2, `A${road++}`);
  for (const t of towns) {
    const near = towns.filter((o) => o !== t).sort((a, b) => Math.hypot(a.x - t.x, a.y - t.y) - Math.hypot(b.x - t.x, b.y - t.y)).slice(0, 2);
    const from = dijkstra(graph, townNode.get(t));
    for (const o of near) upgrade(from.parent, townNode.get(o), 2, `A${road++}`);
  }
  for (const [name, t] of motorways) upgrade(fromCity.parent, townNode.get(t), 3, name);

  const addresses = city.addresses.slice();
  settlements.forEach((s) => {
    for (const v of s.nodes) {
      const st = nodeStreet.get(v);
      if (st) addresses.push({ node: v, lat: lat[v], lon: lon[v], x: xs[v], y: ys[v], num: st.num, street: st.street, hood: s.name, city: s.name });
    }
  });
  const nearestSettlement = (x, y) => settlements.reduce((best, s) => (Math.hypot(s.x - x, s.y - y) < Math.hypot(best.x - x, best.y - y) ? s : best));
  for (const [v, street] of junctionNames) {
    const s = nearestSettlement(xs[v], ys[v]);
    addresses.push({ node: v, lat: lat[v], lon: lon[v], x: xs[v], y: ys[v], num: 1 + (v % 40), street, hood: `near ${s.name}`, city: s.name });
  }

  // Map shapes and labels.
  const ring = (e, k = 1, m = 56) => Array.from({ length: m }, (_, j) => {
    const ang = (j / m) * 2 * Math.PI, rr = blobR(e, ang) * k;
    return toLL(e.x + e.rx * rr * Math.cos(ang), e.y + e.ry * rr * Math.sin(ang));
  });
  const land = [];
  for (let j = 0; j < 1600; j++) {
    const phi = (j / 1600) * 2 * Math.PI, c = Math.cos(phi), sn = Math.sin(phi);
    const rho = edgeR(phi) / (Math.abs(c) ** IC.p + Math.abs(sn) ** IC.p) ** (1 / IC.p);
    const x = IC.x + IC.ax * rho * c;
    land.push(toLL(x, Math.max(IC.y + IC.ay * rho * sn, coastY(x))));
  }
  const vere = [], ash = [];
  for (let x = RX0 - 20000; x <= RX1 + 20000; x += 100) vere.push(toLL(x, riverY(x)));
  for (let y = riverY(38000) - 300; y <= RY1 + 20000; y += 100) ash.push(toLL(ashX(y), y));
  const angle = (ax, ay, bx, by) => {
    let d = (Math.atan2(-(by - ay), bx - ax) * 180) / Math.PI;
    if (d > 90) d -= 180;
    if (d <= -90) d += 180;
    return Math.round(d);
  };
  const riverLabels = [
    ...[-80000, -45000, 25000, 70000].map((x) => ({ name: 'River Vere', ...toLL(x, riverY(x)), angle: angle(x - 80, riverY(x - 80), x + 80, riverY(x + 80)) })),
    ...[20000, 55000, 95000].map((y) => ({ name: 'River Ash', ...toLL(ashX(y), y), angle: angle(ashX(y - 80), y - 80, ashX(y + 80), y + 80) })),
  ];

  const sw = toLL(RX0 - 8000, RY0 - 5000), ne = toLL(RX1 + 8000, RY1 + 8000);
  return {
    graph, A, B, kind, ename, eflag, addresses, settlements,
    land, rivers: [{ pts: vere, width: 130 }, { pts: ash, width: 110 }],
    lakes: [...city.lakes, ...lakes.map((l) => ({ name: l.name, ring: ring(l) }))],
    parks: city.parks,
    forests: forests.map((f) => ({ name: f.name, center: toLL(f.x, f.y), ring: ring(f) })),
    labels: {
      ...city.labels,
      water: [...city.labels.water, ...riverLabels, ...lakes.map((l) => ({ name: l.name, ...toLL(l.x, l.y) }))],
      town: settlements.filter((s) => s.type === 'town').map((s) => ({ name: s.name, ...toLL(s.x, s.y) })),
      village: settlements.filter((s) => s.type === 'village').map((s) => ({ name: s.name, ...toLL(s.x, s.y) })),
      forest: forests.filter((f) => f.name).map((f) => ({ name: f.name, ...toLL(f.x, f.y) })),
    },
    bounds: [[sw.lat, sw.lon], [ne.lat, ne.lon]],
    hood: city.hood,
  };
}

// Built on first use so the page itself appears straight away.
let town = null, addrIndex = null, poiElements = null;
const CELL = 300;
function ensure() {
  if (town) return;
  town = buildRegion(buildTown());
  addrIndex = new Map();
  for (const a of town.addresses) {
    const k = `${Math.floor(a.x / CELL)},${Math.floor(a.y / CELL)}`;
    if (!addrIndex.has(k)) addrIndex.set(k, []);
    addrIndex.get(k).push(a);
  }
  poiElements = buildPoiElements();
}
export const warm = ensure;
export function getBounds() { ensure(); return town.bounds; }

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
const fmtAddress = (a) => (a.city ? `${a.num} ${a.street}, ${a.hood}` : `${a.num} ${a.street}, ${a.hood}, ${TOWN}`);

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
          'addr:housenumber': String(addr.num), 'addr:street': addr.street, 'addr:suburb': addr.hood, 'addr:city': addr.city || TOWN,
          opening_hours: t.tags.leisure === 'playground' || t.tags.tourism === 'viewpoint' ? '24/7' : pick(HOURS),
          ...(rand() < 0.4 ? { website: `${name.toLowerCase().replace(/[^a-z]+/g, '')}.example` } : {}),
          ...(rand() < 0.3 ? { outdoor_seating: 'yes' } : {}),
          ...(rand() < 0.5 ? { wheelchair: 'yes' } : {}),
        },
      });
    }
  }
  // Towns get a high street's worth of places; villages a pub, a café, a shop or two.
  const weighted = TYPES.flatMap((t) => Array(t.n).fill(t));
  const villageTypes = TYPES.filter((t) => ['pub', 'cafe'].includes(t.tags.amenity) || t.tags.shop === 'bakery' || t.tags.cuisine === 'italian' || t.tags.cuisine === 'indian' || t.tags.leisure === 'playground');
  for (const s of town.settlements) {
    const count = s.type === 'town' ? Math.round(20 + (s.R / 1000) * 30) : 2 + Math.floor(rand() * 5);
    for (let i = 0; i < count && s.nodes.length; i++) {
      const t = s.type === 'town' ? pick(weighted) : pick(villageTypes);
      const node = pick(s.nodes);
      const lat = g.lat[node] + (rand() - 0.5) * 0.0004, lon = g.lon[node] + (rand() - 0.5) * 0.0005;
      const addr = nearestAddress(lat, lon);
      els.push({
        type: 'node', id: nid++, lat, lon,
        tags: {
          name: pick(t.names).replace('{N}', pick(NAMES)), ...t.tags,
          'addr:housenumber': String(addr.num), 'addr:street': addr.street, 'addr:suburb': s.name, 'addr:city': s.name,
          opening_hours: pick(HOURS), ...(rand() < 0.4 ? { outdoor_seating: 'yes' } : {}),
        },
      });
    }
  }
  // Parks and forests are places too.
  town.parks.forEach((p, i) => els.push({ type: 'way', id: 50000 + i, center: p.center, tags: { name: p.name, leisure: i === 1 ? 'garden' : 'park', opening_hours: '24/7' } }));
  town.forests.forEach((f, i) => { if (f.name) els.push({ type: 'way', id: 60000 + i, center: f.center, tags: { name: f.name, leisure: 'nature_reserve', opening_hours: '24/7' } }); });
  return els;
}

export async function findPois(center, { radius, minResults = 12 } = {}) {
  ensure();
  await new Promise((r) => setTimeout(r, 250));
  const radii = radius ? [radius] : [800, 1800, 4000, 9000]; // the last step helps out in the countryside
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
  ensure();
  q = q.trim().toLowerCase();
  if (q.length < 2) return [];
  const numMatch = q.match(/^(\d+)\s*/);
  const num = numMatch ? Number(numMatch[1]) : null;
  const words = q.replace(/^\d+\s*/, '').split(/[\s,]+/).filter((w) => w && w !== TOWN.toLowerCase());
  if (!words.length) return [];
  const hit = (s) => words.every((w) => s.toLowerCase().includes(w));
  const results = [];
  const places = [];
  for (const s of town.settlements) {
    if (num != null || !hit(s.name) || !s.nodes.length) continue;
    const a = nearestAddress(toLL(s.x, s.y).lat, toLL(s.x, s.y).lon);
    places.push({ lat: a.lat, lon: a.lon, address: fmtAddress(a), title: s.name, subtitle: s.type === 'town' ? 'Town' : 'Village' });
  }
  const byStreet = new Map();
  for (const a of town.addresses) {
    if (!hit(`${a.street} ${a.hood}`)) continue;
    const key = `${a.street}|${a.hood}`;
    const cur = byStreet.get(key);
    const score = num != null ? Math.abs(a.num - num) : Math.abs(a.lon - CENTER.lon);
    if (!cur || score < cur.score) byStreet.set(key, { a, score });
  }
  for (const { a } of byStreet.values()) {
    results.push({ lat: a.lat, lon: a.lon, address: fmtAddress(a), title: `${a.num} ${a.street}`, subtitle: a.city ? a.hood : `${a.hood}, ${TOWN}` });
  }
  for (const el of poiElements) {
    if (!hit(el.tags.name)) continue;
    const p = el.center || el;
    const where = el.tags['addr:city'] && el.tags['addr:city'] !== TOWN ? el.tags['addr:city'] : `${el.tags['addr:suburb'] || town.hood(p)}, ${TOWN}`;
    results.push({ lat: p.lat, lon: p.lon, address: `${el.tags.name}, ${where}`, title: el.tags.name, subtitle: `${el.tags['addr:street'] ? `${el.tags['addr:housenumber']} ${el.tags['addr:street']}, ` : ''}${el.tags['addr:city'] || TOWN}` });
  }
  if (near) results.sort((x, y) => haversine(near.lat, near.lon, x.lat, x.lon) - haversine(near.lat, near.lon, y.lat, y.lon));
  return [...places, ...results].slice(0, limit);
}

export async function reverseGeocode(lat, lon) {
  ensure();
  const a = nearestAddress(lat, lon);
  return { lat, lon, address: fmtAddress(a), title: `${a.num} ${a.street}`, subtitle: `${a.hood}, ${TOWN}` };
}

/** No GPS in the test town: hand back a random address instead. */
export async function currentPosition() {
  ensure();
  const a = town.addresses[Math.floor(Math.random() * town.addresses.length)];
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

// Directions in the test town: real shortest routes over its own streets for
// walking, cycling and driving. There are no timetables, so no public transport.
const TOWN_SPEED = { walk: 1.35, bike: 4.5, drive: 8.5 }; // m/s
const noTimetables = () => Object.assign(new Error('No timetables in the test town'), { status: 404, friendly: true });

export async function directions(mode, from, to) {
  ensure();
  if (mode === 'transit') throw noTimetables();
  const g = town.graph;
  const a = nearestAddress(from.lat, from.lon).node, b = nearestAddress(to.lat, to.lon).node;
  const { dist, parent } = dijkstra(g, a);
  if (!Number.isFinite(dist[b])) throw Object.assign(new Error('No route found'), { status: 404 });
  const geometry = [];
  for (let v = b; v !== -1; v = parent[v]) geometry.push([g.lat[v], g.lon[v]]);
  geometry.reverse();
  return { mode, provider: 'test-town', distance: Math.round(dist[b]), duration: Math.round(dist[b] / TOWN_SPEED[mode] + (mode === 'drive' ? 90 : 0)), geometry, alternatives: [] };
}

export async function travelTimes(mode, sources, destinations) {
  ensure();
  if (mode === 'transit') throw noTimetables();
  const g = town.graph;
  const targets = destinations.map((p) => nearestAddress(p.lat, p.lon).node);
  const durations = [], distances = [];
  await new Promise((r) => setTimeout(r, 60));
  for (const src of sources) {
    const { dist } = dijkstra(g, nearestAddress(src.lat, src.lon).node);
    distances.push(targets.map((t) => (Number.isFinite(dist[t]) ? Math.round(dist[t]) : null)));
    durations.push(targets.map((t) => (Number.isFinite(dist[t]) ? Math.round(dist[t] / TOWN_SPEED[mode] + (mode === 'drive' ? 90 : 0)) : null)));
  }
  return { durations, distances, destinations: targets.map((t) => [g.lat[t], g.lon[t]]) };
}

/** A ready-made group: you plus three friends spread around town. */
export function sampleGroup() {
  ensure();
  const at = (x, y) => { const ll = toLL(x, y); const a = nearestAddress(ll.lat, ll.lon); return { address: fmtAddress(a), lat: a.lat, lon: a.lon }; };
  return {
    home: { ...at(-3600, 2600), mode: 'walk' },
    friends: [['Sam', 3400, 3300, 'bike'], ['Priya', 2600, -2800, 'walk'], ['Leo', -2800, -2400, 'drive']].map(([nickname, x, y, mode]) => ({ ...at(x, y), nickname, mode })),
  };
}

// ---------------------------------------------------------------- base map

/**
 * Draw the town as real map tiles (Leaflet GridLayer), so panning, wheel and
 * pinch zoom behave like any web map. Street, district, park and water names
 * sit in their own pane and appear as you zoom in.
 */
export function addBasemap(map) {
  ensure();
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
  const cell = (maxX - minX) / 420;
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
  const land = town.land.map(P0);
  const rivers = town.rivers.map((r) => ({ pts: r.pts.map(P0), width: r.width }));
  const lakes = town.lakes.map((l) => l.ring.map(P0)), parks = town.parks.map((p) => p.ring.map(P0));
  const forests = town.forests.map((f) => f.ring.map(P0));
  const colors = () => {
    const s = getComputedStyle(document.documentElement);
    const v = (k) => s.getPropertyValue(k).trim();
    return { land: v('--map-land'), park: v('--map-park'), water: v('--map-water'), road: v('--map-road'), casing: v('--map-casing'), major: v('--map-major'), majorCasing: v('--map-major-casing'), motorway: v('--map-motorway'), motorwayCasing: v('--map-motorway-casing'), forest: v('--map-forest'), label: v('--map-label'), halo: v('--map-halo'), font: s.getPropertyValue('--font') };
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
    ctx.fillStyle = c.water;
    ctx.fillRect(0, 0, 256, 256);
    const fill = (pts, color) => {
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(X(p.x), Y(p.y)) : ctx.moveTo(X(p.x), Y(p.y))));
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
    };
    fill(land, c.land);
    forests.forEach((f) => fill(f, c.forest));
    parks.forEach((p) => fill(p, c.park));
    lakes.forEach((l) => fill(l, c.water));
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const r of rivers) {
      ctx.beginPath();
      r.pts.forEach((p, i) => (i ? ctx.lineTo(X(p.x), Y(p.y)) : ctx.moveTo(X(p.x), Y(p.y))));
      ctx.strokeStyle = c.water;
      ctx.lineWidth = Math.max(z < 10 ? 1.5 : 2.5, r.width / mpp);
      ctx.stroke();
    }

    const pad = 14 / s;
    const x0 = ox / s - pad, x1 = (ox + 256) / s + pad, y0 = oy / s - pad, y1 = (oy + 256) / s + pad;
    if (x1 < minX || x0 > maxX || y1 < minY || y0 > maxY) return;
    stamp++;
    const byKind = [[], [], [], []];
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
    const w0 = clamp(10 / mpp, 0.7, 9), w1 = clamp(15 / mpp, z < 10 ? 0.6 : 1.3, 13), w2 = clamp(22 / mpp, z < 10 ? 1.1 : 2, 18), w3 = clamp(30 / mpp, 1.8, 22);
    if (z >= 13) {
      if (z >= 15) stroke(byKind[0], w0 + 1.6, c.casing);
      ctx.globalAlpha = z >= 14 ? 1 : 0.75;
      stroke(byKind[0], w0, c.road);
      ctx.globalAlpha = 1;
    }
    // Far out, lanes are drawn faintly with no outline so the map stays calm.
    if (z >= 10) stroke(byKind[1], w1 + 2, c.casing);
    ctx.globalAlpha = z >= 10 ? 1 : 0.8;
    stroke(byKind[1], w1, z >= 10 ? c.road : c.casing);
    ctx.globalAlpha = 1;
    stroke(byKind[2], w2 + (z >= 10 ? 2 : 1), c.majorCasing);
    stroke(byKind[2], w2, c.major);
    stroke(byKind[3], w3 + 2, c.motorwayCasing);
    stroke(byKind[3], w3, c.motorway);

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
  const visible = {
    // Few labels at a time, like Apple Maps: names appear only once there is room for them.
    city: (z) => z < 12, bay: (z) => z >= 9 && z < 13, hood: (z) => z >= 12.5 && z < 15.25, water: (z) => z >= 11.5, park: (z) => z >= 14.25,
    street: (z) => z >= 16.25, town: (z) => z >= 8.5 && z < 13.5, village: (z) => z >= 11 && z < 14.5, forest: (z) => z >= 11 && z < 13,
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
}

export const townCenter = CENTER;

// ---------------------------------------------------------------- sample ratings, photos and reviews
//
// The real app shows Tripadvisor ratings, photos and reviews (and free photos
// from Wikimedia Commons). Port Verity is made up, so here every place gets a
// made-up rating, drawn illustrations instead of photos, and sample reviews,
// all clearly labelled as samples.

const nameHash = (s) => [...String(s)].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 2166136261);
const RATED_TABS = new Set(['food', 'drinks', 'fun', 'culture', 'outdoors']);
const PRICES = ['Cheap Eats', 'Mid Range', 'Mid Range', 'Fine Dining'];
const TAB_HUE = { food: 28, drinks: 32, fun: 248, culture: 285, outdoors: 130, shopping: 212 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function sampleRating(p) {
  if (!RATED_TABS.has(p.tab)) return null;
  const h = nameHash(p.name);
  if (h % 11 === 0) return null; // not every place is rated
  return {
    id: h, rating: Math.min(5, 3.5 + ((h >>> 3) % 4) * 0.5), count: 6 + ((h >>> 7) % 1400),
    ratingImage: '', priceLevel: p.tab === 'food' ? PRICES[(h >>> 11) % PRICES.length] : '', url: '',
  };
}

/** A soft drawn picture (SVG data URL): a coloured scene with a plate, cup, tree or building. */
function illustration(p, k = 0) {
  const h = nameHash(`${p.name}#${k}`);
  const hue = ((TAB_HUE[p.tab] ?? 210) + ((h % 50) - 25) + 360) % 360;
  const c1 = `hsl(${hue} 70% ${78 - (h % 9)}%)`, c2 = `hsl(${(hue + 28) % 360} 62% ${58 + (h % 8)}%)`;
  const dots = Array.from({ length: 7 }, (_, i) => {
    const r = 10 + ((h >>> (i * 3)) % 26), x = (h >>> (i * 2)) % 400, y = (h >>> (i * 4 + 1)) % 300;
    return `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" opacity="${0.08 + (i % 3) * 0.05}"/>`;
  }).join('');
  const subject = {
    food: '<ellipse cx="200" cy="190" rx="118" ry="44" fill="#fff" opacity=".95"/><ellipse cx="200" cy="182" rx="78" ry="26" fill="hsl(15 70% 62%)"/><circle cx="178" cy="176" r="10" fill="hsl(110 45% 45%)"/><circle cx="214" cy="178" r="12" fill="hsl(45 90% 60%)"/>',
    drinks: '<rect x="150" y="110" width="100" height="110" rx="16" fill="#fff" opacity=".95"/><path d="M250 135h18a22 22 0 0 1 0 44h-18" fill="none" stroke="#fff" stroke-width="12"/><rect x="160" y="122" width="80" height="22" rx="8" fill="hsl(28 55% 42%)"/>',
    outdoors: '<path d="M200 70l70 110h-140z" fill="hsl(130 45% 40%)"/><path d="M200 110l85 120h-170z" fill="hsl(130 45% 34%)"/><rect x="190" y="225" width="20" height="40" fill="hsl(28 40% 35%)"/>',
    culture: '<path d="M120 130l80-50 80 50z" fill="#fff"/><rect x="132" y="138" width="16" height="90" fill="#fff"/><rect x="172" y="138" width="16" height="90" fill="#fff"/><rect x="212" y="138" width="16" height="90" fill="#fff"/><rect x="252" y="138" width="16" height="90" fill="#fff"/><rect x="118" y="230" width="164" height="14" fill="#fff"/>',
    fun: '<path d="M200 80l22 46 50 7-36 35 9 50-45-24-45 24 9-50-36-35 50-7z" fill="#fff" opacity=".95"/>',
  }[p.tab] || '<rect x="140" y="110" width="120" height="120" rx="20" fill="#fff" opacity=".9"/>';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><rect width="400" height="300" fill="url(#g)"/>${dots}<g transform="translate(${(h % 60) - 30} ${(h % 30) - 15})">${subject}</g></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const REVIEW_BITS = {
  food: [['Lovely evening', 'Friendly staff and generous portions. We shared a few plates and everything came out hot and quick.'], ['Worth the walk', 'Busy on a Friday but the wait was short. Great for a group — they pushed two tables together for us.'], ['Solid choice', 'Good food, fair prices. Dessert was the highlight. Would come back.'], ['A bit slow', 'Tasty, but service was slow when it got busy. Book ahead at weekends.']],
  drinks: [['Cosy spot', 'Comfy seats, good music, not too loud to talk. Perfect for catching up.'], ['Great coffee', 'Strong coffee and nice pastries. A few tables outside when it’s sunny.'], ['Fun night', 'Good selection and friendly bar staff. Gets lively later on.']],
  default: [['Good afternoon out', 'Easy to find and plenty to do. Took about two hours.'], ['Nice for a group', 'We met friends here and it worked well for everyone.'], ['Pleasant', 'Clean and well kept. Quieter in the morning.']],
};
const SAMPLE_PEOPLE = ['Sample guest', 'Test visitor', 'Demo diner', 'Example friend'];

export const rated = {
  async getConfig() { return {}; },
  async ratingsSource() { return 'Sample ratings and drawings: Port Verity is a made-up town'; },
  async rateAll(pois) {
    await sleep(220);
    for (const p of pois) if (p.rating === undefined) p.rating = sampleRating(p);
  },
  async thumbFor(p) {
    if (p.thumb !== undefined) return p.thumb;
    return (p.thumb = illustration(p, 0));
  },
  async detailsFor(p) {
    await sleep(300);
    const r = p.rating ?? sampleRating(p);
    const h = nameHash(p.name);
    const bits = REVIEW_BITS[p.tab] || REVIEW_BITS.default;
    const photos = Array.from({ length: 4 + (h % 5) }, (_, k) => ({ url: illustration(p, k), caption: 'Drawing', by: '', credit: '' }));
    if (!r) return { source: null, photos, reviews: [], photoNote: 'Drawings: the test town is made up' };
    const total = r.count;
    const spread = [0.55, 0.25, 0.11, 0.06, 0.03].map((f, i) => ({ rating: 5 - i, count: Math.round(total * f) }));
    return {
      ...r, source: 'sample',
      attribution: 'Sample ratings and reviews: Port Verity is a made-up test town',
      photoNote: 'Drawings: the test town is made up',
      photos,
      breakdown: spread,
      subratings: p.tab === 'food' ? [{ name: 'Food', rating: Math.min(5, r.rating + 0.2) }, { name: 'Service', rating: r.rating }, { name: 'Value', rating: Math.max(3, r.rating - 0.3) }] : [],
      reviews: bits.map(([title, text], i) => ({
        id: i, title, text, rating: Math.max(3, Math.min(5, Math.round(r.rating) - (i === bits.length - 1 ? 1 : 0))),
        ratingImage: '', date: new Date(Date.now() - (i * 23 + (h % 20)) * 864e5).toISOString(), tripType: ['FRIENDS', 'COUPLES', 'FAMILY', 'SOLO'][i % 4],
        user: SAMPLE_PEOPLE[i % SAMPLE_PEOPLE.length], avatar: '', url: '', reply: '',
      })),
      features: [],
    };
  },
};
