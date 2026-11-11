// Opening hours from OpenStreetMap's opening_hours tag.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHours, openStatus, weekTable } from '../../public/js/hours.js';

const fmt = (m) => { m = ((m % 1440) + 1440) % 1440; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
const at = (s) => new Date(s); // local time
const status = (spec, when) => openStatus(spec, at(when), { fmt })?.text ?? null;

test('weekday and weekend hours', () => {
  const spec = 'Mo-Fr 09:00-17:00; Sa 10:00-14:00';
  assert.equal(status(spec, '2026-11-10T12:00'), 'Open · Closes 17:00'); // Tuesday
  assert.equal(status(spec, '2026-11-10T16:30'), 'Closes soon · 17:00');
  assert.equal(status(spec, '2026-11-14T15:00'), 'Closed · Opens Mon 09:00'); // Saturday afternoon
  assert.equal(status(spec, '2026-11-13T18:00'), 'Closed · Opens tomorrow 10:00'); // Friday evening
});

test('past midnight, lunch breaks, day lists and comma-separated rules', () => {
  assert.equal(status('We-Su 17:00-01:00', '2026-11-13T00:30'), 'Closes soon · 01:00'); // Thursday night
  assert.equal(status('We-Su 17:00-01:00', '2026-11-10T12:00'), 'Closed · Opens tomorrow 17:00');
  assert.equal(status('Mo-Fr 08:00-12:00, 13:00-17:00', '2026-11-10T12:30'), 'Closed · Opens 13:00');
  assert.equal(status('Mo,We 10:00-12:00', '2026-11-11T11:00'), 'Open · Closes 12:00');
  assert.equal(status('Mo-Fr 09:00-17:00, Sa 10:00-14:00', '2026-11-14T11:00'), 'Open · Closes 14:00');
  assert.equal(status('Mo-Sa 10:00-19:00; Su off', '2026-11-15T12:00'), 'Closed · Opens tomorrow 10:00');
});

test('always open, and forms it does not try to guess', () => {
  assert.equal(status('24/7', '2026-11-10T03:00'), 'Open 24 hours');
  assert.equal(status('Mo-Su 00:00-24:00', '2026-11-10T03:00'), 'Open 24 hours');
  assert.equal(parseHours('Dec 25 off'), null);
  assert.equal(parseHours('sunrise-sunset'), null);
  assert.equal(parseHours(''), null);
});

test('weekly table marks today', () => {
  const rows = weekTable('We-Su 17:00-01:00', at('2026-11-10T12:00'), { fmt });
  assert.equal(rows.length, 7);
  assert.deepEqual(rows[1], { day: 'Tue', today: true, text: 'Closed' });
  assert.equal(rows[2].text, '17:00 – 01:00');
});
