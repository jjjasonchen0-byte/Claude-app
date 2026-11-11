// Extra routes for the meeting-point animation ("branches").
//
// Besides each person's best route, the routing service is asked for routes
// through a few points on either side of the straight line to the meeting
// point. Only routes that keep heading towards the meeting point, aren't
// much slower and aren't copies of one already kept make it onto the map.
// The animation then races them: the first to arrive is the one chosen.
import { haversine, makeProjector } from './geo.js';

// Where to route through: fraction of the way there, and how far to the side
// (as a share of the straight-line distance).
const VIA = [[0.35, 0.22], [0.35, -0.22], [0.6, 0.32], [0.6, -0.32]];
const MAX_SIDE_M = 6000;

/** Points to either side of the line from `from` to `to`; none for very short trips. */
export function viaPoints(from, to, { minM = 350 } = {}) {
  const L = haversine(from.lat, from.lon, to.lat, to.lon);
  if (L < minM) return [];
  const proj = makeProjector(from);
  const b = proj.toXY(to);
  const ux = b.x / L, uy = b.y / L; // along
  const nx = -uy, ny = ux; // to the left
  return VIA.map(([f, s]) => {
    const side = Math.sign(s) * Math.min(Math.abs(s) * L, MAX_SIDE_M);
    return proj.toLL({ x: ux * f * L + nx * side, y: uy * f * L + ny * side });
  });
}

/**
 * Does a route keep heading towards `target`? Allowed to drift away by a
 * little (`slackM`, or 6% of the trip), never to double back further.
 */
export function headsTowards(pts, target, { slackM } = {}) {
  if (pts.length < 2) return true;
  const start = haversine(pts[0][0], pts[0][1], target.lat, target.lon);
  const slack = slackM ?? Math.max(120, start * 0.06);
  let closest = start;
  for (const [lat, lon] of pts) {
    const d = haversine(lat, lon, target.lat, target.lon);
    if (d > closest + slack) return false;
    if (d < closest) closest = d;
  }
  return true;
}

/** Share of `a`'s length that runs within `nearM` metres of line `b`. */
export function overlapShare(a, b, nearM = 25) {
  if (a.length < 2 || b.length < 2) return 0;
  const proj = makeProjector({ lat: a[0][0], lon: a[0][1] });
  const B = b.map(([lat, lon]) => proj.toXY({ lat, lon }));
  const near = (p) => {
    for (let i = 1; i < B.length; i++) {
      const ax = B[i - 1].x, ay = B[i - 1].y, dx = B[i].x - ax, dy = B[i].y - ay;
      const len2 = dx * dx + dy * dy;
      const t = len2 ? Math.max(0, Math.min(1, ((p.x - ax) * dx + (p.y - ay) * dy) / len2)) : 0;
      if (Math.hypot(p.x - (ax + t * dx), p.y - (ay + t * dy)) <= nearM) return true;
    }
    return false;
  };
  let total = 0, shared = 0;
  let prev = proj.toXY({ lat: a[0][0], lon: a[0][1] });
  for (let i = 1; i < a.length; i++) {
    const cur = proj.toXY({ lat: a[i][0], lon: a[i][1] });
    const len = Math.hypot(cur.x - prev.x, cur.y - prev.y);
    total += len;
    if (near({ x: (prev.x + cur.x) / 2, y: (prev.y + cur.y) / 2 })) shared += len;
    prev = cur;
  }
  return total ? shared / total : 1;
}

/**
 * The routes worth showing, best first: the main route, then candidates that
 * head towards the meeting point, take at most `maxSlower` times as long, and
 * differ from every route kept so far. Each item: { geometry, duration }.
 */
export function pickBranches(main, candidates, { target, maxSlower = 1.6, maxSame = 0.8, max = 6 } = {}) {
  const kept = [main];
  const sorted = candidates.filter((c) => c?.geometry?.length > 1 && Number.isFinite(c.duration)).sort((a, b) => a.duration - b.duration);
  for (const c of sorted) {
    if (kept.length >= max) break;
    if (c.duration > main.duration * maxSlower) continue;
    if (!headsTowards(c.geometry, target)) continue;
    if (kept.some((k) => overlapShare(c.geometry, k.geometry) > maxSame)) continue;
    kept.push(c);
  }
  return kept;
}
