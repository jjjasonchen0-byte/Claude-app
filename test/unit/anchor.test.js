// Moving the meeting point to somewhere a group can actually meet.
import test from 'node:test';
import assert from 'node:assert/strict';
import { pickAnchor } from '../../public/js/anchor.js';

const spot = { lat: -33.8975, lon: 151.1790 };
const at = (dLat, dLon, extra = {}) => ({ lat: spot.lat + dLat, lon: spot.lon + dLon, tab: 'food', name: 'Place', ...extra });

test('moves to a place close by, preferring one with others around it', () => {
  const lone = at(0.0005, 0, { name: 'Lone café' }); // ~55 m
  // A street of six cafés about 200 m away, all within a short walk of each other.
  const strip = [0, 0.0003, -0.0003, 0.0006, -0.0006, 0.0002].map((dLon, i) => at(0.0018 + (i % 2) * 0.0001, dLon, { name: `Strip ${i + 1}` }));
  assert.match(pickAnchor(spot, [lone, ...strip]).name, /^Strip/, 'a street of cafés beats a lone one 150 m nearer');
  assert.equal(pickAnchor(spot, [lone]).name, 'Lone café');
});

test('only places people meet at, and only close by', () => {
  assert.equal(pickAnchor(spot, [at(0.0003, 0, { tab: 'other' })]), null);
  assert.equal(pickAnchor(spot, [at(0.01, 0)]), null, 'over a kilometre away');
  assert.equal(pickAnchor(spot, []), null);
  assert.equal(pickAnchor(spot, [at(0.0003, 0, { tab: 'outdoors', name: 'Park' })]).name, 'Park');
});
