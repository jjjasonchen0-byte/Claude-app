// Google's place card: finding the place for free, and checking it's the same one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { findPlaceId, samePlace } from '../../public/js/placeskit.js';

const flour = { name: 'Flour and Stone', lat: -33.8722, lon: 151.2190 };

test('finds the place by name close to it, asking Google for IDs only (free)', async () => {
  let asked = null;
  const maps = { importLibrary: async () => ({ Place: { searchByText: async (req) => { asked = req; return { places: [{ id: 'ChIJabc' }] }; } } }) };
  assert.equal(await findPlaceId(flour, maps), 'ChIJabc');
  assert.deepEqual(asked.fields, ['id']);
  assert.equal(asked.textQuery, 'Flour and Stone');
  assert.ok(asked.locationRestriction.north - asked.locationRestriction.south < 0.004, 'within a few hundred metres');
  const none = { importLibrary: async () => ({ Place: { searchByText: async () => ({ places: [] }) } }) };
  assert.equal(await findPlaceId(flour, none), null);
});

test('the card is used only if Google loaded the same place', () => {
  const at = (lat, lng) => ({ lat: () => lat, lng: () => lng });
  assert.equal(samePlace(flour, { displayName: 'Flour and Stone Bakery', location: at(-33.8723, 151.2191) }), true);
  assert.equal(samePlace(flour, { displayName: 'Bills Darlinghurst', location: at(-33.8723, 151.2191) }), false, 'another name');
  assert.equal(samePlace(flour, { displayName: 'Flour and Stone', location: at(-33.89, 151.25) }), false, 'somewhere else');
  assert.equal(samePlace(flour, null), false);
});
