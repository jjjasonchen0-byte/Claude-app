// The search animation, drawn over the map as it is (only dimmed a little,
// so the lines stand out). Everyone's reach floods out along the streets at once, each in their
// colour behind a bright white front, converging until the floods meet at
// the meeting point. Finally everyone's real route lights up and they
// travel along it to the pin, while the floods pull back along their
// streets and are gone just as the routes arrive; then the map turns back
// to normal with the routes left on it.
//
// The floods are shortest-path searches over the streets (graph.js), timed
// in seconds at each person's way of travelling, so where the floods meet is
// where travel times are similar: the meeting point.
// Three canvases sit in their own map pane, above the map but below the
// people and the meeting point: the dimming over the map, the
// settled floods (drawn a little at a time, never cleared while a flood
// grows), and the front, routes and travellers (redrawn every frame).
import { fromEdgeList, dijkstra } from './graph.js';
import { SPEEDS } from './meetpoint.js';
import { haversine } from './geo.js';

const TUNNEL = 16;
const DRIVE = [2.2, 1.7, 1.25, 1.1, 1, 0.8, 0.6, 0.5]; // driving is quicker on big roads (× the town speed)
const CELL = 0.002; // degrees, about 200 m

/** Seconds per metre on each kind of street (0 motorway … 7 path, + bridge/tunnel flags) for a way of travelling. */
export function costTable(mode) {
  const speed = SPEEDS[mode] || SPEEDS.walk;
  return Float64Array.from({ length: 256 }, (_, k) => {
    const c = k & 7;
    if (mode === 'drive') return c === 7 ? Infinity : 1 / (speed * DRIVE[c]);
    // No walking or cycling through road tunnels. Motorways stay open: the
    // map's streets leave out footpaths, and a motorway bridge is often the
    // only way across the water there (its footpath runs alongside).
    return k & TUNNEL ? Infinity : 1 / speed;
  });
}

/**
 * Everything the animation needs about a street network
 * ({ lat, lon, A, B, kinds }, see roads.js): the graph, street lengths,
 * positions on the map, which stretches of street count as one road, and
 * an index for finding the nearest corner.
 */
export function prepareNetwork(roads) {
  const { lat, lon, A, B, kinds } = roads;
  const n = lat.length, m = A.length;
  const g = fromEdgeList(lat, lon, A, B, kinds);
  const len = new Float32Array(m);
  for (let k = 0; k < m; k++) len[k] = haversine(lat[A[k]], lon[A[k]], lat[B[k]], lon[B[k]]);
  // Web Mercator at zoom 0 (as Leaflet projects), so drawing a frame is a scale and a shift.
  const nx = new Float64Array(n), ny = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    nx[i] = ((lon[i] + 180) / 360) * 256;
    const s = Math.sin((Math.max(-85.05, Math.min(85.05, lat[i])) * Math.PI) / 180);
    ny[i] = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 256;
  }
  const { chain, chains, deg } = roadsOf(n, A, B);
  // The largest connected network: floods start from a corner on it, not a stray car park.
  const up = Int32Array.from({ length: n }, (_, i) => i);
  const find = (i) => { while (up[i] !== i) { up[i] = up[up[i]]; i = up[i]; } return i; };
  for (let k = 0; k < m; k++) { const a = find(A[k]), b = find(B[k]); if (a !== b) up[a] = b; }
  const size = new Map();
  for (let i = 0; i < n; i++) if (deg[i]) size.set(find(i), (size.get(find(i)) || 0) + 1);
  let main = -1, best = 0;
  for (const [r, s] of size) if (s > best) { best = s; main = r; }
  const grid = new Map();
  for (let i = 0; i < n; i++) {
    if (!deg[i] || find(i) !== main) continue;
    const key = `${Math.floor(lat[i] / CELL)},${Math.floor(lon[i] / CELL)}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(i);
  }
  return { n, m, lat, lon, A, B, kinds, g, len, nx, ny, chain, chains, grid, major: majorOf(kinds) };
}

const majorOf = (kinds) => Uint8Array.from(kinds, (k) => ((k & 7) <= 2 ? 1 : 0));

/** "Roads" for the counter: each stretch of street between two junctions (or ends) gets one number. */
function roadsOf(n, A, B) {
  const m = A.length;
  const deg = new Int32Array(n), e1 = new Int32Array(n), e2 = new Int32Array(n);
  for (let k = 0; k < m; k++) {
    for (const v of [A[k], B[k]]) { if (deg[v] === 0) e1[v] = k; else if (deg[v] === 1) e2[v] = k; deg[v]++; }
  }
  const up = Int32Array.from({ length: m }, (_, i) => i);
  const find = (i) => { while (up[i] !== i) { up[i] = up[up[i]]; i = up[i]; } return i; };
  for (let v = 0; v < n; v++) if (deg[v] === 2) { const a = find(e1[v]), b = find(e2[v]); if (a !== b) up[a] = b; }
  const chain = new Int32Array(m);
  const dense = new Map();
  for (let k = 0; k < m; k++) { const r = find(k); if (!dense.has(r)) dense.set(r, dense.size); chain[k] = dense.get(r); }
  return { chain, chains: dense.size, deg };
}

/**
 * The same streets in fewer, longer pieces, for flooding and drawing at one
 * zoom. The map's streets come in short pieces (most shorter than a pixel
 * on screen, and each one costs as much to draw as a long one), so a stretch
 * of street through corners where nothing else joins it (and of one kind) is
 * cut only where it bends by more than `tolerance`, or where a piece would
 * be longer than `maxLength` (both in the network's map units: Web Mercator
 * at zoom 0, as nx / ny). Each piece keeps its length along the street, so
 * the floods move as before. The corners left out have no streets in the
 * result; positions and the nearest-corner index are shared with `net`.
 */
export function simplifyNetwork(net, { tolerance, maxLength = Infinity }) {
  const { n, m, A, B, kinds, nx, ny } = net;
  // The streets at each corner (by street number).
  const start = new Int32Array(n + 1);
  for (let k = 0; k < m; k++) { start[A[k] + 1]++; start[B[k] + 1]++; }
  for (let i = 0; i < n; i++) start[i + 1] += start[i];
  const fill = start.slice(0, n);
  const at = new Int32Array(start[n]);
  for (let k = 0; k < m; k++) { at[fill[A[k]]++] = k; at[fill[B[k]]++] = k; }
  // Corners that stay: junctions, dead ends, and where the kind of street changes.
  const keep = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (start[i + 1] - start[i] !== 2) { keep[i] = 1; continue; }
    const a = at[start[i]], b = at[start[i] + 1];
    if (a === b || kinds[a] !== kinds[b]) keep[i] = 1; // a === b: a loop from the corner back to itself
  }
  const outA = [], outB = [], outK = [], outL = [];
  const used = new Uint8Array(m);
  let seq = new Int32Array(64), along = new Float64Array(64), mark = new Uint8Array(64);
  const stack = [];
  const tol2 = tolerance * tolerance;
  const far = (i, j) => { // the point between i and j furthest from the line i–j, if further than the tolerance
    const ax = nx[seq[i]], ay = ny[seq[i]], dx = nx[seq[j]] - ax, dy = ny[seq[j]] - ay, l2 = dx * dx + dy * dy;
    let worst = -1, wd = tol2;
    for (let p = i + 1; p < j; p++) {
      const px = nx[seq[p]] - ax, py = ny[seq[p]] - ay;
      const t = l2 > 0 ? Math.max(0, Math.min(1, (px * dx + py * dy) / l2)) : 0;
      const ex = px - t * dx, ey = py - t * dy, d2 = ex * ex + ey * ey;
      if (d2 > wd) { wd = d2; worst = p; }
    }
    return worst;
  };
  // From a corner that stays along street k to the next one, as few pieces as will do.
  const run = (u, k) => {
    let count = 0, v = u, e = k, total = 0;
    const push = (node) => {
      if (count === seq.length) {
        const s = new Int32Array(count * 2); s.set(seq); seq = s;
        const l = new Float64Array(count * 2); l.set(along); along = l;
        mark = new Uint8Array(count * 2);
      }
      seq[count] = node; along[count++] = total;
    };
    push(u);
    for (;;) {
      used[e] = 1;
      total += net.len[e];
      const w = A[e] === v ? B[e] : A[e];
      push(w);
      if (keep[w]) break;
      const next = at[start[w]] === e ? at[start[w] + 1] : at[start[w]];
      if (used[next]) break;
      v = w; e = next;
    }
    // Douglas–Peucker: keep the points that bend the line by more than the tolerance.
    mark.fill(0, 0, count);
    mark[0] = mark[count - 1] = 1;
    stack.push(0, count - 1);
    while (stack.length) {
      const j = stack.pop(), i = stack.pop();
      const p = far(i, j);
      if (p >= 0) { mark[p] = 1; stack.push(i, p, p, j); }
    }
    // …and enough others that no piece is longer than maxLength (where the street has a point to cut at).
    const piece = (i, j) => { outA.push(seq[i]); outB.push(seq[j]); outK.push(kinds[k]); outL.push(along[j] - along[i]); };
    let last = 0, len = 0;
    for (let p = 1; p < count; p++) {
      const step = Math.hypot(nx[seq[p]] - nx[seq[p - 1]], ny[seq[p]] - ny[seq[p - 1]]);
      if (len + step > maxLength && p - 1 > last) { piece(last, p - 1); last = p - 1; len = 0; }
      len += step;
      if (mark[p]) { piece(last, p); last = p; len = 0; }
    }
  };
  for (let i = 0; i < n; i++) {
    if (!keep[i]) continue;
    for (let s = start[i]; s < start[i + 1]; s++) if (!used[at[s]]) run(i, at[s]);
  }
  // Rings of street with no junction on them: start anywhere.
  for (let k = 0; k < m; k++) if (!used[k]) { keep[A[k]] = 1; run(A[k], k); }
  const A2 = Int32Array.from(outA), B2 = Int32Array.from(outB), K2 = Uint8Array.from(outK), L2 = Float32Array.from(outL);
  const { chain, chains } = roadsOf(n, A2, B2);
  return {
    ...net, m: A2.length, A: A2, B: B2, kinds: K2, len: L2,
    g: fromEdgeList(net.lat, net.lon, A2, B2, K2, L2), chain, chains, major: majorOf(K2),
  };
}

/** The nearest corner on the main network with a street this way of travelling can use (-1 if none within ~2 km). */
export function nearestNode(net, lat, lon, cost) {
  const ci = Math.floor(lat / CELL), cj = Math.floor(lon / CELL);
  let best = -1, bd = Infinity;
  const usable = (i) => {
    for (let e = net.g.adjStart[i]; e < net.g.adjStart[i + 1]; e++) if (Number.isFinite(cost[net.g.adjKind[e]])) return true;
    return false;
  };
  for (let r = 0; r <= 10; r++) {
    for (let di = -r; di <= r; di++) {
      for (let dj = -r; dj <= r; dj++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        for (const i of net.grid.get(`${ci + di},${cj + dj}`) || []) {
          const d = haversine(lat, lon, net.lat[i], net.lon[i]);
          if (d < bd && usable(i)) { bd = d; best = i; }
        }
      }
    }
    // Anything in a further ring is at least r cells away.
    if (best >= 0 && bd < r * CELL * 111320 * Math.cos((lat * Math.PI) / 180)) break;
  }
  return best;
}

/**
 * One person's flood: when it reaches every corner (seconds after setting
 * off) and the pieces of street it covers, each growing from one end between
 * two times. A street reached from both ends fills from both and the two
 * meet where the flood would.
 */
export function floodFrom(net, person) {
  const cost = costTable(person.mode);
  const start = nearestNode(net, person.lat, person.lon, cost);
  if (start < 0) return null;
  const speed = SPEEDS[person.mode] || SPEEDS.walk;
  const off = (haversine(person.lat, person.lon, net.lat[start], net.lon[start]) * 1.3) / speed;
  const { dist } = dijkstra(net.g, start, null, cost);
  const time = (i) => dist[i] + off;
  const cap = 2 * net.m;
  const from = new Int32Array(cap), to = new Int32Array(cap), edge = new Int32Array(cap);
  const t0 = new Float32Array(cap), t1 = new Float32Array(cap), frac = new Float32Array(cap);
  const chainStart = new Float32Array(net.chains).fill(Infinity);
  let p = 0;
  const add = (a, b, k, s, e, f) => {
    from[p] = a; to[p] = b; edge[p] = k; t0[p] = s; t1[p] = e; frac[p] = f; p++;
    if (s < chainStart[net.chain[k]]) chainStart[net.chain[k]] = s;
  };
  for (let k = 0; k < net.m; k++) {
    const c = cost[net.kinds[k]];
    if (!Number.isFinite(c) || !(net.len[k] > 0)) continue;
    let a = net.A[k], b = net.B[k], ta = dist[a], tb = dist[b];
    if (!Number.isFinite(ta) || !Number.isFinite(tb)) continue;
    if (ta > tb) { [a, b] = [b, a]; [ta, tb] = [tb, ta]; }
    const across = net.len[k] * c;
    if (tb >= ta + across - 1e-6) { add(a, b, k, ta + off, ta + off + across, 1); continue; }
    const meet = (ta + tb + across) / 2;
    const f = (meet - ta) / across;
    add(a, b, k, ta + off, meet + off, f);
    add(b, a, k, tb + off, meet + off, 1 - f);
  }
  const starts = Float32Array.from(chainStart.filter(Number.isFinite)).sort();
  return {
    start, at: (i) => (i >= 0 ? time(i) : Infinity), count: p,
    from, to, edge, t0, t1, frac, byStart: order(t0, p), byEnd: order(t1, p), roadStarts: starts,
  };
}

/**
 * The first n positions of `key` (a Float32Array of times, none below 0)
 * in order of their times: a radix sort on the numbers' bits (which for
 * floats of one sign are in the same order as the numbers), many times
 * quicker than sorting with a comparison.
 */
function order(key, n) {
  const bits = new Uint32Array(key.buffer, key.byteOffset, n);
  let idx = Int32Array.from({ length: n }, (_, i) => i), tmp = new Int32Array(n);
  const count = new Int32Array(2048);
  for (let shift = 0; shift < 32; shift += 11) {
    count.fill(0);
    for (let i = 0; i < n; i++) count[(bits[idx[i]] >>> shift) & 2047]++;
    for (let b = 0, sum = 0; b < 2048; b++) { const c = count[b]; count[b] = sum; sum += c; }
    for (let i = 0; i < n; i++) { const j = idx[i]; tmp[count[(bits[j] >>> shift) & 2047]++] = j; }
    [idx, tmp] = [tmp, idx];
  }
  return idx;
}

/**
 * For each street, which person's flood reaches it first (-1: nobody's).
 * floods: [[person, flood, scale]]: with a scale (that person's trip time),
 * "first" means furthest along their own trip.
 */
export function ownership(net, floods) {
  const owner = new Int16Array(net.m).fill(-1);
  const first = new Float32Array(net.m).fill(Infinity);
  for (const [i, fl, scale = 1] of floods) {
    for (let q = 0; q < fl.count; q++) {
      const k = fl.edge[q], t = fl.t0[q] / scale;
      if (t < first[k]) { first[k] = t; owner[k] = i; }
    }
  }
  return owner;
}

/** How many roads a flood has started along by a time. */
export function roadsBy(fl, t) {
  const s = fl.roadStarts;
  let lo = 0, hi = s.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (s[mid] <= t) lo = mid + 1; else hi = mid; }
  return lo;
}

/** How long a flood runs to reach everyone else (a little beyond, so the front passes them). */
export function reachTime(net, fl, others) {
  const t = others.map((o) => fl.at(nearestNode(net, o.lat, o.lon, costTable('walk')))).filter(Number.isFinite);
  if (t.length) return Math.max(...t) * 1.1;
  const all = Float32Array.from(fl.t1.subarray(0, fl.count)).sort();
  return all.length ? all[Math.floor(all.length * 0.8)] : 0;
}

// ---------------------------------------------------------------- drawing

// Colours for each theme. The map stays as it is, a little dimmed so the
// floods stand out on it. Dark: the floods glow and their front is white.
// Light: the floods in their colours with a deeper shade of it at the front.
const THEMES = {
  dark: { dim: 'rgba(0,0,0,0.32)', blend: 'lighter', shade: 0.22, front: () => '#fff', traveller: '#0b0b10' },
  light: { dim: 'rgba(255,255,255,0.24)', blend: 'source-over', shade: -0.08, front: (hex) => shade(hex, -0.42), traveller: '#ffffff' },
};
const FLOOD = { minorW: 1.05, majorW: 1.7, alpha: 0.88 };
// The floods grow a little fainter the further they reach from where each person starts (by
// travel time, as a share of their trip to the meeting point): by `by` at the meeting point,
// barely to be seen, in bands too fine to show as steps.
const FADE = { by: 0.22, bands: 6 };
/** A flood's paths: minor streets in bands 0…bands-1 outwards, then major streets the same. */
const newPaths = () => Array.from({ length: 2 * FADE.bands }, () => new Path2D());
// The front: its colour over the newest … oldest third of it, which is this
// much of each person's trip long; and its glow, drawn small and scaled up
// (so soft, and cheap to draw).
const FRONT = [1, 0.6, 0.3];
const FRONT_BAND = 0.0525;
const GLOW = { scale: 0.5, width: 5, alpha: 0.35 };
// Route lines: one plain line in the person's colour, its pattern telling how
// they travel (dash lengths are multiples of the line's width).
const ROUTE = { width: 4.2 };
// The streets for one zoom: bends of less than this many screen pixels are
// straightened, and no piece is longer than maxLength pixels (so where two
// floods meet along a long road is still drawn closely).
const SIMPLIFY = { tolerance: 0.45, maxLength: 16 };
// The floods pulling back (see prepareRetract): the screen in cells this many
// pixels across, each going at its own time. Of the way from the furthest
// streets to the route, the bright edge is `rim` + `fade` deep, and the
// streets fade out over the last `fade` of it.
const RETRACT = { cell: 2, rim: 0.05, fade: 0.05, rimAlpha: 0.55 };
// How long the best routes take to draw from everyone's door to the meeting
// point (at normal speed). Their pace is the same throughout: no easing in
// or out (each line moves at its person's own speed along their trip).
const ROUTE_DRAW_MS = 3000;
export const LINE_STYLE = {
  walk: { dash: [0.001, 2.5], cap: 'round' },   // dots
  bike: { dash: [1.5, 1.3], cap: 'butt' },      // short dashes
  transit: { dash: [4.5, 1.4], cap: 'butt' },   // long dashes (bus, train, ferry…)
  drive: { dash: [], cap: 'round' },            // solid
};
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/** A colour mixed towards white (amount > 0) or black (amount < 0). */
function shade(hex, amount) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return hex;
  const v = parseInt(m[1], 16);
  const mix = (c) => Math.round(amount > 0 ? c + (255 - c) * amount : c * (1 + amount));
  return `rgb(${mix(v >> 16)},${mix((v >> 8) & 255)},${mix(v & 255)})`;
}

export class FloodAnimation {
  /**
   * people: [{ lat, lon, mode, color, name }]. pace: 1 normal, more is slower.
   * theme: 'dark' or 'light'.
   */
  constructor(map, { people, pace = 1, theme = 'dark' }) {
    this.map = map;
    this.theme = THEMES[theme] || THEMES.dark;
    this.people = people;
    this.pace = pace;
    this.net = null;
    this.floods = people.map(() => undefined);
    this.shown = [];
    this.routes = null;
    this.glow = 1;
    this.dead = false;
    this.skipping = false;
    let pane = map.getPane('flood');
    if (!pane) {
      pane = map.createPane('flood');
      pane.style.zIndex = 450;
      pane.style.pointerEvents = 'none';
    }
    const make = (cls) => {
      const c = document.createElement('canvas');
      c.className = cls;
      pane.appendChild(c);
      return c;
    };
    this.baseCanvas = make('flood-layer flood-base');
    this.floodCanvas = make('flood-layer flood-fill');
    this.glowCanvas = make('flood-layer flood-glow');
    this.canvas = make('growth-canvas');
    this.base = this.baseCanvas.getContext('2d');
    this.fill = this.floodCanvas.getContext('2d');
    this.glowCtx = this.glowCanvas.getContext('2d');
    this.top = this.canvas.getContext('2d');
    this.resize = this.resize.bind(this);
    this.redraw = () => { this.clearTransform(); this.place(); this.redrawAll(); };
    // Once back to the normal map the routes follow it as it moves; while the
    // floods run it is drawn again only when the map settles (the dimming
    // stays over the whole map meanwhile).
    this.onMove = () => {
      if (this.finished) { this.clearTransform(); this.place(); this.drawTop(); }
      else if (this.baseCanvas.isConnected) L.DomUtil.setPosition(this.baseCanvas, this.map.containerPointToLayerPoint([0, 0]));
    };
    this.onZoomAnim = (e) => this.followZoom(e.center, e.zoom);
    map.on('resize', this.resize);
    map.on('moveend zoomend', this.redraw);
    map.on('move zoom viewreset', this.onMove);
    map.on('zoomanim', this.onZoomAnim);
    this.lock(true);
    this.resize();
  }

  // ------------------------------------------------ plumbing

  /** No panning or zooming while the floods run (they are drawn for one view). */
  lock(on) {
    const m = this.map;
    for (const h of [m.dragging, m.touchZoom, m.doubleClickZoom, m.scrollWheelZoom, m.boxZoom, m.keyboard]) {
      if (!h) continue;
      if (on && h.enabled()) { h.disable(); (this.locked ||= []).push(h); }
    }
    if (!on) { for (const h of this.locked || []) h.enable(); this.locked = null; }
  }

  resize() {
    const size = this.map.getSize();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    for (const c of [this.baseCanvas, this.floodCanvas, this.glowCanvas, this.canvas]) {
      if (!c.isConnected) continue;
      const r = c === this.glowCanvas ? GLOW.scale : dpr;
      c.width = Math.round(size.x * r);
      c.height = Math.round(size.y * r);
      c.style.width = `${size.x}px`;
      c.style.height = `${size.y}px`;
    }
    this.dpr = dpr;
    this.size = size;
    this.place();
    this.redrawAll();
  }

  /** Line the canvases up with the top left of the map's view (the pane moves with the map). */
  place() {
    const at = this.map.containerPointToLayerPoint([0, 0]);
    for (const c of [this.baseCanvas, this.floodCanvas, this.glowCanvas, this.canvas]) if (c.isConnected) L.DomUtil.setPosition(c, at);
  }

  /** Map position → canvas pixels for the current view. */
  view() {
    const scale = 2 ** this.map.getZoom();
    const o = this.map.getPixelBounds().min;
    return { X: (x) => x * scale - o.x, Y: (y) => y * scale - o.y, scale };
  }

  followZoom(center, zoom) {
    const map = this.map;
    const scale = map.getZoomScale(zoom, map.getZoom());
    const half = map.getSize().divideBy(2);
    const from = map.getPixelBounds().min;
    const to = map.project(center, zoom).subtract(half);
    const at = map.containerPointToLayerPoint([0, 0]);
    this.canvas.classList.add('zooming');
    L.DomUtil.setTransform(this.canvas, at.add(from.multiplyBy(scale).subtract(to)), scale);
    this.zooming = true;
  }

  clearTransform() {
    if (!this.zooming) return;
    this.zooming = false;
    this.canvas.classList.remove('zooming');
    this.place();
  }

  /** Run `frame(t)` for t from 0 to 1 over ms × pace. Resolves false if cancelled. */
  run(ms, frame = () => {}) {
    return new Promise((resolve) => {
      if (this.dead) { resolve(false); return; }
      const dur = ms * this.pace;
      const startAt = performance.now();
      this.pending = resolve;
      const step = (now) => {
        if (this.dead) return;
        const t = this.skipping || dur <= 0 ? 1 : Math.min(1, (now - startAt) / dur);
        frame(t);
        if (t >= 1) { this.pending = null; resolve(true); return; }
        this.raf = requestAnimationFrame(step);
      };
      this.raf = requestAnimationFrame(step);
    });
  }

  /** Hurry to the end: the remaining steps finish at once. */
  skip() { this.skipping = true; }

  /** The app's theme changed while the animation (or its routes) is showing. */
  setTheme(theme) {
    const th = THEMES[theme] || THEMES.dark;
    if (th === this.theme || this.dead) return;
    this.theme = th;
    for (const f of this.shown) { f.color = shade(this.people[f.i].color, th.shade); f.front = th.front(this.people[f.i].color); }
    for (const r of this.routes || []) r.glow = shade(r.color, th.shade);
    if (!this.routes && this.shown.length) this.additive(true); // the floods are running
    this.redrawAll();
  }

  destroy() {
    this.dead = true;
    cancelAnimationFrame(this.raf);
    this.pending?.(false);
    this.pending = null;
    this.lock(false);
    this.map.off('resize', this.resize);
    this.map.off('moveend zoomend', this.redraw);
    this.map.off('move zoom viewreset', this.onMove);
    this.map.off('zoomanim', this.onZoomAnim);
    for (const c of [this.baseCanvas, this.floodCanvas, this.glowCanvas, this.canvas]) c.remove();
  }

  // ------------------------------------------------ the streets

  /**
   * The streets to flood: as roads.js makes them, or a network prepared from
   * them already (`net`). The floods run over the same streets in fewer,
   * longer pieces for this zoom (see simplifyNetwork): the map holds still
   * while they run, and drawing a frame costs by the piece.
   */
  setRoads(roads, net = null) {
    const full = net || (roads && roads.A.length ? prepareNetwork(roads) : null);
    const px = 1 / 2 ** this.map.getZoom(); // one screen pixel, in the network's map units
    this.net = full ? simplifyNetwork(full, { tolerance: SIMPLIFY.tolerance * px, maxLength: SIMPLIFY.maxLength * px }) : null;
    this.drawBase();
  }

  flood(i) {
    if (this.floods[i] === undefined) this.floods[i] = this.net ? floodFrom(this.net, this.people[i]) : null;
    return this.floods[i];
  }

  /** The map dimmed a little (its own streets show through: the floods run along them). */
  drawBase() {
    const { base: ctx, dpr, size } = this;
    if (!size || !this.baseCanvas.isConnected) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.x, size.y);
    ctx.fillStyle = this.theme.dim;
    ctx.fillRect(0, 0, size.x, size.y);
  }

  // ------------------------------------------------ floods

  /**
   * Show these people's floods (indices), starting from nothing. With
   * `owner` (per street: who gets there first), each street is drawn only
   * for that person, so the floods meet instead of piling up.
   */
  showFloods(list, owner = null, reach = null) {
    this.owner = owner;
    const th = this.theme;
    this.shown = list.map((i) => ({
      i, fl: this.flood(i), color: shade(this.people[i].color, th.shade), front: th.front(this.people[i].color),
      reach: reach?.get(i) || 0, c: 0, s: 0, e: 0, p0: 0, active: [], band: 1, frozen: false,
    })).filter((f) => f.fl);
    const { fill, top, dpr, size } = this;
    fill.setTransform(dpr, 0, 0, dpr, 0, 0);
    fill.clearRect(0, 0, size.x, size.y);
    top.setTransform(dpr, 0, 0, dpr, 0, 0);
    top.clearRect(0, 0, size.x, size.y);
  }

  /** Add the pieces of street in byEnd[from…to) to paths, whole or up to time `upTo`. */
  trace(f, from, to, paths, v, upTo = Infinity) {
    const { fl } = f, own = this.owner;
    for (let j = from; j < to; j++) {
      const q = fl.byEnd[j];
      if (own && own[fl.edge[q]] !== f.i) continue;
      this.piece(fl, q, upTo, this.pathFor(f, paths, q), v);
    }
  }

  /** The path a piece of street goes in: a minor or major street, and how far out it is (see FADE). */
  pathFor(f, paths, q) {
    const out = f.reach > 0 ? Math.min(FADE.bands - 1, Math.floor((f.fl.t0[q] / f.reach) * FADE.bands)) : 0;
    return paths[this.net.major[f.fl.edge[q]] * FADE.bands + out];
  }

  piece(fl, q, upTo, path, v) {
    const net = this.net;
    const a = fl.from[q], b = fl.to[q];
    let f = fl.frac[q];
    if (upTo < fl.t1[q]) f *= fl.t1[q] > fl.t0[q] ? Math.max(0, (upTo - fl.t0[q]) / (fl.t1[q] - fl.t0[q])) : 1;
    const ax = v.X(net.nx[a]), ay = v.Y(net.ny[a]);
    path.moveTo(ax, ay);
    path.lineTo(ax + (v.X(net.nx[b]) - ax) * f, ay + (v.Y(net.ny[b]) - ay) * f);
  }

  strokeFlood(ctx, f, paths, alpha = FLOOD.alpha) {
    ctx.globalCompositeOperation = this.theme.blend;
    ctx.strokeStyle = f.color;
    ctx.lineCap = 'butt';
    for (let k = 0; k < FADE.bands; k++) {
      ctx.globalAlpha = alpha * (1 - (FADE.by * (k + 0.5)) / FADE.bands);
      ctx.lineWidth = FLOOD.minorW; ctx.stroke(paths[k]);
      ctx.lineWidth = FLOOD.majorW; ctx.stroke(paths[FADE.bands + k]);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  /**
   * Move a flood's clock on: the streets it has just finished go onto the
   * flood canvas in its colour (the white of its front is drawn over them
   * for a while yet: see drawFronts).
   */
  advance(f, c, band) {
    const { fl } = f;
    f.c = c; f.band = band;
    while (f.p0 < fl.count && fl.t0[fl.byStart[f.p0]] <= c) f.active.push(fl.byStart[f.p0++]);
    const from = f.e;
    while (f.e < fl.count && fl.t1[fl.byEnd[f.e]] <= c) f.e++;
    if (f.e > from) {
      const v = this.view(), paths = newPaths();
      this.fill.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.trace(f, from, f.e, paths, v);
      this.strokeFlood(this.fill, f, paths);
    }
    while (f.s < f.e && fl.t1[fl.byEnd[f.s]] <= c - band) f.s++;
  }

  /**
   * The bright front of each flood: the newest streets white, fading to the
   * person's colour (the streets finished already have it, on the flood
   * canvas; the ones the front is moving along get it here, so far).
   */
  drawFronts(fade = 1) {
    const { top: ctx, glowCtx: gctx } = this;
    const v = this.view();
    const own = this.owner;
    gctx.setTransform(GLOW.scale, 0, 0, GLOW.scale, 0, 0);
    this.glowing = true;
    for (const f of this.shown) {
      if (f.frozen) continue;
      const { fl } = f;
      const colour = newPaths();
      const white = FRONT.map(() => new Path2D());
      const glow = new Path2D();
      for (let j = f.s; j < f.e; j++) {
        const q = fl.byEnd[j];
        if (own && own[fl.edge[q]] !== f.i) continue;
        const age = (f.c - fl.t1[q]) / f.band;
        const k = Math.max(0, Math.min(FRONT.length - 1, Math.floor(age * FRONT.length)));
        this.piece(fl, q, Infinity, white[k], v);
        if (k === 0) this.piece(fl, q, Infinity, glow, v);
      }
      // Streets the front is moving along right now.
      let w = 0;
      for (const q of f.active) {
        if (fl.t1[q] <= f.c) continue;
        f.active[w++] = q;
        if (own && own[fl.edge[q]] !== f.i) continue;
        this.piece(fl, q, f.c, this.pathFor(f, colour, q), v);
        this.piece(fl, q, f.c, white[0], v);
        this.piece(fl, q, f.c, glow, v);
      }
      f.active.length = w;
      this.strokeFlood(ctx, f, colour);
      // Flat ends: much quicker to draw than round ones on so many short
      // pieces, and too thin (or too soft) for the difference to show.
      gctx.globalCompositeOperation = this.theme.blend;
      gctx.lineCap = 'butt';
      gctx.strokeStyle = f.color;
      gctx.globalAlpha = GLOW.alpha * fade;
      gctx.lineWidth = GLOW.width;
      gctx.stroke(glow);
      ctx.globalCompositeOperation = this.theme.blend;
      ctx.lineCap = 'butt';
      ctx.strokeStyle = f.front;
      FRONT.forEach((a, k) => { ctx.globalAlpha = a * fade; ctx.lineWidth = k === 0 ? 1.6 : 1.2; ctx.stroke(white[k]); });
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    gctx.globalAlpha = 1;
    gctx.globalCompositeOperation = 'source-over';
  }

  /**
   * The front's canvas adds its light to the floods below it (in the dark
   * theme), as it did when the streets behind the front were drawn on it
   * too. Only while the floods run: routes and travellers are painted.
   */
  additive(on) {
    for (const c of [this.canvas, this.glowCanvas]) c.classList.toggle('adds', !!on && this.theme.blend === 'lighter');
  }

  /** Stop the floods where they are: the front fades and everything left settles. */
  async settle() {
    const ok = await this.run(380, (t) => { this.clearTop(); this.drawFronts(1 - t); });
    for (const f of this.shown) this.freeze(f);
    this.clearTop();
    if (ok) this.snapshotFloods();
    return ok;
  }

  /** A flood that has stopped: the streets its front was part way along go onto the flood canvas in its colour. */
  freeze(f) {
    if (f.frozen) return;
    const v = this.view();
    const paths = newPaths();
    this.partial(f, paths, v);
    this.fill.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.strokeFlood(this.fill, f, paths);
    f.frozen = true;
  }

  /** Add the streets a flood is part way along to paths, as far as it has got. */
  partial(f, paths, v) {
    const { fl } = f;
    for (const q of f.active) if (fl.t1[q] > f.c && (!this.owner || this.owner[fl.edge[q]] === f.i)) this.piece(fl, q, f.c, this.pathFor(f, paths, q), v);
  }

  /** Every flood as far as it has got, from scratch, on the flood canvas. */
  drawFloods() {
    const { fill, dpr, size } = this;
    this.snap = null;
    fill.setTransform(dpr, 0, 0, dpr, 0, 0);
    fill.clearRect(0, 0, size.x, size.y);
    const v = this.view();
    for (const f of this.shown) {
      const paths = newPaths();
      this.trace(f, 0, f.e, paths, v);
      if (f.frozen) this.partial(f, paths, v);
      this.strokeFlood(fill, f, paths);
    }
  }

  /** Clear the canvas the fronts, routes and travellers are drawn on (and the fronts' glow). */
  clearTop() {
    const { top: ctx, dpr, size } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.x, size.y);
    if (this.glowing) {
      this.glowing = false;
      this.glowCtx.setTransform(1, 0, 0, 1, 0, 0);
      this.glowCtx.clearRect(0, 0, this.glowCanvas.width, this.glowCanvas.height);
    }
  }

  // ------------------------------------------------ the phases

  /** The map dims a little. */
  intro() {
    this.baseCanvas.classList.add('on');
    return this.run(450);
  }

  /** Work out everyone's flood now (a moment's work each), so the floods start smoothly later. */
  prepare() {
    if (this.net) this.people.forEach((_, i) => this.flood(i));
  }

  /**
   * Everyone's floods at once, each timed as progress through that person's
   * own trip, so they all reach the meeting point together: someone driving
   * floods out faster than someone walking, and the map divides into
   * territories that meet at the pin.
   * onProgress(t) with t from 0 to 1; onRoads(total) with the number of roads searched.
   */
  async allAtOnce(meet, { onProgress, onRoads } = {}) {
    if (!this.net) return true;
    const list = this.people.map((_, i) => i).filter((i) => this.flood(i));
    if (!list.length) return true;
    const node = nearestNode(this.net, meet.lat, meet.lon, costTable('walk'));
    const trip = new Map(list.map((i) => {
      const fl = this.flood(i);
      const t = fl.at(node);
      return [i, Math.max(60, Number.isFinite(t) ? t : reachTime(this.net, fl, this.people.filter((_, j) => j !== i)) * 0.6)];
    }));
    this.showFloods(list, ownership(this.net, list.map((i) => [i, this.flood(i), trip.get(i)])), trip);
    this.additive(true);
    const END = 1.03;
    const ok = await this.run(2600, (t) => {
      const progress = END * (0.5 * t + 0.5 * easeInOut(t));
      for (const f of this.shown) this.advance(f, progress * trip.get(f.i), FRONT_BAND * trip.get(f.i));
      this.clearTop();
      this.drawFronts();
      onProgress?.(t);
      onRoads?.(this.shown.reduce((sum, f) => sum + roadsBy(f.fl, f.c), 0));
    });
    if (!ok) return false;
    return this.settle();
  }

  /**
   * Everyone's route lights up and they travel along it to the meeting point,
   * then gather above the pin.
   * tracks: [{ color, initial, duration, pieces: [{ pts: [[lat, lon]], t0, t1, walk }] }]
   * onArrive() once everyone has arrived.
   */
  async reveal(meet, tracks, { onArrive } = {}) {
    const crs = L.CRS.EPSG3857;
    const proj = ([lat, lon]) => crs.latLngToPoint(L.latLng(lat, lon), 0);
    const ok = (p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]);
    this.meetPt = proj([meet.lat, meet.lon]);
    this.routes = tracks.map((t) => {
      const segs = [];
      let prev = null;
      for (const piece of t.pieces) {
        let pts = piece.pts.filter(ok).map(proj);
        // Each piece starts where the last one ended, so the route is one unbroken line.
        if (prev && pts.length && (pts[0].x !== prev.x || pts[0].y !== prev.y)) pts = [prev, ...pts];
        addTimed(segs, pts, piece.t0, piece.t1, piece.mode || (piece.walk ? 'walk' : 'drive'));
        if (pts.length) prev = pts[pts.length - 1];
      }
      segs.sort((a, b) => a.s0 - b.s0);
      return { color: t.color, glow: shade(t.color, this.theme.shade), initial: t.initial, duration: t.duration, segs };
    });
    this.routeClock = 0;
    this.gather = 0;
    this.glow = 1;
    this.additive(false);
    const total = Math.max(1, ...this.routes.map((r) => r.duration));
    this.prepareRetract();
    // The routes draw while the floods pull back: both on one clock, so the
    // last of the floods goes just as the last route reaches the meeting point.
    if (!(await this.run(ROUTE_DRAW_MS, (p) => {
      this.routeClock = total * p;
      this.drawRetract(p);
      this.drawTop();
    }))) return false;
    this.drawRetract(1);
    onArrive?.();
    if (!(await this.run(400, (t) => { this.gather = easeInOut(t); this.drawTop(); }))) return false;
    return this.run(750);
  }

  /**
   * Once the floods have stopped: their picture, to pull back from (see
   * drawRetract), and which cells of the screen (RETRACT.cell pixels
   * across) each person's streets cover. Done while nothing moves (the
   * floods have settled and the routes are on their way), so the pulling
   * back starts smoothly.
   */
  snapshotFloods() {
    this.snap = null;
    const { net, size } = this;
    if (!net || !size || !this.floodCanvas.isConnected) return;
    const cw = this.floodCanvas.width, ch = this.floodCanvas.height;
    if (!cw || !ch) return;
    const v = this.view(), own = this.owner, c = RETRACT.cell;
    const W = Math.ceil(size.x / c), H = Math.ceil(size.y / c);
    const cells = this.shown.map((f) => {
      const { fl } = f;
      let out = new Int32Array(4096), count = 0;
      const sample = (q, upTo) => {
        let fr = fl.frac[q];
        if (upTo < fl.t1[q]) fr *= fl.t1[q] > fl.t0[q] ? Math.max(0, (upTo - fl.t0[q]) / (fl.t1[q] - fl.t0[q])) : 1;
        const ax = v.X(net.nx[fl.from[q]]), ay = v.Y(net.ny[fl.from[q]]);
        const bx = ax + (v.X(net.nx[fl.to[q]]) - ax) * fr, by = ay + (v.Y(net.ny[fl.to[q]]) - ay) * fr;
        if (Math.max(ax, bx) < 0 || Math.min(ax, bx) >= size.x || Math.max(ay, by) < 0 || Math.min(ay, by) >= size.y) return;
        const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / c));
        for (let s = 0; s <= steps; s++) {
          const x = ax + ((bx - ax) * s) / steps, y = ay + ((by - ay) * s) / steps;
          if (!(x >= 0 && y >= 0 && x < size.x && y < size.y)) continue;
          if (count === out.length) { const o = new Int32Array(count * 2); o.set(out); out = o; }
          out[count++] = Math.floor(y / c) * W + Math.floor(x / c);
        }
      };
      for (let j = 0; j < f.e; j++) { const q = fl.byEnd[j]; if (!own || own[fl.edge[q]] === f.i) sample(q, Infinity); }
      for (const q of f.active) if (fl.t1[q] > f.c && (!own || own[fl.edge[q]] === f.i)) sample(q, f.c);
      return out.subarray(0, count);
    });
    const img = this.fill.getImageData(0, 0, cw, ch);
    this.snap = {
      W, H, cells, img, cw, orig: new Uint8ClampedArray(img.data),
      // Each cell's edges in canvas pixels.
      xs: Int32Array.from({ length: W + 1 }, (_, i) => Math.min(cw, Math.round((i * c * cw) / size.x))),
      ys: Int32Array.from({ length: H + 1 }, (_, i) => Math.min(ch, Math.round((i * c * ch) / size.y))),
    };
  }

  /**
   * Ready for the floods to pull back towards everyone's route, the
   * furthest streets first: each cell of the screen gets the moment its
   * streets go, 0 for those furthest from that person's route … 1 for those
   * right beside it (by a coarse distance map of the screen and a little
   * past it). Each frame then changes only the pixels of the cells on the
   * move (see drawRetract), however many streets there are.
   */
  prepareRetract() {
    this.mask = null;
    if (!this.snap) this.snapshotFloods();
    const sn = this.snap, { size } = this;
    if (!sn) return;
    const { W, H, cells } = sn;
    const v = this.view();
    const dc = 2 * RETRACT.cell, M = 24; // distances: cells twice as big, M of them past each edge
    const DW = Math.ceil(W / 2) + 2 * M, DH = Math.ceil(H / 2) + 2 * M;
    const V = new Float32Array(W * H).fill(-1), who = new Int16Array(W * H).fill(-1);
    const D = new Float32Array(DW * DH);
    this.shown.forEach((f, si) => {
      // Distance 0 along the route (without one: at the meeting point)…
      D.fill(Infinity);
      let seeded = false;
      const pad = M * dc;
      for (const sg of this.routes?.[f.i]?.segs || []) {
        const ax = v.X(sg.ax), ay = v.Y(sg.ay), bx = v.X(sg.bx), by = v.Y(sg.by);
        if (Math.max(ax, bx) < -pad || Math.min(ax, bx) > size.x + pad || Math.max(ay, by) < -pad || Math.min(ay, by) > size.y + pad) continue;
        const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / (dc / 2)));
        for (let s = 0; s <= steps; s++) {
          const gx = Math.floor((ax + ((bx - ax) * s) / steps) / dc) + M, gy = Math.floor((ay + ((by - ay) * s) / steps) / dc) + M;
          if (gx >= 0 && gy >= 0 && gx < DW && gy < DH) { D[gy * DW + gx] = 0; seeded = true; }
        }
      }
      if (!seeded && this.meetPt) {
        const gx = Math.min(DW - 1, Math.max(0, Math.floor(v.X(this.meetPt.x) / dc) + M));
        const gy = Math.min(DH - 1, Math.max(0, Math.floor(v.Y(this.meetPt.y) / dc) + M));
        D[gy * DW + gx] = 0;
      }
      chamfer(D, DW, DH);
      // …then each cell this flood covers, by its distance from there.
      const list = cells[si];
      const dist = (k) => D[(((k / W) | 0) >> 1) * DW + M * DW + ((k % W) >> 1) + M];
      let max = 0;
      for (let s = 0; s < list.length; s++) { const d = dist(list[s]); if (d > max && d < Infinity) max = d; }
      for (let s = 0; s < list.length; s++) {
        const k = list[s], d = dist(k);
        if (!(d < Infinity)) continue;
        const val = max > 0 ? 1 - d / max : 1;
        if (val > V[k]) { V[k] = val; who[k] = si; }
      }
    });
    // A street's line reaches a little into the cells beside it: each cell
    // goes with the last of its neighbours to go (rows, then columns).
    const spread = (src, srcWho, dst, dstWho, step, len, lines, stride) => {
      for (let l = 0; l < lines; l++) {
        for (let i = 0; i < len; i++) {
          const k = l * stride + i * step;
          let best = src[k], bw = srcWho[k];
          if (i > 0 && src[k - step] > best) { best = src[k - step]; bw = srcWho[k - step]; }
          if (i < len - 1 && src[k + step] > best) { best = src[k + step]; bw = srcWho[k + step]; }
          dst[k] = best; dstWho[k] = bw;
        }
      }
    };
    const V1 = new Float32Array(W * H), who1 = new Int16Array(W * H);
    spread(V, who, V1, who1, 1, W, H, W);
    spread(V1, who1, V, who, W, H, W, 1);
    this.mask = {
      ...sn, V, who, tints: this.shown.map((f) => rgbOf(f.front)),
      alpha: new Uint8Array(W * H).fill(255), tint: new Uint8Array(W * H),
    };
  }

  /**
   * The floods pulling back: p = 0 as they were, 1 all gone. The streets
   * furthest from each person's route go first, closing in on it behind a
   * bright edge (the front's colour, added as the front was drawn while the
   * floods grew) where they fade out, until the last ones, right beside the
   * route, go as it reaches the meeting point.
   */
  drawRetract(p) {
    this.retract = p;
    if (!this.floodCanvas.isConnected) return;
    const mk = this.mask;
    if (!this.net || p >= 1 || !mk) {
      const { fill, dpr, size } = this;
      fill.setTransform(dpr, 0, 0, dpr, 0, 0);
      fill.clearRect(0, 0, size.x, size.y);
      if (p >= 1) this.mask = this.snap = null;
      return;
    }
    const { W, H, V, who, img, orig, cw, xs, ys, tints, alpha, tint } = mk;
    const data = img.data;
    const F = RETRACT.fade, R = RETRACT.rim, adds = this.theme.blend === 'lighter';
    const edge = -R + p * (1 + R); // cells at or below this have gone
    const rim = RETRACT.rimAlpha * (1 - p) * Math.min(1, p / 0.08); // the edge's strength, coming in quickly at the start
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let cy = 0, i = 0; cy < H; cy++) {
      for (let cx = 0; cx < W; cx++, i++) {
        const val = V[i];
        if (val < 0) continue;
        const u = val - edge;
        let a = 0, t = 0;
        if (u > 0) {
          a = u >= F ? 255 : Math.round((255 * u) / F);
          t = 8 * Math.round(32 * rim * Math.max(0, Math.min(1, (F + R - u) / (0.3 * R)))); // in steps, so the cells along the edge are redrawn only when it changes visibly
        }
        if (a === alpha[i] && t === tint[i]) continue;
        alpha[i] = a; tint[i] = t;
        if (cx < x0) x0 = cx;
        if (cx > x1) x1 = cx;
        if (cy < y0) y0 = cy;
        y1 = cy;
        const tc = tints[who[i]], k = t / 255, m = a / 255;
        for (let py = ys[cy]; py < ys[cy + 1]; py++) {
          for (let o = (py * cw + xs[cx]) * 4, end = (py * cw + xs[cx + 1]) * 4; o < end; o += 4) {
            const oa = orig[o + 3];
            if (!oa) continue;
            // The edge's colour over the street (as much as the street covers
            // the pixel): added to it in the dark theme, laid over it in the light.
            const a0 = oa / 255, kc = k * Math.min(1, a0 / FLOOD.alpha);
            let A, r, g, b;
            if (adds) {
              A = Math.min(1, a0 + kc);
              r = orig[o] * a0 + tc[0] * kc; g = orig[o + 1] * a0 + tc[1] * kc; b = orig[o + 2] * a0 + tc[2] * kc;
            } else {
              A = kc + a0 * (1 - kc);
              r = tc[0] * kc + orig[o] * a0 * (1 - kc); g = tc[1] * kc + orig[o + 1] * a0 * (1 - kc); b = tc[2] * kc + orig[o + 2] * a0 * (1 - kc);
            }
            data[o] = r / A; data[o + 1] = g / A; data[o + 2] = b / A;
            data[o + 3] = 255 * A * m;
          }
        }
      }
    }
    if (x1 >= 0) this.fill.putImageData(img, 0, 0, xs[x0], ys[y0], xs[x1 + 1] - xs[x0], ys[y1 + 1] - ys[y0]);
  }

  /** Back to the normal map, keeping the routes. */
  async outro() {
    this.lock(false);
    this.baseCanvas.classList.remove('on');
    this.floodCanvas.style.opacity = '0';
    const ok = await this.run(550, (t) => { this.glow = 1 - t; this.drawTop(); });
    this.baseCanvas.remove();
    this.floodCanvas.remove();
    this.glowCanvas.remove();
    this.mask = this.snap = null;
    this.glow = 0;
    this.finished = true;
    this.drawTop();
    return ok;
  }

  // ------------------------------------------------ routes and travellers

  drawTop() {
    const { top: ctx } = this;
    if (!this.size) return;
    this.clearTop();
    if (!this.routes) return;
    const v = this.view();
    const g = this.glow;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const tips = [];
    for (const r of this.routes) {
      const upToT = Math.min(this.routeClock, r.duration);
      // One path per way of travelling; joined pieces continue the same line,
      // so a pattern stays evenly spaced across corners and doesn't creep as
      // the line grows.
      const paths = {};
      let tip = null, last = null, lastMode = null;
      for (const s of r.segs) {
        if (s.s0 > upToT) break;
        const x0 = v.X(s.ax), y0 = v.Y(s.ay);
        let x1 = v.X(s.bx), y1 = v.Y(s.by);
        if (s.s1 > upToT) { const f = s.s1 > s.s0 ? (upToT - s.s0) / (s.s1 - s.s0) : 1; x1 = x0 + (x1 - x0) * f; y1 = y0 + (y1 - y0) * f; }
        const path = (paths[s.mode] ||= new Path2D());
        const joined = last && Math.abs(last.x - x0) < 0.01 && Math.abs(last.y - y0) < 0.01;
        if (!joined || lastMode !== s.mode) path.moveTo(x0, y0);
        path.lineTo(x1, y1);
        last = { x: x1, y: y1 };
        lastMode = s.mode;
        tip = last;
      }
      // A plain line in the person's colour: no glow, no highlight.
      const color = g > 0.5 ? r.glow : r.color;
      for (const [mode, path] of Object.entries(paths)) {
        const st = LINE_STYLE[mode] || LINE_STYLE.drive;
        ctx.globalAlpha = 1;
        ctx.strokeStyle = color;
        ctx.lineWidth = ROUTE.width;
        ctx.lineCap = st.cap;
        ctx.setLineDash(st.dash.map((d) => d * ROUTE.width));
        ctx.lineDashOffset = 0;
        ctx.stroke(path);
      }
      if (tip && g > 0) tips.push({ ...tip, r });
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    // Travellers: at the front of their route, then gathered in a row above the pin.
    const mx = v.X(this.meetPt.x), my = v.Y(this.meetPt.y);
    tips.forEach((h, k) => {
      const slotX = mx + (k - (tips.length - 1) / 2) * 23, slotY = my - 40; // clear of the pin's hop
      const x = h.x + (slotX - h.x) * this.gather, y = h.y + (slotY - h.y) * this.gather;
      ctx.globalAlpha = g;
      ctx.shadowColor = h.r.glow; ctx.shadowBlur = 14;
      ctx.beginPath(); ctx.arc(x, y, 10.5, 0, Math.PI * 2);
      ctx.fillStyle = this.theme.traveller; ctx.fill();
      ctx.shadowBlur = 0;
      ctx.lineWidth = 2.6; ctx.strokeStyle = h.r.glow; ctx.stroke();
      ctx.fillStyle = h.r.glow;
      ctx.font = '700 11px -apple-system, BlinkMacSystemFont, "Inter", sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(h.r.initial || '', x, y + 0.5);
    });
    ctx.globalAlpha = 1;
  }

  /** After a resize or the view changes: everything again from scratch. */
  redrawAll() {
    if (!this.size) return;
    this.drawBase();
    const floods = this.floodCanvas.isConnected && this.net;
    if (this.retract != null) {
      // Pulling back: the floods again in full, to pull back from where they are now.
      if (floods && this.retract < 1) { this.drawFloods(); this.snapshotFloods(); this.prepareRetract(); }
      this.drawRetract(this.retract);
    } else if (floods) this.drawFloods();
    if (this.routes) this.drawTop();
    else { this.clearTop(); this.drawFronts(); }
  }
}

/** Distances (in cells) from the cells at 0 to all the others: two sweeps, straight and diagonal steps. */
function chamfer(D, W, H) {
  const R2 = Math.SQRT2;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      let d = D[i];
      if (x > 0) d = Math.min(d, D[i - 1] + 1);
      if (y > 0) {
        d = Math.min(d, D[i - W] + 1);
        if (x > 0) d = Math.min(d, D[i - W - 1] + R2);
        if (x < W - 1) d = Math.min(d, D[i - W + 1] + R2);
      }
      D[i] = d;
    }
  }
  for (let y = H - 1; y >= 0; y--) {
    for (let x = W - 1; x >= 0; x--) {
      const i = y * W + x;
      let d = D[i];
      if (x < W - 1) d = Math.min(d, D[i + 1] + 1);
      if (y < H - 1) {
        d = Math.min(d, D[i + W] + 1);
        if (x < W - 1) d = Math.min(d, D[i + W + 1] + R2);
        if (x > 0) d = Math.min(d, D[i + W - 1] + R2);
      }
      D[i] = d;
    }
  }
}

/** [r, g, b] of a colour written #rgb, #rrggbb or rgb(r, g, b) (white if neither). */
function rgbOf(css) {
  const s = String(css || '');
  let m = /^#([0-9a-f]{6})$/i.exec(s);
  if (m) { const v = parseInt(m[1], 16); return [v >> 16, (v >> 8) & 255, v & 255]; }
  m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(s);
  if (m) return [m[1], m[2], m[3]].map((h) => parseInt(h + h, 16));
  m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(s);
  if (m) return [+m[1], +m[2], +m[3]];
  return [255, 255, 255];
}

/** Split a projected line into segments timed evenly by length between t0 and t1. */
function addTimed(out, raw, t0, t1, mode) {
  // Repeated points would make zero-length steps (and uneven dots).
  const pts = raw.filter((p, i) => i === 0 || p.x !== raw[i - 1].x || p.y !== raw[i - 1].y);
  if (pts.length < 2) return;
  let total = 0;
  const lens = [];
  for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); lens.push(l); total += l; }
  let along = 0;
  for (let i = 1; i < pts.length; i++) {
    const s0 = t0 + (total ? along / total : 0) * (t1 - t0);
    along += lens[i - 1];
    const s1 = t0 + (total ? along / total : 1) * (t1 - t0);
    out.push({ ax: pts[i - 1].x, ay: pts[i - 1].y, bx: pts[i].x, by: pts[i].y, s0, s1, mode });
  }
}
