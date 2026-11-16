// The search animation's floods: shortest-path searches over the streets,
// timed at each person's speed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareNetwork, simplifyNetwork, floodFrom, roadsBy, nearestNode, costTable, reachTime, ownership } from '../../public/js/flood.js';
import { SPEEDS } from '../../public/js/meetpoint.js';
import { haversine } from '../../public/js/geo.js';

/** A street grid, size × size corners about 100 m apart; `kindOf(i, j, across)` picks each street's kind. */
function gridTown(size = 15, kindOf = () => 5) {
  const lat = [], lon = [], A = [], B = [], kinds = [];
  const id = (i, j) => i * size + j;
  for (let i = 0; i < size; i++) for (let j = 0; j < size; j++) { lat.push(51.5 + i * 0.0009); lon.push(-0.1 + j * 0.00145); }
  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      if (j + 1 < size) { A.push(id(i, j)); B.push(id(i, j + 1)); kinds.push(kindOf(i, j, true)); }
      if (i + 1 < size) { A.push(id(i, j)); B.push(id(i + 1, j)); kinds.push(kindOf(i, j, false)); }
    }
  }
  return { lat: Float64Array.from(lat), lon: Float64Array.from(lon), A: Int32Array.from(A), B: Int32Array.from(B), kinds: Uint8Array.from(kinds) };
}

test('a flood reaches corners at walking speed along the streets', () => {
  const net = prepareNetwork(gridTown());
  const p = { lat: net.lat[0], lon: net.lon[0], mode: 'walk' };
  const fl = floodFrom(net, p);
  assert.equal(fl.start, 0);
  const far = net.lat.length - 1;
  // Corner to corner along the grid (an L shape: 14 blocks each way).
  const along = haversine(net.lat[0], net.lon[0], net.lat[14 * 15], net.lon[14 * 15]) + haversine(net.lat[14 * 15], net.lon[14 * 15], net.lat[far], net.lon[far]);
  assert.ok(Math.abs(fl.at(far) - along / SPEEDS.walk) < 2, `${fl.at(far)} s`);
});

test('every street is covered exactly once, each piece growing forwards in time', () => {
  const net = prepareNetwork(gridTown());
  const fl = floodFrom(net, { lat: 51.5041, lon: -0.093, mode: 'bike' });
  const cover = new Float64Array(net.m);
  for (let q = 0; q < fl.count; q++) {
    assert.ok(fl.t1[q] >= fl.t0[q]);
    cover[fl.edge[q]] += fl.frac[q];
  }
  for (let k = 0; k < net.m; k++) assert.ok(Math.abs(cover[k] - 1) < 1e-4, `street ${k} covered ${cover[k]}`);
  // Sorted for drawing.
  for (let j = 1; j < fl.count; j++) assert.ok(fl.t1[fl.byEnd[j]] >= fl.t1[fl.byEnd[j - 1]]);
  for (let j = 1; j < fl.count; j++) assert.ok(fl.t0[fl.byStart[j]] >= fl.t0[fl.byStart[j - 1]]);
});

test('the roads counter counts stretches between junctions and grows to all of them', () => {
  // A straight street of five pieces with no side streets is one road.
  const line = { lat: Float64Array.from([0, 0, 0, 0, 0, 0].map((_, i) => 51.5)), lon: Float64Array.from([0, 1, 2, 3, 4, 5].map((i) => -0.1 + i * 0.001)), A: Int32Array.from([0, 1, 2, 3, 4]), B: Int32Array.from([1, 2, 3, 4, 5]), kinds: Uint8Array.from([5, 5, 5, 5, 5]) };
  assert.equal(prepareNetwork(line).chains, 1);
  const net = prepareNetwork(gridTown());
  // In a grid every block is its own road, except round the four outer corners (a bend, not a junction).
  assert.equal(net.chains, net.m - 4);
  const fl = floodFrom(net, { lat: net.lat[0], lon: net.lon[0], mode: 'walk' });
  assert.equal(roadsBy(fl, -1), 0);
  assert.equal(roadsBy(fl, Infinity), net.chains);
  assert.ok(roadsBy(fl, 300) > 0 && roadsBy(fl, 300) < net.m);
});

test('walkers keep out of road tunnels; drivers are quicker on motorways', () => {
  // The middle row of streets is a motorway, the row above it a road tunnel.
  const TUNNEL = 16;
  const net = prepareNetwork(gridTown(15, (i, j, across) => (across && i === 7 ? 0 : across && i === 8 ? 5 | TUNNEL : 5)));
  const walk = costTable('walk'), drive = costTable('drive');
  assert.equal(walk[5 | TUNNEL], Infinity);
  assert.ok(Number.isFinite(walk[0]), 'motorways stay open (the map has no footpaths beside them)');
  assert.ok(drive[0] < drive[5]);
  const a = { lat: net.lat[7 * 15], lon: net.lon[7 * 15] };
  const end = 7 * 15 + 14;
  const walker = floodFrom(net, { ...a, mode: 'walk' }), driver = floodFrom(net, { ...a, mode: 'drive' });
  const pieceOn = (fl, k) => [...fl.edge.subarray(0, fl.count)].includes(k);
  const tunnel = [...net.kinds].indexOf(5 | TUNNEL);
  assert.ok(!pieceOn(walker, tunnel), 'no walking through the tunnel');
  assert.ok(pieceOn(driver, tunnel));
  assert.ok(driver.at(end) < walker.at(end) / 8);
});

test('two walkers\' floods meet half way; a driver\'s meets a walker\'s near the walker', () => {
  const net = prepareNetwork(gridTown());
  const a = { lat: net.lat[7 * 15], lon: net.lon[7 * 15] }, b = { lat: net.lat[7 * 15 + 14], lon: net.lon[7 * 15 + 14] };
  const meetCol = (pa, pb) => {
    const fa = floodFrom(net, pa), fb = floodFrom(net, pb);
    let best = -1, bd = Infinity;
    for (let j = 0; j < 15; j++) { const d = Math.abs(fa.at(7 * 15 + j) - fb.at(7 * 15 + j)); if (d < bd) { bd = d; best = j; } }
    return best;
  };
  assert.equal(meetCol({ ...a, mode: 'walk' }, { ...b, mode: 'walk' }), 7);
  assert.ok(meetCol({ ...a, mode: 'walk' }, { ...b, mode: 'drive' }) <= 2);
});

test('people off the streets start from the nearest corner, and a flood runs until it has reached everyone', () => {
  const net = prepareNetwork(gridTown());
  assert.equal(nearestNode(net, 51.5 + 0.0001, -0.1 + 0.0002, costTable('walk')), 0);
  assert.equal(nearestNode(net, 10, 10, costTable('walk')), -1, 'nowhere near');
  const me = { lat: net.lat[0], lon: net.lon[0], mode: 'walk' };
  const fl = floodFrom(net, me);
  const friend = { lat: net.lat[224], lon: net.lon[224] };
  assert.ok(reachTime(net, fl, [friend]) >= fl.at(224));
  assert.equal(floodFrom(net, { lat: 10, lon: 10, mode: 'walk' }), null);
});

test('all at once, each street belongs to whoever gets there first', () => {
  const net = prepareNetwork(gridTown());
  const a = floodFrom(net, { lat: net.lat[7 * 15], lon: net.lon[7 * 15], mode: 'walk' });
  const b = floodFrom(net, { lat: net.lat[7 * 15 + 14], lon: net.lon[7 * 15 + 14], mode: 'walk' });
  const owner = ownership(net, [[0, a], [1, b]]);
  assert.ok(owner.every((o) => o === 0 || o === 1));
  for (let k = 0; k < net.m; k++) {
    const mid = (net.lon[net.A[k]] + net.lon[net.B[k]]) / 2 - net.lon[0];
    if (mid < 0.006) assert.equal(owner[k], 0, 'west side');
    if (mid > 0.00145 * 14 - 0.006) assert.equal(owner[k], 1, "east side");
  }
});

/** A street through these points ([lat, lon]), one piece between each two, all of one kind unless `kinds` says. */
function street(points, kinds = null) {
  const n = points.length;
  return {
    lat: Float64Array.from(points, (p) => p[0]), lon: Float64Array.from(points, (p) => p[1]),
    A: Int32Array.from({ length: n - 1 }, (_, i) => i), B: Int32Array.from({ length: n - 1 }, (_, i) => i + 1),
    kinds: Uint8Array.from({ length: n - 1 }, (_, i) => (kinds ? kinds[i] : 5)),
  };
}
const total = (net) => net.len.reduce((a, b) => a + b, 0);
const PX = 1 / 2 ** 15; // one screen pixel at zoom 15, in the network's map units

test('fewer pieces: a straight street with no side streets becomes one piece, as long as before', () => {
  const net = prepareNetwork(street([0, 1, 2, 3, 4, 5].map((i) => [51.5, -0.1 + i * 0.0005])));
  const s = simplifyNetwork(net, { tolerance: 0.5 * PX });
  assert.equal(s.m, 1);
  assert.deepEqual([s.A[0], s.B[0]].sort(), [0, 5]);
  assert.ok(Math.abs(total(s) - total(net)) < 1e-3);
  assert.equal(s.chains, 1);
});

test('fewer pieces: a corner stays, a wiggle smaller than the tolerance goes, and kinds are not mixed', () => {
  // East, a 2 cm wiggle, east again, then a right-angled turn north.
  const pts = [[51.5, -0.1], [51.5, -0.0995], [51.5000002, -0.099], [51.5, -0.0985], [51.5, -0.098], [51.5005, -0.098], [51.501, -0.098]];
  const net = prepareNetwork(street(pts));
  const s = simplifyNetwork(net, { tolerance: 0.5 * PX });
  assert.equal(s.m, 2, 'one piece each side of the corner');
  assert.ok([...s.A, ...s.B].includes(4), 'the corner stays');
  assert.ok(Math.abs(total(s) - total(net)) < 1e-3, 'lengths along the street are kept');
  // The same street with a motorway stretch in the middle keeps the corners where the kind changes.
  const mixed = simplifyNetwork(prepareNetwork(street(pts, [5, 5, 0, 0, 5, 5])), { tolerance: 0.5 * PX });
  for (const k of [2, 4]) assert.ok([...mixed.A, ...mixed.B].includes(k), `corner ${k} stays`);
  assert.deepEqual([...new Set(mixed.kinds)].sort(), [0, 5]);
});

test('fewer pieces: no piece longer than maxLength, and a ring of street with no junction survives', () => {
  const line = prepareNetwork(street(Array.from({ length: 41 }, (_, i) => [51.5, -0.1 + i * 0.0001])));
  const s = simplifyNetwork(line, { tolerance: 0.5 * PX, maxLength: 20 * PX });
  for (let k = 0; k < s.m; k++) assert.ok(Math.hypot(s.nx[s.B[k]] - s.nx[s.A[k]], s.ny[s.B[k]] - s.ny[s.A[k]]) <= 20 * PX + 1e-12);
  assert.ok(s.m > 1 && s.m < line.m);
  // A square ring: four corners, each a bend.
  const ring = { lat: Float64Array.from([51.5, 51.5, 51.501, 51.501]), lon: Float64Array.from([-0.1, -0.099, -0.099, -0.1]), A: Int32Array.from([0, 1, 2, 3]), B: Int32Array.from([1, 2, 3, 0]), kinds: Uint8Array.from([5, 5, 5, 5]) };
  const r = simplifyNetwork(prepareNetwork(ring), { tolerance: 0.5 * PX });
  assert.equal(r.m, 4);
  assert.ok(Math.abs(total(r) - total(prepareNetwork(ring))) < 1e-3);
});

test('fewer pieces: floods reach the corners that stay at the same times as before', () => {
  // A grid whose blocks have extra points along them (as map data has).
  const size = 9, lat = [], lon = [], A = [], B = [], kinds = [];
  const id = (i, j) => i * size + j;
  for (let i = 0; i < size; i++) for (let j = 0; j < size; j++) { lat.push(51.5 + i * 0.0009); lon.push(-0.1 + j * 0.00145); }
  const mid = (a, b) => { lat.push((lat[a] + lat[b]) / 2 + 0.00001); lon.push((lon[a] + lon[b]) / 2); return lat.length - 1; };
  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      for (const [a, b] of [[id(i, j), j + 1 < size ? id(i, j + 1) : -1], [id(i, j), i + 1 < size ? id(i + 1, j) : -1]]) {
        if (b < 0) continue;
        const m = mid(a, b);
        A.push(a, m); B.push(m, b); kinds.push(5, 5);
      }
    }
  }
  const net = prepareNetwork({ lat: Float64Array.from(lat), lon: Float64Array.from(lon), A: Int32Array.from(A), B: Int32Array.from(B), kinds: Uint8Array.from(kinds) });
  const s = simplifyNetwork(net, { tolerance: 0.5 * PX });
  assert.ok(s.m < net.m * 0.6, `${s.m} pieces of ${net.m}`);
  const who = { lat: lat[id(4, 4)], lon: lon[id(4, 4)], mode: 'walk' };
  const before = floodFrom(net, who), after = floodFrom(s, who);
  for (let i = 0; i < size; i++) for (let j = 0; j < size; j++) assert.ok(Math.abs(before.at(id(i, j)) - after.at(id(i, j))) < 1e-3);
});
