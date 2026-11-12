// Google directions, travel-time checks and map tiles (with a stand-in for Google's servers).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGoogle, normalizeGoogleRoute, normalizeGoogleMatrix, normalizeGooglePlace, routeRequest, routeFields } from '../../lib/google.js';
import { decodePolyline } from '../../public/js/directions.js';

// "_p~iF~ps|U_ulLnnqC_mqNvxq`@" is Google's example polyline: (38.5,-120.2) (40.7,-120.95) (43.252,-126.453).
const POLY = { encodedPolyline: '_p~iF~ps|U_ulLnnqC_mqNvxq`@' };
const at = (lat, lng) => ({ latLng: { latitude: lat, longitude: lng } });

const transitRoute = (depart, arrive, extra = {}) => ({
  duration: '1800s', distanceMeters: 5200, polyline: POLY,
  legs: [{
    steps: [
      { travelMode: 'WALK', staticDuration: '120s', distanceMeters: 150, polyline: POLY, startLocation: at(-33.89, 151.17), endLocation: at(-33.888, 151.172) },
      { travelMode: 'WALK', staticDuration: '60s', distanceMeters: 70, polyline: POLY, startLocation: at(-33.888, 151.172), endLocation: at(-33.887, 151.173) },
      {
        travelMode: 'TRANSIT', staticDuration: '900s', distanceMeters: 4600, polyline: POLY,
        transitDetails: {
          stopDetails: { departureStop: { name: 'Newtown Station', location: at(-33.898, 151.179) }, departureTime: depart, arrivalStop: { name: 'Central', location: at(-33.883, 151.206) }, arrivalTime: arrive },
          headsign: 'City Circle', stopCount: 4,
          transitLine: { name: 'Inner West & Leppington Line', nameShort: 'T2', color: '#0098cd', textColor: '#ffffff', agencies: [{ name: 'Sydney Trains' }], vehicle: { type: 'HEAVY_RAIL', name: { text: 'Train' } } },
        },
      },
      { travelMode: 'WALK', staticDuration: '300s', distanceMeters: 380, polyline: POLY, startLocation: at(-33.883, 151.206), endLocation: at(-33.880, 151.21) },
    ],
  }],
  ...extra,
});

test('a transit route becomes walking and riding legs with real stops, lines and times', () => {
  const out = normalizeGoogleRoute({ routes: [transitRoute('2026-11-12T08:05:00Z', '2026-11-12T08:20:00Z')] }, 'transit');
  assert.equal(out.provider, 'google');
  const [o] = out.options;
  assert.deepEqual(o.legs.map((l) => l.mode), ['WALK', 'RAIL', 'WALK'], 'the two walking steps make one leg');
  const [walk, ride, last] = o.legs;
  assert.equal(walk.duration, 180);
  assert.equal(walk.distance, 220);
  assert.equal(walk.from.name, 'Start');
  assert.equal(walk.to.name, 'Newtown Station');
  assert.equal(walk.from.time, '2026-11-12T08:02:00.000Z', 'leaves in time to walk to the station');
  assert.equal(ride.line, 'T2');
  assert.equal(ride.color, '#0098cd');
  assert.equal(ride.agency, 'Sydney Trains');
  assert.equal(ride.stops, 3, 'stops in between (Google counts the one you get off at)');
  assert.equal(ride.duration, 900);
  assert.equal(last.to.name, 'Destination');
  assert.equal(last.to.time, '2026-11-12T08:25:00.000Z');
  assert.equal(o.duration, 23 * 60);
  assert.equal(o.transfers, 0);
  assert.deepEqual(ride.geometry, decodePolyline(POLY.encodedPolyline));
});

test('several transit routes: the earliest arrival first (latest departure when arriving by a time)', () => {
  const json = { routes: [transitRoute('2026-11-12T08:10:00Z', '2026-11-12T08:30:00Z'), transitRoute('2026-11-12T08:05:00Z', '2026-11-12T08:20:00Z')] };
  assert.equal(normalizeGoogleRoute(json, 'transit').options[0].legs[1].from.time, '2026-11-12T08:05:00Z');
  assert.equal(normalizeGoogleRoute(json, 'transit', { arriveBy: true }).options[0].legs[1].from.time, '2026-11-12T08:10:00Z');
});

test('walking, cycling and driving routes, and no route', () => {
  const out = normalizeGoogleRoute({ routes: [{ duration: '754s', distanceMeters: 3210, polyline: POLY }] }, 'bike');
  assert.deepEqual({ mode: out.mode, duration: out.duration, distance: out.distance, n: out.geometry.length }, { mode: 'bike', duration: 754, distance: 3210, n: 3 });
  assert.throws(() => normalizeGoogleRoute({}, 'walk'), (e) => e.status === 404);
});

test('requests: only the fields needed, no traffic (cheaper) unless asked, no times in the past', () => {
  const a = { lat: -33.9, lon: 151.18 }, b = { lat: -33.87, lon: 151.21 };
  const drive = routeRequest('drive', a, b);
  assert.equal(drive.travelMode, 'DRIVE');
  assert.equal(drive.routingPreference, 'TRAFFIC_UNAWARE');
  assert.deepEqual(drive.origin, { location: { latLng: { latitude: -33.9, longitude: 151.18 } } });
  assert.equal(routeRequest('drive', a, b, { traffic: true }).routingPreference, 'TRAFFIC_AWARE');
  assert.equal(routeRequest('walk', a, b).routingPreference, undefined);
  const now = Date.parse('2026-11-12T08:00:00Z');
  assert.equal(routeRequest('transit', a, b, { time: '2026-11-12T07:00:00Z', now }).departureTime, undefined);
  assert.equal(routeRequest('transit', a, b, { time: '2026-11-12T09:00:00Z', now }).departureTime, '2026-11-12T09:00:00.000Z');
  assert.equal(routeRequest('transit', a, b, { time: '2026-11-12T09:00:00Z', arriveBy: true, now }).arrivalTime, '2026-11-12T09:00:00.000Z');
  assert.equal(routeFields('walk'), 'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline');
  assert.match(routeFields('transit'), /routes\.legs\.steps\.transitDetails/);
});

test('matrix answers: indices left out when zero, and spots with no route', () => {
  const out = normalizeGoogleMatrix([
    { duration: '600s', distanceMeters: 800, condition: 'ROUTE_EXISTS' },
    { originIndex: 1, duration: '900s', distanceMeters: 1200, condition: 'ROUTE_EXISTS' },
    { destinationIndex: 1, condition: 'ROUTE_NOT_FOUND' },
    { originIndex: 1, destinationIndex: 1, duration: '30s', condition: 'ROUTE_EXISTS' },
  ], 2, 2);
  assert.deepEqual(out.durations, [[600, null], [900, 30]]);
  assert.deepEqual(out.distances, [[800, null], [1200, 0]]);
});

/** A stand-in for Google's servers that records what was asked. */
function fakeGoogle() {
  const calls = [];
  let sessions = 0;
  const reply = (status, body, headers = {}) => new Response(typeof body === 'string' || body instanceof Uint8Array ? body : JSON.stringify(body), { status, headers });
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, init });
    if (url.includes('createSession')) return reply(200, { session: `s${++sessions}`, expiry: String(Math.floor(Date.now() / 1000) + 14 * 86400) });
    if (url.includes('/2dtiles/')) return url.includes('session=s1') && calls.filter((c) => c.url.includes('/2dtiles/')).length === 1
      ? reply(403, 'expired') : reply(200, new Uint8Array([137, 80, 78, 71]), { 'content-type': 'image/png', 'cache-control': 'max-age=3600' });
    if (url.includes('computeRouteMatrix')) return reply(200, [{ duration: '60s', distanceMeters: 90, condition: 'ROUTE_EXISTS' }]);
    if (url.includes('computeRoutes')) return reply(200, { routes: [{ duration: '100s', distanceMeters: 200, polyline: POLY }] });
    return reply(404, {});
  };
  return { fetchImpl, calls };
}

test('the server sends the key in a header and falls back once a daily cap is used up', async () => {
  const { fetchImpl, calls } = fakeGoogle();
  const g = createGoogle({ apiKey: 'k3y', fetchImpl, limits: { routes: 2, elements: 3 } });
  assert.equal(g.enabled, true);
  const a = { lat: 51.5, lon: -0.1 }, b = { lat: 51.51, lon: -0.12 };
  const r = await g.route('walk', a, b);
  assert.equal(r.duration, 100);
  const sent = calls.at(-1).init;
  assert.equal(sent.headers['X-Goog-Api-Key'], 'k3y');
  assert.match(sent.headers['X-Goog-FieldMask'], /routes\.duration/);
  await g.route('walk', a, b);
  await assert.rejects(g.route('walk', a, b), (e) => e.status === 429 && e.limit, 'third route of the day is over the cap');
  assert.equal(g.available('routes'), false);
  assert.deepEqual((await g.matrix('drive', [a], [b, a])).durations[0], [60, null]);
  await assert.rejects(g.matrix('drive', [a, b], [b]), (e) => e.limit, '2 more elements would pass 3');
  assert.equal(createGoogle({}).enabled, false);
});

test('map tiles: one session per style, made again when Google refuses it', async () => {
  const { fetchImpl, calls } = fakeGoogle();
  const g = createGoogle({ apiKey: 'k3y', fetchImpl });
  const t = await g.tile('light2x', 12, 3765, 2457);
  assert.equal(t.status, 200);
  assert.equal(t.type, 'image/png');
  assert.equal(t.cacheControl, 'max-age=3600');
  const made = calls.filter((c) => c.url.includes('createSession'));
  assert.equal(made.length, 2, 'the first session was refused, so a new one was made');
  const body = JSON.parse(made[0].init.body);
  assert.equal(body.mapType, 'roadmap');
  assert.equal(body.highDpi, true);
  assert.ok(body.styles.some((s) => s.featureType === 'poi.business'), 'quiet style: no shop icons');
  await g.tile('light2x', 12, 3765, 2458);
  assert.equal(calls.filter((c) => c.url.includes('createSession')).length, 2, 'the session is reused');
  assert.match(calls.at(-1).url, /2dtiles\/12\/3765\/2458\?session=s2&key=k3y/);
});

test('server: with a key, Google answers for pages showing its map; others keep the free services', async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const osrm = fs.readFileSync(new URL('../fixtures/osrm-route.json', import.meta.url), 'utf8');
  const { fetchImpl, calls } = fakeGoogle();
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    if (u.startsWith('http://localhost')) return realFetch(url, init);
    if (u.includes('googleapis.com')) return fetchImpl(u, init);
    if (u.includes('routing.openstreetmap.de')) return new Response(osrm, { headers: { 'content-type': 'application/json' } });
    throw new Error(`unexpected request ${u}`);
  };
  process.env.DATA_FILE = path.join(os.tmpdir(), `meet-google-test-${Date.now()}.json`);
  process.env.GOOGLE_MAPS_API_KEY = 'k3y';
  const { server } = await import(`../../server.js?google-${Date.now()}`);
  await new Promise((r) => server.listen(0, r));
  const base = `http://localhost:${server.address().port}`;
  const get = async (p) => { const r = await realFetch(base + p); return { status: r.status, type: r.headers.get('content-type'), body: r.headers.get('content-type')?.includes('json') ? await r.json() : Buffer.from(await r.arrayBuffer()) }; };
  try {
    assert.equal((await get('/api/config')).body.google, true);
    const g = await get('/api/directions?g=1&mode=walk&from=51.5,-0.1&to=51.51,-0.12');
    assert.equal(g.body.provider, 'google');
    const free = await get('/api/directions?mode=walk&from=51.5,-0.1&to=51.51,-0.12');
    assert.equal(free.body.provider, 'osrm', 'pages on the free map get free routes');
    const check = await get('/api/checktimes?g=1&mode=drive&from=51.5,-0.1&to=51.51,-0.12;51.52,-0.11');
    assert.deepEqual(check.body.durations, [[60, null]]);
    const tile = await get('/api/gmap/dark2x/12/2047/1361');
    assert.equal(tile.status, 200);
    assert.equal(tile.type, 'image/png');
    assert.equal((await get('/api/gmap/neon/12/2047/1361')).status, 400);
    assert.equal((await get('/api/gmap/light/3/9/1')).status, 400, 'tile outside the world');
    assert.ok(calls.every((c) => !String(c.init?.body || '').includes('k3y')), 'the key is never in a request body');
  } finally {
    await new Promise((r) => server.close(r));
    globalThis.fetch = realFetch;
    delete process.env.GOOGLE_MAPS_API_KEY;
    fs.rmSync(process.env.DATA_FILE, { force: true });
  }
});

const gPlace = {
  id: 'ChIJabc', displayName: { text: 'Flour and Stone' }, location: { latitude: -33.8722, longitude: 151.2190 },
  rating: 4.6, userRatingCount: 1234, googleMapsUri: 'https://maps.google.com/?cid=1', websiteUri: 'https://flourandstone.com.au',
  nationalPhoneNumber: '(02) 8068 8818', priceLevel: 'PRICE_LEVEL_MODERATE',
  regularOpeningHours: { weekdayDescriptions: ['Monday: 7:00 AM – 3:00 PM'] },
  photos: Array.from({ length: 9 }, (_, i) => ({ name: `places/ChIJabc/photos/P${i}`, authorAttributions: [{ displayName: `Snapper ${i}`, uri: `https://maps.google.com/u/${i}` }] })),
  reviews: [
    { name: 'places/ChIJabc/reviews/R1', rating: 5, text: { text: 'Best lamington in town.' }, relativePublishTimeDescription: '2 weeks ago', publishTime: '2026-10-29T01:00:00Z', authorAttribution: { displayName: 'Sam K', uri: 'https://maps.google.com/u/sam', photoUri: 'https://lh3.googleusercontent.com/a/sam' } },
    { name: 'places/ChIJabc/reviews/R2', rating: 4, originalText: { text: 'Lovely, small.' }, authorAttribution: { displayName: 'Jo' } },
  ],
};

test('a Google place becomes the place page: photos with their authors, reviews with theirs, rating and details', () => {
  const p = normalizeGooglePlace(gPlace, { photoUrl: (n, w) => `/photo?name=${n}&w=${w}`, maxPhotos: 6 });
  assert.equal(p.source, 'google');
  assert.equal(p.rating, 4.6);
  assert.equal(p.count, 1234);
  assert.equal(p.priceLevel, 'Mid Range');
  assert.deepEqual(p.hours, ['Monday: 7:00 AM – 3:00 PM']);
  assert.equal(p.photos.length, 6, 'at most six photos (each one is billed)');
  assert.deepEqual(p.photos[0], { url: '/photo?name=places/ChIJabc/photos/P0&w=1200', caption: '', by: 'Snapper 0', byUrl: 'https://maps.google.com/u/0', credit: 'Google Maps' });
  assert.equal(p.reviews.length, 2);
  assert.deepEqual({ user: p.reviews[0].user, userUrl: p.reviews[0].userUrl, avatar: p.reviews[0].avatar, when: p.reviews[0].when, text: p.reviews[0].text },
    { user: 'Sam K', userUrl: 'https://maps.google.com/u/sam', avatar: 'https://lh3.googleusercontent.com/a/sam', when: '2 weeks ago', text: 'Best lamington in town.' });
  assert.equal(p.reviews[1].text, 'Lovely, small.');
  assert.match(p.attribution, /Google Maps/);
  assert.equal(normalizeGooglePlace(gPlace, { maxPhotos: 0 }).photos.length, 0, 'no photos left today: none listed');
});

test('server: a place is matched on Google (free search), checked, and its photos are sent on to Google', async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (u.startsWith('http://localhost')) return realFetch(url, init);
    calls.push({ url: u, init });
    if (u.endsWith('places:searchText')) {
      const body = JSON.parse(init.body);
      return new Response(JSON.stringify(body.textQuery === 'Nowhere Cafe' ? {} : { places: [{ id: body.textQuery === 'Wrong Name' ? 'ChIJother' : 'ChIJabc' }] }));
    }
    if (u.includes('/places/ChIJabc?')) return new Response(JSON.stringify(gPlace));
    if (u.includes('/places/ChIJother?')) return new Response(JSON.stringify({ ...gPlace, id: 'ChIJother', displayName: { text: 'Totally Different' } }));
    if (u.includes('/media?')) return new Response(JSON.stringify({ photoUri: 'https://lh3.googleusercontent.com/p/xyz' }));
    throw new Error(`unexpected request ${u}`);
  };
  process.env.DATA_FILE = path.join(os.tmpdir(), `meet-gplaces-test-${Date.now()}.json`);
  process.env.GOOGLE_MAPS_API_KEY = 'k3y';
  const { server } = await import(`../../server.js?gplaces-${Date.now()}`);
  await new Promise((r) => server.listen(0, r));
  const base = `http://localhost:${server.address().port}`;
  const details = (name) => realFetch(`${base}/api/gplaces/details?${new URLSearchParams({ g: '1', key: `node/${name}`, name, at: '-33.8723,151.2191' })}`);
  try {
    const r = await details('Flour and Stone');
    assert.equal(r.status, 200);
    const { place } = await r.json();
    assert.equal(place.reviews[0].user, 'Sam K');
    assert.match(place.photos[0].url, /^\/api\/gplaces\/photo\?name=places%2FChIJabc%2Fphotos%2FP0&w=1200$/);
    const search = calls.find((c) => c.url.endsWith('places:searchText'));
    assert.equal(search.init.headers['X-Goog-FieldMask'], 'places.id', 'the search asks for IDs only (free)');
    // Opened again: the stored ID is used, no new search.
    const searches = calls.filter((c) => c.url.endsWith('places:searchText')).length;
    assert.equal((await details('Flour and Stone')).status, 200);
    assert.equal(calls.filter((c) => c.url.endsWith('places:searchText')).length, searches);
    // A different place with the same position isn't taken for it, and nothing found is remembered.
    assert.equal((await details('Wrong Name')).status, 404);
    assert.equal((await details('Nowhere Cafe')).status, 404);
    const before = calls.length;
    assert.equal((await details('Nowhere Cafe')).status, 404);
    assert.equal(calls.length, before, 'a place not on Google is not looked up again straight away');
    // Photos: a redirect to Google's picture, kept by the browser for an hour.
    const ph = await realFetch(base + place.photos[0].url, { redirect: 'manual' });
    assert.equal(ph.status, 302);
    assert.equal(ph.headers.get('location'), 'https://lh3.googleusercontent.com/p/xyz');
    assert.match(ph.headers.get('cache-control'), /max-age=3600/);
    assert.equal((await realFetch(`${base}/api/gplaces/photo?name=..%2Fsecret&w=800`, { redirect: 'manual' })).status, 400);
    // Not for pages on the free map.
    assert.equal((await realFetch(`${base}/api/gplaces/details?key=a&name=b&at=1,1`)).status, 404);
  } finally {
    await new Promise((r) => server.close(r));
    globalThis.fetch = realFetch;
    delete process.env.GOOGLE_MAPS_API_KEY;
    fs.rmSync(process.env.DATA_FILE, { force: true });
  }
});
