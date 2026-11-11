// A compact road graph and shortest paths. Only the offline test town uses
// this now: the real app asks routing services for travel times instead of
// downloading the streets.
import { haversine } from './geo.js';

/** Small deterministic PRNG (mulberry32). */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Make an undirected CSR graph from parallel edge arrays. `kinds` (optional,
 * one small number per edge) lets a search skip some kinds of street.
 */
export function fromEdgeList(lat, lon, A, B, kinds = null) {
  const n = lat.length;
  const deg = new Int32Array(n + 1);
  for (let k = 0; k < A.length; k++) { deg[A[k]]++; deg[B[k]]++; }
  const adjStart = new Int32Array(n + 1);
  for (let i = 0; i < n; i++) adjStart[i + 1] = adjStart[i] + deg[i];
  const fill = adjStart.slice(0, n);
  const adjNode = new Int32Array(adjStart[n]);
  const adjLen = new Float32Array(adjStart[n]);
  const adjKind = kinds ? new Uint8Array(adjStart[n]) : null;
  for (let k = 0; k < A.length; k++) {
    const a = A[k], b = B[k];
    const len = haversine(lat[a], lon[a], lat[b], lon[b]);
    if (adjKind) { adjKind[fill[a]] = kinds[k]; adjKind[fill[b]] = kinds[k]; }
    adjNode[fill[a]] = b; adjLen[fill[a]++] = len;
    adjNode[fill[b]] = a; adjLen[fill[b]++] = len;
  }
  return { n, lat, lon, adjStart, adjNode, adjLen, adjKind };
}

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

/**
 * Dijkstra from `start`: { dist, parent }. With `allowed` (a 256-entry table
 * indexed by edge kind), streets whose kind is not allowed are skipped.
 */
export function dijkstra(g, start, allowed = null) {
  const dist = new Float64Array(g.n).fill(Infinity);
  const parent = new Int32Array(g.n).fill(-1);
  const heap = new Heap();
  const kinds = allowed && g.adjKind;
  dist[start] = 0;
  heap.push(0, start);
  while (heap.size) {
    const u = heap.pop();
    const du = heap.lastKey;
    if (du > dist[u]) continue;
    for (let e = g.adjStart[u]; e < g.adjStart[u + 1]; e++) {
      if (kinds && !allowed[kinds[e]]) continue;
      const v = g.adjNode[e];
      const nd = du + g.adjLen[e];
      if (nd < dist[v]) { dist[v] = nd; parent[v] = u; heap.push(nd, v); }
    }
  }
  return { dist, parent };
}
