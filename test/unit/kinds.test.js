import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KIND_GLYPHS, groupIcon, placeIcon } from '../../public/js/kinds.js';
import { categorize } from '../../public/js/pois.js';

test('kinds: each kind of food and drink has a drawing of its own', () => {
  const icon = (tags) => { const c = categorize(tags); return groupIcon(c.tab, c.group); };
  assert.equal(icon({ amenity: 'restaurant' }), 'restaurant');
  assert.equal(icon({ amenity: 'restaurant', cuisine: 'italian' }), 'restaurant');
  assert.equal(icon({ amenity: 'fast_food' }), 'fries');
  assert.equal(icon({ amenity: 'fast_food', cuisine: 'burger' }), 'burger');
  assert.equal(icon({ amenity: 'restaurant', cuisine: 'pizza' }), 'pizza');
  assert.equal(icon({ shop: 'bakery' }), 'croissant');
  assert.equal(icon({ amenity: 'cafe' }), 'coffee');
  assert.equal(icon({ amenity: 'cafe', cuisine: 'bubble_tea' }), 'boba');
  assert.equal(icon({ amenity: 'ice_cream' }), 'icecream');
  assert.equal(icon({ amenity: 'pub' }), 'beer');
  assert.equal(icon({ amenity: 'bar' }), 'wine');
  assert.equal(icon({ amenity: 'bar', bar: 'cocktail' }), 'cocktail');
  assert.equal(icon({ amenity: 'restaurant', cuisine: 'sushi' }), 'sushi');
  assert.equal(icon({ amenity: 'restaurant', cuisine: 'mexican' }), 'chili');
  assert.equal(icon({ amenity: 'cinema' }), 'film');
  assert.equal(icon({ leisure: 'park' }), 'tree');
});

test('kinds: a fast-food place listed by a cuisine with no drawing is still fast food', () => {
  assert.equal(placeIcon({ tab: 'food', group: 'Italian', kind: 'Fast food' }), 'fries');
  assert.equal(placeIcon({ tab: 'food', group: 'Italian', kind: 'Restaurant' }), 'restaurant');
  assert.equal(placeIcon({ tab: 'food', group: 'Pizza', kind: 'Fast food' }), 'pizza');
});

test('kinds: every listing a place can be in has a drawing that exists', () => {
  const samples = [
    ...['restaurant', 'fast_food', 'cafe', 'bar', 'pub', 'biergarten', 'ice_cream', 'cinema', 'nightclub', 'bowling_alley', 'theatre', 'library', 'arts_centre', 'community_centre', 'marketplace', 'karaoke_box'].map((amenity) => ({ amenity })),
    ...['bakery', 'coffee', 'tea', 'mall', 'books', 'toys', 'music', 'gift', 'clothes', 'supermarket'].map((shop) => ({ shop })),
    ...['escape_game', 'amusement_arcade', 'miniature_golf', 'sports_centre', 'ice_rink', 'water_park', 'park', 'garden', 'playground', 'nature_reserve'].map((leisure) => ({ leisure })),
    ...['museum', 'gallery', 'attraction', 'viewpoint', 'picnic_site', 'zoo', 'aquarium', 'theme_park'].map((tourism) => ({ tourism })),
    ...Object.keys({ italian: 1, chinese: 1, thai: 1, kebab: 1, chicken: 1, seafood: 1, sandwich: 1, dessert: 1, donut: 1, breakfast: 1, vegan: 1, bbq: 1, dumpling: 1, hot_dog: 1 }).map((cuisine) => ({ amenity: 'restaurant', cuisine })),
  ];
  for (const tags of samples) {
    const c = categorize(tags);
    assert.ok(c, JSON.stringify(tags));
    const id = groupIcon(c.tab, c.group);
    if (id) assert.ok(KIND_GLYPHS[id], `${c.group} → ${id} has no drawing`);
    else assert.equal(c.tab, 'fun', `${c.group} falls back to its tab's drawing`);
  }
});
