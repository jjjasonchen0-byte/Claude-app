// Distances in metres and kilometres, or feet and miles for US phones.
import test from 'node:test';
import assert from 'node:assert/strict';
import { usesMiles, fmtDist, fmtRadius } from '../../public/js/units.js';

test('which phones get miles', () => {
  assert.equal(usesMiles('en-US'), true);
  assert.equal(usesMiles('es-US'), true);
  assert.equal(usesMiles('en-us'), true);
  assert.equal(usesMiles('en-AU'), false);
  assert.equal(usesMiles('en-GB'), false);
  assert.equal(usesMiles('en'), false);
  assert.equal(usesMiles(''), false);
  assert.equal(usesMiles(), false);
});

test('metric distances', () => {
  assert.equal(fmtDist(3), '10 m');
  assert.equal(fmtDist(347), '350 m');
  assert.equal(fmtDist(949), '950 m');
  assert.equal(fmtDist(2420), '2.4 km');
  assert.equal(fmtDist(12300), '12 km');
});

test('distances in feet and miles', () => {
  assert.equal(fmtDist(5, true), '50 ft');
  assert.equal(fmtDist(150, true), '500 ft'); // 492 ft
  assert.equal(fmtDist(400, true), '0.2 mi'); // 1312 ft
  assert.equal(fmtDist(2414, true), '1.5 mi');
  assert.equal(fmtDist(20000, true), '12 mi');
});

test('the search radius', () => {
  assert.equal(fmtRadius(300), '300 m');
  assert.equal(fmtRadius(800), '800 m');
  assert.equal(fmtRadius(1000), '1 km');
  assert.equal(fmtRadius(1500), '1.5 km');
  assert.equal(fmtRadius(300, true), '1000 ft');
  assert.equal(fmtRadius(800, true), '0.5 mi');
  assert.equal(fmtRadius(1000, true), '0.6 mi');
  assert.equal(fmtRadius(3000, true), '1.9 mi');
});
