// The streets around the group, for the search animation. They come from
// the same free OpenFreeMap vector tiles as the base map (so they are often
// already in the browser's cache): a handful of tiles, never the whole city.
import { readLayerLines } from './mvt.js';

const TILEJSON = 'https://tiles.openfreemap.org/planet';
// Street kinds as the test version numbers them (0 motorway … 7 footpath); paths are left out.
export const ROAD = { motorway: 0, trunk: 1, primary: 2, secondary: 3, tertiary: 4, minor: 5, service: 6, busway: 5 };
const BRIDGE = 8, TUNNEL = 16;
const MAX_TILES = 9;

const lon2x = (lon, z) => Math.floor(((lon + 180) / 360) * 2 ** z);
const lat2y = (lat, z) => {
  const r = (Math.max(-85, Math.min(85, lat)) * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
};

/**
 * Which tiles cover an area: the most detailed zoom (13 at most) that needs
 * no more than `max` tiles. bounds: { s, w, n, e }.
 */
export function tilesFor(b, max = MAX_TILES) {
  for (let z = 13; z >= 8; z--) {
    const x0 = lon2x(b.w, z), x1 = lon2x(b.e, z), y0 = lat2y(b.n, z), y1 = lat2y(b.s, z);
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > max && z > 8) continue;
    const tiles = [];
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) tiles.push({ z, x, y });
    return tiles;
  }
  return [];
}

/** Keep the part of segment p→q inside the box (Liang–Barsky); null if none. */
function clip(px, py, qx, qy, x0, y0, x1, y1) {
  let t0 = 0, t1 = 1;
  const dx = qx - px, dy = qy - py;
  for (const [p, q] of [[-dx, px - x0], [dx, x1 - px], [-dy, py - y0], [dy, y1 - py]]) {
    if (p === 0) { if (q < 0) return null; continue; }
    const r = q / p;
    if (p < 0) { if (r > t1) return null; if (r > t0) t0 = r; } else { if (r < t0) return null; if (r < t1) t1 = r; }
  }
  if (t1 - t0 < 1e-9) return null;
  return [Math.round(px + t0 * dx), Math.round(py + t0 * dy), Math.round(px + t1 * dx), Math.round(py + t1 * dy)];
}

/**
 * Join decoded tiles into one street network: { lat, lon, A, B, kinds }.
 * Each tile keeps only the streets inside its own square, in coordinates
 * shared by every tile at that zoom, so a street crossing from one tile into
 * the next meets itself at the edge. Map tiles drop the corner where two
 * streets cross when a street is straight there, so crossings and side
 * streets that end on another street are found again and joined (not where
 * a bridge or tunnel passes over or under). Ends that miss each other by a
 * metre or so at a tile edge are joined up too.
 * tiles: [{ z, x, y, extent, features: [{ props, lines }] }]
 */
export function buildNetwork(tiles, bounds = null) {
  // 1. Every piece of street, cut to its tile, once.
  const segs = [];
  const seen = new Set();
  let world = 0, ext = 4096;
  for (const t of tiles) {
    ext = t.extent || 4096;
    world = ext * 2 ** t.z;
    const X0 = t.x * ext, Y0 = t.y * ext;
    for (const f of t.features) {
      const base = ROAD[f.props.class];
      if (base === undefined) continue;
      const kind = base | (f.props.brunnel === 'bridge' ? BRIDGE : 0) | (f.props.brunnel === 'tunnel' ? TUNNEL : 0);
      for (const line of f.lines) {
        for (let i = 1; i < line.length; i++) {
          const c = clip(X0 + line[i - 1][0], Y0 + line[i - 1][1], X0 + line[i][0], Y0 + line[i][1], X0, Y0, X0 + ext, Y0 + ext);
          if (!c || (c[0] === c[2] && c[1] === c[3])) continue;
          const key = c[0] < c[2] || (c[0] === c[2] && c[1] < c[3]) ? c.join() : [c[2], c[3], c[0], c[1]].join();
          if (seen.has(key)) continue;
          seen.add(key);
          segs.push({ ax: c[0], ay: c[1], bx: c[2], by: c[3], kind, cuts: [] });
        }
      }
    }
  }

  // 2. Where streets cross or one ends on another, both get a corner there.
  findJunctions(segs);

  // 3. Corners and streets.
  const keyOf = new Map();
  const gx = [], gy = [];
  const node = (x, y) => {
    const k = x * 67108864 + y;
    let i = keyOf.get(k);
    if (i === undefined) { i = gx.length; keyOf.set(k, i); gx.push(x); gy.push(y); }
    return i;
  };
  const edges = new Map();
  const nodeKind = [];
  const addEdge = (a, b, kind) => {
    if (a === b) return;
    nodeKind[a] = nodeKind[b] = kind;
    const k = a < b ? a * 4194304 + b : b * 4194304 + a;
    const old = edges.get(k);
    if (old === undefined || kind < old) edges.set(k, kind);
  };
  for (const s of segs) {
    let prev = node(s.ax, s.ay);
    for (const [, x, y] of s.cuts.sort((p, q) => p[0] - q[0])) { const i = node(x, y); addEdge(prev, i, s.kind); prev = i; }
    addEdge(prev, node(s.bx, s.by), s.kind);
  }

  // 4. Loose ends on a tile edge: join each to the nearest other loose end within 3 units.
  const deg = new Int32Array(gx.length);
  for (const k of edges.keys()) { deg[Math.floor(k / 4194304)]++; deg[k % 4194304]++; }
  const loose = new Map();
  const cell = (x, y) => `${Math.floor(x / 4)},${Math.floor(y / 4)}`;
  for (let i = 0; i < gx.length; i++) {
    if (deg[i] !== 1 || (gx[i] % ext !== 0 && gy[i] % ext !== 0)) continue;
    const c = cell(gx[i], gy[i]);
    if (!loose.has(c)) loose.set(c, []);
    loose.get(c).push(i);
  }
  const joined = new Set();
  for (const list of loose.values()) {
    for (const i of list) {
      if (joined.has(i)) continue;
      let best = -1, bd = 10;
      const cx = Math.floor(gx[i] / 4), cy = Math.floor(gy[i] / 4);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        for (const j of loose.get(`${cx + dx},${cy + dy}`) || []) {
          if (j === i || joined.has(j)) continue;
          const d = (gx[i] - gx[j]) ** 2 + (gy[i] - gy[j]) ** 2;
          if (d < bd) { bd = d; best = j; }
        }
      }
      if (best >= 0) { joined.add(i); joined.add(best); addEdge(i, best, nodeKind[i] ?? 5); }
    }
  }

  // 5. Positions, keeping only corners on streets in the area.
  const inside = (i) => {
    if (!bounds) return true;
    const lon = (gx[i] / world) * 360 - 180;
    const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * gy[i]) / world))) * 180) / Math.PI;
    return lat >= bounds.s && lat <= bounds.n && lon >= bounds.w && lon <= bounds.e;
  };
  const id = new Int32Array(gx.length).fill(-1);
  const lat = [], lon = [], A = [], B = [], kinds = [];
  const keep = (i) => {
    if (id[i] < 0) {
      id[i] = lat.length;
      lon.push((gx[i] / world) * 360 - 180);
      lat.push((Math.atan(Math.sinh(Math.PI * (1 - (2 * gy[i]) / world))) * 180) / Math.PI);
    }
    return id[i];
  };
  for (const [k, kind] of edges) {
    const a = Math.floor(k / 4194304), b = k % 4194304;
    if (!inside(a) && !inside(b)) continue;
    A.push(keep(a)); B.push(keep(b)); kinds.push(kind);
  }
  return { lat: Float64Array.from(lat), lon: Float64Array.from(lon), A: Int32Array.from(A), B: Int32Array.from(B), kinds: Uint8Array.from(kinds) };
}

/**
 * Mark where pieces of street cross, or where one ends on (or within 1.5
 * units of) another: each piece gets cuts [t, x, y] at those points.
 * Bridges and tunnels only join streets at their ends.
 */
function findJunctions(segs, tol = 1.5) {
  const CELL = 96;
  const grid = new Map();
  segs.forEach((s, i) => {
    const x0 = Math.floor((Math.min(s.ax, s.bx) - tol) / CELL), x1 = Math.floor((Math.max(s.ax, s.bx) + tol) / CELL);
    const y0 = Math.floor((Math.min(s.ay, s.by) - tol) / CELL), y1 = Math.floor((Math.max(s.ay, s.by) + tol) / CELL);
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        const k = x * 1048576 + y;
        let list = grid.get(k);
        if (!list) grid.set(k, (list = []));
        list.push(i);
      }
    }
  });
  const done = new Set();
  const EPS = 1e-6;
  // Where on piece s the point (px, py) lies, if it is within tol of its middle part.
  const onto = (s, px, py) => {
    const dx = s.bx - s.ax, dy = s.by - s.ay, len2 = dx * dx + dy * dy;
    const t = ((px - s.ax) * dx + (py - s.ay) * dy) / len2;
    if (t <= EPS || t >= 1 - EPS) return null;
    const ex = s.ax + t * dx - px, ey = s.ay + t * dy - py;
    return ex * ex + ey * ey <= tol * tol ? t : null;
  };
  for (const list of grid.values()) {
    for (let a = 0; a < list.length; a++) {
      for (let b = a + 1; b < list.length; b++) {
        const i = Math.min(list[a], list[b]), j = Math.max(list[a], list[b]);
        const pair = i * segs.length + j;
        if (done.has(pair)) continue;
        done.add(pair);
        const s = segs[i], r = segs[j];
        // An end of one on the middle of the other: a side street.
        let joinedAt = false;
        for (const [p, q] of [[s, r], [r, s]]) {
          for (const [px, py] of [[q.ax, q.ay], [q.bx, q.by]]) {
            const t = onto(p, px, py);
            if (t !== null) { p.cuts.push([t, px, py]); joinedAt = true; }
          }
        }
        if (joinedAt || (s.kind | r.kind) & (BRIDGE | TUNNEL)) continue;
        // Crossing in the middle of both.
        const d = (s.bx - s.ax) * (r.by - r.ay) - (s.by - s.ay) * (r.bx - r.ax);
        if (d === 0) continue;
        const t = ((r.ax - s.ax) * (r.by - r.ay) - (r.ay - s.ay) * (r.bx - r.ax)) / d;
        const u = ((r.ax - s.ax) * (s.by - s.ay) - (r.ay - s.ay) * (s.bx - s.ax)) / d;
        if (t <= EPS || t >= 1 - EPS || u <= EPS || u >= 1 - EPS) continue;
        const x = Math.round(s.ax + t * (s.bx - s.ax)), y = Math.round(s.ay + t * (s.by - s.ay));
        s.cuts.push([t, x, y]);
        r.cuts.push([u, x, y]);
      }
    }
  }
}

let template = null;
function tileTemplate(signal) {
  template ||= fetch(TILEJSON, { signal })
    .then((r) => { if (!r.ok) throw new Error(`Map tiles: ${r.status}`); return r.json(); })
    .then((j) => j.tiles[0])
    .catch((err) => { template = null; throw err; });
  return template;
}

/** The streets in an area (bounds: { s, w, n, e }) as a network for the animation. */
export async function loadRoads(bounds, { signal } = {}) {
  const url = await tileTemplate(signal);
  const tiles = await Promise.all(tilesFor(bounds).map(async (t) => {
    const res = await fetch(url.replace('{z}', t.z).replace('{x}', t.x).replace('{y}', t.y), { signal });
    if (!res.ok) throw new Error(`Map tile: ${res.status}`);
    return { ...t, ...readLayerLines(new Uint8Array(await res.arrayBuffer()), 'transportation') };
  }));
  return buildNetwork(tiles, bounds);
}
