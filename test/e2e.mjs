// End-to-end walkthrough in a headless browser. External map services
// (tiles, geocoding, Overpass) are mocked so it runs offline and is repeatable.
//   node test/e2e.mjs [--shots dir]
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { encodeTile } from './helpers/mvt-encode.mjs';

// Use a local Playwright if installed, else a global one (via NODE_PATH).
const { chromium } = await import('playwright').catch(() => createRequire(import.meta.url)('playwright'));

const shotsDir = process.argv.includes('--shots') ? process.argv[process.argv.indexOf('--shots') + 1] : null;
if (shotsDir) fs.mkdirSync(shotsDir, { recursive: true });
const PORT = 3999;
const dataFile = path.join(os.tmpdir(), `meet-e2e-${Date.now()}.json`);
const server = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT, DATA_FILE: dataFile }, stdio: 'inherit' });
await new Promise((r) => setTimeout(r, 600));

// ---- fake data ---------------------------------------------------------------
const ADDRESSES = {
  home: { name: '12 Baker Street', city: 'London', lat: 51.5205, lon: -0.1568 },
  sam: { name: '40 Brick Lane', city: 'London', lat: 51.5215, lon: -0.0717 },
  jo: { name: '5 Clapham High St', city: 'London', lat: 51.4645, lon: -0.1302 },
};
const feature = (a) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [a.lon, a.lat] }, properties: { name: a.name, city: a.city, country: 'United Kingdom' } });

// Map tiles for the search animation's streets: a slightly wavy grid in every tile,
// with a main road every fourth street. Streets run edge to edge so tiles join up.
const STREET_TILE = (() => {
  const lines = [];
  for (let k = 0; k <= 16; k++) {
    const at = k * 256;
    const props = { class: k % 4 === 0 ? 'primary' : 'minor' };
    // Straight where they cross a tile edge, so they meet the next tile's streets.
    const wave = (i) => (k % 16 ? Math.round(Math.sin((i / 16) * Math.PI * (2 + (k % 3))) * 40) : 0);
    lines.push({ props, lines: [Array.from({ length: 17 }, (_, i) => [i * 256, at + wave(i)])] });
    lines.push({ props, lines: [Array.from({ length: 17 }, (_, i) => [at - wave(i), i * 256])] });
  }
  return Buffer.from(encodeTile({ transportation: lines }));
})();

function pois(query) {
  const [lat, lon] = query.match(/around:\d+,([-\d.]+),([-\d.]+)/).slice(1).map(Number);
  const kinds = [
    ...['Luigi\'s', 'Trattoria Roma', 'Pasta Bella', 'Nonna\'s Kitchen'].map((name) => ({ name, amenity: 'restaurant', cuisine: 'italian' })),
    ...['Sakura Sushi', 'Tokyo Bites'].map((name) => ({ name, amenity: 'restaurant', cuisine: 'japanese' })),
    { name: 'Spice Route', amenity: 'restaurant', cuisine: 'indian' },
    { name: 'Burger Barn', amenity: 'fast_food', cuisine: 'burger' },
    { name: 'Bean There', amenity: 'cafe' }, { name: 'Daily Grind', amenity: 'cafe' },
    { name: 'The Crown', amenity: 'pub' }, { name: 'Tea Time', amenity: 'cafe', cuisine: 'bubble_tea' },
    { name: 'Odeon Central', amenity: 'cinema' }, { name: 'Strike Bowl', leisure: 'bowling_alley' },
    { name: 'City Museum', tourism: 'museum' }, { name: 'Riverside Park', leisure: 'park' }, { name: 'Rose Garden', leisure: 'garden' },
    { name: 'Page Turners', shop: 'books' },
  ];
  return {
    elements: kinds.map((t, i) => ({
      type: 'node', id: 9000 + i,
      lat: lat + Math.sin(i * 2.1) * 0.004, lon: lon + Math.cos(i * 2.1) * 0.006,
      tags: { ...t, 'addr:street': 'High Street', 'addr:housenumber': String(10 + i), opening_hours: 'Mo-Su 10:00-22:00' },
    })),
  };
}

// 256x256 light grey PNG tile.
const TILE = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAQAAAAEAAQMAAABmvDolAAAAA1BMVEXo6OxXbM8mAAAAH0lEQVRo3u3BAQ0AAADCoPdPbQ43oAAAAAAAAAAAvg0hAAABmmDh1QAAAABJRU5ErkJggg==', 'base64');

// ---- run ---------------------------------------------------------------------
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 820 }, deviceScaleFactor: 1 });
// The base map: a plain stand-in style for the vector map (and tiles for the no-WebGL fallback).
// The same tiles give the search animation its streets.
let streetTiles = 0;
await ctx.route('https://tiles.openfreemap.org/**', (r) => {
  const url = r.request().url();
  if (url.endsWith('/planet')) return r.fulfill({ json: { tiles: ['https://tiles.openfreemap.org/planet/test/{z}/{x}/{y}.pbf'] } });
  if (url.endsWith('.pbf')) { streetTiles++; return r.fulfill({ body: STREET_TILE, contentType: 'application/x-protobuf' }); }
  return r.fulfill({ json: { version: 8, sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#eeece8' } }] } });
});
await ctx.route('https://tile.openstreetmap.org/**', (r) => r.fulfill({ body: TILE, contentType: 'image/png' }));
await ctx.route('https://photon.komoot.io/**', (r) => {
  const u = new URL(r.request().url());
  if (u.pathname.startsWith('/reverse')) {
    return r.fulfill({ json: { features: [feature({ name: 'Meeting Square', city: 'London', lat: +u.searchParams.get('lat'), lon: +u.searchParams.get('lon') })] } });
  }
  const q = (u.searchParams.get('q') || '').toLowerCase();
  const hit = Object.values(ADDRESSES).filter((a) => a.name.toLowerCase().includes(q.split(' ')[0]) || q.includes(a.name.toLowerCase().split(' ')[1]));
  return r.fulfill({ json: { features: hit.map(feature) } });
});
// Directions: the server would call FOSSGIS OSRM and Transitous; stand in with
// real (trimmed) London responses, normalised exactly as the server does.
const { normalizeOsrm, normalizeOsrmTable, normalizeTransit } = await import('../public/js/directions.js');
const fx = (n) => JSON.parse(fs.readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8'));
let transitCalls = 0;
const transitTimes = new Set(); // the departure times public transport was asked for
await ctx.route('**/api/directions?**', (r) => {
  const mode = new URL(r.request().url()).searchParams.get('mode');
  if (mode === 'transit') { transitCalls++; transitTimes.add(new URL(r.request().url()).searchParams.get('time')); }
  return r.fulfill({ json: mode === 'transit' ? normalizeTransit(fx('transitous-plan.json')) : normalizeOsrm(fx('osrm-route.json'), mode) });
});
// Public transport times from one person to every stop around: a grid of stops, slower further away.
const reachAsked = [];
await ctx.route('**/api/transit/reach?**', (r) => {
  const q = new URL(r.request().url()).searchParams;
  reachAsked.push(q.get('time'));
  const [lat, lon] = q.get('from').split(',').map(Number);
  const [s0, w0, n0, e0] = q.get('box').split(',').map(Number);
  const cells = [];
  for (let i = 0; i <= 24; i++) for (let j = 0; j <= 24; j++) {
    const a = s0 + ((n0 - s0) * i) / 24, b = w0 + ((e0 - w0) * j) / 24;
    const km = Math.hypot((a - lat) * 111, (b - lon) * 69);
    cells.push([a, b, Math.round(8 + km * 3.2), i % 6 === 0 && j % 6 === 0 ? 900 : 10]);
  }
  return r.fulfill({ json: { cells } });
});
await ctx.route('**/api/traveltimes?**', (r) => {
  const q = new URL(r.request().url()).searchParams;
  const n = q.get('from').split(';').length, m = q.get('to').split(';').length;
  const t = normalizeOsrmTable(fx('osrm-table.json'));
  return r.fulfill({ json: { durations: Array.from({ length: n }, (_, i) => Array.from({ length: m }, (_, j) => t.durations[i % 2][j % 2] + j * 30)), distances: [] } });
});
await ctx.route(/overpass/, async (r) => {
  const q = new URLSearchParams(r.request().postData()).get('data');
  await new Promise((res) => setTimeout(res, 150));
  return r.fulfill({ json: pois(q) });
});

const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const shot = async (name) => shotsDir && page.screenshot({ path: path.join(shotsDir, `${name}.png`) });

try {
  await page.goto(`http://localhost:${PORT}/`);
  // Home address
  await page.waitForSelector('#screen-home:not([hidden])');
  await shot('01-start');
  await page.fill('#home-search input', 'Baker Street');
  await page.waitForSelector('#home-search .suggestions li[data-i]');
  await shot('02-home');
  await page.keyboard.press('Enter');

  // Main map
  await page.waitForSelector('#screen-main:not([hidden])');
  await page.waitForSelector('.person');
  assert.equal(await page.isDisabled('[data-action=find]'), true, 'find disabled with only you');

  for (const [q, nick] of [['Brick Lane', 'Sam'], ['Clapham High', 'Jo']]) {
    await page.fill('#add-nick', nick);
    await page.fill('#add-search input', q);
    await page.waitForSelector('#add-search .suggestions li[data-i]');
    await page.keyboard.press('Enter');
    await page.waitForFunction((n) => [...document.querySelectorAll('.person .cell-title')].some((e) => e.textContent.includes(n)), nick);
  }
  await page.waitForTimeout(600);
  await shot('03-people');
  assert.equal(await page.locator('.person').count(), 3);

  // Leaving: Now by default, or a chosen time, which the search asks public transport for.
  assert.equal(await page.locator('.leave-row [data-action=leave-now].active').count(), 1, 'leaving now by default');
  const later = new Date(Date.now() + 2 * 864e5);
  later.setHours(9, 0, 0, 0);
  const laterValue = new Date(later.getTime() - later.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  await page.fill('#leave-at', laterValue);
  await page.dispatchEvent('#leave-at', 'change');
  assert.equal(await page.locator('#leave-at.active').count(), 1);
  assert.equal(await page.locator('.leave-row [data-action=leave-now].active').count(), 0);

  // Find places → the search animation: everyone's floods converge on the meeting point, then the routes.
  await page.click('[data-action=find]');
  await page.waitForSelector('.growth-canvas');
  await page.waitForSelector('#screen-main.flooding .flood-base.on', { timeout: 20000 });
  assert.equal(await page.locator('#flood-hud').isHidden(), true, 'no heading while the floods run');
  assert.equal(await page.locator('#flood-city').count(), 0, 'no city name');
  assert.ok(streetTiles > 0, 'streets came from the map tiles');
  assert.equal(await page.locator('.flood-pill').count(), 3, 'a name tag over everyone');
  assert.match(await page.textContent('.flood-pill >> nth=1'), /^Sam · /);
  await page.waitForTimeout(900);
  await shot('04-converging');
  await page.waitForFunction(() => /Meet near/.test(document.querySelector('#flood-hud')?.textContent), null, { timeout: 20000 });
  await page.waitForTimeout(800);
  await shot('04c-meet');
  await page.waitForSelector('.panel:not(.away) .pills', { timeout: 30000 });
  assert.equal(await page.locator('.flood-base').count(), 0, 'the dark map is gone');
  assert.equal(await page.locator('#screen-main.flooding').count(), 0);
  assert.deepEqual([...transitTimes], [later.toISOString()], 'public transport planned for the chosen time');
  assert.deepEqual(reachAsked, Array(3).fill(later.toISOString()), 'stops reached by each rider, leaving at the chosen time');
  // The meeting point moved to a place to meet at, named in the results.
  const heading = await page.textContent('.result-head h2');
  assert.ok(['Luigi\'s', 'Trattoria Roma', 'Pasta Bella', 'Nonna\'s Kitchen', 'Sakura Sushi', 'Tokyo Bites', 'Spice Route', 'Burger Barn', 'Bean There', 'Daily Grind', 'The Crown', 'Tea Time', 'Odeon Central', 'Strike Bowl', 'City Museum', 'Riverside Park', 'Rose Garden', 'Page Turners'].includes(heading.trim()), `meeting at a place: ${heading}`);
  assert.match(await page.textContent('.panel'), /Times for leaving at 9:00/);
  await page.waitForTimeout(700);
  await shot('05-results');
  // Edit people sits right under the people; there is no "Surprise me" any more.
  assert.equal(await page.locator('.trip + li [data-action=edit-people]').count(), 1, 'Edit people right under the people');
  assert.equal(await page.locator('[data-action=surprise]').count(), 0);
  assert.equal(await page.locator('.panel .modes').count(), 0, 'no travel-mode bar on the results screen');
  // Picking a radius draws it as a circle around the meeting point.
  assert.equal(await page.locator('.radius-ring').count(), 0);
  await page.click('[data-action=radius][data-r="1000"]');
  await page.waitForSelector('.radius-ring');
  await page.waitForSelector('[data-action=radius][data-r="1000"].active');
  await page.waitForTimeout(700);
  await shot('05b-radius');
  const italian = page.locator('[data-action=group]', { hasText: 'Italian' });
  assert.equal((await italian.locator('.cell-end').textContent()).trim(), '4', 'Italian count');

  // Category → POI map
  await italian.click();
  await page.waitForSelector('.poi');
  assert.equal(await page.locator('.poi').count(), 4);
  assert.equal(await page.locator('.poi-pin').count(), 4);
  await page.waitForTimeout(700);
  await shot('06-category');

  // Place → send location
  await page.locator('.poi').first().click();
  await page.waitForSelector('[data-action=choose]');
  await page.waitForTimeout(600);
  // Real directions: public transport by default, with line badges and an expandable journey.
  await page.waitForFunction(() => document.querySelectorAll('.dirs .line-badge').length >= 3);
  assert.ok(transitCalls >= 3, 'asked for public transport for everyone');
  assert.equal(await page.locator('.growth-canvas.away').count(), 1, 'routes to the meeting point give way to routes to the place');
  await page.locator('.dirs [data-action=dir-toggle]').first().click();
  await page.waitForSelector('.dirs .legs .leg.ride');
  assert.ok(await page.locator('.dirs .legs .leg').count() >= 4, 'journey shows its legs');
  await page.waitForTimeout(500);
  await shot('07-place');
  // Everyone cycles: real routes, no line badges, every pill says Bike.
  await page.click('.modes [data-mode=bike]');
  await page.waitForFunction(() => !document.querySelector('.dirs .line-badge') && [...document.querySelectorAll('.dirs .mode-pill')].every((b) => /Bike/.test(b.textContent)));
  await shot('07b-place-bike');
  // Back to public transport for everyone, then just Sam on a bike.
  await page.click('.modes [data-mode=transit]');
  await page.waitForFunction(() => document.querySelectorAll('.dirs .line-badge').length >= 3);
  const samRow = page.locator('.dirs > li', { hasText: 'Sam' });
  await samRow.locator('.mode-pill').click();
  await samRow.locator('.mode-picker [data-mode=bike]').click();
  await page.waitForFunction(() => {
    const rows = [...document.querySelectorAll('.dirs > li')];
    const sam = rows.find((r) => r.textContent.includes('Sam'));
    const others = rows.filter((r) => r !== sam);
    return sam && /Bike/.test(sam.querySelector('.mode-pill').textContent) && !sam.querySelector('.line-badge') && !sam.querySelector('.spinner')
      && others.every((r) => r.querySelector('.line-badge'));
  });
  assert.equal(await page.locator('.modes .seg.active').count(), 0, 'mixed modes: the everyone bar shows no single mode');
  await page.waitForTimeout(400);
  await shot('07c-place-mixed');
  await page.click('[data-action=choose]');
  await page.waitForSelector('#share-text');
  const text = await page.inputValue('#share-text');
  assert.match(text, /Let's meet at/);
  assert.match(text, /google\.com\/maps/);
  await shot('08-share');

  // Guest history is visible in the menu; then create an optional profile.
  await page.click('#btn-menu');
  await page.waitForSelector('#history-list [data-hid]');
  await shot('09-menu');
  await page.click('#btn-signin');
  // The form puts the cursor in the email box just after opening; wait for that before typing.
  await page.waitForFunction(() => document.activeElement?.id === 'auth-email');
  await page.fill('#auth-name', 'Alex');
  await page.fill('#auth-email', 'alex@example.com');
  await page.fill('#auth-password', 'secret123');
  await page.click('#auth-submit');
  await page.waitForSelector('#auth-modal', { state: 'hidden' });
  await page.waitForSelector('.person');
  assert.equal(await page.locator('.person').count(), 3, 'guest people moved into the profile');

  // Reload: the server session survives and the profile has everything.
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector('.person');
  assert.equal(await page.locator('.person').count(), 3, 'addresses persisted on the server');
  assert.match(await page.locator('.person', { hasText: 'Sam' }).locator('.mode-pill').textContent(), /Bike/, "Sam's travel mode is remembered");
  await page.click('#btn-menu');
  assert.equal(await page.textContent('#drawer-email'), 'alex@example.com');
  assert.equal(await page.locator('#history-list [data-hid]').count(), 1, 'history moved into the profile');
  await page.click('#drawer-close');

  // Exclude Jo and search again with just two people.
  await page.locator('.person', { hasText: 'Jo' }).locator('.switch span').click();
  await page.waitForFunction(() => document.querySelectorAll('.person.inactive').length === 1);
  await page.click('[data-action=find]');
  await page.waitForSelector('.growth-canvas');
  await page.waitForTimeout(3000);
  await shot('10-two-people-growing');
  await page.click('#btn-skip');
  await page.waitForSelector('.panel:not(.away) .pills', { timeout: 20000 });
  assert.equal(await page.locator('.panel .trip').count(), 2, 'two travellers');
  await page.waitForTimeout(600);
  await shot('11-two-people-results');
  // Changing the meeting rule in the menu looks for a spot again straight away.
  assert.match(await page.textContent('.result-head .eyebrow'), /Similar travel times · \d/);
  await page.click('#btn-menu');
  await page.click('#set-mode [data-value=total]');
  await page.waitForSelector('#drawer', { state: 'hidden' });
  await page.waitForFunction(() => /Least total travel/.test(document.querySelector('.panel:not(.away) .result-head .eyebrow')?.textContent || ''), null, { timeout: 45000 });

  // Mobile layout check
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  await shot('12-mobile-results');
  await page.click('[data-action=edit-people]');
  await page.waitForSelector('.person');
  await page.waitForTimeout(500);
  await shot('13-mobile-people');

  assert.deepEqual(errors, [], `page errors: ${errors.join('\n')}`);
  console.log('E2E passed ✔');
} catch (err) {
  await shot('zz-failure');
  console.error('E2E failed:', err.message, '\nPage errors:', errors);
  process.exitCode = 1;
} finally {
  await browser.close();
  server.kill();
  fs.rmSync(dataFile, { force: true });
}
