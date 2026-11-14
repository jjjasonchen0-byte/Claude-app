// Address search and "what is at this spot": fallbacks when a service fails
// or answers with nothing usable.
import test from 'node:test';
import assert from 'node:assert/strict';
import { searchAddress, reverseGeocode } from '../../public/js/geocode.js';

function withFetch(answer, run) {
  const real = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push(String(url));
    const [status, body] = await answer(String(url), init);
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  };
  return run(calls).finally(() => { globalThis.fetch = real; });
}
const feature = (props, lon = -0.1, lat = 51.5) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] }, properties: props });

test('address search: Photon first, with a title and the rest as a subtitle', async () => {
  await withFetch(() => [200, { features: [feature({ housenumber: '12', street: 'Baker Street', city: 'London', country: 'United Kingdom' })] }], async (calls) => {
    const r = await searchAddress('12 Baker');
    assert.equal(calls.length, 1);
    assert.deepEqual(r.map((x) => [x.title, x.subtitle, x.lat, x.lon]), [['12 Baker Street', 'London, United Kingdom', 51.5, -0.1]]);
  });
});

test('address search: results with no name or no position are left out; when Photon has nothing or fails, Nominatim is asked', async () => {
  await withFetch((url) => (url.includes('photon') ? [200, { features: [feature({}), { type: 'Feature', properties: { name: 'No position' } }] }] : [200, [{ display_name: 'Somewhere, Town, Country', lat: '1.5', lon: '2.5' }, { lat: '1', lon: '2' }]]), async (calls) => {
    const r = await searchAddress('somewhere');
    assert.equal(calls.length, 2);
    assert.deepEqual(r.map((x) => [x.title, x.lat, x.lon]), [['Somewhere, Town', 1.5, 2.5]]);
  });
  await withFetch((url) => (url.includes('photon') ? [500, 'down'] : [200, { error: 'unexpected shape' }]), async () => {
    assert.deepEqual(await searchAddress('anything'), []);
  });
});

test('"what is here": the address, else the coordinates; it never fails', async () => {
  await withFetch(() => [200, { features: [feature({ name: 'Meeting Square', city: 'London' })] }], async () => {
    assert.deepEqual(await reverseGeocode(51.5, -0.1), { lat: 51.5, lon: -0.1, address: 'Meeting Square, London', title: 'Meeting Square', subtitle: 'London' });
  });
  // A spot Photon knows nothing about (no name, no street): Nominatim, then the coordinates.
  await withFetch((url) => (url.includes('photon') ? [200, { features: [feature({})] }] : [200, { display_name: 'Field, Village, Country' }]), async () => {
    assert.equal((await reverseGeocode(51.5, -0.1)).address, 'Field, Village, Country');
  });
  await withFetch(() => [500, 'down'], async () => {
    assert.deepEqual(await reverseGeocode(51.5, -0.1), { lat: 51.5, lon: -0.1, address: '51.50000, -0.10000' });
  });
});

test('a lookup that never answers is given up on', async () => {
  const real = globalThis.fetch;
  globalThis.fetch = (url, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))));
  const realTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (fn, ms, ...a) => realTimeout(fn, Math.min(ms, 20), ...a); // the 7 seconds pass in a moment
  try {
    assert.deepEqual(await reverseGeocode(1, 2), { lat: 1, lon: 2, address: '1.00000, 2.00000' });
  } finally { globalThis.fetch = real; globalThis.setTimeout = realTimeout; }
});
