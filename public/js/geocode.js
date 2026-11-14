// Address search & reverse geocoding.
// Photon (komoot) is built for type-ahead; Nominatim is the fallback.

const PHOTON = 'https://photon.komoot.io';
const NOMINATIM = 'https://nominatim.openstreetmap.org';

function photonLabel(p) {
  const street = [p.housenumber, p.street].filter(Boolean).join(' ');
  const first = p.name && p.name !== p.street ? p.name : street;
  const parts = [first, first === street ? '' : street, p.district || p.locality, p.city || p.county, p.state, p.country];
  return [...new Set(parts.filter(Boolean))].join(', ');
}

function fromPhoton(f) {
  const [lon, lat] = f.geometry.coordinates;
  const p = f.properties || {};
  const label = photonLabel(p);
  return { lat, lon, address: label, title: label.split(', ')[0], subtitle: label.split(', ').slice(1).join(', ') };
}

function fromNominatim(r) {
  const label = r.display_name;
  return {
    lat: Number(r.lat), lon: Number(r.lon), address: label,
    title: label.split(', ').slice(0, 2).join(', '), subtitle: label.split(', ').slice(2).join(', '),
  };
}

/** GET JSON, giving up after `ms` (a stalled lookup must not leave "Looking up address…" on screen for good). */
async function getJson(url, signal, ms = 7000) {
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  if (signal?.aborted) ctrl.abort();
  signal?.addEventListener('abort', onAbort);
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`Geocoder ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

/** Search for addresses; `near` biases results towards a location. */
export async function searchAddress(q, { near, signal, limit = 6 } = {}) {
  q = q.trim();
  if (q.length < 3) return [];
  try {
    const u = new URL(`${PHOTON}/api/`);
    u.searchParams.set('q', q);
    u.searchParams.set('limit', String(limit));
    if (near) { u.searchParams.set('lat', near.lat.toFixed(5)); u.searchParams.set('lon', near.lon.toFixed(5)); }
    const json = await getJson(u, signal);
    const out = (json.features || []).filter((f) => Array.isArray(f?.geometry?.coordinates)).map(fromPhoton).filter((r) => r.address && Number.isFinite(r.lat) && Number.isFinite(r.lon));
    if (out.length) return out;
  } catch (err) {
    if (signal?.aborted) throw err;
  }
  const u = new URL(`${NOMINATIM}/search`);
  u.searchParams.set('q', q);
  u.searchParams.set('format', 'jsonv2');
  u.searchParams.set('limit', String(limit));
  if (near) {
    const d = 0.5;
    u.searchParams.set('viewbox', [near.lon - d, near.lat + d, near.lon + d, near.lat - d].map((x) => x.toFixed(4)).join(','));
  }
  const found = await getJson(u, signal);
  return (Array.isArray(found) ? found : []).filter((r) => r?.display_name).map(fromNominatim).filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lon));
}

/** Address text for a coordinate (falls back to the coordinates themselves). */
export async function reverseGeocode(lat, lon, { signal } = {}) {
  const fallback = { lat, lon, address: `${lat.toFixed(5)}, ${lon.toFixed(5)}` };
  try {
    const json = await getJson(`${PHOTON}/reverse?lat=${lat}&lon=${lon}&limit=1`, signal);
    const f = json.features?.[0];
    const found = Array.isArray(f?.geometry?.coordinates) ? fromPhoton(f) : null;
    if (found?.address) return { ...found, lat, lon }; // a place with no name or street falls through
  } catch (err) { if (signal?.aborted) throw err; }
  try {
    const json = await getJson(`${NOMINATIM}/reverse?lat=${lat}&lon=${lon}&format=jsonv2`, signal);
    if (json.display_name) return { ...fromNominatim(json), lat, lon };
  } catch (err) { if (signal?.aborted) throw err; }
  return fallback;
}

/** Browser geolocation as a promise. */
export function currentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Location is not available in this browser'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      (e) => reject(new Error(e.code === 1 ? 'Location permission was denied' : 'Could not get your location')),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    );
  });
}
