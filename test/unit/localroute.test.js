// Travel times worked out in the browser over the map's streets (localroute.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalRouter, MODELS } from '../../public/js/localroute.js';
import { haversine } from '../../public/js/geo.js';

/**
 * A street grid: `n` × `n` corners `step` degrees apart around (lat0, lon0),
 * all minor streets (kind 5), with a main road (kind 2) along the middle row.
 * `extra` adds streets: [[i1, j1, i2, j2, kind]].
 */
function grid({ n = 21, step = 0.002, lat0 = -33.88, lon0 = 151.2, extra = [] } = {}) {
  const lat = [], lon = [], A = [], B = [], kinds = [];
  const id = (i, j) => i * n + j;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { lat.push(lat0 + (i - (n - 1) / 2) * step); lon.push(lon0 + (j - (n - 1) / 2) * step); }
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    if (j + 1 < n) { A.push(id(i, j)); B.push(id(i, j + 1)); kinds.push(i === (n - 1) / 2 ? 2 : 5); }
    if (i + 1 < n) { A.push(id(i, j)); B.push(id(i + 1, j)); kinds.push(5); }
  }
  for (const [i1, j1, i2, j2, kind] of extra) { A.push(id(i1, j1)); B.push(id(i2, j2)); kinds.push(kind); }
  return { roads: { lat: Float64Array.from(lat), lon: Float64Array.from(lon), A: Int32Array.from(A), B: Int32Array.from(B), kinds: Uint8Array.from(kinds) }, at: (i, j) => ({ lat: lat[id(i, j)], lon: lon[id(i, j)] }) };
}

test('walking along a street takes its length at walking pace', async () => {
  const { roads, at } = grid();
  const r = createLocalRouter(roads);
  assert.equal(r.ok, true);
  const a = at(3, 2), b = at(3, 18); // along one street, 16 blocks
  const m = haversine(a.lat, a.lon, b.lat, b.lon);
  const t = await r.travelTimes('walk', [a], [b]);
  assert.ok(Math.abs(t.distances[0][0] - m) < 5, `${t.distances[0][0]} m for ${Math.round(m)} m`);
  assert.ok(Math.abs(t.durations[0][0] - m / (MODELS.walk.kmh[5] / 3.6)) < 3);
  assert.deepEqual(t.destinations[0], [b.lat, b.lon], 'the spot, on its street corner');
  // Corner to corner across the grid: the blocks either way (no going through them).
  const c = at(18, 18);
  const across = (await r.travelTimes('walk', [a], [c])).distances[0][0];
  const blocks = haversine(a.lat, a.lon, c.lat, a.lon) + haversine(c.lat, a.lon, c.lat, c.lon);
  assert.ok(Math.abs(across - blocks) < 10);
});

test('a door away from a corner: the way to the street counts too', async () => {
  const { roads, at } = grid();
  const r = createLocalRouter(roads);
  const corner = at(10, 10);
  const door = { lat: corner.lat + 0.0005, lon: corner.lon + 0.0004 }; // in the middle of a block
  const [toCorner, fromDoor] = await Promise.all([r.travelTimes('walk', [at(10, 2)], [corner]), r.travelTimes('walk', [at(10, 2)], [door])]);
  assert.ok(fromDoor.durations[0][0] > toCorner.durations[0][0]);
  assert.ok(fromDoor.durations[0][0] - toCorner.durations[0][0] < 120);
});

test('cycling is quicker than walking, and driving through junctions costs time', async () => {
  const { roads, at } = grid();
  const r = createLocalRouter(roads);
  const a = at(3, 2), b = at(3, 18);
  const [walk, bike, drive] = await Promise.all(['walk', 'bike', 'drive'].map((m) => r.travelTimes(m, [a], [b])));
  assert.ok(bike.durations[0][0] < walk.durations[0][0] / 2);
  assert.ok(drive.durations[0][0] < bike.durations[0][0]);
  // The 16 blocks pass 15 junctions: driving takes the junctions and a minute's start into account.
  const m = drive.distances[0][0];
  const bare = m / (MODELS.drive.kmh[5] / 3.6);
  assert.ok(drive.durations[0][0] >= bare + MODELS.drive.perTrip + 15 * MODELS.drive.perJunction - 2, `${drive.durations[0][0]} s for ${Math.round(bare)} s of road`);
  // A driver takes the main road when it is quicker, not the shortest way.
  const d = await r.directions('drive', at(9, 0), at(9, 20));
  const mainRow = at(10, 0).lat;
  assert.ok(d.geometry.some(([lat]) => Math.abs(lat - mainRow) < 1e-9), 'goes along the main road');
});

test('tunnels are for driving only; footpaths for walking and cycling only', async () => {
  // A tunnel (kind 5 + 16) straight across a gap that is otherwise a long way round.
  const n = 9;
  const lat = [], lon = [], A = [], B = [], kinds = [];
  for (let j = 0; j < n; j++) { lat.push(-33.88); lon.push(151.2 + j * 0.002); }
  for (let j = 0; j < n; j++) { lat.push(-33.86); lon.push(151.2 + j * 0.002); }
  for (let j = 0; j + 1 < n; j++) { A.push(j); B.push(j + 1); kinds.push(5); A.push(n + j); B.push(n + j + 1); kinds.push(5); }
  A.push(n - 1); B.push(2 * n - 1); kinds.push(5); // the long way round, at the far end
  A.push(0); B.push(n); kinds.push(5 | 16); // the tunnel
  const r = createLocalRouter({ lat: Float64Array.from(lat), lon: Float64Array.from(lon), A: Int32Array.from(A), B: Int32Array.from(B), kinds: Uint8Array.from(kinds) });
  const a = { lat: lat[0], lon: lon[0] }, b = { lat: lat[n], lon: lon[n] };
  const walk = await r.travelTimes('walk', [a], [b]);
  const drive = await r.travelTimes('drive', [a], [b]);
  assert.ok(walk.distances[0][0] > 3000, 'walking goes the long way round');
  assert.ok(drive.distances[0][0] < 3000, 'driving takes the tunnel');
});

test('places off the streets loaded, and public transport, are left to the routing services', async () => {
  const { roads, at } = grid();
  const r = createLocalRouter(roads);
  const far = { lat: -34.5, lon: 150.5 };
  assert.equal(r.covers(at(5, 5), 'drive'), true);
  assert.equal(r.covers(at(5, 5), 'transit'), true, 'a rider can walk from there');
  assert.equal(r.covers(far, 'walk'), false);
  const t = await r.travelTimes('walk', [at(5, 5), far], [at(6, 6), far]);
  assert.ok(t.durations[0][0] > 0);
  assert.equal(t.durations[0][1], null, 'a spot off the streets: no time');
  assert.deepEqual(t.durations[1], [null, null], 'someone off the streets: no times');
  assert.equal(t.destinations[1], null);
  await assert.rejects(r.directions('walk', at(5, 5), far), (e) => e.status === 404);
  await assert.rejects(r.travelTimes('transit', [at(5, 5)], [at(6, 6)]), (e) => e.status === 400);
  await assert.rejects(r.directions('transit', at(5, 5), at(6, 6)), (e) => e.status === 400);
  // No streets at all.
  const none = createLocalRouter(null);
  assert.equal(none.ok, false);
  assert.equal(none.covers(at(5, 5), 'walk'), false);
});

test('a route is a line along the streets, from near one door to near the other', async () => {
  const { roads, at } = grid();
  const r = createLocalRouter(roads);
  const from = at(2, 3), to = at(15, 17);
  const d = await r.directions('bike', from, to);
  assert.equal(d.provider, 'local');
  assert.deepEqual(d.geometry[0], [from.lat, from.lon]);
  assert.deepEqual(d.geometry.at(-1), [to.lat, to.lon]);
  assert.ok(d.geometry.length > 20);
  const t = await r.travelTimes('bike', [from], [to]);
  assert.equal(d.duration, t.durations[0][0]);
  assert.equal(d.distance, t.distances[0][0]);
});
