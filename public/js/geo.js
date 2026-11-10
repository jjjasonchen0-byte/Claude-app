// Geometry helpers. Pure functions, usable in the browser and in Node tests.

const R = 6371008.8; // mean Earth radius, metres
const toRad = (d) => (d * Math.PI) / 180;

/** Great-circle distance in metres. */
export function haversine(lat1, lon1, lat2, lon2) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export const dist = (a, b) => haversine(a.lat, a.lon, b.lat, b.lon);

/** Local equirectangular projection around a reference point (metres). */
export function makeProjector(ref) {
  const kx = Math.cos(toRad(ref.lat)) * (Math.PI / 180) * R;
  const ky = (Math.PI / 180) * R;
  return {
    toXY: (p) => ({ x: (p.lon - ref.lon) * kx, y: (p.lat - ref.lat) * ky }),
    toLL: (q) => ({ lat: ref.lat + q.y / ky, lon: ref.lon + q.x / kx }),
  };
}

export function centroid(points) {
  const n = points.length;
  return {
    lat: points.reduce((s, p) => s + p.lat, 0) / n,
    lon: points.reduce((s, p) => s + p.lon, 0) / n,
  };
}

/** Bounding box {s,w,n,e} padded by `padFrac` of its span (min `minPadM` metres). */
export function paddedBBox(points, padFrac = 0.2, minPadM = 600) {
  let s = 90, n = -90, w = 180, e = -180;
  for (const p of points) {
    s = Math.min(s, p.lat); n = Math.max(n, p.lat);
    w = Math.min(w, p.lon); e = Math.max(e, p.lon);
  }
  const midLat = (s + n) / 2;
  const mPerDegLat = 111320;
  const mPerDegLon = 111320 * Math.cos(toRad(midLat));
  const padLat = Math.max((n - s) * padFrac, minPadM / mPerDegLat);
  const padLon = Math.max((e - w) * padFrac, minPadM / mPerDegLon);
  return { s: s - padLat, n: n + padLat, w: w - padLon, e: e + padLon };
}

/** Largest pairwise straight-line distance between points (metres). */
export function span(points) {
  let m = 0;
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) m = Math.max(m, dist(points[i], points[j]));
  }
  return m;
}

/**
 * Smallest enclosing circle (Welzl, iterative). Its centre is the point that
 * minimises the maximum straight-line distance to everyone — the geometric
 * "fairest" spot. Used when no road network is available.
 */
export function smallestEnclosingCircle(points) {
  const ref = centroid(points);
  const proj = makeProjector(ref);
  const P = points.map(proj.toXY);
  for (let i = P.length - 1; i > 0; i--) { // deterministic shuffle is fine for tiny n
    const j = (i * 7919) % (i + 1);
    [P[i], P[j]] = [P[j], P[i]];
  }
  const inC = (c, p) => c && Math.hypot(p.x - c.x, p.y - c.y) <= c.r + 1e-7;
  const c2 = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, r: Math.hypot(a.x - b.x, a.y - b.y) / 2 });
  const c3 = (a, b, c) => {
    const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
    if (Math.abs(d) < 1e-12) { // collinear: use the widest pair
      const cs = [c2(a, b), c2(a, c), c2(b, c)];
      return cs.sort((u, v) => v.r - u.r)[0];
    }
    const a2 = a.x * a.x + a.y * a.y, b2 = b.x * b.x + b.y * b.y, cc = c.x * c.x + c.y * c.y;
    const x = (a2 * (b.y - c.y) + b2 * (c.y - a.y) + cc * (a.y - b.y)) / d;
    const y = (a2 * (c.x - b.x) + b2 * (a.x - c.x) + cc * (b.x - a.x)) / d;
    return { x, y, r: Math.hypot(a.x - x, a.y - y) };
  };
  let c = null;
  for (let i = 0; i < P.length; i++) {
    if (inC(c, P[i])) continue;
    c = { x: P[i].x, y: P[i].y, r: 0 };
    for (let j = 0; j < i; j++) {
      if (inC(c, P[j])) continue;
      c = c2(P[i], P[j]);
      for (let k = 0; k < j; k++) if (!inC(c, P[k])) c = c3(P[i], P[j], P[k]);
    }
  }
  const ll = proj.toLL(c);
  return { lat: ll.lat, lon: ll.lon, radius: c.r };
}
