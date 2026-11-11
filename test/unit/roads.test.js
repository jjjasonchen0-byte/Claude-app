// Reading streets out of the base map's vector tiles and joining them up.
import test from 'node:test';
import assert from 'node:assert/strict';
import { VectorTile } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';
import { readLayerLines } from '../../public/js/mvt.js';
import { buildNetwork, tilesFor } from '../../public/js/roads.js';
import { encodeTile } from '../helpers/mvt-encode.mjs';

const streets = {
  transportation: [
    { props: { class: 'minor', brunnel: 'bridge' }, lines: [[[100, 100], [900, 120], [1500, 2000]]] },
    { props: { class: 'primary' }, lines: [[[0, 4000], [4096, 4000]], [[10, 10], [20, 30]]] },
    { props: { class: 'rail' }, lines: [[[5, 5], [400, 400]]] },
  ],
  water: [{ props: { class: 'lake' }, type: 3, lines: [[[0, 0], [10, 0], [10, 10]]] }],
};

test('reads the lines and their properties from a tile, as the reference library does', () => {
  const bytes = encodeTile(streets);
  const { extent, features } = readLayerLines(bytes, 'transportation');
  assert.equal(extent, 4096);
  assert.equal(features.length, 3);
  assert.deepEqual(features[0].props, { class: 'minor', brunnel: 'bridge' });
  assert.deepEqual(features[0].lines, [[[100, 100], [900, 120], [1500, 2000]]]);
  assert.equal(features[1].lines.length, 2, 'a feature with two lines');
  const ref = new VectorTile(new PbfReader(bytes)).layers.transportation;
  for (let i = 0; i < ref.length; i++) {
    assert.deepEqual(features[i].lines, ref.feature(i).loadGeometry().map((l) => l.map((p) => [p.x, p.y])));
  }
  assert.equal(readLayerLines(bytes, 'nope').features.length, 0);
  assert.equal(readLayerLines(bytes, 'water').features.length, 0, 'areas are not lines');
});

const tileAt = (x, layers) => ({ z: 13, x, y: 4000, extent: 4096, ...readLayerLines(encodeTile(layers), 'transportation') });

/** Connected groups of nodes in a network. */
function components(net) {
  const up = Int32Array.from({ length: net.lat.length }, (_, i) => i);
  const find = (i) => { while (up[i] !== i) i = up[i] = up[up[i]]; return i; };
  for (let k = 0; k < net.A.length; k++) up[find(net.A[k])] = find(net.B[k]);
  return new Set([...net.A, ...net.B].map(find)).size;
}

test('a street running across two tiles is one street: cut at the edge and joined there', () => {
  // The tiles overlap a little (their buffer); each keeps only its own square.
  const a = tileAt(7000, { transportation: [{ props: { class: 'secondary' }, lines: [[[3000, 2000], [4200, 2000]]] }] });
  const b = tileAt(7001, { transportation: [{ props: { class: 'secondary' }, lines: [[[-104, 2000], [1000, 2000]]] }] });
  const net = buildNetwork([a, b]);
  assert.equal(net.A.length, 2, 'two pieces, no overlapping copies');
  assert.equal(components(net), 1);
  assert.equal(net.kinds[0], 3, 'secondary');
  // Positions: zoom 13 tile 7000 is at longitude 127.6°.
  for (const lon of net.lon) assert.ok(lon > 127.5 && lon < 127.75);
});

test('ends that miss each other by a unit or two at a tile edge are joined up', () => {
  const a = tileAt(7000, { transportation: [{ props: { class: 'minor' }, lines: [[[3000, 2000], [4096, 2001]]] }] });
  const b = tileAt(7001, { transportation: [{ props: { class: 'minor' }, lines: [[[0, 2003], [1000, 2003]]] }] });
  assert.equal(components(buildNetwork([a, b])), 1);
});

test('railways and paths are left out; areas outside the bounds are dropped', () => {
  const t = tileAt(7000, { transportation: [
    { props: { class: 'rail' }, lines: [[[0, 0], [100, 100]]] },
    { props: { class: 'path' }, lines: [[[0, 0], [100, 0]]] },
    { props: { class: 'motorway', brunnel: 'tunnel' }, lines: [[[200, 200], [300, 200]]] },
  ] });
  const net = buildNetwork([t]);
  assert.equal(net.A.length, 1);
  assert.equal(net.kinds[0], 16, 'a motorway (0) in a tunnel (16)');
  const far = buildNetwork([t], { s: 0, n: 1, w: 0, e: 1 });
  assert.equal(far.A.length, 0);
});

test('picks the most detailed tiles that keep the download small', () => {
  const small = tilesFor({ s: -33.90, n: -33.88, w: 151.19, e: 151.21 });
  assert.equal(small[0].z, 13);
  assert.ok(small.length <= 4);
  const city = tilesFor({ s: -34.0, n: -33.75, w: 151.0, e: 151.3 });
  assert.ok(city.length <= 9 && city[0].z < 13, `${city.length} tiles at zoom ${city[0].z}`);
});

test('streets that cross without a shared corner are joined where they cross; bridges are not', () => {
  const t = tileAt(7000, { transportation: [
    { props: { class: 'minor' }, lines: [[[100, 500], [900, 500]]] },
    { props: { class: 'minor' }, lines: [[[500, 100], [500, 900]]] },
    // A side street ending on the first street, between its corners.
    { props: { class: 'service' }, lines: [[[300, 800], [300, 501]]] },
    // A motorway bridge over everything.
    { props: { class: 'motorway', brunnel: 'bridge' }, lines: [[[50, 50], [950, 950]]] },
  ] });
  const net = buildNetwork([t]);
  // The crossing splits both streets in two; the side street splits the first again.
  assert.equal(net.kinds.filter((k) => k === 5).length, 5);
  assert.equal(net.kinds.filter((k) => k === 6).length, 1);
  assert.equal(net.kinds.filter((k) => k === 8).length, 1, 'the bridge is in one piece');
  assert.equal(components(net), 2, 'the streets join up; the bridge is apart');
});
