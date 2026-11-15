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

import { simplify } from './geo.js';

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
  return `${OSRM}/${OSRM_PROFILE[mode]}/route/v1/driving/${pts}?overview=full&geometries=polyline&steps=false${alternatives && !via ? '&alternatives=2' : ''}`;
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

// A route's line: an encoded polyline (what the app asks for: a quarter of the size), or GeoJSON.
const coords = (g) => (typeof g === 'string' ? decodePolyline(g, 5) : (g?.coordinates || []).map(([lon, lat]) => [lat, lon]));

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
    end: it.endTime || legs[legs.length - 1]?.to.time || null,
    transfers: it.transfers ?? Math.max(0, legs.filter((l) => !isWalkLeg(l)).length - 1),
    legs,
  };
}

/**
 * The order journeys are offered in: by arrival, earliest first (when leaving
 * at a time), or by departure, latest first (when arriving by a time); fewer
 * changes break ties. First of all comes the simplest of those within three
 * minutes of the best, the one with the fewest vehicles: "walk 13 minutes,
 * then one stop on a bus" should not come before walking all the way because
 * it arrives a minute sooner.
 */
export function rankItineraries(options, { arriveBy = false } = {}) {
  const t = (s) => (s ? Date.parse(s) : 0);
  const off = arriveBy ? (o) => -t(o.start) : (o) => t(o.end); // smaller is better
  const rides = (o) => o.legs.filter((l) => !isWalkLeg(l)).length;
  const list = [...options].sort((a, b) => off(a) - off(b) || a.transfers - b.transfers || a.duration - b.duration);
  if (list.length > 1) {
    const pick = list.filter((o) => off(o) - off(list[0]) <= 180000).reduce((a, b) => (rides(b) < rides(a) ? b : a));
    if (pick !== list[0]) { list.splice(list.indexOf(pick), 1); list.unshift(pick); }
  }
  return list;
}

/**
 * Transitous plan → { mode: 'transit', options: [itinerary, ...] } with the
 * best option first (see rankItineraries).
 */
export function normalizeTransit(json, { arriveBy = false } = {}) {
  let options = (json?.itineraries || []).map(normalizeItinerary);
  if (!options.length && json?.direct?.length) options = json.direct.map(normalizeItinerary);
  if (!options.length) throw Object.assign(new Error('No public transport route found'), { status: 404 });
  options = rankItineraries(options, { arriveBy });
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
const MAX_CACHED = 300;

/**
 * One request per key: whoever asks for the same thing while it is running,
 * or afterwards, gets the same answer. A request cancelled by whoever started
 * it (an earlier search) is not an answer for anyone else: they ask again.
 */
function cached(key, signal, make) {
  const hit = cache.get(key);
  if (hit) return hit.catch((err) => { if (err?.name === 'AbortError' && !signal?.aborted) return cached(key, signal, make); throw err; });
  const promise = make();
  cache.set(key, promise);
  if (cache.size > MAX_CACHED) cache.delete(cache.keys().next().value); // the oldest goes
  promise.catch(() => { if (cache.get(key) === promise) cache.delete(key); });
  return promise;
}

// The Meet server gives up on a routing service after about 25 seconds; a
// request still unanswered after this long is not going to be.
const GIVE_UP_MS = 30000;

async function getJson(url, init = {}) {
  // The caller's own cancel still works; on top of it, a time limit, so nothing waits for good.
  const ctrl = new AbortController();
  const outer = init.signal;
  const onAbort = () => ctrl.abort();
  if (outer?.aborted) ctrl.abort();
  outer?.addEventListener('abort', onAbort);
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, GIVE_UP_MS);
  let res, data = null;
  try {
    res = await fetch(url, { ...init, signal: ctrl.signal });
    try { data = await res.json(); } catch { /* not JSON */ }
  } catch (err) {
    if (timedOut && !outer?.aborted) throw Object.assign(new Error('No answer in time'), { status: 504 });
    throw err;
  } finally {
    clearTimeout(timer);
    outer?.removeEventListener('abort', onAbort);
  }
  if (!res.ok) throw Object.assign(new Error(data?.error || `Request failed (${res.status})`), { status: res.status, data });
  // "OK" with something that isn't data (a Wi-Fi sign-in page, a host that
  // answers every address with its front page) is no answer at all.
  if (data === null || typeof data !== 'object') throw Object.assign(new Error('Unreadable answer'), { unreadable: true });
  return data;
}

const unusable = (what) => Object.assign(new Error(`${what} unavailable right now`), { status: 502 });
/** A route the app can draw and time, or an error: never a half-filled object. */
function usableRoute(r) {
  if (!r || !Number.isFinite(r.duration)) throw unusable('Directions');
  if (r.options !== undefined) {
    if (!Array.isArray(r.options) || !r.options.length || !r.options.every((o) => o && Array.isArray(o.legs) && Number.isFinite(o.duration))) throw unusable('Directions');
    for (const o of r.options) for (const l of o.legs) { if (!Array.isArray(l.geometry)) l.geometry = []; l.from ||= {}; l.to ||= {}; }
  }
  if (!Array.isArray(r.geometry)) r.geometry = [];
  return r;
}
/** A table of travel times with its rows, or an error. */
function usableTable(t) {
  if (!t || !Array.isArray(t.durations)) throw unusable('Travel times');
  return t;
}

// The free routing service (FOSSGIS) takes one request a second from each
// address on the internet and refuses more. The Meet server's address is
// often shared with other sites on the same host, which use that allowance
// up, so the service is asked straight from this browser first, a little over
// a second apart, and the Meet server is the other way (see fromRoutingService).
export const routingPace = { gapMs: 1100, slowMs: 2500, prefer: 'direct' }; // (`prefer` changes as described below; tests change the rest)
let routingFreeAt = 0;
function routingTurn(signal) {
  const now = Date.now(), at = Math.max(now, routingFreeAt);
  routingFreeAt = at + routingPace.gapMs;
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException('Aborted', 'AbortError')); return; }
    const timer = setTimeout(resolve, at - now);
    signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); }, { once: true });
  });
}

/** The routing service's own "there is no way between these" (sent as an error status): an answer, not a failure. */
function routingAnswer(err) {
  if (['NoRoute', 'NoSegment', 'NoTable'].includes(err?.data?.code)) return Object.assign(new Error('No route found'), { status: 404, final: true });
  return err;
}

const SLOW = Symbol('slow');
/**
 * An answer from the free routing service, by two ways: straight from this
 * browser (`direct(signal)`), or through the Meet server (`serverPath`),
 * which asks from its own address and keeps answers for a day. The way that
 * answered well last is tried first: the browser's own to begin with. The
 * other way is asked at once when the first is refused or out of reach, and
 * as well when the first is slow (now and then the service holds a request
 * back for eight seconds): then the first good answer is used, and its way
 * goes first from then on.
 */
async function fromRoutingService(serverPath, direct, signal) {
  const stop = new AbortController();
  const onAbort = () => stop.abort();
  if (signal?.aborted) stop.abort();
  signal?.addEventListener('abort', onAbort);
  // Each way: `sent` settles when the request goes out, `answer` with its result.
  const ways = {
    direct() {
      const sent = routingTurn(stop.signal);
      return { sent, answer: sent.then(() => direct(stop.signal)).catch((err) => { throw routingAnswer(err); }) };
    },
    server() {
      const answer = getJson(serverPath, { signal: stop.signal, credentials: 'same-origin' })
        .catch((err) => { if (err.status === 404 && err.data?.error) err.final = true; throw err; }); // "No route found", said by the server
      return { sent: Promise.resolve(), answer };
    },
  };
  const order = routingPace.prefer === 'server' ? ['server', 'direct'] : ['direct', 'server'];
  // Of two failures, the one that says something: a message from the Meet server, else an answer with a status.
  const telling = (x, y) => (x?.data?.error ? x : y?.data?.error ? y : x?.status ? x : y?.status ? y : x);
  let timer;
  try {
    const first = ways[order[0]]();
    first.answer.catch(() => {}); // looked at below
    // "Slow" counts from when the request is sent, not while it waits its turn.
    const slow = first.sent.then(() => new Promise((resolve) => { timer = setTimeout(() => resolve(SLOW), routingPace.slowMs); }), () => new Promise(() => {}));
    let early;
    try {
      early = await Promise.race([first.answer, slow]);
    } catch (err) {
      if (signal?.aborted || err.final) throw err;
      const other = await ways[order[1]]().answer.catch((otherErr) => { throw signal?.aborted || otherErr.final ? otherErr : telling(err, otherErr); });
      routingPace.prefer = order[1];
      return other;
    }
    if (early !== SLOW) return early;
    const second = ways[order[1]]();
    return await new Promise((resolve, reject) => {
      let failure = null, done = false;
      const failed = (err) => {
        if (done) return;
        if (err?.final || signal?.aborted) { done = true; return reject(err); }
        if (failure) { done = true; reject(telling(failure, err)); } else failure = err;
      };
      first.answer.then((v) => { if (!done) { done = true; resolve(v); } }, failed);
      second.answer.then((v) => { if (!done) { done = true; routingPace.prefer = order[1]; resolve(v); } }, failed);
    });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
    stop.abort(); // the copy still running, if any
  }
}

/** Ask the Meet server; if there is no server (404 / network error), call the provider directly. */
async function viaServerOr(path, direct, signal) {
  try {
    return await getJson(path, { signal, credentials: 'same-origin' });
  } catch (err) {
    if (signal?.aborted) throw err;
    // The Meet server's own answer ("No route found" comes as a 404 with a message) stands;
    // only a missing server (a bare 404 or 405, or no connection) sends the request to the provider.
    if (err.status && (err.data?.error || (err.status !== 404 && err.status !== 405))) throw err;
  }
  return direct(signal);
}

/** A route straight from the routing service, slimmed down as the Meet server would. */
async function routeDirect(mode, from, to, { alt, viaPt }, signal) {
  const r = normalizeOsrm(await getJson(osrmRouteUrl(mode, from, to, { alternatives: alt, via: viaPt }), { signal }), mode);
  r.geometry = simplify(r.geometry, 2);
  for (const a of r.alternatives) a.geometry = simplify(a.geometry, 2);
  return r;
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
  const q = new URLSearchParams({ mode, from: ll(from), to: ll(to) });
  if (google) q.set('g', '1');
  if (time) q.set('time', new Date(time).toISOString());
  if (arriveBy) q.set('arriveBy', '1');
  if (alt) q.set('alt', '1');
  if (viaPt) q.set('via', ll(viaPt));
  return cached(key, signal, () => {
    // Walking, cycling and driving from the free routing service: this browser first.
    // With Google's map the Meet server answers (from Google); public transport always goes through it.
    if (road && !google) return fromRoutingService(`/api/directions?${q}`, (sig) => routeDirect(mode, from, to, { alt, viaPt }, sig), signal).then(usableRoute);
    return viaServerOr(`/api/directions?${q}`, async (sig) => {
      if (mode === 'transit') return normalizeTransit(await getJson(transitUrl(from, to, { time, arriveBy }), { signal: sig }), { arriveBy });
      await routingTurn(sig);
      return routeDirect(mode, from, to, { alt, viaPt }, sig);
    }, signal).then(usableRoute);
  });
}

/**
 * Public transport times from one person to the stops in an area (box: { s, w, n, e }),
 * within `max` minutes, leaving at `time` (or now): { cells: [[lat, lon, minutes, importance]] }.
 * Needs the Meet server.
 */
export function getTransitReach(from, { box, max = 60, time, signal } = {}) {
  const q = new URLSearchParams({ from: ll(from), max: String(max), box: [box.s, box.w, box.n, box.e].map((v) => v.toFixed(4)).join(',') });
  if (time) q.set('time', new Date(time).toISOString());
  return cached(`reach|${q}`, signal, () => getJson(`/api/transit/reach?${q}`, { signal, credentials: 'same-origin' })
    .then((r) => { if (!Array.isArray(r.cells)) throw unusable('Public transport times'); return r; }));
}

// One request carries at most this many starting points and destinations (the
// Meet server's limits, which keep it inside the routing service's own).
const MAX_SOURCES = 12, MAX_DESTINATIONS = 80;
const chunks = (list, n) => Array.from({ length: Math.ceil(list.length / n) }, (_, i) => list.slice(i * n, (i + 1) * n));

/** Travel times from each source to each destination (walk, bike or drive only). */
export function getTravelTimes(mode, sources, destinations, { signal } = {}) {
  if (mode === 'transit') return Promise.reject(Object.assign(new Error('Not available for public transport'), { status: 400 }));
  // A big group or a long list of places: several requests, put together as one table.
  if (sources.length > MAX_SOURCES || destinations.length > MAX_DESTINATIONS) {
    const parts = chunks(sources, MAX_SOURCES).map((ss) => Promise.all(chunks(destinations, MAX_DESTINATIONS).map((dd) => getTravelTimes(mode, ss, dd, { signal }))));
    return Promise.all(parts).then((rows) => {
      const across = (tables, key, n) => Array.from({ length: n }, (_, i) => tables.flatMap((t) => t[key]?.[i] || []));
      const size = (k) => chunks(sources, MAX_SOURCES)[k].length;
      return {
        durations: rows.flatMap((tables, k) => across(tables, 'durations', size(k))),
        distances: rows.flatMap((tables, k) => across(tables, 'distances', size(k))),
        destinations: rows[0].flatMap((t) => t.destinations || []),
      };
    });
  }
  const key = ['table', mode, sources.map(ll).join(';'), destinations.map(ll).join(';')].join('|');
  const q = new URLSearchParams({ mode, from: sources.map(ll).join(';'), to: destinations.map(ll).join(';') });
  return cached(key, signal, () => fromRoutingService(`/api/traveltimes?${q}`,
    async (sig) => normalizeOsrmTable(await getJson(osrmTableUrl(mode, sources, destinations), { signal: sig })), signal).then(usableTable));
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
