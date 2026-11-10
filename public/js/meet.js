// The meeting-point solver.
//
// Every friend's address is a source. From each source we run Dijkstra over
// the road graph — the frontier of that search is exactly "all routes
// branching out at the same rate" (an invisible circle measured along roads).
// Each search is restricted to nodes that lead *towards* another friend
// (inside a travel ellipse), so branches heading away are never explored.
// The meeting point is the first place every frontier reaches: the node that
// minimises the longest anyone has to travel.
import { haversine } from './geo.js';

/** Binary min-heap keyed by float priority, storing int ids. */
class Heap {
  constructor(cap = 1024) { this.k = new Float64Array(cap); this.v = new Int32Array(cap); this.size = 0; }
  push(key, val) {
    if (this.size === this.k.length) {
      const k = new Float64Array(this.size * 2); k.set(this.k); this.k = k;
      const v = new Int32Array(this.size * 2); v.set(this.v); this.v = v;
    }
    let i = this.size++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.k[p] <= key) break;
      this.k[i] = this.k[p]; this.v[i] = this.v[p]; i = p;
    }
    this.k[i] = key; this.v[i] = val;
  }
  pop() { // returns value; key available in this.lastKey
    const topV = this.v[0];
    this.lastKey = this.k[0];
    const key = this.k[--this.size];
    const val = this.v[this.size];
    let i = 0;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= this.size) break;
      if (c + 1 < this.size && this.k[c + 1] < this.k[c]) c++;
      if (this.k[c] >= key) break;
      this.k[i] = this.k[c]; this.v[i] = this.v[c]; i = c;
    }
    this.k[i] = key; this.v[i] = val;
    return topV;
  }
}

/** Label connected components; returns { comp: Int32Array, largest }. */
export function components(g) {
  const comp = new Int32Array(g.n).fill(-1);
  const sizes = [];
  const stack = new Int32Array(g.n);
  for (let s = 0; s < g.n; s++) {
    if (comp[s] !== -1 || g.adjStart[s] === g.adjStart[s + 1]) continue;
    const c = sizes.length;
    let top = 0, size = 0;
    stack[top++] = s; comp[s] = c;
    while (top) {
      const u = stack[--top]; size++;
      for (let e = g.adjStart[u]; e < g.adjStart[u + 1]; e++) {
        const v = g.adjNode[e];
        if (comp[v] === -1) { comp[v] = c; stack[top++] = v; }
      }
    }
    sizes.push(size);
  }
  let largest = 0;
  for (let c = 1; c < sizes.length; c++) if (sizes[c] > sizes[largest]) largest = c;
  return { comp, largest, sizes };
}

/** Nearest graph node to a point, optionally limited to one component. */
export function nearestNode(g, p, comp, wanted) {
  let best = -1, bestD = Infinity;
  const cos = Math.cos((p.lat * Math.PI) / 180);
  for (let i = 0; i < g.n; i++) {
    if (comp && comp[i] !== wanted) continue;
    const dy = g.lat[i] - p.lat, dx = (g.lon[i] - p.lon) * cos;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

/** Dijkstra from `start` (with initial distance d0) over nodes where allowed[v]. */
export function dijkstra(g, start, d0 = 0, allowed = null) {
  const dist = new Float64Array(g.n).fill(Infinity);
  const parent = new Int32Array(g.n).fill(-1);
  const heap = new Heap();
  dist[start] = d0;
  heap.push(d0, start);
  while (heap.size) {
    const u = heap.pop();
    const du = heap.lastKey;
    if (du > dist[u]) continue;
    for (let e = g.adjStart[u]; e < g.adjStart[u + 1]; e++) {
      const v = g.adjNode[e];
      if (allowed && !allowed[v]) continue;
      const nd = du + g.adjLen[e];
      if (nd < dist[v]) { dist[v] = nd; parent[v] = u; heap.push(nd, v); }
    }
  }
  return { dist, parent };
}

/**
 * Nodes "leading towards" another friend from source i: inside the ellipse
 * |s_i v| + |v t| <= k * |s_i t| + slack for some other friend t (or the
 * group centroid). Fast equirectangular distances are plenty here.
 */
export function corridorMask(g, src, targets, k = 1.45, slack = 400) {
  const mask = new Uint8Array(g.n);
  const cos = Math.cos((src.lat * Math.PI) / 180);
  const M = 111320;
  const d = (aLat, aLon, bLat, bLon) => Math.hypot((aLat - bLat) * M, (aLon - bLon) * M * cos);
  const lims = targets.map((t) => k * d(src.lat, src.lon, t.lat, t.lon) + slack);
  for (let v = 0; v < g.n; v++) {
    const ds = d(src.lat, src.lon, g.lat[v], g.lon[v]);
    for (let j = 0; j < targets.length; j++) {
      if (ds + d(g.lat[v], g.lon[v], targets[j].lat, targets[j].lon) <= lims[j]) { mask[v] = 1; break; }
    }
  }
  return mask;
}

/**
 * Solve for the meeting point.
 * @param g graph from network.js
 * @param people [{lat, lon}]
 * @param opts { mode: 'fair' | 'total', k }
 */
export function solveMeeting(g, people, { mode = 'fair', corridors = [1.12, 1.3, 1.6] } = {}) {
  if (people.length < 2) throw new Error('Need at least two addresses');
  const { comp, largest } = components(g);
  const cLat = people.reduce((s, p) => s + p.lat, 0) / people.length;
  const cLon = people.reduce((s, p) => s + p.lon, 0) / people.length;
  const center = { lat: cLat, lon: cLon };

  const snapped = people.map((p) => {
    const node = nearestNode(g, p, comp, largest);
    return { node, gap: haversine(p.lat, p.lon, g.lat[node], g.lon[node]) };
  });

  const run = (k) => people.map((p, i) => {
    const others = people.filter((_, j) => j !== i);
    const mask = k ? corridorMask(g, p, people.length > 2 ? [...others, center] : others, k, 150) : null;
    if (mask) mask[snapped[i].node] = 1;
    return dijkstra(g, snapped[i].node, snapped[i].gap, mask);
  });

  const pick = (searches) => {
    let best = -1, bestKey = Infinity, bestTie = Infinity;
    for (let v = 0; v < g.n; v++) {
      let mx = 0, sum = 0, ok = true;
      for (const s of searches) {
        const d = s.dist[v];
        if (d === Infinity) { ok = false; break; }
        if (d > mx) mx = d;
        sum += d;
      }
      if (!ok) continue;
      const key = mode === 'total' ? sum : mx;
      const tie = mode === 'total' ? mx : sum;
      if (key < bestKey - 1e-6 || (Math.abs(key - bestKey) <= 1e-6 && tie < bestTie)) {
        best = v; bestKey = key; bestTie = tie;
      }
    }
    return best;
  };

  // Try a tight corridor first, widen it if the roads don't connect inside
  // it (rivers, motorways…), and finally explore freely.
  let searches, meet = -1, restricted = false;
  for (const k of [...corridors, null]) {
    searches = run(k);
    meet = pick(searches);
    restricted = k;
    if (meet >= 0) break;
  }
  if (meet < 0) throw new Error('Could not connect everyone on the road network');

  const reach = searches.map((s) => s.dist[meet]);
  const radius = Math.max(...reach);
  return {
    meetNode: meet,
    meet: { lat: g.lat[meet], lon: g.lon[meet] },
    radius,
    restricted,
    people: people.map((p, i) => ({
      ...p,
      node: snapped[i].node,
      gap: snapped[i].gap,
      reach: reach[i],
      dist: searches[i].dist,
      parent: searches[i].parent,
    })),
  };
}

/** Road path (array of node ids) from a person's snapped node to `node`. */
export function pathTo(person, node) {
  const out = [];
  for (let v = node; v !== -1; v = person.parent[v]) out.push(v);
  return out.reverse();
}

/**
 * Animation segments for one person: the shortest-path tree, clipped at
 * `limit`. Each segment grows from d0 to d1 (metres along the roads), so a
 * single shared radius r draws every friend's frontier at the same rate.
 *
 * Each segment also gets a `trunk` flag: 1 when the branch beyond it carries
 * on for at least `minTail` metres (or reaches the limit, or is on the route
 * to the meeting point). Drawing only trunks leaves out the short dead-end
 * twigs that make a raw shortest-path tree look busy.
 *
 * Returns Float64Array of [lat0, lon0, lat1, lon1, d0, d1, trunk] * count, sorted by d0.
 */
export const SEG_STRIDE = 7;
export function treeSegments(g, person, limit, others = [], meetNode = -1, { minTail = Math.max(150, Math.min(700, limit * 0.12)) } = {}) {
  // Furthest distance reached anywhere in each node's subtree.
  const reached = [];
  for (let v = 0; v < g.n; v++) if (person.dist[v] < Infinity) reached.push(v);
  reached.sort((a, b) => person.dist[b] - person.dist[a]);
  const far = new Float64Array(g.n);
  for (const v of reached) if (person.dist[v] > far[v]) far[v] = person.dist[v];
  for (const v of reached) {
    const p = person.parent[v];
    if (p >= 0 && far[v] > far[p]) far[p] = far[v];
  }

  const rows = [];
  // Connector from the doorstep to the nearest street.
  rows.push([person.lat, person.lon, g.lat[person.node], g.lon[person.node], 0, person.gap, 1]);
  // Branches stop where they run into a friend's frontier (a node someone
  // else reaches first), except along this person's route to the meeting point.
  const onRoute = new Uint8Array(g.n);
  if (meetNode >= 0) for (const v of pathTo(person, meetNode)) onRoute[v] = 1;
  for (let v = 0; v < g.n; v++) {
    const p = person.parent[v];
    if (p < 0) continue;
    const d0 = person.dist[p];
    if (d0 > limit) continue;
    if (!onRoute[v] && others.some((o) => o.dist[p] < d0)) continue;
    const trunk = onRoute[v] || far[v] >= Math.min(d0 + minTail, limit) ? 1 : 0;
    rows.push([g.lat[p], g.lon[p], g.lat[v], g.lon[v], d0, person.dist[v], trunk]);
  }
  rows.sort((a, b) => a[4] - b[4]);
  const out = new Float64Array(rows.length * SEG_STRIDE);
  rows.forEach((r, i) => out.set(r, i * SEG_STRIDE));
  return out;
}

/** Approximate road distance from a person to an arbitrary point. */
export function roadDistanceTo(g, person, point, radiusM = 250) {
  // Use the best reached node near the point; fall back to a detour factor.
  let best = Infinity;
  const cos = Math.cos((point.lat * Math.PI) / 180);
  const r2 = (radiusM / 111320) ** 2;
  for (let v = 0; v < g.n; v++) {
    const dv = person.dist[v];
    if (dv === Infinity) continue;
    const dy = g.lat[v] - point.lat, dx = (g.lon[v] - point.lon) * cos;
    if (dx * dx + dy * dy > r2) continue;
    const total = dv + haversine(g.lat[v], g.lon[v], point.lat, point.lon);
    if (total < best) best = total;
  }
  if (best === Infinity) best = haversine(person.lat, person.lon, point.lat, point.lon) * 1.3;
  return best;
}
