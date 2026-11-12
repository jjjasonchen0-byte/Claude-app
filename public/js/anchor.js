// The meeting point has to be somewhere a group can stand and wait for each
// other: by a café, a restaurant, a pub, a park, a museum or the shops, not
// the middle of a motorway, a railway line or a car park. The fairest spot
// (by travel times) is moved to the liveliest such place close by: one with
// other places around it beats a lone one a little nearer.
import { haversine } from './geo.js';

// Kinds of place people meet at (the places tabs in pois.js).
const MEETABLE = new Set(['food', 'drinks', 'fun', 'culture', 'outdoors', 'shopping']);

/**
 * The place to meet at near `spot`, or null if there is none within `maxM`.
 * pois: [{ lat, lon, tab, name }].
 */
export function pickAnchor(spot, pois, { maxM = 500, aroundM = 120 } = {}) {
  const near = (pois || []).filter((p) => MEETABLE.has(p.tab) && Number.isFinite(p.lat) && Number.isFinite(p.lon)
    && haversine(spot.lat, spot.lon, p.lat, p.lon) <= maxM + aroundM);
  let best = null, bestScore = Infinity;
  for (const p of near) {
    const d = haversine(spot.lat, spot.lon, p.lat, p.lon);
    if (d > maxM) continue;
    // Each other place within a short walk counts as 40 m nearer (up to 8 of them).
    const company = near.reduce((n, q) => n + (q !== p && haversine(p.lat, p.lon, q.lat, q.lon) <= aroundM ? 1 : 0), 0);
    const score = d - 40 * Math.min(company, 8);
    if (score < bestScore) { bestScore = score; best = p; }
  }
  return best;
}
