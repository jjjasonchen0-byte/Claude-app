// Matching an OpenStreetMap place to a listing elsewhere (names + distance).
import test from 'node:test';
import assert from 'node:assert/strict';
import { nameSimilarity, bestMatch } from '../../public/js/match.js';

test('names that mean the same place match', () => {
  assert.ok(nameSimilarity("Luigi's", 'Luigis Restaurant') >= 0.9);
  assert.ok(nameSimilarity('Café Nero', 'Caffe Nero') >= 0.72);
  assert.ok(nameSimilarity('The Marquis of Granby', 'Marquis Of Granby') >= 0.9);
  assert.ok(nameSimilarity('Dishoom Covent Garden', 'Dishoom') >= 0.9);
  assert.ok(nameSimilarity('Sakura Sushi', 'Burger Barn') < 0.3);
  assert.equal(nameSimilarity('The Bar', 'the bar'), 1);
});

test('the nearest listing with a similar name wins; far or different ones do not', () => {
  const place = { name: 'Trattoria Roma', lat: 51.5, lon: -0.1 };
  const near = { id: 1, name: 'Trattoria Roma', lat: 51.5003, lon: -0.1 };
  const other = { id: 2, name: 'Pizza Express', lat: 51.5001, lon: -0.1 };
  const far = { id: 3, name: 'Trattoria Roma', lat: 51.51, lon: -0.1 };
  assert.equal(bestMatch(place, [other, far, near]).id, 1);
  assert.equal(bestMatch(place, [other, far]), null);
});
