// End-to-end walkthrough in a headless browser. External map services
// (tiles, geocoding, Overpass) are mocked so it runs offline and is repeatable.
//   node test/e2e.mjs [--shots dir]
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

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

function roadNetwork(query) {
  const [s, w, n, e] = query.match(/\(([-\d.]+),([-\d.]+),([-\d.]+),([-\d.]+)\)/).slice(1).map(Number);
  const els = [];
  const rows = 70, cols = 90;
  let id = 1;
  const ids = [];
  for (let r = 0; r <= rows; r++) {
    ids.push([]);
    for (let c = 0; c <= cols; c++) {
      const jitter = Math.sin(r * 12.9898 + c * 78.233) * 0.3;
      els.push({ type: 'node', id, lat: s + ((r + jitter) / rows) * (n - s), lon: w + ((c - jitter) / cols) * (e - w) });
      ids[r].push(id++);
    }
  }
  let wid = 1;
  for (let r = 0; r <= rows; r++) els.push({ type: 'way', id: wid++, nodes: ids[r] });
  for (let c = 0; c <= cols; c++) if (c % 2 === 0 || c % 7 === 3) els.push({ type: 'way', id: wid++, nodes: ids.map((row) => row[c]) });
  for (let k = 0; k < 12; k++) els.push({ type: 'way', id: wid++, nodes: ids.slice(0, 50).map((row, r) => row[Math.min(cols, k * 8 + r)]) });
  return { elements: els };
}

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
await ctx.route('https://tiles.openfreemap.org/**', (r) => r.fulfill({ json: { version: 8, sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#eeece8' } }] } }));
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
await ctx.route('**/api/directions?**', (r) => {
  const mode = new URL(r.request().url()).searchParams.get('mode');
  if (mode === 'transit') transitCalls++;
  return r.fulfill({ json: mode === 'transit' ? normalizeTransit(fx('transitous-plan.json')) : normalizeOsrm(fx('osrm-route.json'), mode) });
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
  return r.fulfill({ json: q.includes('highway') ? roadNetwork(q) : pois(q) });
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

  // Find places → animation
  await page.click('[data-action=find]');
  await page.waitForSelector('.growth-canvas');
  await page.waitForTimeout(2600);
  await shot('04-growing');
  await page.waitForSelector('.panel:not(.away) .pills', { timeout: 20000 });
  await page.waitForTimeout(700);
  await shot('05-results');
  // Edit people sits right under the people; there is no "Surprise me" any more.
  assert.equal(await page.locator('.trip + li [data-action=edit-people]').count(), 1, 'Edit people right under the people');
  assert.equal(await page.locator('[data-action=surprise]').count(), 0);
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
  await page.waitForSelector('.panel:not(.away) .pills', { timeout: 20000 });
  assert.equal(await page.locator('.panel .trip').count(), 2, 'two travellers');
  await page.waitForTimeout(600);
  await shot('11-two-people-results');

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
