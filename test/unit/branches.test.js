// Extra routes for the meeting-point animation: where to route through, and
// which routes are worth showing (heading to the meeting point, not much
// slower, not a copy of another).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { haversine } from '../../public/js/geo.js';
import { normalizeOsrm } from '../../public/js/directions.js';
import { viaPoints, headsTowards, overlapShare, pickBranches } from '../../public/js/branches.js';

const from = { lat: 51.5072, lon: -0.1276 };
const to = { lat: 51.5155, lon: -0.0877 };
const real = normalizeOsrm(JSON.parse(fs.readFileSync(new URL('../fixtures/osrm-route-alternatives.json', import.meta.url), 'utf8')), 'walk');

test('route-through points sit on both sides of the way there, closer to the meeting point', () => {
  const vias = viaPoints(from, to);
  assert.equal(vias.length, 4);
  const L = haversine(from.lat, from.lon, to.lat, to.lon);
  for (const v of vias) {
    assert.ok(haversine(v.lat, v.lon, to.lat, to.lon) < L * 0.8, 'nearer the meeting point than the start is');
    const side = haversine(v.lat, v.lon, from.lat, from.lon);
    assert.ok(side > L * 0.3 && side < L * 0.75);
  }
  // Two to the left and two to the right of the line.
  const cross = (v) => (to.lon - from.lon) * (v.lat - from.lat) - (to.lat - from.lat) * (v.lon - from.lon);
  assert.equal(vias.filter((v) => cross(v) > 0).length, 2);
  assert.deepEqual(viaPoints(from, { lat: 51.5075, lon: -0.1270 }), [], 'none for a short walk');
});

test('a route that doubles back is not "heading towards" the meeting point', () => {
  assert.ok(headsTowards(real.geometry, to), 'the real best route does');
  const back = [[from.lat, from.lon], [from.lat, from.lon - 0.02], [to.lat, to.lon]]; // 1.4 km the wrong way first
  assert.equal(headsTowards(back, to), false);
  const wobble = [[from.lat, from.lon], [from.lat + 0.0005, from.lon - 0.0005], [to.lat, to.lon]]; // a few metres sideways
  assert.ok(headsTowards(wobble, to));
});

test('overlap: a route is all shared with itself and little with a parallel street 300 m away', () => {
  assert.equal(overlapShare(real.geometry, real.geometry), 1);
  const shifted = real.geometry.map(([lat, lon]) => [lat + 0.0027, lon]);
  assert.ok(overlapShare(real.geometry, shifted) < 0.1);
});

test('branches: best first, copies and slow or backtracking routes left out', () => {
  const main = { geometry: real.geometry, duration: real.duration };
  const alt = { geometry: real.alternatives[0].geometry, duration: real.alternatives[0].duration };
  const copy = { geometry: real.geometry.map(([a, b]) => [a + 0.00002, b]), duration: real.duration + 30 };
  const slow = { geometry: real.alternatives[0].geometry.map(([a, b]) => [a - 0.003, b]), duration: real.duration * 2 };
  const back = { geometry: [[from.lat, from.lon], [from.lat, from.lon - 0.02], [to.lat, to.lon]], duration: real.duration * 1.1 };
  const kept = pickBranches(main, [copy, slow, back, alt], { target: to });
  assert.equal(kept[0], main);
  assert.ok(!kept.includes(copy), 'near-copy left out');
  assert.ok(!kept.includes(slow), 'much slower left out');
  assert.ok(!kept.includes(back), 'backtracking left out');
  assert.ok(overlapShare(alt.geometry, main.geometry) < 0.8 ? kept.includes(alt) : true);
});
