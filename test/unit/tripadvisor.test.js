// Tripadvisor (Terra API): ratings, photos and reviews. No API key is
// available to the tests, so this stands in for the API with responses
// shaped like Tripadvisor's published reference (docs.terra.tripadvisor.com):
// catalog nearby search, allowlist, multi-get details, photos and reviews.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createTripadvisor, normalizePlace } from '../../lib/tripadvisor.js';

const LISTINGS = {
  101: { id: 101, names: [{ language: 'en', primary: true, value: 'Trattoria Roma' }], coordinates: { latitude: 51.4937, longitude: -0.1286 }, overall_rating: { rating: 4.5, count: 812, icon_url: 'https://example.test/bubbles-45.svg' }, urls: { tripadvisor: { main: 'https://www.tripadvisor.com/Restaurant_Review-101' } } },
  102: { id: 102, names: [{ language: 'en', primary: true, value: 'Pizza Express' }], coordinates: { latitude: 51.4938, longitude: -0.1287 }, overall_rating: { rating: 3.5, count: 220, icon_url: 'https://example.test/bubbles-35.svg' } },
};
const details = (id) => ({
  ...LISTINGS[id], price_level: 'Mid Range', status: { value: 'OPEN' }, photos: { total_count: 57 },
  traveler_ratings: { overall: LISTINGS[id].overall_rating, breakdowns: [{ rating: 5, count: 500 }, { rating: 4, count: 200 }, { rating: 1, count: 12 }], subratings: [{ type: 'food', type_name: 'Food', rating: 4.5 }] },
  phone_numbers: [{ type: 'phone', value: '+44 20 7946 0000' }], urls: { ...LISTINGS[id].urls, official: 'https://roma.example', menu: 'https://roma.example/menu' },
  rankings: [{ display_text: '#120 of 20,000 Restaurants in London' }], categories: [{ id: 'italian', display_name: 'Italian' }],
  descriptions: [{ language: 'en', value: 'Family-run trattoria.' }], addresses: [{ formatted: '12 Millbank, London' }], geo: 'London', geo_id: 186338,
});

function fakeTerra() {
  const calls = [];
  const allowlist = new Set();
  const fetchImpl = async (url, init) => {
    const u = new URL(url);
    calls.push({ path: u.pathname, method: init.method, key: init.headers['X-API-Key'], q: Object.fromEntries(u.searchParams), body: init.body && JSON.parse(init.body) });
    const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
    if (u.pathname === '/api/catalog/locations/nearby') {
      return json({ data: Object.values(LISTINGS).map((location) => ({ location, distance_kilometers: 0.01 })), pagination: { page: 1, size: 3 } });
    }
    if (u.pathname === '/api/allowlist') {
      const b = JSON.parse(init.body);
      let added = 0;
      for (const id of b.allowlist) if (!allowlist.has(id)) { allowlist.add(id); added++; }
      return json({ added, deleted: 0, no_change: b.allowlist.length - added });
    }
    const id = Number(u.pathname.split('/')[3]);
    if (u.pathname === '/api/locations') return json({ data: u.searchParams.get('id').split(',').map(Number).filter((x) => allowlist.has(x)).map(details) });
    if (!allowlist.has(id)) return json({ title: 'Not Found' }, 404);
    if (u.pathname.endsWith('/photos')) {
      const n = Number(u.searchParams.get('size'));
      return json({ data: Array.from({ length: n }, (_, k) => ({ id: k, caption: k ? '' : 'Pasta', photo: { original_size_url: `https://example.test/p${k}.jpg`, original_width: 1600, original_height: 1200 }, user: { username: `diner${k}` } })), pagination: {} });
    }
    if (u.pathname.endsWith('/reviews')) {
      return json({ data: [{ id: 9, rating: 5, title: [{ language: 'en', value: 'Lovely' }], text: [{ language: 'en', value: 'Great pasta and friendly staff.' }], publish_ts: '2026-10-01T12:00:00Z', travel_date: '2026-09', trip_type: 'FRIENDS', subratings: [], user: { username: 'Sam_L' }, rating_icon_url: { url: 'https://example.test/bubbles-50.svg' }, url: 'https://www.tripadvisor.com/ShowUserReviews-9' }], pagination: {} });
    }
    return json(details(id));
  };
  return { fetchImpl, calls, allowlist };
}

const roma = { key: 'node/1', name: "Trattoria Roma", lat: 51.4936, lon: -0.1285, category: 'RESTAURANT' };

test('finds the matching listing, adds it to the allowlist and returns its rating', async () => {
  const t = fakeTerra();
  const ids = new Map();
  const ta = createTripadvisor({ apiKey: 'k', fetchImpl: t.fetchImpl, ids });
  const out = await ta.ratings([roma]);
  assert.equal(out['node/1'].id, 101);
  assert.equal(out['node/1'].rating, 4.5);
  assert.equal(out['node/1'].count, 812);
  assert.equal(out['node/1'].ratingImage, 'https://example.test/bubbles-45.svg');
  assert.equal(ids.get('node/1'), 101, 'only the ID is remembered');
  assert.ok(t.allowlist.has(101));
  const search = t.calls.find((c) => c.path === '/api/catalog/locations/nearby');
  assert.equal(search.key, 'k', 'API key goes in the X-API-Key header');
  assert.equal(search.q.size, '3');
  assert.equal(search.q.category, 'RESTAURANT');
  assert.equal(search.q.version, '1');
});

test('a place seen before is looked up by ID in one batch, without searching again', async () => {
  const t = fakeTerra();
  const ta = createTripadvisor({ apiKey: 'k', fetchImpl: t.fetchImpl, ids: new Map([['node/1', 101], ['node/2', null]]) });
  const out = await ta.ratings([roma, { ...roma, key: 'node/2', name: 'Nowhere' }]);
  assert.equal(out['node/1'].priceLevel, 'Mid Range');
  assert.equal(out['node/2'], null);
  assert.equal(t.calls.filter((c) => c.path.includes('catalog')).length, 0);
  assert.equal(t.calls.filter((c) => c.path === '/api/locations').length, 1);
});

test('place page: details, photos and reviews in one go', async () => {
  const t = fakeTerra();
  const ta = createTripadvisor({ apiKey: 'k', fetchImpl: t.fetchImpl });
  const p = await ta.place(101);
  assert.equal(p.name, 'Trattoria Roma');
  assert.equal(p.photos.length, 12);
  assert.equal(p.photos[0].caption, 'Pasta');
  assert.equal(p.reviews[0].title, 'Lovely');
  assert.equal(p.reviews[0].tripType, 'FRIENDS');
  assert.equal(p.ranking, '#120 of 20,000 Restaurants in London');
  assert.equal(p.phone, '+44 20 7946 0000');
  assert.deepEqual(p.breakdown.map((b) => b.rating), [5, 4, 1]);
  assert.equal(p.subratings[0].name, 'Food');
  assert.equal(normalizePlace(details(102)).name, 'Pizza Express');
});

test('the daily limit stops spending', async () => {
  const t = fakeTerra();
  const ta = createTripadvisor({ apiKey: 'k', fetchImpl: t.fetchImpl, dailyLimit: 4 });
  await ta.place(101); // 3
  await assert.rejects(ta.place(101), (e) => e.status === 429);
  assert.equal(ta.usage().used, 3);
});

test('server: ratings (and Google) are off without a key', async () => {
  process.env.DATA_FILE = path.join(os.tmpdir(), `meet-ta-test-${Date.now()}.json`);
  delete process.env.TRIPADVISOR_API_KEY;
  delete process.env.GOOGLE_MAPS_API_KEY;
  const { server } = await import(`../../server.js?ta-off-${Date.now()}`);
  await new Promise((r) => server.listen(0, r));
  const base = `http://localhost:${server.address().port}`;
  try {
    assert.deepEqual(await (await fetch(`${base}/api/config`)).json(), { ratings: null, google: false, version: '' });
    assert.equal((await fetch(`${base}/api/checktimes?g=1&mode=walk&from=51.5,-0.1&to=51.51,-0.1`)).status, 404);
    assert.equal((await fetch(`${base}/api/gmap/light/12/2047/1361`)).status, 404);
    const r = await fetch(`${base}/api/places/ratings`, { method: 'POST', body: JSON.stringify({ items: [roma] }) });
    assert.equal(r.status, 404);
  } finally {
    await new Promise((r) => server.close(r));
    fs.rmSync(process.env.DATA_FILE, { force: true });
  }
});
