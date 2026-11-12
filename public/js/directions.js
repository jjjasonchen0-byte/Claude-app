// Real directions: walking, cycling and driving from OpenStreetMap routing
// (OSRM, run by FOSSGIS at routing.openstreetmap.de) and public transport
// from Transitous (MOTIS 2, api.transitous.org). When the Meet server has a
// Google key and the page shows Google's map, the server answers from
// Google's Routes API instead (see lib/google.js).
//
// Pure functions shared by the browser and the server: request URLs,
// response normalisers and a polyline decoder. The browser asks the Meet
// server first (which caches, trims responses and identifies the app as the
// providers ask); without a server it calls the providers directly.

export const MODES = [
  { id: 'transit', label: 'Transit' },
  { id: 'walk', label: 'Walk' },
  { id: 'bike', label: 'Bike' },
  { id: 'drive', label: 'Drive' },
];

const OSRM = 'https://routing.openstreetmap.de';
const OSRM_PROFILE = { walk: 'routed-foot', bike: 'routed-bike', drive: 'routed-car' };
const TRANSITOUS = 'https://api.transitous.org/api/v5/plan';
const TRANSITOUS_REACH = 'https://api.transitous.org/api/v1/one-to-all';

export const ATTRIBUTION = {
  routing: { text: 'Routes © OpenStreetMap contributors, via FOSSGIS OSRM', url: 'https://routing.openstreetmap.de/about.html' },
  transit: { text: 'Public transport by Transitous', url: 'https://transitous.org/sources/' },
  google: { text: 'Directions by Google Maps', url: 'https://www.google.com/maps' },
};

// Google directions only go with Google's map (Google's terms): the app turns
// this on when it shows that map.
let google = false;
export function useGoogle(on) { google = !!on; }
export const usingGoogle = () => google;

const ll = (p) => `${Number(p.lat).toFixed(6)},${Number(p.lon).toFixed(6)}`;
const lonlat = (p) => `${Number(p.lon).toFixed(6)},${Number(p.lat).toFixed(6)}`;

/** A route, optionally through a `via` point, optionally with other good routes. */
export function osrmRouteUrl(mode, from, to, { alternatives = false, via = null } = {}) {
  const pts = [from, ...(via ? [via] : []), to].map(lonlat).join(';');
  return `${OSRM}/${OSRM_PROFILE[mode]}/route/v1/driving/${pts}?overview=full&geometries=geojson&steps=false${alternatives && !via ? '&alternatives=2' : ''}`;
}

export function osrmTableUrl(mode, sources, destinations) {
  const pts = [...sources, ...destinations].map(lonlat).join(';');
  const src = sources.map((_, i) => i).join(';');
  const dst = destinations.map((_, i) => i + sources.length).join(';');
  return `${OSRM}/${OSRM_PROFILE[mode]}/table/v1/driving/${pts}?sources=${src}&destinations=${dst}&annotations=duration,distance`;
}

export function transitUrl(from, to, { time, arriveBy = false } = {}) {
  const q = new URLSearchParams({
    fromPlace: ll(from), toPlace: ll(to), arriveBy: String(!!arriveBy),
    numItineraries: '3', maxItineraries: '3', detailedTransfers: 'false',
  });
  if (time) q.set('time', new Date(time).toISOString());
  return `${TRANSITOUS}?${q}`;
}

/** Every stop reachable from a place by public transport within `max` minutes. */
export function transitReachUrl(from, { time, max = 60 } = {}) {
  const q = new URLSearchParams({ one: ll(from), maxTravelTime: String(max) });
  if (time) q.set('time', new Date(time).toISOString());
  return `${TRANSITOUS_REACH}?${q}`;
}

/**
 * Transitous "one to all" → the stops inside an area as { cells: [[lat, lon,
 * minutes, importance]] }: one per ~100 m (the quickest stop there), with
 * importance ×1e6 (big stations are more important than bus stops).
 */
export function reduceReach(json, box) {
  const cells = new Map();
  for (const a of json?.all || []) {
    const p = a.place || {};
    const { lat, lon } = p;
    const min = Number(a.duration);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(min)) continue;
    if (box && (lat < box.s || lat > box.n || lon < box.w || lon > box.e)) continue;
    const key = `${Math.round(lat * 1000)},${Math.round(lon * 1000)}`;
    const imp = Math.round((Number(p.importance) || 0) * 1e6);
    const old = cells.get(key);
    if (!old || min < old[2] || (min === old[2] && imp > old[3])) cells.set(key, [Math.round(lat * 1e5) / 1e5, Math.round(lon * 1e5) / 1e5, min, Math.max(imp, old?.[3] || 0)]);
  }
  return { cells: [...cells.values()] };
}

/** Decode a Google-style encoded polyline into [[lat, lon], ...]. */
export function decodePolyline(str, precision = 5) {
  const factor = 10 ** precision;
  const out = [];
  let i = 0, lat = 0, lon = 0;
  while (i < str.length) {
    for (const which of [0, 1]) {
      let shift = 0, result = 0, b;
      do {
        b = str.charCodeAt(i++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20 && i < str.length);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (which === 0) lat += delta; else lon += delta;
    }
    out.push([lat / factor, lon / factor]);
  }
  return out;
}

const coords = (g) => (g?.coordinates || []).map(([lon, lat]) => [lat, lon]);

/**
 * OSRM route → { mode, duration (s), distance (m), geometry: [[lat, lon]],
 * alternatives: [{ duration, distance, geometry }] } (other good routes, if asked for).
 */
export function normalizeOsrm(json, mode) {
  const r = json?.routes?.[0];
  if (json?.code !== 'Ok' || !r) throw Object.assign(new Error('No route found'), { status: 404 });
  return {
    mode, provider: 'osrm',
    duration: Math.round(r.duration), distance: Math.round(r.distance),
    geometry: coords(r.geometry),
    alternatives: json.routes.slice(1, 3).map((a) => ({ duration: Math.round(a.duration), distance: Math.round(a.distance), geometry: coords(a.geometry) })),
  };
}

/**
 * OSRM table → { durations: [[s|null]], distances: [[m|null]], destinations: [[lat, lon]] }
 * (sources × destinations; destinations are the spots snapped onto the nearest road).
 */
export function normalizeOsrmTable(json) {
  if (json?.code !== 'Ok') throw Object.assign(new Error('Travel times unavailable'), { status: 502 });
  const round = (rows) => (rows || []).map((row) => row.map((v) => (v == null ? null : Math.round(v))));
  const snapped = (json.destinations || []).map((d) => (Array.isArray(d?.location) ? [Math.round(d.location[1] * 1e6) / 1e6, Math.round(d.location[0] * 1e6) / 1e6] : null));
  return { durations: round(json.durations), distances: round(json.distances), destinations: snapped };
}

const VEHICLE = {
  BUS: 'Bus', COACH: 'Coach', TRAM: 'Tram', SUBWAY: 'Underground', METRO: 'Metro', FERRY: 'Ferry', AIRPLANE: 'Flight',
  RAIL: 'Train', HIGHSPEED_RAIL: 'Train', LONG_DISTANCE: 'Train', NIGHT_RAIL: 'Night train', REGIONAL_FAST_RAIL: 'Train',
  REGIONAL_RAIL: 'Train', SUBURBAN: 'Train', FUNICULAR: 'Funicular', AERIAL_LIFT: 'Cable car', ODM: 'On-demand', OTHER: 'Transit',
};
export const vehicleName = (mode) => VEHICLE[mode] || 'Transit';
export const isWalkLeg = (leg) => leg.mode === 'WALK' || leg.mode === 'BIKE' || leg.mode === 'CAR';

const place = (p, fallback) => ({
  name: p?.name && !['START', 'END'].includes(p.name) ? p.name : fallback,
  lat: p?.lat, lon: p?.lon,
  time: p?.departure || p?.arrival || null,
});

function normalizeLeg(l) {
  const color = l.routeColor && /^[0-9a-f]{6}$/i.test(l.routeColor) ? `#${l.routeColor}` : null;
  const textColor = l.routeTextColor && /^[0-9a-f]{6}$/i.test(l.routeTextColor) ? `#${l.routeTextColor}` : '#ffffff';
  return {
    mode: l.mode,
    line: l.displayName || l.routeShortName || l.routeLongName || '',
    color, textColor,
    headsign: l.headsign || '',
    agency: l.agencyName || '',
    from: { ...place(l.from, 'Start'), time: l.startTime || l.from?.departure || null },
    to: { ...place(l.to, 'Destination'), time: l.endTime || l.to?.arrival || null },
    duration: Math.round(l.duration || 0),
    distance: l.distance != null ? Math.round(l.distance) : null,
    stops: Array.isArray(l.intermediateStops) ? l.intermediateStops.length : 0,
    realTime: !!l.realTime,
    geometry: l.legGeometry?.points ? decodePolyline(l.legGeometry.points, l.legGeometry.precision || 5) : [],
  };
}

function normalizeItinerary(it) {
  const legs = (it.legs || []).map(normalizeLeg);
  return {
    duration: Math.round(it.duration || 0),
    start: it.startTime || legs[0]?.from.time || null,
    end: it.endTime || legs.at(-1)?.to.time || null,
    transfers: it.transfers ?? Math.max(0, legs.filter((l) => !isWalkLeg(l)).length - 1),
    legs,
  };
}

/**
 * Transitous plan → { mode: 'transit', options: [itinerary, ...] } with the
 * best option first: earliest arrival when leaving at a time, latest
 * departure when arriving by a time; fewer changes break ties.
 */
export function normalizeTransit(json, { arriveBy = false } = {}) {
  let options = (json?.itineraries || []).map(normalizeItinerary);
  if (!options.length && json?.direct?.length) options = json.direct.map(normalizeItinerary);
  if (!options.length) throw Object.assign(new Error('No public transport route found'), { status: 404 });
  const t = (s) => (s ? Date.parse(s) : 0);
  options.sort((a, b) => (arriveBy ? t(b.start) - t(a.start) : t(a.end) - t(b.end)) || a.transfers - b.transfers || a.duration - b.duration);
  const best = options[0];
  return {
    mode: 'transit', provider: 'transitous',
    duration: best.duration, distance: null,
    geometry: best.legs.flatMap((l) => l.geometry),
    options: options.slice(0, 3),
  };
}

// ---------------------------------------------------------------- browser client

const cache = new Map();

async function getJson(url, init) {
  const res = await fetch(url, init);
  let data = null;
  try { data = await res.json(); } catch { /* not JSON */ }
  if (!res.ok) throw Object.assign(new Error(data?.error || `Request failed (${res.status})`), { status: res.status, data });
  return data;
}

/** Ask the Meet server; if there is no server (404 / network error), call the provider directly. */
async function viaServerOr(path, direct, signal) {
  try {
    return await getJson(path, { signal, credentials: 'same-origin' });
  } catch (err) {
    if (signal?.aborted) throw err;
    if (err.status && err.status !== 404 && err.status !== 405) throw err;
  }
  return direct();
}

/**
 * Directions for one person. mode: transit | walk | bike | drive.
 * For walk, bike and drive, `alternatives` also returns other good routes and
 * `via` routes through a given point (both used by the route animation).
 */
export function getDirections(mode, from, to, { time, arriveBy = false, alternatives = false, via = null, signal } = {}) {
  const road = mode !== 'transit';
  const viaPt = road && via ? via : null;
  const alt = road && alternatives && !viaPt;
  const key = [mode, ll(from), ll(to), time || '', arriveBy, alt, viaPt ? ll(viaPt) : '', google].join('|');
  if (cache.has(key)) return cache.get(key);
  const q = new URLSearchParams({ mode, from: ll(from), to: ll(to) });
  if (google) q.set('g', '1');
  if (time) q.set('time', new Date(time).toISOString());
  if (arriveBy) q.set('arriveBy', '1');
  if (alt) q.set('alt', '1');
  if (viaPt) q.set('via', ll(viaPt));
  const promise = viaServerOr(`/api/directions?${q}`, async () => {
    if (mode === 'transit') return normalizeTransit(await getJson(transitUrl(from, to, { time, arriveBy }), { signal }), { arriveBy });
    return normalizeOsrm(await getJson(osrmRouteUrl(mode, from, to, { alternatives: alt, via: viaPt }), { signal }), mode);
  }, signal);
  cache.set(key, promise);
  promise.catch(() => cache.delete(key));
  return promise;
}

/**
 * Public transport times from one person to the stops in an area (box: { s, w, n, e }),
 * within `max` minutes, leaving at `time` (or now): { cells: [[lat, lon, minutes, importance]] }.
 * Needs the Meet server.
 */
export function getTransitReach(from, { box, max = 60, time, signal } = {}) {
  const q = new URLSearchParams({ from: ll(from), max: String(max), box: [box.s, box.w, box.n, box.e].map((v) => v.toFixed(4)).join(',') });
  if (time) q.set('time', new Date(time).toISOString());
  const key = `reach|${q}`;
  if (cache.has(key)) return cache.get(key);
  const promise = getJson(`/api/transit/reach?${q}`, { signal, credentials: 'same-origin' });
  cache.set(key, promise);
  promise.catch(() => cache.delete(key));
  return promise;
}

/** Travel times from each source to each destination (walk, bike or drive only). */
export function getTravelTimes(mode, sources, destinations, { signal } = {}) {
  if (mode === 'transit') return Promise.reject(Object.assign(new Error('Not available for public transport'), { status: 400 }));
  const key = ['table', mode, sources.map(ll).join(';'), destinations.map(ll).join(';')].join('|');
  if (cache.has(key)) return cache.get(key);
  const q = new URLSearchParams({ mode, from: sources.map(ll).join(';'), to: destinations.map(ll).join(';') });
  const promise = viaServerOr(`/api/traveltimes?${q}`, async () => normalizeOsrmTable(await getJson(osrmTableUrl(mode, sources, destinations), { signal })), signal);
  cache.set(key, promise);
  promise.catch(() => cache.delete(key));
  return promise;
}

/**
 * Real travel times from Google (when it is in use) from everyone to a few
 * spots: [person][spot] seconds and metres, null where unknown. People are
 * grouped by how they travel, one request per group.
 */
export async function getCheckTimes(people, spots, { signal, time } = {}) {
  if (!google) throw Object.assign(new Error('Not available'), { status: 404 });
  const durations = people.map(() => spots.map(() => null));
  const distances = people.map(() => spots.map(() => null));
  const groups = new Map();
  people.forEach((p, i) => { if (!groups.has(p.mode)) groups.set(p.mode, []); groups.get(p.mode).push(i); });
  await Promise.all([...groups].map(async ([mode, idx]) => {
    const q = new URLSearchParams({ g: '1', mode, from: idx.map((i) => ll(people[i])).join(';'), to: spots.map(ll).join(';') });
    if (time && mode === 'transit') q.set('time', new Date(time).toISOString());
    const t = await getJson(`/api/checktimes?${q}`, { signal, credentials: 'same-origin' });
    idx.forEach((pi, k) => spots.forEach((_, j) => {
      durations[pi][j] = t.durations?.[k]?.[j] ?? null;
      distances[pi][j] = t.distances?.[k]?.[j] ?? null;
    }));
  }));
  return { durations, distances };
}

/** Hand-off links to full navigation apps. */
export function navLinks(mode, from, to) {
  const gm = { transit: 'transit', walk: 'walking', bike: 'bicycling', drive: 'driving' }[mode];
  const am = { transit: 'r', walk: 'w', bike: 'w', drive: 'd' }[mode];
  return {
    google: `https://www.google.com/maps/dir/?api=1&origin=${ll(from)}&destination=${ll(to)}&travelmode=${gm}`,
    apple: `https://maps.apple.com/?saddr=${ll(from)}&daddr=${ll(to)}&dirflg=${am}`,
  };
}
