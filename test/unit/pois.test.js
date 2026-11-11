// Places: categorising OpenStreetMap tags, and the Photon fallback used when
// the Overpass API is unavailable (fixture: a trimmed real Photon response, London).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { categorize, parsePois, groupPois, photonElements, photonUrl, PHOTON_GROUPS } from '../../public/js/pois.js';

const photon = JSON.parse(fs.readFileSync(new URL('../fixtures/photon-places.json', import.meta.url), 'utf8'));
const millbank = { lat: 51.4935, lon: -0.1285 };

test('OpenStreetMap tags go into the right tab and group', () => {
  assert.deepEqual(categorize({ amenity: 'restaurant', cuisine: 'italian' }), { tab: 'food', group: 'Italian' });
  assert.deepEqual(categorize({ amenity: 'restaurant' }), { tab: 'food', group: 'Restaurants' });
  assert.deepEqual(categorize({ amenity: 'pub' }), { tab: 'drinks', group: 'Pubs' });
  assert.deepEqual(categorize({ leisure: 'park' }), { tab: 'outdoors', group: 'Parks' });
  assert.equal(categorize({ amenity: 'pharmacy' }), null);
});

test('Photon results become categorised places with addresses', () => {
  const pois = parsePois(photonElements(photon.features), millbank);
  assert.equal(pois.length, photon.features.length);
  const groups = groupPois(pois).drinks.map((g) => g.group);
  assert.ok(groups.includes('Cafés') && groups.includes('Pubs'), groups.join(', '));
  const pub = pois.find((p) => p.name === 'Marquis of Granby');
  assert.ok(pub && pub.tab === 'drinks' && pub.group === 'Pubs');
  assert.ok(pois.every((p) => p.fromCenter < 3000), 'all near the search point');
  assert.ok(pois.some((p) => p.address), 'street addresses come through');
  for (let i = 1; i < pois.length; i++) assert.ok(pois[i].fromCenter >= pois[i - 1].fromCenter, 'nearest first');
});

test('Photon request asks for nearby places of the given kinds', () => {
  const u = new URL(photonUrl(millbank, 1500, PHOTON_GROUPS[1]));
  assert.equal(u.pathname, '/reverse');
  assert.equal(u.searchParams.get('radius'), '1.50');
  assert.equal(u.searchParams.get('limit'), '50');
  assert.deepEqual(u.searchParams.getAll('osm_tag'), PHOTON_GROUPS[1]);
});

// ---- speed: Overpass and Photon race, so a slow or refusing Overpass costs seconds, not tens of seconds.
import { findPois } from '../../public/js/pois.js';

const overpassJson = { elements: [{ type: 'node', id: 1, lat: 51.4936, lon: -0.1286, tags: { name: 'Trattoria Roma', amenity: 'restaurant', cuisine: 'italian' } }] };
function stubFetch({ overpass = 'fast', photon = 'fast' } = {}) {
  const real = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    seen.push(u.includes('overpass') ? 'overpass' : 'photon');
    const wait = (ms) => new Promise((res, rej) => {
      const t = setTimeout(res, ms);
      init.signal?.addEventListener('abort', () => { clearTimeout(t); rej(Object.assign(new Error('aborted'), { name: 'AbortError' })); });
    });
    if (u.includes('overpass')) {
      if (overpass === 'refuses') return new Response('{}', { status: 429 });
      await wait(overpass === 'slow' ? 60000 : 20);
      return new Response(JSON.stringify(overpassJson), { status: 200 });
    }
    await wait(photon === 'slow' ? 60000 : 20);
    return new Response(JSON.stringify(photon === 'empty' ? { features: [] } : photon), { status: 200 });
  };
  return { seen, restore: () => { globalThis.fetch = real; } };
}
const opts = { photonAfterMs: 80, graceMs: 60, overpassTimeoutMs: 400, minResults: 1 };

test('places: a quick Overpass answer is used and Photon is never asked', async () => {
  const s = stubFetch();
  try {
    const r = await findPois(millbank, opts);
    assert.equal(r.source, 'overpass');
    assert.equal(r.pois[0].group, 'Italian');
    assert.deepEqual(s.seen, ['overpass']);
  } finally { s.restore(); }
});

test('places: when Overpass refuses, Photon answers straight away', async () => {
  const s = stubFetch({ overpass: 'refuses', photon });
  try {
    const t0 = Date.now();
    const r = await findPois(millbank, opts);
    assert.equal(r.source, 'photon');
    assert.ok(r.pois.length > 5);
    assert.ok(Date.now() - t0 < 300, 'no long wait');
  } finally { s.restore(); }
});

test('places: when Overpass is slow, Photon steps in after a moment', async () => {
  const s = stubFetch({ overpass: 'slow', photon });
  try {
    const t0 = Date.now();
    const r = await findPois(millbank, opts);
    assert.equal(r.source, 'photon');
    assert.ok(Date.now() - t0 < 350, `took ${Date.now() - t0} ms`);
  } finally { s.restore(); }
});
