// Road network loading. Fetches real streets from OpenStreetMap (Overpass API)
// for the area around everyone's addresses and turns them into a compact
// graph. If that is not possible (offline, rate-limited, too far apart) a
// synthetic organic "street" graph is generated so the experience still works.
import { haversine, paddedBBox, span } from './geo.js';

export const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

/** Which road classes to download, scaled by how spread out the group is. */
export function roadClassesFor(spanM) {
  if (spanM < 6000) return 'motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|pedestrian|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link';
  if (spanM < 20000) return 'motorway|trunk|primary|secondary|tertiary|unclassified|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link';
  if (spanM < 60000) return 'motorway|trunk|primary|secondary|motorway_link|trunk_link|primary_link';
  return 'motorway|trunk|primary|motorway_link|trunk_link';
}

export const MAX_NETWORK_SPAN_M = 220000;

/** Overpass QL for the road network in a bbox. */
export function roadQuery(bbox, classes) {
  const b = `${bbox.s.toFixed(5)},${bbox.w.toFixed(5)},${bbox.n.toFixed(5)},${bbox.e.toFixed(5)}`;
  return `[out:json][timeout:40][maxsize:268435456];way["highway"~"^(${classes})$"](${b});(._;>;);out skel qt;`;
}

/** POST an Overpass query, trying mirrors in turn. */
export async function overpass(query, { signal, timeoutMs = 45000 } = {}) {
  let lastErr;
  for (const url of OVERPASS_ENDPOINTS) {
    const ctrl = new AbortController();
    const onAbort = () => ctrl.abort();
    signal?.addEventListener('abort', onAbort);
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: 'POST',
        body: new URLSearchParams({ data: query }),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`Overpass ${res.status}`);
      const json = await res.json();
      if (!json || !Array.isArray(json.elements)) throw new Error('Bad Overpass response');
      return json;
    } catch (err) {
      if (signal?.aborted) throw err;
      lastErr = err;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }
  throw lastErr || new Error('Overpass unavailable');
}

/**
 * Build a CSR adjacency graph from Overpass `out skel` elements.
 * Returns { n, lat, lon, adjStart, adjNode, adjLen, synthetic }.
 */
export function buildGraph(elements) {
  const nodeIdx = new Map();
  const lats = [];
  const lons = [];
  const coords = new Map();
  for (const el of elements) if (el.type === 'node') coords.set(el.id, el);

  const edgesA = [];
  const edgesB = [];
  const idx = (id) => {
    let i = nodeIdx.get(id);
    if (i === undefined) {
      const c = coords.get(id);
      if (!c) return -1;
      i = lats.length;
      nodeIdx.set(id, i);
      lats.push(c.lat);
      lons.push(c.lon);
    }
    return i;
  };
  for (const el of elements) {
    if (el.type !== 'way' || !Array.isArray(el.nodes)) continue;
    let prev = -1;
    for (const id of el.nodes) {
      const i = idx(id);
      if (i >= 0 && prev >= 0 && i !== prev) { edgesA.push(prev); edgesB.push(i); }
      prev = i;
    }
  }
  return fromEdgeList(Float64Array.from(lats), Float64Array.from(lons), edgesA, edgesB, false);
}

/** Make an undirected CSR graph from parallel edge arrays. */
export function fromEdgeList(lat, lon, A, B, synthetic) {
  const n = lat.length;
  const deg = new Int32Array(n + 1);
  for (let k = 0; k < A.length; k++) { deg[A[k]]++; deg[B[k]]++; }
  const adjStart = new Int32Array(n + 1);
  for (let i = 0; i < n; i++) adjStart[i + 1] = adjStart[i] + deg[i];
  const fill = adjStart.slice(0, n);
  const m = adjStart[n];
  const adjNode = new Int32Array(m);
  const adjLen = new Float32Array(m);
  for (let k = 0; k < A.length; k++) {
    const a = A[k], b = B[k];
    const len = haversine(lat[a], lon[a], lat[b], lon[b]);
    adjNode[fill[a]] = b; adjLen[fill[a]++] = len;
    adjNode[fill[b]] = a; adjLen[fill[b]++] = len;
  }
  return { n, lat, lon, adjStart, adjNode, adjLen, synthetic };
}

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
 * Generate an organic, street-like graph covering the group's area:
 * a jittered grid with random diagonals and a few missing links.
 */
export function syntheticGraph(points, { cells = 70, seed = 7 } = {}) {
  const bbox = paddedBBox(points, 0.25, 800);
  const rand = rng(seed + Math.round(points[0].lat * 1e4) + Math.round(points[0].lon * 1e4));
  const midLat = (bbox.s + bbox.n) / 2;
  const aspect = ((bbox.e - bbox.w) * Math.cos((midLat * Math.PI) / 180)) / (bbox.n - bbox.s);
  const cols = Math.max(12, Math.round(cells * Math.sqrt(aspect)));
  const rows = Math.max(12, Math.round(cells / Math.sqrt(aspect)));
  const dLat = (bbox.n - bbox.s) / rows;
  const dLon = (bbox.e - bbox.w) / cols;
  const n = (rows + 1) * (cols + 1);
  const lat = new Float64Array(n);
  const lon = new Float64Array(n);
  const id = (r, c) => r * (cols + 1) + c;
  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c <= cols; c++) {
      const i = id(r, c);
      lat[i] = bbox.s + (r + (rand() - 0.5) * 0.7) * dLat;
      lon[i] = bbox.w + (c + (rand() - 0.5) * 0.7) * dLon;
    }
  }
  const A = [];
  const B = [];
  const link = (a, b, p) => { if (rand() < p) { A.push(a); B.push(b); } };
  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c <= cols; c++) {
      if (c < cols) link(id(r, c), id(r, c + 1), 0.88);
      if (r < rows) link(id(r, c), id(r + 1, c), 0.88);
      if (r < rows && c < cols) link(id(r, c), id(r + 1, c + 1), 0.22);
      if (r < rows && c > 0) link(id(r, c), id(r + 1, c - 1), 0.22);
    }
  }
  return fromEdgeList(lat, lon, A, B, true);
}

/**
 * Load the best graph available for these points.
 * Resolves to { graph, source: 'osm' | 'synthetic', reason? }.
 */
export async function loadNetwork(points, { signal, onStatus = () => {} } = {}) {
  const s = span(points);
  if (s > MAX_NETWORK_SPAN_M) {
    return { graph: syntheticGraph(points), source: 'synthetic', reason: 'Addresses are very far apart, so routes are approximated.' };
  }
  try {
    onStatus('Downloading streets…');
    const bbox = paddedBBox(points, 0.2, 700);
    const json = await overpass(roadQuery(bbox, roadClassesFor(s)), { signal });
    onStatus('Mapping intersections…');
    const graph = buildGraph(json.elements);
    if (graph.n < 20) throw new Error('Too few roads found');
    return { graph, source: 'osm' };
  } catch (err) {
    if (signal?.aborted) throw err;
    return { graph: syntheticGraph(points), source: 'synthetic', reason: 'Street data could not be loaded, so routes are approximated.' };
  }
}
