// Directions: response normalisers (fed with trimmed real responses from
// FOSSGIS OSRM and Transitous, London) and the server's relay endpoints.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  decodePolyline, normalizeOsrm, normalizeOsrmTable, normalizeTransit, transitUrl, osrmTableUrl, osrmRouteUrl, isWalkLeg,
} from '../../public/js/directions.js';
import { simplify, lineLength } from '../../public/js/geo.js';

const fixture = (name) => JSON.parse(fs.readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8'));
const inLondon = ([lat, lon]) => lat > 51.3 && lat < 51.7 && lon > -0.5 && lon < 0.3;

test('decodes Google-style polylines', () => {
  const pts = decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@', 5);
  assert.deepEqual(pts.map(([a, b]) => [+a.toFixed(3), +b.toFixed(3)]), [[38.5, -120.2], [40.7, -120.95], [43.252, -126.453]]);
});

test('walking route: time, distance and a lat/lon line in London', () => {
  const r = normalizeOsrm(fixture('osrm-route.json'), 'walk');
  assert.equal(r.mode, 'walk');
  assert.ok(r.duration > 1500 && r.duration < 4000, `duration ${r.duration}`);
  assert.ok(r.distance > 2000 && r.distance < 4500);
  assert.ok(r.geometry.length > 5 && r.geometry.every(inLondon));
});

test('travel-time table: sources × destinations, rounded, with spots snapped to roads', () => {
  const t = normalizeOsrmTable(fixture('osrm-table.json'));
  assert.equal(t.durations.length, 2);
  assert.equal(t.durations[0].length, 2);
  assert.ok(t.durations.flat().every((v) => Number.isInteger(v) && v > 0));
  assert.equal(t.destinations.length, 2);
  assert.ok(t.destinations.every(inLondon), 'snapped [lat, lon]');
});

test('route alternatives come back as extra lines', () => {
  const r = normalizeOsrm(fixture('osrm-route-alternatives.json'), 'walk');
  assert.ok(r.alternatives.length >= 1);
  assert.ok(r.alternatives.every((a) => a.geometry.length > 5 && a.geometry.every(inLondon)));
  assert.ok(r.alternatives.every((a) => a.duration > 1500 && a.distance > 2000), 'each alternative keeps its time and length');
  assert.match(osrmRouteUrl('walk', { lat: 51.5, lon: -0.1 }, { lat: 51.51, lon: -0.09 }, { alternatives: true }), /alternatives=2/);
  assert.doesNotMatch(osrmRouteUrl('walk', { lat: 51.5, lon: -0.1 }, { lat: 51.51, lon: -0.09 }), /alternatives/);
  // A route through a point to one side: three coordinates, no alternatives.
  const via = osrmRouteUrl('bike', { lat: 51.5, lon: -0.1 }, { lat: 51.51, lon: -0.09 }, { alternatives: true, via: { lat: 51.506, lon: -0.098 } });
  assert.match(via, /driving\/-0\.100000,51\.500000;-0\.098000,51\.506000;-0\.090000,51\.510000\?/);
  assert.doesNotMatch(via, /alternatives/);
});

test('simplified routes keep their shape with far fewer points', () => {
  const full = normalizeOsrm(fixture('osrm-route-alternatives.json'), 'walk').geometry;
  const slim = simplify(full, 2);
  assert.ok(slim.length < full.length * 0.8, `${full.length} → ${slim.length} points`);
  assert.deepEqual(slim[0], full[0]);
  assert.deepEqual(slim.at(-1), full.at(-1));
  assert.ok(Math.abs(lineLength(slim) - lineLength(full)) / lineLength(full) < 0.02, 'length within 2%');
});

test('public transport: options, line names and colours, walking legs, geometry', () => {
  const r = normalizeTransit(fixture('transitous-plan.json'));
  assert.equal(r.mode, 'transit');
  assert.ok(r.options.length >= 1);
  const ends = r.options.map((o) => Date.parse(o.end));
  assert.deepEqual(ends.slice(1), ends.slice(1).sort((a, b) => a - b), 'by arrival, earliest first');
  assert.ok(ends[0] - Math.min(...ends) <= 180000, 'the first arrives within three minutes of the earliest');
  const best = r.options[0];
  assert.equal(r.duration, best.duration);
  const rides = best.legs.filter((l) => !isWalkLeg(l));
  assert.ok(rides.length >= 1);
  for (const l of rides) {
    assert.ok(l.line, 'ride has a line name');
    assert.match(l.color, /^#[0-9a-f]{6}$/i);
    assert.ok(l.from.name && l.to.name && l.from.time && l.to.time);
  }
  assert.ok(best.legs.some(isWalkLeg), 'includes walking to and from stops');
  assert.ok(best.legs.every((l) => l.geometry.every(inLondon)));
  assert.equal(best.legs[0].from.name, 'Start', 'START becomes a friendly name');
});

test('arrive-by puts the latest departure first', () => {
  const r = normalizeTransit(fixture('transitous-plan.json'), { arriveBy: true });
  const starts = r.options.map((o) => Date.parse(o.start));
  assert.deepEqual(starts.slice(1), starts.slice(1).sort((a, b) => b - a));
  assert.ok(Math.max(...starts) - starts[0] <= 180000);
});

test('journeys arriving within a few minutes of each other: the simplest comes first', async () => {
  const { rankItineraries } = await import('../../public/js/directions.js');
  const leg = (mode) => ({ mode });
  const at = (hhmm) => `2026-11-14T${hhmm}:00Z`;
  const busHop = { start: at('12:35'), end: at('12:50'), duration: 900, transfers: 0, legs: [leg('WALK'), leg('BUS'), leg('WALK')] }; // walk 13 min, one stop on a bus
  const walk = { start: at('12:38'), end: at('12:51'), duration: 780, transfers: 0, legs: [leg('WALK')] };
  const later = { start: at('12:42'), end: at('12:58'), duration: 960, transfers: 0, legs: [leg('WALK')] };
  assert.deepEqual(rankItineraries([busHop, walk, later]), [walk, busHop, later], 'walking all the way, a minute later, beats the bus hop');
  // More than three minutes later is too much to give up.
  const slowWalk = { ...walk, end: at('12:55') };
  assert.deepEqual(rankItineraries([slowWalk, busHop]), [busHop, slowWalk]);
  // The same number of vehicles: the earliest arrival stays first.
  const train = { start: at('12:36'), end: at('12:51'), duration: 900, transfers: 0, legs: [leg('WALK'), leg('RAIL'), leg('WALK')] };
  assert.deepEqual(rankItineraries([train, busHop]), [busHop, train]);
  // Arriving by a time: the latest departure, with the same rule.
  const direct = { start: at('12:40'), end: at('12:58'), duration: 1080, transfers: 0, legs: [leg('WALK'), leg('RAIL'), leg('WALK')] };
  const twoBuses = { start: at('12:42'), end: at('12:59'), duration: 1020, transfers: 1, legs: [leg('WALK'), leg('BUS'), leg('BUS'), leg('WALK')] };
  assert.deepEqual(rankItineraries([direct, twoBuses], { arriveBy: true }), [direct, twoBuses]);
  assert.deepEqual(rankItineraries([]), []);
  assert.deepEqual(rankItineraries([walk]), [walk]);
});

test('no journeys is a clear 404', () => {
  assert.throws(() => normalizeTransit({ itineraries: [], direct: [] }), (e) => e.status === 404);
  assert.throws(() => normalizeOsrm({ code: 'NoRoute', routes: [] }, 'walk'), (e) => e.status === 404);
});

test('request URLs ask for only what the app needs', () => {
  const u = new URL(transitUrl({ lat: 51.5, lon: -0.1 }, { lat: 51.4, lon: -0.2 }, { time: Date.UTC(2026, 0, 1, 9), arriveBy: true }));
  assert.equal(u.searchParams.get('fromPlace'), '51.500000,-0.100000');
  assert.equal(u.searchParams.get('arriveBy'), 'true');
  assert.equal(u.searchParams.get('maxItineraries'), '3');
  assert.equal(u.searchParams.get('time'), '2026-01-01T09:00:00.000Z');
  const t = osrmTableUrl('bike', [{ lat: 1, lon: 2 }], [{ lat: 3, lon: 4 }, { lat: 5, lon: 6 }]);
  assert.match(t, /routed-bike\/table\/v1\/driving\/2\.000000,1\.000000;4\.000000,3\.000000;6\.000000,5\.000000\?sources=0&destinations=1;2/);
});

test('server relays directions with caching, a daily transit cap and validation', async () => {
  process.env.DATA_FILE = path.join(os.tmpdir(), `meet-dir-test-${Date.now()}.json`);
  process.env.TRANSIT_DAILY_LIMIT = '2';
  process.env.ROUTING_GAP_MS = '10'; // (the wait between requests to the routing service, kept short for the test)
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), ua: init?.headers?.['User-Agent'] });
    const body = String(url).includes('transitous') ? fixture('transitous-plan.json')
      : String(url).includes('/table/') ? fixture('osrm-table.json')
        : String(url).includes('alternatives=2') ? fixture('osrm-route-alternatives.json') : fixture('osrm-route.json');
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const { server } = await import(`../../server.js?${Date.now()}`);
  await new Promise((r) => server.listen(0, r));
  const base = `http://localhost:${server.address().port}`;
  const get = async (p) => { const res = await realFetch(base + p); return { status: res.status, body: await res.json() }; };
  try {
    const walk = await get('/api/directions?mode=walk&from=51.5205,-0.1568&to=51.5074,-0.1278');
    assert.equal(walk.status, 200);
    assert.equal(walk.body.mode, 'walk');
    assert.ok(calls[0].ua.startsWith('Meet/'), 'identifies the app');
    assert.deepEqual(walk.body.alternatives, []);

    const alt = await get('/api/directions?mode=walk&from=51.5072,-0.1276&to=51.5155,-0.0877&alt=1');
    assert.ok(alt.body.alternatives.length >= 1, 'alternatives on request');
    const through = await get('/api/directions?mode=walk&from=51.5072,-0.1276&to=51.5155,-0.0877&via=51.512,-0.11');
    assert.equal(through.status, 200);
    assert.match(calls.at(-1).url, /-0\.127600,51\.507200;-0\.110000,51\.512000;-0\.087700,51\.515500/, 'route through the given point');
    assert.equal((await get('/api/directions?mode=walk&from=51.5072,-0.1276&to=51.5155,-0.0877&via=999,1')).status, 400);
    const raw = fixture('osrm-route-alternatives.json').routes[0].geometry.coordinates.length;
    assert.ok(alt.body.geometry.length < raw, 'geometry is slimmed down before it is sent');

    const t1 = await get('/api/directions?mode=transit&from=51.5205,-0.1568&to=51.4645,-0.1302&time=2026-01-01T09:00:10Z');
    assert.equal(t1.status, 200);
    assert.ok(t1.body.options[0].legs.length > 1);
    const before = calls.length;
    const again = await get('/api/directions?mode=transit&from=51.5205,-0.1568&to=51.4645,-0.1302&time=2026-01-01T09:00:40Z');
    assert.equal(again.status, 200);
    assert.equal(calls.length, before, 'same minute is served from the cache');

    await get('/api/directions?mode=transit&from=51.5205,-0.1568&to=51.40,-0.10&time=2026-01-01T09:00:00Z');
    const capped = await get('/api/directions?mode=transit&from=51.5205,-0.1568&to=51.41,-0.10&time=2026-01-01T09:00:00Z');
    assert.equal(capped.status, 429, 'daily public-transport cap');

    const times = await get('/api/traveltimes?mode=bike&from=51.5205,-0.1568;51.5215,-0.0717&to=51.5074,-0.1278;51.5101,-0.1340');
    assert.equal(times.status, 200);
    assert.equal(times.body.durations.length, 2);
    assert.equal(times.body.destinations.length, 2);

    assert.equal((await get('/api/directions?mode=fly&from=1,1&to=2,2')).status, 400);
    assert.equal((await get('/api/directions?mode=walk&from=999,1&to=2,2')).status, 400);
    assert.equal((await get('/api/traveltimes?mode=transit&from=1,1&to=2,2')).status, 400);
  } finally {
    globalThis.fetch = realFetch;
    await new Promise((r) => server.close(r));
    fs.rmSync(process.env.DATA_FILE, { force: true });
  }
});

test('server: requests to the free routing service take turns (one at a time, a gap between them), none is sent twice', async () => {
  process.env.DATA_FILE = path.join(os.tmpdir(), `meet-turns-test-${Date.now()}.json`);
  process.env.ROUTING_GAP_MS = '150';
  const sent = []; // { url, at }
  const refuseOnce = new Set();
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = String(url);
    sent.push({ url: u, at: Date.now() });
    // One address is refused the first time, as the service does when asked too fast.
    if (u.includes('51.6000') && !refuseOnce.has(u)) { refuseOnce.add(u); return new Response('Too Many Requests', { status: 429 }); }
    const body = u.includes('transitous') ? fixture('transitous-plan.json') : u.includes('/table/') ? fixture('osrm-table.json') : fixture('osrm-route.json');
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const { server } = await import(`../../server.js?turns-${Date.now()}`);
  await new Promise((r) => server.listen(0, r));
  const base = `http://localhost:${server.address().port}`;
  const get = (p) => realFetch(base + p).then((r) => r.status);
  try {
    // A search asks for several things at once: a table for each way of travelling, a route each, the same route twice.
    const statuses = await Promise.all([
      get('/api/traveltimes?mode=walk&from=51.52,-0.15&to=51.50,-0.12;51.51,-0.13'),
      get('/api/traveltimes?mode=bike&from=51.52,-0.15&to=51.50,-0.12;51.51,-0.13'),
      get('/api/directions?mode=drive&from=51.52,-0.15&to=51.50,-0.12'),
      get('/api/directions?mode=drive&from=51.52,-0.15&to=51.50,-0.12'),
      get('/api/directions?mode=walk&from=51.53,-0.15&to=51.50,-0.12'),
      get('/api/directions?mode=transit&from=51.52,-0.15&to=51.50,-0.12'),
    ]);
    assert.deepEqual(statuses, [200, 200, 200, 200, 200, 200]);
    const road = sent.filter((x) => x.url.includes('routing.openstreetmap.de'));
    assert.equal(road.length, 4, 'four different questions, each sent once (the repeated one shared)');
    const gaps = road.slice(1).map((x, i) => x.at - road[i].at);
    assert.ok(gaps.every((g) => g >= 140), `at least the gap between requests: ${gaps}`);
    assert.deepEqual(road.map((x) => /routed-(\w+)/.exec(x.url)[1]).sort(), ['bike', 'car', 'foot', 'foot']);
    const transit = sent.find((x) => x.url.includes('transitous'));
    assert.ok(transit.at - road[0].at < 140, 'the timetable service is another service: it does not wait in this queue');

    // Refused for asking too fast all the same: asked once more after a pause, and the answer is used.
    const before = sent.length;
    assert.equal(await get('/api/directions?mode=bike&from=51.6000,-0.15&to=51.50,-0.12'), 200);
    const again = sent.slice(before);
    assert.equal(again.length, 2);
    assert.ok(again[1].at - again[0].at >= 280, `a pause before asking again: ${again[1].at - again[0].at} ms`);

    // An answer already given is not asked for again.
    const n = sent.length;
    assert.equal(await get('/api/directions?mode=drive&from=51.52,-0.15&to=51.50,-0.12'), 200);
    assert.equal(sent.length, n);
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.ROUTING_GAP_MS;
    await new Promise((r) => server.close(r));
    fs.rmSync(process.env.DATA_FILE, { force: true });
  }
});

// ---------------------------------------------------------------- the browser's side

/** Stand-in for fetch: `answer(url, init)` returns [status, body] (an object is sent as JSON), or a promise of it. */
function withFetch(answer, run) {
  const real = globalThis.fetch;
  const calls = [];
  if (typeof routingPace !== 'undefined') routingPace.prefer = 'direct'; // each test starts as a new visit does
  globalThis.fetch = async (url, init = {}) => {
    calls.push(String(url));
    const [status, body] = await answer(String(url), init);
    const json = typeof body === 'object';
    return new Response(json ? JSON.stringify(body) : body, { status, headers: { 'Content-Type': json ? 'application/json' : 'text/html' } });
  };
  return run(calls).finally(() => { globalThis.fetch = real; });
}
// Requests straight to the routing service, and those to the Meet server.
const straight = (url) => url.startsWith('https://routing.openstreetmap.de/');
const toServer = (url) => url.startsWith('/api/');
const { getDirections, getTravelTimes, getTransitReach, useGoogle, routingPace } = await import('../../public/js/directions.js');
// (No waiting between requests in these tests, and "slow" is 80 ms.)
Object.assign(routingPace, { gapMs: 0, slowMs: 80 });
const hang = (init) => new Promise((_, reject) => init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))));

test('browser: walking, cycling and driving are asked of the routing service straight from the browser; the Meet server is not needed', async () => {
  await withFetch((url) => (straight(url) ? [200, fixture('osrm-route.json')] : [500, { error: 'should not be asked' }]), async (calls) => {
    const r = await getDirections('walk', { lat: 10.1, lon: 20.1 }, { lat: 10.2, lon: 20.2 });
    assert.ok(r.duration > 0 && r.geometry.length > 1);
    assert.equal(calls.length, 1);
    assert.match(calls[0], /routing\.openstreetmap\.de\/routed-foot\/route/);
    assert.match(calls[0], /geometries=polyline/, 'the compact form of the line');
  });
  await withFetch((url) => (straight(url) ? [200, fixture('osrm-table.json')] : [500, { error: 'should not be asked' }]), async (calls) => {
    const t = await getTravelTimes('bike', [{ lat: 10.1, lon: 20.1 }, { lat: 10.3, lon: 20.3 }], [{ lat: 10.2, lon: 20.2 }, { lat: 10.4, lon: 20.4 }]);
    assert.equal(t.durations.length, 2);
    assert.equal(calls.length, 1);
    assert.match(calls[0], /routed-bike\/table/);
  });
});

test('browser: an encoded line and a GeoJSON line give the same route', () => {
  const geo = fixture('osrm-route.json');
  const pts = geo.routes[0].geometry.coordinates.map(([lon, lat]) => [lat, lon]);
  // Encode as the routing service does (5 decimal places).
  const enc = (v) => { let n = v < 0 ? ~(v << 1) : v << 1, out = ''; while (n >= 0x20) { out += String.fromCharCode((0x20 | (n & 0x1f)) + 63); n >>= 5; } return out + String.fromCharCode(n + 63); };
  let line = '', pLat = 0, pLon = 0;
  for (const [lat, lon] of pts) { const a = Math.round(lat * 1e5), b = Math.round(lon * 1e5); line += enc(a - pLat) + enc(b - pLon); pLat = a; pLon = b; }
  const encoded = { ...geo, routes: [{ ...geo.routes[0], geometry: line }] };
  const a = normalizeOsrm(geo, 'walk'), b = normalizeOsrm(encoded, 'walk');
  assert.equal(b.geometry.length, a.geometry.length);
  assert.ok(b.geometry.every(([lat, lon], i) => Math.abs(lat - a.geometry[i][0]) < 2e-5 && Math.abs(lon - a.geometry[i][1]) < 2e-5));
});

test('browser: refused or unreachable from the browser, the Meet server is asked at once', async () => {
  for (const [k, refusal] of [[429, 'Too Many Requests'], [503, 'busy']].entries()) {
    await withFetch((url) => (straight(url) ? refusal : [200, normalizeOsrm(fixture('osrm-route.json'), 'drive')]), async (calls) => {
      const r = await getDirections('drive', { lat: 11.1 + k, lon: 20.1 }, { lat: 11.2 + k, lon: 20.2 });
      assert.ok(r.duration > 0);
      assert.equal(calls.length, 2);
      assert.ok(straight(calls[0]) && toServer(calls[1]));
    });
  }
  // No connection to the service at all (blocked, offline there).
  routingPace.prefer = 'direct';
  const real = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    if (straight(String(url))) throw new TypeError('Failed to fetch');
    return new Response(JSON.stringify({ durations: [[100]], distances: [[130]], destinations: [[13.2, 20.2]] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    assert.deepEqual((await getTravelTimes('walk', [{ lat: 13.1, lon: 20.1 }], [{ lat: 13.2, lon: 20.2 }])).durations, [[100]]);
    assert.equal(calls.length, 2);
  } finally { globalThis.fetch = real; }
});

test('browser: when the routing service is slow to answer, the Meet server is asked as well and the first good answer is used', async () => {
  const served = { durations: [[77]], distances: [[99]], destinations: [[14.2, 20.2]] };
  // The service never answers: the server's answer is used, and the request to the service is dropped.
  let dropped = false;
  await withFetch((url, init) => {
    if (straight(url)) { init.signal.addEventListener('abort', () => { dropped = true; }); return hang(init); }
    return [200, served];
  }, async (calls) => {
    const t0 = Date.now();
    assert.deepEqual((await getTravelTimes('walk', [{ lat: 14.1, lon: 20.1 }], [{ lat: 14.2, lon: 20.2 }])).durations, [[77]]);
    assert.ok(Date.now() - t0 >= 70, 'the server is only asked once the service has been slow');
    assert.equal(calls.length, 2);
    await new Promise((r) => setTimeout(r, 5));
    assert.equal(dropped, true);
  });
  // The service answers after the server was asked but before it replied: the service's answer is used.
  await withFetch(async (url, init) => {
    if (straight(url)) { await new Promise((r) => setTimeout(r, 120)); return [200, fixture('osrm-table.json')]; }
    return hang(init);
  }, async (calls) => {
    const t = await getTravelTimes('walk', [{ lat: 14.3, lon: 20.1 }, { lat: 14.4, lon: 20.1 }], [{ lat: 14.2, lon: 20.2 }, { lat: 14.5, lon: 20.2 }]);
    assert.equal(t.durations.length, 2);
    assert.equal(calls.length, 2);
  });
  // Slow, and then both fail: a failure, with the server's own message.
  await withFetch(async (url) => {
    if (straight(url)) { await new Promise((r) => setTimeout(r, 120)); return [500, 'down']; }
    return [502, { error: 'The directions service is busy right now. Try again in a moment.' }];
  }, async () => {
    await assert.rejects(getTravelTimes('walk', [{ lat: 14.6, lon: 20.1 }], [{ lat: 14.2, lon: 20.2 }]), (err) => /busy right now/.test(err.message));
  });
});

test('browser: "no way between these" is an answer: said once, by the service or by the Meet server', async () => {
  // The service itself says so (it sends an error status with a code): final, the server is not asked.
  await withFetch((url) => (straight(url) ? [400, { code: 'NoRoute', message: 'Impossible route between points' }] : [200, {}]), async (calls) => {
    await assert.rejects(getDirections('walk', { lat: 15.1, lon: 20.1 }, { lat: 15.2, lon: 20.2 }), (err) => err.status === 404 && /No route found/.test(err.message));
    assert.equal(calls.length, 1);
  });
  // The browser could not reach the service; the Meet server did, and says there is no route.
  await withFetch((url) => (straight(url) ? [503, 'busy'] : [404, { error: 'No route found' }]), async (calls) => {
    await assert.rejects(getDirections('walk', { lat: 15.3, lon: 20.1 }, { lat: 15.2, lon: 20.2 }), (err) => err.status === 404 && /No route found/.test(err.message));
    assert.equal(calls.length, 2);
  });
});

test('browser: with Google\'s map the Meet server answers for routes (from Google); public transport always goes through it', async () => {
  const route = normalizeOsrm(fixture('osrm-route.json'), 'walk');
  useGoogle(true);
  try {
    await withFetch(() => [200, route], async (calls) => {
      await getDirections('walk', { lat: 16.1, lon: 20.1 }, { lat: 16.2, lon: 20.2 });
      assert.equal(calls.length, 1);
      assert.match(calls[0], /^\/api\/directions\?.*g=1/);
    });
  } finally { useGoogle(false); }
  await withFetch(() => [200, normalizeTransit(fixture('transitous-plan.json'))], async (calls) => {
    const r = await getDirections('transit', { lat: 16.3, lon: 20.1 }, { lat: 16.2, lon: 20.2 });
    assert.ok(r.options.length >= 1);
    assert.equal(calls.length, 1);
    assert.match(calls[0], /^\/api\/directions\?mode=transit/);
  });
  // Without a Meet server (a bare 404): the timetable service straight from the browser.
  await withFetch((url) => (toServer(url) ? [404, 'Not found'] : [200, fixture('transitous-plan.json')]), async (calls) => {
    const r = await getDirections('transit', { lat: 16.5, lon: 20.1 }, { lat: 16.2, lon: 20.2 });
    assert.ok(r.options.length >= 1);
    assert.match(calls[1], /api\.transitous\.org/);
  });
});

test('browser: an answer that is not a route (a Wi-Fi sign-in page everywhere, an empty object) is a failure, never a half-made route', async () => {
  await withFetch(() => [200, '<html>Sign in to this Wi-Fi network</html>'], async () => {
    await assert.rejects(getDirections('bike', { lat: 12.1, lon: 20.1 }, { lat: 12.2, lon: 20.2 }));
    await assert.rejects(getTravelTimes('walk', [{ lat: 12.1, lon: 20.1 }], [{ lat: 12.2, lon: 20.2 }]));
    await assert.rejects(getTransitReach({ lat: 12.1, lon: 20.1 }, { box: { s: 12, w: 20, n: 13, e: 21 } }));
  });
  await withFetch(() => [200, {}], async () => {
    await assert.rejects(getDirections('drive', { lat: 13.1, lon: 20.1 }, { lat: 13.2, lon: 20.2 }), (err) => err.status === 502);
    await assert.rejects(getDirections('transit', { lat: 13.1, lon: 20.1 }, { lat: 13.2, lon: 20.2 }), (err) => err.status === 502);
    await assert.rejects(getTravelTimes('walk', [{ lat: 13.15, lon: 20.1 }], [{ lat: 13.2, lon: 20.2 }]), (err) => err.status === 502);
    await assert.rejects(getTransitReach({ lat: 13.1, lon: 20.1 }, { box: { s: 13, w: 20, n: 14, e: 21 } }), (err) => err.status === 502);
  });
});

test('browser: a request cancelled by the search that started it is asked again for a later search sharing it', async () => {
  let n = 0;
  await withFetch((url, init) => {
    n++;
    if (n === 1) return hang(init); // never answers; cancelled
    return straight(url) ? [200, fixture('osrm-table.json')] : [500, { error: 'not needed' }];
  }, async (calls) => {
    const first = new AbortController(), second = new AbortController();
    const args = ['walk', [{ lat: 17.1, lon: 20.1 }, { lat: 17.3, lon: 20.1 }], [{ lat: 17.2, lon: 20.2 }, { lat: 17.4, lon: 20.2 }]];
    const a = getTravelTimes(...args, { signal: first.signal });
    const b = getTravelTimes(...args, { signal: second.signal }); // shares the first one's request
    await new Promise((r) => setTimeout(r, 10));
    first.abort();
    await assert.rejects(a, (err) => err.name === 'AbortError');
    const table = await b;
    assert.equal(table.durations.length, 2);
    assert.equal(calls.length, 2);
    // and the answer is kept for whoever asks next
    assert.deepEqual((await getTravelTimes(...args)).durations, table.durations);
    assert.equal(calls.length, 2);
  });
});

test('browser: requests to the routing service are spaced out (its rule is one a second)', async () => {
  routingPace.gapMs = 60;
  const at = [];
  try {
    await withFetch((url) => { at.push(Date.now()); return [200, straight(url) ? fixture('osrm-table.json') : {}]; }, async () => {
      // A search asks for three ways of travelling at once.
      await Promise.all(['walk', 'bike', 'drive'].map((mode) => getTravelTimes(mode, [{ lat: 18.1, lon: 20.1 }, { lat: 18.3, lon: 20.1 }], [{ lat: 18.2, lon: 20.2 }, { lat: 18.4, lon: 20.2 }])));
      assert.equal(at.length, 3);
      const gaps = at.slice(1).map((t, i) => t - at[i]);
      assert.ok(gaps.every((g) => g >= 50), `gaps ${gaps}`);
    });
  } finally { routingPace.gapMs = 0; }
});

test('browser: a big group or a long list of places is asked for in several requests and comes back as one table', async () => {
  const sources = Array.from({ length: 14 }, (_, i) => ({ lat: 15 + i * 0.01, lon: 30 }));
  const destinations = Array.from({ length: 100 }, (_, j) => ({ lat: 15, lon: 31 + j * 0.001 }));
  // The routing service is out of reach here; the stand-in server answers with source and destination numbers, so the pieces can be checked once put together.
  const answer = (url) => {
    if (straight(url)) return [503, 'busy'];
    const q = new URL(url, 'http://x').searchParams;
    const from = q.get('from').split(';').map((s) => Math.round((Number(s.split(',')[0]) - 15) * 100));
    const to = q.get('to').split(';').map((s) => Math.round((Number(s.split(',')[1]) - 31) * 1000));
    return [200, { durations: from.map((i) => to.map((j) => i * 1000 + j)), distances: from.map((i) => to.map((j) => (i * 1000 + j) * 2)), destinations: to.map((j) => [15, 31 + j * 0.001]) }];
  };
  await withFetch(answer, async (calls) => {
    const asked = () => calls.filter(toServer).length;
    const t = await getTravelTimes('walk', sources, destinations);
    assert.equal(asked(), 4, '2 groups of people × 2 groups of places');
    assert.equal(t.durations.length, 14);
    assert.ok(t.durations.every((row) => row.length === 100));
    assert.equal(t.durations[13][99], 13099);
    assert.equal(t.durations[0][80], 80);
    assert.equal(t.distances[12][5], 24010);
    assert.equal(t.destinations.length, 100);
    // The first piece again: already answered, nothing is asked.
    await getTravelTimes('walk', sources.slice(0, 12), destinations.slice(0, 80));
    assert.equal(asked(), 4);
    // Within the limits: one request, as before.
    const small = await getTravelTimes('walk', sources.slice(1, 13), destinations.slice(1, 81));
    assert.equal(asked(), 5);
    assert.equal(small.durations[0][0], 1001);
  });
});

test('browser: the way that answered well goes first next time (the browser\'s own request, or the Meet server)', async () => {
  const served = { durations: [[5]], distances: [[6]], destinations: [[19.2, 20.2]] };
  const dest = [{ lat: 19.2, lon: 20.2 }];
  let directWorks = false, serverWorks = true;
  await withFetch((url, init) => {
    if (straight(url)) return directWorks ? [200, { code: 'Ok', durations: [[9]], distances: [[9]] }] : hang(init); // held back by the service
    return serverWorks ? [200, served] : [502, { error: 'The directions service is busy right now. Try again in a moment.' }];
  }, async (calls) => {
    // The browser's own request is held back: the server answers, and goes first from now on.
    assert.deepEqual((await getTravelTimes('walk', [{ lat: 19.01, lon: 20.1 }], dest)).durations, [[5]]);
    assert.equal(routingPace.prefer, 'server');
    assert.ok(straight(calls[0]) && toServer(calls[1]));
    const n = calls.length;
    await getTravelTimes('walk', [{ lat: 19.02, lon: 20.1 }], dest);
    assert.equal(calls.length, n + 1, 'one request, to the server, without waiting on the service');
    assert.ok(toServer(calls[n]));
    // The server stops answering and the service is back: the browser's own request again.
    serverWorks = false; directWorks = true;
    assert.deepEqual((await getTravelTimes('walk', [{ lat: 19.03, lon: 20.1 }], dest)).durations, [[9]]);
    assert.equal(routingPace.prefer, 'direct');
    const m = calls.length;
    await getTravelTimes('walk', [{ lat: 19.04, lon: 20.1 }], dest);
    assert.equal(calls.length, m + 1);
    assert.ok(straight(calls[m]));
  });
});
