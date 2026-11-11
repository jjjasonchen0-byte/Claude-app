// Is this OpenStreetMap place the same as that listing elsewhere? Compares
// names (ignoring accents, punctuation and words like "The" or "Restaurant")
// and requires the two to be close together.
import { haversine } from './geo.js';

const FILLER = new Set(['the', 'a', 'an', 'and', 'restaurant', 'ristorante', 'cafe', 'café', 'bar', 'pub', 'coffee', 'kitchen', 'grill', 'house', 'co', 'ltd', 'of', 'le', 'la', 'il', 'el', 'de', 'at']);

export function nameTokens(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/['’`]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !FILLER.has(w));
}

const bigrams = (s) => {
  const out = new Map();
  for (let i = 0; i < s.length - 1; i++) { const g = s.slice(i, i + 2); out.set(g, (out.get(g) || 0) + 1); }
  return out;
};

/** 0…1: how alike two place names are. */
export function nameSimilarity(a, b) {
  const ta = nameTokens(a), tb = nameTokens(b);
  if (!ta.length || !tb.length) {
    // Names made only of filler words ("The Bar"): compare them as written.
    return String(a).trim().toLowerCase() === String(b).trim().toLowerCase() ? 1 : 0;
  }
  const sa = ta.join(''), sb = tb.join('');
  if (sa === sb) return 1;
  if (sa.length > 3 && sb.length > 3 && (sa.includes(sb) || sb.includes(sa))) return 0.9;
  const A = bigrams(sa), B = bigrams(sb);
  let common = 0;
  for (const [g, n] of A) common += Math.min(n, B.get(g) || 0);
  return (2 * common) / Math.max(1, sa.length - 1 + sb.length - 1);
}

/**
 * The best listing for a place: names alike (≥ 0.72) and within `maxM`
 * metres; nearer and more alike wins. Candidates: [{ name, lat, lon, ... }].
 */
export function bestMatch(place, candidates, { maxM = 150, minSim = 0.72 } = {}) {
  let best = null, bestScore = -Infinity;
  for (const c of candidates) {
    if (c.lat == null || c.lon == null) continue;
    const d = haversine(place.lat, place.lon, c.lat, c.lon);
    if (d > maxM) continue;
    const sim = nameSimilarity(place.name, c.name);
    if (sim < minSim) continue;
    const score = sim - d / (maxM * 4);
    if (score > bestScore) { bestScore = score; best = c; }
  }
  return best;
}
