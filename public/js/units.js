// Distances as people read them: metres and kilometres, or feet and miles where the phone is set to
// a country that measures in those (the US, Liberia, Myanmar).

const FT = 3.28084;
const MI = 1609.344;

/** True for a language tag like "en-US" (the regions that use miles). */
export const usesMiles = (tag = '') => /-(US|LR|MM)\b/i.test(tag);

/** "350 m", "2.4 km", "12 km" (or "500 ft", "1.5 mi", "12 mi"). */
export function fmtDist(m, imperial = false) {
  if (imperial) {
    if (m * FT < 1000) return `${Math.max(50, Math.round((m * FT) / 50) * 50)} ft`;
    const mi = m / MI;
    return `${mi.toFixed(mi < 9.5 ? 1 : 0)} mi`;
  }
  if (m < 950) return `${Math.max(10, Math.round(m / 10) * 10)} m`;
  return `${(m / 1000).toFixed(m < 9500 ? 1 : 0)} km`;
}

/** The search radius: "800 m", "1 km", "1.5 km" (or "500 ft", "0.6 mi", "1.9 mi"). */
export function fmtRadius(r, imperial = false) {
  if (imperial) return r * FT >= 1300 ? `${+(r / MI).toFixed(1)} mi` : `${Math.round((r * FT) / 50) * 50} ft`;
  return r >= 1000 ? `${+(r / 1000).toFixed(1)} km` : `${Math.round(r / 10) * 10} m`;
}
