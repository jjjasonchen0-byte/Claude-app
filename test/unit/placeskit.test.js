// Google's place card: finding the place for free, and checking it's the same one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { findPlaceId, samePlace, placeIdFor, rowPhoto } from '../../public/js/placeskit.js';

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

test('Google\'s card brings its place\'s position but not its name: then the position decides', () => {
  const at = (lat, lng) => ({ lat: () => lat, lng: () => lng });
  // As the card loads it: an ID and a position, no name.
  assert.equal(samePlace(flour, { id: 'ChIJabc', displayName: null, location: at(-33.8723, 151.2191) }), true, 'about 15 m apart');
  assert.equal(samePlace(flour, { id: 'ChIJabc', location: at(-33.8728, 151.2192) }), true, 'about 70 m apart');
  assert.equal(samePlace(flour, { id: 'ChIJabc', location: at(-33.8735, 151.2190) }), false, 'about 145 m apart: another place');
  assert.equal(samePlace(flour, { id: 'ChIJabc', displayName: null, location: null }), false, 'no position at all');
  // A name in Google's newer form ({ text }) counts as a name.
  assert.equal(samePlace(flour, { displayName: { text: 'Bills Darlinghurst' }, location: at(-33.8723, 151.2191) }), false);
});

/** A stand-in for Google's places library: one place, at `where`, with these photos and types. */
function fakeGoogle({ id = 'ChIJabc', where = [-33.8723, 151.2191], photos = [], types = [] } = {}) {
  const calls = { searches: 0, fields: [] };
  class Place {
    constructor({ id: pid }) { this.id = pid; }
    static async searchByText() { calls.searches++; return { places: id ? [{ id }] : [] }; }
    async fetchFields({ fields }) {
      calls.fields.push(fields);
      this.location = { lat: () => where[0], lng: () => where[1] };
      this.photos = photos;
      this.types = types;
    }
  }
  return { calls, maps: { importLibrary: async () => ({ Place }) } };
}
const photo = (url, by) => ({ getURI: ({ maxWidth }) => `${url}?w=${maxWidth}`, authorAttributions: [{ displayName: by }] });

test('a photo for a place in a list: its first photo, who took it, and what kinds of place it is', async () => {
  const g = fakeGoogle({ photos: [photo('https://photos.example/a', 'Sam Lee'), photo('https://photos.example/b', 'Jo')], types: ['bakery', 'cafe', 'food'] });
  const p = { ...flour, id: 'node/1' };
  const got = await rowPhoto(p, { maps: g.maps });
  assert.deepEqual(got, { url: 'https://photos.example/a?w=240', by: 'Sam Lee', types: ['bakery', 'cafe', 'food'] });
  // Only the fields that cost least: the place's position (to check it's the same place), photos and kinds.
  assert.deepEqual(g.calls.fields, [['location', 'photos', 'types']]);
  // Google's ID is looked for once a visit, for the list and the place's card alike.
  assert.equal(await placeIdFor(p, g.maps), 'ChIJabc');
  assert.equal(g.calls.searches, 1);
});

test('no list photo when Google has no such place there, or no photos of it', async () => {
  const elsewhere = fakeGoogle({ where: [-33.89, 151.25], photos: [photo('https://photos.example/x', 'X')] });
  assert.equal(await rowPhoto({ ...flour, id: 'node/2' }, { maps: elsewhere.maps }), null, 'a place of that name somewhere else');
  const missing = fakeGoogle({ id: null });
  assert.equal(await rowPhoto({ ...flour, id: 'node/3' }, { maps: missing.maps }), null);
  const bare = fakeGoogle({ types: ['restaurant'] });
  assert.deepEqual(await rowPhoto({ ...flour, id: 'node/4' }, { maps: bare.maps }), { url: null, by: '', types: ['restaurant'] });
});
