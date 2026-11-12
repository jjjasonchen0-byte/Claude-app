// Google Maps Platform, optional (set GOOGLE_MAPS_API_KEY): directions from
// the Routes API, travel-time checks from its route matrix, and the base map
// from the Map Tiles API. Google's terms only allow Routes API results on a
// Google map, so the app uses Google's map whenever it shows Google routes.
//
// Everything goes through the Meet server so the key is never sent to
// browsers. Daily caps keep usage inside Google's free monthly allowance by
// default (10,000 route requests, 10,000 matrix elements and 100,000 map
// tiles a month); past a cap the app falls back to the free services.
import { decodePolyline } from '../public/js/directions.js';

const ROUTES = 'https://routes.googleapis.com/directions/v2:computeRoutes';
const MATRIX = 'https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix';
const TILES = 'https://tile.googleapis.com';

const TRAVEL_MODE = { walk: 'WALK', bike: 'BICYCLE', drive: 'DRIVE', transit: 'TRANSIT' };
// Google's vehicle types → the names the app's directions use (see vehicleName in directions.js).
const VEHICLE = {
  BUS: 'BUS', TROLLEYBUS: 'BUS', INTERCITY_BUS: 'COACH', SHARE_TAXI: 'ODM', TRAM: 'TRAM',
  SUBWAY: 'SUBWAY', METRO_RAIL: 'METRO', MONORAIL: 'METRO',
  RAIL: 'RAIL', HEAVY_RAIL: 'RAIL', COMMUTER_TRAIN: 'SUBURBAN', HIGH_SPEED_TRAIN: 'HIGHSPEED_RAIL', LONG_DISTANCE_TRAIN: 'LONG_DISTANCE',
  FERRY: 'FERRY', CABLE_CAR: 'AERIAL_LIFT', GONDOLA_LIFT: 'AERIAL_LIFT', FUNICULAR: 'FUNICULAR',
};

// Quiet map styles in the spirit of Apple Maps: no shop or bus-stop icons, soft colours.
const QUIET = [
  { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
];
export const MAP_STYLES = {
  light: [
    ...QUIET,
    { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#f6f4f0' }] },
    { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#d3eac5' }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#a6d2f5' }] },
    { featureType: 'road.highway', elementType: 'geometry.fill', stylers: [{ color: '#fbd994' }] },
    { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#eec47a' }] },
    { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
    { featureType: 'road.local', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  ],
  dark: [
    ...QUIET,
    { elementType: 'geometry', stylers: [{ color: '#1c1c1e' }] },
    { elementType: 'labels.text.fill', stylers: [{ color: '#a1a1a6' }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: '#1c1c1e' }] },
    { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#1c2b20' }] },
    { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#3a3a3d' }] },
    { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#2a2a2d' }] },
    { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#4a4136' }] },
    { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#333336' }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#1a2d42' }] },
    { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#6b93bd' }] },
  ],
};
/** Map styles the server makes tiles for: light or dark, at normal or double resolution. */
export const TILE_STYLES = ['light', 'light2x', 'dark', 'dark2x'];

const seconds = (d) => (d == null ? 0 : Math.round(parseFloat(String(d)) || 0)); // "123s" → 123
const hex = (c) => (typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c) ? c : null);
const latLng = (p) => ({ location: { latLng: { latitude: p.lat, longitude: p.lon } } });
const pointOf = (loc) => (loc?.latLng ? { lat: loc.latLng.latitude, lon: loc.latLng.longitude } : {});
const pts = (poly) => (poly?.encodedPolyline ? decodePolyline(poly.encodedPolyline) : []);
const iso = (ms) => (Number.isFinite(ms) ? new Date(ms).toISOString() : null);
const noRoute = () => Object.assign(new Error('No route found'), { status: 404 });

/** The computeRoutes request body for a way of travelling. */
export function routeRequest(mode, from, to, { time, arriveBy = false, traffic = false, now = Date.now() } = {}) {
  const body = { origin: latLng(from), destination: latLng(to), travelMode: TRAVEL_MODE[mode], languageCode: 'en', units: 'METRIC' };
  if (mode === 'drive') body.routingPreference = traffic ? 'TRAFFIC_AWARE' : 'TRAFFIC_UNAWARE';
  if (mode === 'transit') {
    body.computeAlternativeRoutes = true;
    // Times in the past are refused; "leave now" sends no time at all.
    const t = time ? new Date(time).getTime() : NaN;
    if (Number.isFinite(t) && (arriveBy || t > now + 60000)) body[arriveBy ? 'arrivalTime' : 'departureTime'] = new Date(t).toISOString();
  }
  return body;
}

/** Response fields to ask for (Google bills and answers only what is asked). */
export function routeFields(mode) {
  const base = ['routes.duration', 'routes.distanceMeters', 'routes.polyline.encodedPolyline'];
  if (mode !== 'transit') return base.join(',');
  return [...base, ...['travelMode', 'staticDuration', 'distanceMeters', 'polyline.encodedPolyline', 'startLocation', 'endLocation', 'transitDetails']
    .map((f) => `routes.legs.steps.${f}`)].join(',');
}

/** One Google transit route → an itinerary in the app's format (as normalizeTransit makes them). */
function itinerary(route, { time } = {}) {
  const legs = [];
  let walk = null;
  const steps = (route.legs || []).flatMap((l) => l.steps || []);
  for (const st of steps) {
    const td = st.transitDetails;
    if (st.travelMode === 'TRANSIT' && td) {
      if (walk) { legs.push(walk); walk = null; }
      const line = td.transitLine || {}, sd = td.stopDetails || {};
      const dep = Date.parse(sd.departureTime), arr = Date.parse(sd.arrivalTime);
      legs.push({
        mode: VEHICLE[line.vehicle?.type] || 'OTHER',
        line: line.nameShort || line.name || line.vehicle?.name?.text || '',
        color: hex(line.color), textColor: hex(line.textColor) || '#ffffff',
        headsign: td.headsign || '',
        agency: line.agencies?.[0]?.name || '',
        from: { name: sd.departureStop?.name || 'Stop', ...pointOf(sd.departureStop?.location), time: sd.departureTime || null },
        to: { name: sd.arrivalStop?.name || 'Stop', ...pointOf(sd.arrivalStop?.location), time: sd.arrivalTime || null },
        duration: Number.isFinite(dep) && Number.isFinite(arr) ? Math.round((arr - dep) / 1000) : seconds(st.staticDuration),
        distance: st.distanceMeters ?? null,
        stops: Math.max(0, (td.stopCount || 1) - 1), // Google counts the stop you get off at
        realTime: false,
        geometry: pts(st.polyline),
      });
    } else {
      // Walking between stops comes as many short steps: one leg for each stretch.
      walk ||= {
        mode: 'WALK', line: '', color: null, textColor: '#ffffff', headsign: '', agency: '',
        from: { name: '', ...pointOf(st.startLocation), time: null }, to: { name: '', time: null },
        duration: 0, distance: 0, stops: 0, realTime: false, geometry: [],
      };
      walk.duration += seconds(st.staticDuration);
      walk.distance += st.distanceMeters || 0;
      walk.geometry.push(...pts(st.polyline));
      walk.to = { name: '', ...pointOf(st.endLocation), time: null };
    }
  }
  if (walk) legs.push(walk);
  if (!legs.length) return null;
  // Walking legs take their names and times from the stops either side.
  const startAt = Date.parse(time) || Date.now();
  legs.forEach((l, i) => {
    if (l.mode !== 'WALK') return;
    const prev = legs[i - 1], next = legs[i + 1];
    l.from.name = prev ? prev.to.name : 'Start';
    l.to.name = next ? next.from.name : 'Destination';
    const start = prev ? Date.parse(prev.to.time) : next ? Date.parse(next.from.time) - l.duration * 1000 : startAt;
    l.from.time = iso(start);
    l.to.time = iso(next ? Date.parse(next.from.time) : start + l.duration * 1000);
  });
  const start = legs[0].from.time, end = legs.at(-1).to.time;
  const span = Date.parse(end) - Date.parse(start);
  return {
    duration: Number.isFinite(span) ? Math.round(span / 1000) : seconds(route.duration),
    start, end,
    transfers: Math.max(0, legs.filter((l) => l.mode !== 'WALK').length - 1),
    legs,
  };
}

/** computeRoutes response → the app's route format (see normalizeOsrm / normalizeTransit). */
export function normalizeGoogleRoute(json, mode, { arriveBy = false, time } = {}) {
  const routes = json?.routes || [];
  if (!routes.length) throw noRoute();
  if (mode !== 'transit') {
    const r = routes[0];
    return { mode, provider: 'google', duration: seconds(r.duration), distance: r.distanceMeters || 0, geometry: pts(r.polyline), alternatives: [] };
  }
  const options = routes.map((r) => itinerary(r, { time })).filter(Boolean);
  if (!options.length) throw noRoute();
  const t = (s) => (s ? Date.parse(s) : 0);
  options.sort((a, b) => (arriveBy ? t(b.start) - t(a.start) : t(a.end) - t(b.end)) || a.transfers - b.transfers || a.duration - b.duration);
  const best = options[0];
  return {
    mode: 'transit', provider: 'google', duration: best.duration, distance: null,
    geometry: best.legs.flatMap((l) => l.geometry), options: options.slice(0, 3),
  };
}

/** computeRouteMatrix response → { durations, distances } (origins × destinations, null where there is no route). */
export function normalizeGoogleMatrix(json, nOrigins, nDestinations) {
  if (!Array.isArray(json)) throw Object.assign(new Error('Travel times unavailable'), { status: 502 });
  const durations = Array.from({ length: nOrigins }, () => Array(nDestinations).fill(null));
  const distances = Array.from({ length: nOrigins }, () => Array(nDestinations).fill(null));
  for (const e of json) {
    const i = e.originIndex ?? 0, j = e.destinationIndex ?? 0; // zero values are left out of the JSON
    if (e.condition !== 'ROUTE_EXISTS' || e.status?.code || i >= nOrigins || j >= nDestinations) continue;
    durations[i][j] = seconds(e.duration);
    distances[i][j] = e.distanceMeters ?? 0;
  }
  return { durations, distances };
}

/**
 * The Google client. fetchImpl and now are for tests.
 * limits: { routes, elements, tiles } a day.
 */
export function createGoogle({ apiKey, limits = {}, traffic = false, region = 'US', fetchImpl = fetch, now = () => Date.now() } = {}) {
  const key = String(apiKey || '').trim();
  const caps = { routes: 320, elements: 320, tiles: 3200, ...limits };
  let day = '', used = { routes: 0, elements: 0, tiles: 0 };
  const today = () => {
    const d = new Date(now()).toISOString().slice(0, 10);
    if (d !== day) { day = d; used = { routes: 0, elements: 0, tiles: 0 }; }
  };
  const left = (what) => { today(); return caps[what] - used[what]; };
  const spend = (what, n = 1) => {
    if (left(what) < n) throw Object.assign(new Error('Google daily limit reached'), { status: 429, limit: true });
    used[what] += n;
  };

  async function post(url, body, fields) {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': fields },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    let data = null;
    try { data = await res.json(); } catch { /* not JSON */ }
    if (!res.ok) throw Object.assign(new Error(data?.error?.message || `Google answered ${res.status}`), { status: res.status === 404 ? 404 : 502 });
    return data;
  }

  // Map tile sessions last two weeks; a new one is made a day before that.
  const sessions = new Map(); // style → Promise<{ session, expiresAt }>
  function session(style) {
    const hit = sessions.get(style);
    if (hit && !hit.failed && (hit.expiresAt == null || hit.expiresAt - now() > 864e5)) return hit.promise;
    const entry = { expiresAt: null, failed: false };
    entry.promise = (async () => {
      const res = await fetchImpl(`${TILES}/v1/createSession?key=${encodeURIComponent(key)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mapType: 'roadmap', language: 'en', region,
          ...(style.endsWith('2x') ? { scale: 'scaleFactor2x', highDpi: true } : {}),
          styles: MAP_STYLES[style.startsWith('dark') ? 'dark' : 'light'],
        }),
        signal: AbortSignal.timeout(10000),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.session) throw Object.assign(new Error(data?.error?.message || 'Map tiles unavailable'), { status: 502 });
      entry.expiresAt = Number(data.expiry) * 1000 || now() + 13 * 864e5;
      return data.session;
    })();
    entry.promise.catch(() => { entry.failed = true; });
    sessions.set(style, entry);
    return entry.promise;
  }

  return {
    enabled: !!key,
    /** Whether Google may be used today for routes (and the map, for tiles). */
    available: (what) => !!key && left(what) > 0,
    usage: () => { today(); return { day, used: { ...used }, caps: { ...caps } }; },

    async route(mode, from, to, { time, arriveBy = false } = {}) {
      spend('routes');
      const data = await post(ROUTES, routeRequest(mode, from, to, { time, arriveBy, traffic, now: now() }), routeFields(mode));
      return normalizeGoogleRoute(data, mode, { arriveBy, time });
    },

    async matrix(mode, origins, destinations, { time } = {}) {
      spend('elements', origins.length * destinations.length);
      const body = { origins: origins.map((p) => ({ waypoint: latLng(p) })), destinations: destinations.map((p) => ({ waypoint: latLng(p) })), travelMode: TRAVEL_MODE[mode] };
      if (mode === 'drive') body.routingPreference = traffic ? 'TRAFFIC_AWARE' : 'TRAFFIC_UNAWARE';
      if (mode === 'transit' && time && Date.parse(time) > now() + 60000) body.departureTime = new Date(time).toISOString();
      const data = await post(MATRIX, body, 'originIndex,destinationIndex,duration,distanceMeters,status,condition');
      return normalizeGoogleMatrix(data, origins.length, destinations.length);
    },

    /** One map tile: { status, type, cacheControl, etag, body }. */
    async tile(style, z, x, y) {
      spend('tiles');
      for (let attempt = 0; attempt < 2; attempt++) {
        const s = await session(style);
        const res = await fetchImpl(`${TILES}/v1/2dtiles/${z}/${x}/${y}?session=${encodeURIComponent(s)}&key=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(10000) });
        // An expired or refused session: make a new one and try once more.
        if ((res.status === 400 || res.status === 401 || res.status === 403) && attempt === 0) { sessions.delete(style); continue; }
        return {
          status: res.status, type: res.headers.get('content-type') || 'image/png',
          cacheControl: res.headers.get('cache-control'), etag: res.headers.get('etag'),
          body: Buffer.from(await res.arrayBuffer()),
        };
      }
      throw Object.assign(new Error('Map tiles unavailable'), { status: 502 });
    },

    /** The map data credits Google asks to show for an area: { copyright }. */
    async viewport(style, { zoom, north, south, east, west }) {
      const s = await session(style);
      const q = new URLSearchParams({ session: s, key, zoom, north, south, east, west });
      const res = await fetchImpl(`${TILES}/tile/v1/viewport?${q}`, { signal: AbortSignal.timeout(10000) });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw Object.assign(new Error('Map credits unavailable'), { status: 502 });
      return { copyright: String(data?.copyright || '') };
    },
  };
}
