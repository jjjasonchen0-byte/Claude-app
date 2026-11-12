// Finding the meeting point from travel-time tables (here a stand-in routing
// service where roads are 25% longer than a straight line).
import test from 'node:test';
import assert from 'node:assert/strict';
import { haversine } from '../../public/js/geo.js';
import { findMeetingPoint, SPEEDS, grid } from '../../public/js/meetpoint.js';

const ROAD = 1.25;
function fakeRouter({ fail = [] } = {}) {
  const calls = [];
  const travelTimes = async (mode, sources, destinations) => {
    calls.push({ mode, n: sources.length, m: destinations.length });
    if (fail.includes(mode)) throw new Error('down');
    const distances = sources.map((s) => destinations.map((d) => haversine(s.lat, s.lon, d.lat, d.lon) * ROAD));
    return {
      distances,
      durations: distances.map((row) => row.map((m) => m / SPEEDS[mode])),
      destinations: destinations.map((d) => [d.lat, d.lon]),
    };
  };
  return { travelTimes, calls };
}
const secs = (p, q, mode) => (haversine(p.lat, p.lon, q.lat, q.lon) * ROAD) / SPEEDS[mode];

/** Best possible longest trip, by brute force over a fine grid. */
function bruteForce(people, rule = 'fair') {
  let best = Infinity;
  const lat = people.map((p) => p.lat), lon = people.map((p) => p.lon);
  for (const c of grid({ s: Math.min(...lat), n: Math.max(...lat), w: Math.min(...lon), e: Math.max(...lon) }, 81)) {
    const t = people.map((p) => secs(p, c, p.mode));
    best = Math.min(best, rule === 'fair' ? Math.max(...t) : t.reduce((a, b) => a + b, 0));
  }
  return best;
}

const london = [
  { lat: 51.5205, lon: -0.1568, mode: 'walk' },
  { lat: 51.5215, lon: -0.0717, mode: 'walk' },
  { lat: 51.4645, lon: -0.1302, mode: 'walk' },
];

const spread = (t) => Math.max(...t) - Math.min(...t);

test('three walkers get similar walks, none much longer than it has to be', async () => {
  const { travelTimes, calls } = fakeRouter();
  const r = await findMeetingPoint(london, { travelTimes });
  const opt = bruteForce(london);
  const got = Math.max(...r.times);
  assert.ok(got <= opt * 1.3, `longest trip ${got.toFixed(0)} s vs shortest possible ${opt.toFixed(0)} s`);
  assert.ok(spread(r.times) < 0.1 * got, `trips within ${spread(r.times).toFixed(0)} s of each other`);
  assert.equal(r.approx, false);
  assert.ok(calls.length <= 4, `only ${calls.length} small requests`);
  assert.ok(calls.every((c) => c.m <= 80));
});

test('similar times: two far apart and one in between; times come closer, but no one travels much further', async () => {
  // The "shortest longest trip" spot is halfway between the two far apart,
  // where the third has a much shorter trip. Similar times moves the spot
  // towards making the third travel about as long, as far as the longest
  // trip can grow by about 12% (beyond that everyone just travels further).
  const people = [{ lat: 51.50, lon: -0.18, mode: 'walk' }, { lat: 51.50, lon: -0.10, mode: 'walk' }, { lat: 51.509, lon: -0.14, mode: 'walk' }];
  const { travelTimes } = fakeRouter();
  const r = await findMeetingPoint(people, { travelTimes });
  const total = await findMeetingPoint(people, { travelTimes, rule: 'total' });
  const opt = bruteForce(people);
  const half = people.map((p) => secs(p, { lat: 51.50, lon: -0.14 }, 'walk')); // the halfway spot
  assert.ok(spread(r.times) < 0.6 * spread(half), `times ${r.times.map((t) => Math.round(t / 60))} min, halfway ${half.map((t) => Math.round(t / 60))}`);
  assert.ok(Math.max(...r.times) <= opt * 1.14, 'the longest trip grows by at most about 12%');
  assert.ok(spread(total.times) > 1.5 * spread(r.times), '"least travel" leaves times much less even');
});

test('a driver goes further so a walker does not have to', async () => {
  const people = [{ lat: 51.50, lon: -0.20, mode: 'walk' }, { lat: 51.50, lon: -0.05, mode: 'drive' }];
  const { travelTimes } = fakeRouter();
  const r = await findMeetingPoint(people, { travelTimes });
  const dWalker = haversine(people[0].lat, people[0].lon, r.meet.lat, r.meet.lon);
  const dDriver = haversine(people[1].lat, people[1].lon, r.meet.lat, r.meet.lon);
  assert.ok(dDriver > dWalker * 3, `driver ${dDriver.toFixed(0)} m, walker ${dWalker.toFixed(0)} m`);
  assert.ok(Math.abs(r.times[0] - r.times[1]) < 0.2 * Math.max(...r.times), 'similar travel times');
});

test('"least total travel" sides with the group, "similar times" with the one far away', async () => {
  const people = [
    { lat: 51.50, lon: -0.10, mode: 'walk' }, { lat: 51.501, lon: -0.101, mode: 'walk' },
    { lat: 51.502, lon: -0.099, mode: 'walk' }, { lat: 51.50, lon: -0.02, mode: 'walk' },
  ];
  const { travelTimes } = fakeRouter();
  const fair = await findMeetingPoint(people, { travelTimes, rule: 'similar' });
  const total = await findMeetingPoint(people, { travelTimes, rule: 'total' });
  assert.ok(total.meet.lon < fair.meet.lon - 0.02, 'total stays near the three friends');
  const sum = total.times.reduce((a, b) => a + b, 0);
  assert.ok(sum <= bruteForce(people, 'total') * 1.03);
});

test('public transport riders: the best spots are checked against real timetables', async () => {
  const people = [{ ...london[0], mode: 'transit' }, { ...london[1], mode: 'transit' }, london[2]];
  const { travelTimes, calls } = fakeRouter();
  const asked = [];
  const directions = async (mode, from, to) => { asked.push({ mode, to }); return { duration: 900 + asked.length }; };
  const r = await findMeetingPoint(people, { travelTimes, directions });
  assert.ok(calls.length <= 4 && calls.every((c) => c.mode === 'walk' && c.n === 3), 'riders share the walking request');
  assert.ok(asked.length > 0 && asked.length <= 4, `${asked.length} timetable checks`);
  assert.ok(asked.every((a) => a.mode === 'transit'));
  assert.deepEqual(r.real, [true, true, true]);
  assert.ok(r.times[0] <= 904 && r.times[1] <= 904, 'uses the timetable answers');
});

test('without a routing service it still picks a sensible spot, marked as an estimate', async () => {
  const { travelTimes } = fakeRouter({ fail: ['walk'] });
  const r = await findMeetingPoint(london, { travelTimes });
  assert.equal(r.approx, true);
  assert.deepEqual(r.real, [false, false, false]);
  assert.ok(Math.max(...r.times) <= bruteForce(london) * 1.35);
});

test('the spot snapped onto a road by the routing service becomes the meeting point', async () => {
  const { travelTimes: base } = fakeRouter();
  const returned = new Set();
  const travelTimes = async (...a) => {
    const t = await base(...a);
    t.destinations = t.destinations.map(([lat, lon]) => [lat + 0.0001, lon]);
    for (const [lat, lon] of t.destinations) returned.add(`${lat},${lon}`);
    return t;
  };
  const r = await findMeetingPoint(london, { travelTimes });
  assert.ok(returned.has(`${r.meet.lat},${r.meet.lon}`));
});

test('someone the routing service cannot route from is estimated, not a dead end for the group', async () => {
  const { travelTimes: base } = fakeRouter();
  // The second person's streets don't join anyone else's: every time comes back empty.
  const travelTimes = async (mode, sources, destinations) => {
    const t = await base(mode, sources, destinations);
    const k = sources.findIndex((s) => s.lat === london[1].lat);
    if (k >= 0) { t.durations[k] = t.durations[k].map(() => null); t.distances[k] = t.distances[k].map(() => null); }
    return t;
  };
  const r = await findMeetingPoint(london, { travelTimes });
  assert.equal(r.approx, true, 'marked as an estimate');
  assert.ok(r.times.every((t) => Number.isFinite(t) && t > 0));
});

test('groups whose streets do not join at all still get a spot, marked as an estimate', async () => {
  const { travelTimes: base } = fakeRouter();
  // Each person can only reach spots on their own side of a line (like two islands).
  const travelTimes = async (mode, sources, destinations) => {
    const t = await base(mode, sources, destinations);
    sources.forEach((s, k) => destinations.forEach((d, j) => {
      if ((s.lon < -0.12) !== (d.lon < -0.12)) { t.durations[k][j] = null; t.distances[k][j] = null; }
    }));
    return t;
  };
  const r = await findMeetingPoint(london, { travelTimes });
  assert.equal(r.approx, true);
  assert.ok(Number.isFinite(r.meet.lat) && r.times.every(Number.isFinite));
});

test('spots the routing service could not place on a street never become a meeting point without a position', async () => {
  const { travelTimes: base } = fakeRouter();
  // Like the test version past the edge of its map: some spots come back unplaced
  // ([undefined, undefined] or null) and unreachable, and one person can reach nothing,
  // so estimates fill the gaps.
  const travelTimes = async (mode, sources, destinations) => {
    const t = await base(mode, sources, destinations);
    t.destinations = t.destinations.map((d, j) => (j % 3 === 0 ? [undefined, undefined] : j % 3 === 1 ? null : d));
    sources.forEach((s, k) => destinations.forEach((_, j) => {
      if (j % 3 !== 2 || s.lat === london[2].lat) { t.durations[k][j] = null; t.distances[k][j] = null; }
    }));
    return t;
  };
  for (let i = 0; i < 3; i++) {
    const r = await findMeetingPoint(london, { travelTimes });
    assert.ok(Number.isFinite(r.meet.lat) && Number.isFinite(r.meet.lon), `meeting point ${JSON.stringify(r.meet)}`);
  }
});

test('with exact travel times for the best spots, the final choice uses them', async () => {
  const { travelTimes } = fakeRouter();
  const asked = [];
  // The exact source says the first spot offered is much slower for the first person than estimated.
  const checkTimes = async (people, spots) => {
    asked.push(spots.length);
    return {
      durations: people.map((p, i) => spots.map((s, j) => secs(p, s, p.mode) * (i === 0 && j === 0 ? 3 : 1))),
      distances: people.map((p) => spots.map((s) => haversine(p.lat, p.lon, s.lat, s.lon) * ROAD)),
    };
  };
  const plain = await findMeetingPoint(london, { travelTimes });
  const r = await findMeetingPoint(london, { travelTimes, checkTimes });
  assert.deepEqual(asked, [3], 'three spots checked, once');
  assert.deepEqual(r.real, [true, true, true]);
  assert.equal(r.approx, false);
  assert.notDeepEqual(r.meet, plain.meet, 'moved off the spot that turned out slow');
  // When the exact source fails, the free estimates are used as before.
  const failing = await findMeetingPoint(london, { travelTimes, checkTimes: async () => { throw new Error('down'); } });
  assert.deepEqual(failing.meet, plain.meet);
});

test('public transport riders: the spot is picked among stops, by real times (a fast train line included)', async () => {
  // Three riders. Stops every ~250 m; buses at 4 m/s, except a fast train line
  // along latitude 51.50 that gets the first rider east at 15 m/s.
  const riders = [{ lat: 51.50, lon: -0.20, mode: 'transit' }, { lat: 51.53, lon: -0.10, mode: 'transit' }, { lat: 51.47, lon: -0.10, mode: 'transit' }];
  const asked = [], stopsGiven = [];
  const transitReach = async (p, { box, max, time }) => {
    asked.push({ max, time });
    const cells = [];
    for (let lat = box.s; lat <= box.n; lat += 0.00225) {
      for (let lon = box.w; lon <= box.e; lon += 0.0036) {
        const onLine = Math.abs(lat - 51.50) < 0.0012 && p === riders[0];
        const sec = onLine ? 300 + haversine(p.lat, p.lon, lat, lon) / 15 : 300 + (haversine(p.lat, p.lon, lat, lon) * 1.3) / 4;
        if (sec / 60 <= max) cells.push([lat, lon, Math.round(sec / 60), onLine ? 900 : 5]);
      }
    }
    stopsGiven.push(...cells);
    return { cells };
  };
  const { travelTimes } = fakeRouter();
  const r = await findMeetingPoint(riders, { travelTimes, transitReach, time: '2026-11-14T09:00:00Z' });
  assert.equal(asked.length, 3, 'one request per rider');
  assert.ok(asked.every((a) => a.time === '2026-11-14T09:00:00Z'));
  assert.deepEqual(r.real, [true, true, true]);
  // The two riders by bus need 23 min at best; nobody's trip is much longer than that.
  assert.ok(Math.max(...r.times) <= 26 * 60, `longest trip ${Math.round(Math.max(...r.times) / 60)} min: ${r.times.map((t) => Math.round(t / 60))}`);
  assert.ok(stopsGiven.some(([lat, lon]) => lat === r.meet.lat && lon === r.meet.lon), 'the meeting point is one of the stops');
  // A walker in the group: real walking times to the most promising stops.
  const mixed = await findMeetingPoint([...riders.slice(0, 2), { lat: 51.47, lon: -0.10, mode: 'walk' }], { travelTimes, transitReach });
  assert.ok(Number.isFinite(mixed.times[2]) && mixed.times[2] > 0);
  // No public transport data: the old way (estimates and timetable checks).
  const fallback = await findMeetingPoint(riders, { travelTimes, transitReach: async () => { throw new Error('down'); } });
  assert.ok(Number.isFinite(fallback.meet.lat));
});
