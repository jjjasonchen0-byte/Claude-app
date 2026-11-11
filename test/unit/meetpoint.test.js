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

test('three walkers meet where the longest walk is as short as possible', async () => {
  const { travelTimes, calls } = fakeRouter();
  const r = await findMeetingPoint(london, { travelTimes });
  const opt = bruteForce(london);
  const got = Math.max(...r.times);
  assert.ok(got <= opt * 1.03, `longest trip ${got.toFixed(0)} s vs best ${opt.toFixed(0)} s`);
  assert.ok(Math.max(...r.times) - Math.min(...r.times) < 0.15 * got, 'trips are balanced');
  assert.equal(r.approx, false);
  assert.ok(calls.length <= 4, `only ${calls.length} small requests`);
  assert.ok(calls.every((c) => c.m <= 80));
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

test('"least total travel" sides with the group, "fairest" with the one far away', async () => {
  const people = [
    { lat: 51.50, lon: -0.10, mode: 'walk' }, { lat: 51.501, lon: -0.101, mode: 'walk' },
    { lat: 51.502, lon: -0.099, mode: 'walk' }, { lat: 51.50, lon: -0.02, mode: 'walk' },
  ];
  const { travelTimes } = fakeRouter();
  const fair = await findMeetingPoint(people, { travelTimes, rule: 'fair' });
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
  assert.ok(Math.max(...r.times) <= bruteForce(london) * 1.15);
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
