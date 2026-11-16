// What the app saves on the device: whatever is found in the browser's
// storage (an older version's data, something damaged, nothing at all, or no
// storage) comes back in the shape the app expects.
import test from 'node:test';
import assert from 'node:assert/strict';

const KEY = 'meet-guest-v1';
const store = new Map();
let blocked = false;
globalThis.localStorage = {
  getItem: (k) => { if (blocked) throw new Error('denied'); return store.has(k) ? store.get(k) : null; },
  setItem: (k, v) => { if (blocked) throw new Error('denied'); store.set(k, String(v)); },
  removeItem: (k) => { if (blocked) throw new Error('denied'); store.delete(k); },
};
const { api } = await import('../../public/js/api.js');

test('nothing saved yet: a blank start', async () => {
  store.clear();
  assert.deepEqual(await api.start(), { name: '', home: null, places: [], saved: [], history: [], settings: {} });
});

test('damaged or unexpected data never reaches the app as it is', async () => {
  for (const raw of ['{bad json', 'null', '7', '"text"', '[]', JSON.stringify({ places: 'oops', home: { lat: 'x' }, history: 7, settings: 'dark' })]) {
    store.set(KEY, raw);
    const u = await api.start();
    assert.equal(u.home, null, raw);
    assert.deepEqual(u.places, [], raw);
    assert.deepEqual(u.history, [], raw);
    assert.deepEqual(u.settings, {}, raw);
  }
});

test('data from when profiles were optional is kept; entries without a position are dropped, missing ids filled in', async () => {
  store.set(KEY, JSON.stringify({
    id: 'guest', guest: true, email: '',
    home: { address: 'Old home', lat: -33.87, lon: 151.21 },
    places: [{ address: 'A', lat: -33.88, lon: 151.19 }, { address: 'no position' }, { id: 'abc', address: 'B', lat: -33.89, lon: 151.27, nickname: 'Bea' }],
    history: [{ name: 'Old place', lat: -33.87, lon: 151.2, at: 1 }],
    settings: { theme: 'dark' },
  }));
  const u = await api.start();
  assert.equal(u.home.address, 'Old home');
  assert.deepEqual(u.places.map((p) => p.address), ['A', 'B']);
  assert.ok(u.places.every((p) => p.id), 'everyone has an id');
  assert.equal(u.places[1].id, 'abc');
  assert.equal(u.history.length, 1);
  assert.equal(u.settings.theme, 'dark');
  // The id given to the entry without one is the same on every read, so it can be changed and removed.
  const id = u.places[0].id;
  assert.equal((await api.start()).places[0].id, id);
  await api.updatePlace(id, { nickname: 'Ann' });
  assert.equal((await api.start()).places[0].nickname, 'Ann');
  await api.deletePlace(id);
  assert.deepEqual((await api.start()).places.map((p) => p.address), ['B']);
});

test('saving, changing and removing people and history', async () => {
  store.set(KEY, '{}');
  await api.updateMe({ home: { address: 'Home', lat: 1, lon: 2, mode: 'walk' }, settings: { speed: 'fast' } });
  const { place } = await api.addPlace({ address: 'Friend', lat: 3, lon: 4, nickname: ' Sam ', mode: 'teleport' });
  assert.equal(place.nickname, 'Sam');
  assert.equal(place.mode, undefined, 'an unknown way of travelling is not saved');
  assert.equal(place.active, true);
  await api.updatePlace(place.id, { mode: 'bike', active: false });
  let u = await api.start();
  assert.equal(u.places[0].mode, 'bike');
  assert.equal(u.places[0].active, false);
  assert.equal(u.settings.speed, 'fast');
  await assert.rejects(api.updatePlace('nope', { active: true }), (err) => err.status === 404);
  for (let i = 0; i < 60; i++) await api.addHistory({ name: `Place ${i}`, lat: 1, lon: 2 });
  u = await api.start();
  assert.equal(u.history.length, 50, 'the 50 latest are kept');
  assert.equal(u.history[0].name, 'Place 59');
  await api.deleteHistory(u.history[0].id);
  assert.equal((await api.start()).history[0].name, 'Place 58');
});

test('addresses kept with the heart: saved with their names, the same one again moves to the top, removable', async () => {
  store.set(KEY, '{}');
  const { saved: a } = await api.saveAddress({ address: '12 King St, Newtown', lat: -33.89, lon: 151.18, nickname: ' Sam ', mode: 'walk' });
  assert.equal(a.nickname, 'Sam');
  assert.equal(a.mode, undefined, 'a way of travelling belongs to a person, not an address');
  await api.saveAddress({ address: '1 Pitt St, Sydney', lat: -33.86, lon: 151.21 });
  await api.saveAddress({ address: '12 King St, Newtown', lat: -33.89, lon: 151.18, nickname: 'Sam (work)' });
  let u = await api.start();
  assert.deepEqual(u.saved.map((s) => s.nickname || s.address), ['Sam (work)', '1 Pitt St, Sydney']);
  await api.unsaveAddress(u.saved[1].id);
  u = await api.start();
  assert.deepEqual(u.saved.map((s) => s.address), ['12 King St, Newtown']);
  // Damaged entries are dropped like the rest.
  store.set(KEY, JSON.stringify({ saved: [{ address: 'no position' }, { address: 'Ok', lat: 1, lon: 2 }, 'junk'] }));
  assert.deepEqual((await api.start()).saved.map((s) => s.address), ['Ok']);
});

test('with storage blocked everything still works for the visit, and the app can tell', async () => {
  const { api: fresh } = await import('../../public/js/api.js?blocked'); // as on a newly opened page
  blocked = true;
  try {
    assert.equal(fresh.saved(), true, 'nothing refused yet');
    await fresh.updateMe({ home: { address: 'Home', lat: 1, lon: 2 } });
    assert.equal(fresh.saved(), false);
    await fresh.addPlace({ address: 'Friend', lat: 3, lon: 4 });
    const u = await fresh.start();
    assert.equal(u.home.address, 'Home');
    assert.equal(u.places.length, 1);
  } finally { blocked = false; }
});

test('a save the browser refuses (storage full) is not lost during the visit, and is written once saving works again', async () => {
  const { api: fresh } = await import('../../public/js/api.js?full');
  store.set(KEY, JSON.stringify({ home: { address: 'Home', lat: 1, lon: 2 }, places: [] }));
  const realSet = globalThis.localStorage.setItem;
  globalThis.localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
  let place;
  try {
    ({ place } = await fresh.addPlace({ address: 'Friend', lat: 3, lon: 4 }));
    assert.equal(fresh.saved(), false);
    // Reading back gives what was added, not the older copy still in storage.
    assert.equal((await fresh.start()).places.length, 1);
    await fresh.updatePlace(place.id, { nickname: 'Sam' });
  } finally { globalThis.localStorage.setItem = realSet; }
  await fresh.updatePlace(place.id, { active: false });
  assert.equal(fresh.saved(), true);
  assert.equal(JSON.parse(store.get(KEY)).places[0].nickname, 'Sam');
});
