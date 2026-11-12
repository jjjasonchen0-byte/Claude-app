// The search animation. The map goes quiet (dark or light, with the app's
// theme) and its streets show faintly.
// Then everyone's reach floods out along the streets at once, each in their
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
// people and the meeting point: the dark backdrop with the streets, the
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
  // A "road" for the counter: the stretch of street between two junctions.
  const deg = new Int32Array(n), e1 = new Int32Array(n), e2 = new Int32Array(n);
  for (let k = 0; k < m; k++) {
    for (const v of [A[k], B[k]]) { if (deg[v] === 0) e1[v] = k; else if (deg[v] === 1) e2[v] = k; deg[v]++; }
  }
  const up = Int32Array.from({ length: Math.max(n, m) }, (_, i) => i);
  const find = (i) => { while (up[i] !== i) { up[i] = up[up[i]]; i = up[i]; } return i; };
  for (let v = 0; v < n; v++) if (deg[v] === 2) { const a = find(e1[v]), b = find(e2[v]); if (a !== b) up[a] = b; }
  const chain = new Int32Array(m);
  const dense = new Map();
  for (let k = 0; k < m; k++) { const r = find(k); if (!dense.has(r)) dense.set(r, dense.size); chain[k] = dense.get(r); }
  // The largest connected network: floods start from a corner on it, not a stray car park.
  for (let i = 0; i < n; i++) up[i] = i;
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
  const major = Uint8Array.from(kinds, (k) => ((k & 7) <= 2 ? 1 : 0));
  return { n, m, lat, lon, A, B, kinds, g, len, nx, ny, chain, chains: dense.size, grid, major };
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
  const ids = (key) => Int32Array.from({ length: p }, (_, i) => i).sort((x, y) => key[x] - key[y]);
  const starts = Float32Array.from(chainStart.filter(Number.isFinite)).sort();
  return {
    start, at: (i) => (i >= 0 ? time(i) : Infinity), count: p,
    from, to, edge, t0, t1, frac, byStart: ids(t0), byEnd: ids(t1), roadStarts: starts,
  };
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

// Colours for each theme. Dark: streets glow a dim gold, the floods glow and
// their front is white. Light: a pale map with grey streets, the floods in
// their colours with a deeper shade of it at the front.
const THEMES = {
  dark: {
    scrim: 'rgba(2,2,5,0.95)', minor: 'rgba(196,158,86,0.26)', major: 'rgba(222,178,98,0.46)',
    blend: 'lighter', shade: 0.22, front: () => '#fff', traveller: '#0b0b10',
  },
  light: {
    scrim: 'rgba(246,244,240,0.94)', minor: 'rgba(120,112,100,0.24)', major: 'rgba(110,100,85,0.42)',
    blend: 'source-over', shade: -0.08, front: (hex) => shade(hex, -0.42), traveller: '#ffffff',
  },
};
const BASE = { minorW: 0.7, majorW: 1.2 };
const FLOOD = { minorW: 1.05, majorW: 1.7, alpha: 0.88 };
const FRONT = [1, 0.6, 0.3, 0.08]; // the front colour over the newest … oldest quarter of the front
// Route lines: one plain line in the person's colour, its pattern telling how
// they travel (dash lengths are multiples of the line's width).
const ROUTE = { width: 4.2 };
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
    this.canvas = make('growth-canvas');
    this.base = this.baseCanvas.getContext('2d');
    this.fill = this.floodCanvas.getContext('2d');
    this.top = this.canvas.getContext('2d');
    this.resize = this.resize.bind(this);
    this.redraw = () => { this.clearTransform(); this.place(); this.redrawAll(); };
    // Once back to the normal map the routes follow it as it moves; while the
    // map is dark it stays still, and is drawn again only when it settles.
    this.onMove = () => { if (this.finished) { this.clearTransform(); this.place(); this.drawTop(); } };
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
    for (const c of [this.baseCanvas, this.floodCanvas, this.canvas]) {
      if (!c.isConnected) continue;
      c.width = Math.round(size.x * dpr);
      c.height = Math.round(size.y * dpr);
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
    for (const c of [this.baseCanvas, this.floodCanvas, this.canvas]) if (c.isConnected) L.DomUtil.setPosition(c, at);
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
    for (const c of [this.baseCanvas, this.floodCanvas, this.canvas]) c.remove();
  }

  // ------------------------------------------------ the streets

  setRoads(roads) {
    this.net = roads && roads.A.length ? prepareNetwork(roads) : null;
    this.drawBase();
  }

  flood(i) {
    if (this.floods[i] === undefined) this.floods[i] = this.net ? floodFrom(this.net, this.people[i]) : null;
    return this.floods[i];
  }

  drawBase() {
    const { base: ctx, dpr, size, net } = this;
    if (!size || !this.baseCanvas.isConnected) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.x, size.y);
    ctx.fillStyle = this.theme.scrim;
    ctx.fillRect(0, 0, size.x, size.y);
    if (!net) return;
    const { X, Y } = this.view();
    const minor = new Path2D(), major = new Path2D();
    for (let k = 0; k < net.m; k++) {
      const a = net.A[k], b = net.B[k];
      const p = net.major[k] ? major : minor;
      p.moveTo(X(net.nx[a]), Y(net.ny[a]));
      p.lineTo(X(net.nx[b]), Y(net.ny[b]));
    }
    ctx.lineCap = 'round';
    ctx.strokeStyle = this.theme.minor; ctx.lineWidth = BASE.minorW; ctx.stroke(minor);
    ctx.strokeStyle = this.theme.major; ctx.lineWidth = BASE.majorW; ctx.stroke(major);
  }

  // ------------------------------------------------ floods

  /**
   * Show these people's floods (indices), starting from nothing. With
   * `owner` (per street: who gets there first), each street is drawn only
   * for that person, so the floods meet instead of piling up.
   */
  showFloods(list, owner = null) {
    this.owner = owner;
    const th = this.theme;
    this.shown = list.map((i) => ({ i, fl: this.flood(i), color: shade(this.people[i].color, th.shade), front: th.front(this.people[i].color), c: 0, s: 0, e: 0, p0: 0, active: [], band: 1, frozen: false })).filter((f) => f.fl);
    const { fill, top, dpr, size } = this;
    fill.setTransform(dpr, 0, 0, dpr, 0, 0);
    fill.clearRect(0, 0, size.x, size.y);
    top.setTransform(dpr, 0, 0, dpr, 0, 0);
    top.clearRect(0, 0, size.x, size.y);
  }

  /** Add the pieces of street in byEnd[from…to) to paths, whole or up to time `upTo`. */
  trace(f, from, to, paths, v, upTo = Infinity) {
    const { fl } = f, net = this.net, own = this.owner;
    for (let j = from; j < to; j++) {
      const q = fl.byEnd[j];
      if (own && own[fl.edge[q]] !== f.i) continue;
      this.piece(fl, q, upTo, paths[net.major[fl.edge[q]]], v);
    }
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
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = f.color;
    ctx.lineCap = 'butt';
    ctx.lineWidth = FLOOD.minorW; ctx.stroke(paths[0]);
    ctx.lineWidth = FLOOD.majorW; ctx.stroke(paths[1]);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  /** Move a flood's clock on: newly settled streets go onto the flood canvas. */
  advance(f, c, band) {
    const { fl } = f;
    f.c = c; f.band = band;
    while (f.p0 < fl.count && fl.t0[fl.byStart[f.p0]] <= c) f.active.push(fl.byStart[f.p0++]);
    const from = f.s;
    while (f.s < fl.count && fl.t1[fl.byEnd[f.s]] <= c - band) f.s++;
    if (f.s > from) {
      const v = this.view(), paths = [new Path2D(), new Path2D()];
      this.fill.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.trace(f, from, f.s, paths, v);
      this.strokeFlood(this.fill, f, paths);
    }
    if (f.e < f.s) f.e = f.s;
    while (f.e < fl.count && fl.t1[fl.byEnd[f.e]] <= c) f.e++;
  }

  /** The bright front of each flood: the newest streets white, fading to the person's colour. */
  drawFronts(fade = 1) {
    const { top: ctx } = this;
    const v = this.view();
    const own = this.owner;
    for (const f of this.shown) {
      if (f.frozen) continue;
      const { fl } = f;
      const colour = [new Path2D(), new Path2D()];
      const white = FRONT.map(() => new Path2D());
      const glow = new Path2D();
      const net = this.net;
      for (let j = f.s; j < f.e; j++) {
        const q = fl.byEnd[j];
        if (own && own[fl.edge[q]] !== f.i) continue;
        const age = (f.c - fl.t1[q]) / f.band;
        this.piece(fl, q, Infinity, colour[net.major[fl.edge[q]]], v);
        const k = Math.min(FRONT.length - 1, Math.floor(age * FRONT.length));
        this.piece(fl, q, Infinity, white[k], v);
        if (k === 0) this.piece(fl, q, Infinity, glow, v);
      }
      // Streets the front is moving along right now.
      let w = 0;
      for (const q of f.active) {
        if (fl.t1[q] <= f.c) continue;
        f.active[w++] = q;
        if (own && own[fl.edge[q]] !== f.i) continue;
        this.piece(fl, q, f.c, colour[net.major[fl.edge[q]]], v);
        this.piece(fl, q, f.c, white[0], v);
        this.piece(fl, q, f.c, glow, v);
      }
      f.active.length = w;
      this.strokeFlood(ctx, f, colour);
      ctx.globalCompositeOperation = this.theme.blend;
      ctx.lineCap = 'round';
      ctx.strokeStyle = f.color;
      ctx.globalAlpha = 0.35 * fade;
      ctx.lineWidth = 5;
      ctx.stroke(glow);
      ctx.strokeStyle = f.front;
      FRONT.forEach((a, k) => { ctx.globalAlpha = a * fade; ctx.lineWidth = k === 0 ? 1.6 : 1.2; ctx.stroke(white[k]); });
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  /** Stop the floods where they are: the front fades and everything left settles. */
  async settle() {
    const ok = await this.run(380, (t) => { this.clearTop(); this.drawFronts(1 - t); });
    for (const f of this.shown) this.freeze(f);
    this.clearTop();
    return ok;
  }

  /** A flood that has stopped: its front goes onto the flood canvas in its colour. */
  freeze(f) {
    if (f.frozen) return;
    const v = this.view();
    const paths = [new Path2D(), new Path2D()];
    this.trace(f, f.s, f.e, paths, v);
    for (const q of f.active) if (!this.owner || this.owner[f.fl.edge[q]] === f.i) this.piece(f.fl, q, f.c, paths[this.net.major[f.fl.edge[q]]], v);
    this.fill.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.strokeFlood(this.fill, f, paths);
    f.frozen = true;
  }

  clearTop() {
    const { top: ctx, dpr, size } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.x, size.y);
  }

  // ------------------------------------------------ the phases

  /** The map goes dark and the streets appear. */
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
    this.showFloods(list, ownership(this.net, list.map((i) => [i, this.flood(i), trip.get(i)])));
    const END = 1.03;
    const ok = await this.run(2600, (t) => {
      const progress = END * (0.5 * t + 0.5 * easeInOut(t));
      for (const f of this.shown) this.advance(f, progress * trip.get(f.i), 0.07 * trip.get(f.i));
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
    const total = Math.max(1, ...this.routes.map((r) => r.duration));
    this.prepareRetract();
    // The routes draw while the floods pull back: both on one clock, so the
    // last of the floods goes just as the last route reaches the meeting point.
    if (!(await this.run(1900, (t) => {
      const p = easeInOut(t);
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
   * How far each piece of a flood is from that person's route, for pulling
   * the floods back from the route outwards. Distances come from a coarse
   * distance map (about 300 cells across) rather than street by street.
   */
  prepareRetract() {
    if (!this.net) return;
    const net = this.net;
    for (const f of this.shown) {
      const { fl } = f;
      const route = this.routes?.[f.i];
      const ids = [];
      for (let j = 0; j < f.e; j++) {
        const q = fl.byEnd[j];
        if (!this.owner || this.owner[fl.edge[q]] === f.i) ids.push(q);
      }
      if (!ids.length || !route?.segs.length) { f.retract = null; continue; }
      // Where each piece is: the middle of the stretch drawn.
      const mx = new Float64Array(ids.length), my = new Float64Array(ids.length);
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      ids.forEach((q, k) => {
        const a = fl.from[q], b = fl.to[q], h = fl.frac[q] / 2;
        mx[k] = net.nx[a] + (net.nx[b] - net.nx[a]) * h;
        my[k] = net.ny[a] + (net.ny[b] - net.ny[a]) * h;
        x0 = Math.min(x0, mx[k]); x1 = Math.max(x1, mx[k]); y0 = Math.min(y0, my[k]); y1 = Math.max(y1, my[k]);
      });
      for (const sg of route.segs) {
        x0 = Math.min(x0, sg.ax, sg.bx); x1 = Math.max(x1, sg.ax, sg.bx); y0 = Math.min(y0, sg.ay, sg.by); y1 = Math.max(y1, sg.ay, sg.by);
      }
      const cell = Math.max(x1 - x0, y1 - y0, 1e-9) / 300;
      const W = Math.ceil((x1 - x0) / cell) + 1, H = Math.ceil((y1 - y0) / cell) + 1;
      const D = new Float32Array(W * H).fill(Infinity);
      const at = (x, y) => Math.min(H - 1, Math.max(0, Math.round((y - y0) / cell))) * W + Math.min(W - 1, Math.max(0, Math.round((x - x0) / cell)));
      // The route itself is distance 0…
      for (const sg of route.segs) {
        const n = Math.max(1, Math.ceil(Math.hypot(sg.bx - sg.ax, sg.by - sg.ay) / (cell / 2)));
        for (let i = 0; i <= n; i++) D[at(sg.ax + ((sg.bx - sg.ax) * i) / n, sg.ay + ((sg.by - sg.ay) * i) / n)] = 0;
      }
      // …and every other cell its distance from it (two sweeps, straight and diagonal steps).
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
      const dist = Float32Array.from(ids, (_, k) => D[at(mx[k], my[k])]);
      const order = Int32Array.from(ids.keys()).sort((a, b) => dist[a] - dist[b]);
      f.retract = { ids: Int32Array.from(order, (k) => ids[k]), dist: Float32Array.from(order, (k) => dist[k]) };
      f.retract.max = f.retract.dist[f.retract.dist.length - 1] || 0;
    }
  }

  /**
   * The floods pulling back: p = 0 as they were, 1 all gone. The streets
   * nearest each person's route go first, then further and further out,
   * behind a fading edge, so the route is left standing on its own.
   */
  drawRetract(p) {
    this.retract = p;
    if (!this.floodCanvas.isConnected) return;
    const { fill: ctx, dpr, size } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.x, size.y);
    if (!this.net || p >= 1) return;
    const v = this.view(), net = this.net;
    for (const f of this.shown) {
      const r = f.retract;
      if (!r) continue;
      const gone = r.max * p, edge = gone + r.max * 0.08;
      let k = 0;
      { let lo = 0, hi = r.dist.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (r.dist[mid] <= gone) lo = mid + 1; else hi = mid; } k = lo; }
      const paths = [new Path2D(), new Path2D()], front = new Path2D();
      for (let j = k; j < r.ids.length; j++) {
        const q = r.ids[j];
        this.piece(f.fl, q, Infinity, paths[net.major[f.fl.edge[q]]], v);
        if (r.dist[j] <= edge) this.piece(f.fl, q, Infinity, front, v);
      }
      this.strokeFlood(ctx, f, paths);
      ctx.globalCompositeOperation = this.theme.blend;
      ctx.globalAlpha = 0.55 * (1 - p);
      ctx.strokeStyle = f.front;
      ctx.lineWidth = 1.4;
      ctx.lineCap = 'round';
      ctx.stroke(front);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  /** Back to the normal map, keeping the routes. */
  async outro() {
    this.lock(false);
    this.baseCanvas.classList.remove('on');
    this.floodCanvas.style.opacity = '0';
    const ok = await this.run(550, (t) => { this.glow = 1 - t; this.drawTop(); });
    this.baseCanvas.remove();
    this.floodCanvas.remove();
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
      const slotX = mx + (k - (tips.length - 1) / 2) * 23, slotY = my - 34;
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
    if (this.retract != null) this.drawRetract(this.retract);
    else if (this.floodCanvas.isConnected && this.net) {
      const { fill, dpr, size } = this;
      fill.setTransform(dpr, 0, 0, dpr, 0, 0);
      fill.clearRect(0, 0, size.x, size.y);
      const v = this.view();
      for (const f of this.shown) {
        const paths = [new Path2D(), new Path2D()];
        this.trace(f, 0, f.frozen ? f.e : f.s, paths, v);
        if (f.frozen) for (const q of f.active) if (!this.owner || this.owner[f.fl.edge[q]] === f.i) this.piece(f.fl, q, f.c, paths[this.net.major[f.fl.edge[q]]], v);
        this.strokeFlood(fill, f, paths);
      }
    }
    if (this.routes) this.drawTop();
    else { this.clearTop(); this.drawFronts(); }
  }
}

/** How many of a flood's pieces of street (in the order they finish) are finished by time c. */
function upTo(fl, c) {
  let lo = 0, hi = fl.count;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (fl.t1[fl.byEnd[mid]] <= c) lo = mid + 1; else hi = mid; }
  return lo;
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
