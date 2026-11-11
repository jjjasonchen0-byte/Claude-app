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
  assert.ok(r.alternatives.every((g) => g.length > 5 && g.every(inLondon)));
  assert.match(osrmRouteUrl('walk', { lat: 51.5, lon: -0.1 }, { lat: 51.51, lon: -0.09 }, { alternatives: true }), /alternatives=2/);
  assert.doesNotMatch(osrmRouteUrl('walk', { lat: 51.5, lon: -0.1 }, { lat: 51.51, lon: -0.09 }), /alternatives/);
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
  assert.deepEqual(ends, [...ends].sort((a, b) => a - b), 'earliest arrival first');
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
  assert.deepEqual(starts, [...starts].sort((a, b) => b - a));
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
