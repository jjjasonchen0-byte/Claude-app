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
  camden: { name: '8 Camden Road', city: 'London', lat: 51.539, lon: -0.1426 },
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
let tablesAsked = 0; // travel-time tables asked of the routing service (through the server or not)
await ctx.route('**/api/traveltimes?**', (r) => {
  tablesAsked++;
  const q = new URL(r.request().url()).searchParams;
  const n = q.get('from').split(';').length, m = q.get('to').split(';').length;
  const t = normalizeOsrmTable(fx('osrm-table.json'));
  return r.fulfill({ json: { durations: Array.from({ length: n }, (_, i) => Array.from({ length: m }, (_, j) => t.durations[i % 2][j % 2] + j * 30)), distances: [] } });
});
// Walking, cycling and driving times and routes are asked of the routing service
// straight from the browser: the same stand-in answers, in the service's own format.
let routingAsked = 0;
await ctx.route('https://routing.openstreetmap.de/**', (r) => {
  routingAsked++;
  const u = new URL(r.request().url());
  const cors = { 'access-control-allow-origin': '*' };
  if (u.pathname.includes('/table/')) {
    tablesAsked++;
    const n = u.searchParams.get('sources').split(';').length, m = u.searchParams.get('destinations').split(';').length;
    const t = fx('osrm-table.json');
    return r.fulfill({ headers: cors, json: { code: 'Ok', durations: Array.from({ length: n }, (_, i) => Array.from({ length: m }, (_, j) => t.durations[i % 2][j % 2] + j * 30)) } });
  }
  return r.fulfill({ headers: cors, json: fx('osrm-route.json') });
});
let overpassAsked = 0;
await ctx.route(/overpass/, async (r) => {
  overpassAsked++;
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
  assert.equal(await page.locator('#screen-home :text("Sign in")').count(), 0, 'no sign-in on the start screen');
  await shot('01-start');
  await page.fill('#home-search input', 'Baker Street');
  await page.waitForSelector('#home-search .suggestions li[data-i]');
  await shot('02-home');
  await page.keyboard.press('Enter');

  // Main map
  await page.waitForSelector('#screen-main:not([hidden])');
  await page.waitForSelector('.person');
  assert.equal(await page.isDisabled('[data-action=find]'), true, 'find disabled with only you');

  // Adding someone: pick their address (nobody is added yet), then their name, then Add (Sam's address
  // kept with the heart on the way), or Enter in the name box.
  for (const [q, nick, keep] of [['Brick Lane', 'Sam', true], ['Clapham High', 'Jo', false]]) {
    const before = await page.locator('.person').count();
    await page.fill('#add-search input', q);
    await page.waitForSelector('#add-search .suggestions li[data-i]:not(.saved)');
    assert.equal(await page.isDisabled('[data-action=add-person]'), true, 'nothing to add before an address is picked');
    assert.equal(await page.isDisabled('[data-action=save-address]'), true, 'nothing to keep yet');
    await page.keyboard.press('Enter'); // the first suggestion
    await page.waitForFunction(() => document.activeElement?.id === 'add-nick');
    assert.equal(await page.locator('.person').count(), before, 'picking an address adds nobody yet');
    assert.equal(await page.isDisabled('[data-action=add-person]'), false);
    await page.keyboard.type(nick);
    if (keep) {
      await page.click('[data-action=save-address]');
      await page.waitForSelector('[data-action=save-address].on[aria-pressed=true]');
      await page.click('[data-action=add-person]');
    } else {
      await page.keyboard.press('Enter');
    }
    await page.waitForFunction((n) => [...document.querySelectorAll('.person .p-name')].some((e) => e.textContent.includes(n)), nick);
    assert.equal(await page.inputValue('#add-search input'), '', 'the form is empty again');
    assert.equal(await page.isDisabled('[data-action=add-person]'), true);
  }
  await page.waitForTimeout(600);
  await shot('03-people');
  assert.equal(await page.locator('.person').count(), 3);
  // The address kept with the heart: on this device, offered in an empty address box with its name.
  const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('meet-guest-v1')).saved);
  assert.deepEqual(kept.map((s) => s.nickname), ['Sam']);
  await page.click('#add-search input');
  await page.waitForSelector('#add-search .suggestions li.saved');
  assert.match(await page.textContent('#add-search .suggestions li.saved'), /Sam.*Brick Lane/s);
  await shot('03b-saved');
  await page.keyboard.press('Escape');
  await page.locator('#add-search input').blur();

  // Each row: two lines, and a heart on everyone's picture but yours (filled for Sam, whose address is kept).
  assert.equal(await page.locator('.person.home .badge-heart').count(), 0, 'no heart on your own row');
  assert.deepEqual(await page.locator('.person .badge-heart').evaluateAll((bs) => bs.map((b) => b.getAttribute('aria-pressed'))), ['true', 'false']);
  const joRow = () => page.locator('.person', { hasText: 'Clapham' });
  // A tap opens the row where it is: taller, a pencil beside the name, the address lower down in full with a pencil at its end.
  assert.equal(await joRow().locator('.pencil:visible').count(), 0, 'no pencils on a shut row');
  const shutHeight = (await joRow().boundingBox()).height;
  await joRow().locator('.p-name').click();
  await page.waitForSelector('.person.open .p-line1 [data-action=edit][data-field=name]');
  assert.equal(await page.locator('.person.open').count(), 1);
  await page.waitForTimeout(400);
  assert.equal((await joRow().locator('.p-addr span').textContent()).trim(), '5 Clapham High St, London, United Kingdom');
  assert.equal(await joRow().locator('.p-addr [data-action=edit][data-field=address]:visible').count(), 1, 'a pencil at the end of the address');
  const nameBox = await joRow().locator('.p-line1').boundingBox(), addrBox = await joRow().locator('.p-addr').boundingBox();
  assert.ok(addrBox.y >= nameBox.y + nameBox.height + 6, 'the address drops below the top line');
  assert.ok((await joRow().boundingBox()).height > shutHeight + 10, 'the row grows');
  await shot('03a-row-open');
  await joRow().locator('[data-action=edit][data-field=name]').click();
  await page.waitForFunction(() => document.activeElement?.id === 'edit-nick');
  assert.equal(await page.locator('.p-edit .field-icon.save').count(), 1, 'a save button beside the box');
  await page.keyboard.press('Escape'); // leaves things as they were
  await page.waitForSelector('.p-edit', { state: 'detached' });
  await joRow().locator('[data-action=edit][data-field=name]').click();
  await page.waitForFunction(() => document.activeElement?.id === 'edit-nick');
  await page.fill('#edit-nick', 'Joanna');
  await page.keyboard.press('Enter'); // saved
  await page.waitForFunction(() => [...document.querySelectorAll('.person .p-name')].some((e) => e.textContent.includes('Joanna')));
  assert.equal(await page.locator('.person.open', { hasText: 'Joanna' }).count(), 1, 'the row stays open');
  // A new address: picked from the suggestions, then the save button. (And back again.)
  for (const [q, street] of [['Camden', 'Camden Road'], ['Clapham', 'Clapham High St']]) {
    await page.locator('.person', { hasText: 'Joanna' }).locator('[data-action=edit][data-field=address]').click();
    await page.waitForFunction(() => document.activeElement?.id === 'edit-address');
    await page.fill('#edit-address', q);
    await page.waitForSelector('#edit-search .suggestions li[data-i]:not(.saved)');
    await page.keyboard.press('Enter');
    await page.click('.p-edit [type=submit]');
    await page.waitForFunction((st) => [...document.querySelectorAll('.person .p-addr')].some((e) => e.textContent.includes(st)), street);
    if (q === 'Camden') await shot('03c-row-changed');
  }
  const joNow = await page.evaluate(() => JSON.parse(localStorage.getItem('meet-guest-v1')).places.find((x) => x.nickname === 'Joanna'));
  assert.equal(joNow.address.startsWith('5 Clapham High St'), true, 'the address change is saved');
  // Another tap closes it.
  await page.locator('.person', { hasText: 'Joanna' }).locator('.p-name').click();
  await page.waitForFunction(() => !document.querySelector('.person.open'));
  // The heart keeps that address on this device (filled), and forgets it again (hollow).
  const rowHeart = () => page.locator('.person', { hasText: 'Joanna' }).locator('[data-action=heart-person]');
  assert.equal(await rowHeart().getAttribute('aria-pressed'), 'false');
  await rowHeart().click();
  await page.waitForSelector('.person:has-text("Joanna") [data-action=heart-person][aria-pressed=true]');
  assert.deepEqual((await page.evaluate(() => JSON.parse(localStorage.getItem('meet-guest-v1')).saved)).map((x) => x.nickname), ['Joanna', 'Sam']);
  await rowHeart().click();
  await page.waitForSelector('.person:has-text("Joanna") [data-action=heart-person][aria-pressed=false]');
  // A double-tap on the row does the same, the heart popping over their picture (and the row stays shut).
  await page.locator('.person', { hasText: 'Joanna' }).locator('.p-addr').dblclick();
  await page.waitForSelector('.person:has-text("Joanna") [data-action=heart-person][aria-pressed=true]');
  assert.equal(await page.locator('.person:has-text("Joanna") .heart-pop').count(), 1, 'the heart pops');
  await page.waitForTimeout(400);
  assert.equal(await page.locator('.person.open').count(), 0, 'a double-tap does not open the row');
  await rowHeart().click();
  await page.waitForSelector('.person:has-text("Joanna") [data-action=heart-person][aria-pressed=false]');
  assert.equal(await page.locator('.person:has-text("Sam") [data-action=heart-person][aria-pressed=true]').count(), 1, "Sam's address is kept");
  await page.waitForTimeout(700);

  // Leaving: Now by default, or a chosen time, which the search asks public transport for.
  assert.equal(await page.locator('.leave-row [data-action=leave-now].active').count(), 1, 'leaving now by default');
  const later = new Date(Date.now() + 2 * 864e5);
  later.setHours(9, 0, 0, 0);
  const laterValue = new Date(later.getTime() - later.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  await page.fill('#leave-at', laterValue);
  await page.dispatchEvent('#leave-at', 'change');
  assert.equal(await page.locator('#leave-at.active').count(), 1);
  assert.equal(await page.locator('.leave-row [data-action=leave-now].active').count(), 0);
  // Reset in a phone's date picker empties the box: leaving now again, the box showing the time it is now.
  await page.evaluate(() => {
    const box = document.querySelector('#leave-at');
    box.value = '';
    box.dispatchEvent(new Event('input', { bubbles: true }));
    box.dispatchEvent(new Event('change', { bubbles: true }));
  });
  assert.equal(await page.locator('.leave-row [data-action=leave-now].active').count(), 1, 'Reset: leaving now');
  assert.equal(await page.locator('#leave-at.active').count(), 0);
  const shownNow = await page.inputValue('#leave-at');
  assert.ok(Math.abs(new Date(shownNow).getTime() - Date.now()) < 120000, `Reset shows the time it is now: ${shownNow}`);
  await page.fill('#leave-at', laterValue); // (and the time chosen again, for the search)
  await page.dispatchEvent('#leave-at', 'change');
  assert.equal(await page.locator('#leave-at.active').count(), 1);

  // Find places → the search animation: everyone's floods converge on the meeting point, then the routes.
  // The map stays as it is (everyone is in sight): the lines are drawn on it.
  const mapView = () => page.evaluate(() => { const m = window.__meet.map, c = m.getCenter(); return [c.lat.toFixed(6), c.lng.toFixed(6), m.getZoom()]; });
  const viewBefore = await mapView();
  await page.click('[data-action=find]');
  await page.waitForSelector('.growth-canvas');
  await page.waitForSelector('#screen-main.flooding .flood-base.on', { timeout: 20000 });
  assert.deepEqual(await mapView(), viewBefore, 'the map stays where it was when the search starts');
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
  assert.equal(await page.locator('.flood-base').count(), 0, 'the dimming is gone');
  assert.deepEqual(await mapView(), viewBefore, 'and where it was with the results (nobody is behind the panel)');
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
  // No "Similar travel times" heading; Your route and Send (with its paper aeroplane) instead of one row for both.
  assert.doesNotMatch(await page.textContent('.panel'), /Similar travel times|Routes to this spot/);
  assert.equal(await page.locator('.meet-actions [data-action=your-route]').count(), 1);
  assert.equal(await page.locator('.meet-actions [data-action=send-meet] svg').count(), 1);
  assert.equal(await page.locator('[data-action=surprise]').count(), 0);
  assert.equal(await page.locator('.panel .modes').count(), 0, 'no travel-mode bar on the results screen');
  // How far to look: a slider from 100 m to 1 km, drawn as a circle around the meeting point.
  // Further than the places found so far asks again (a spinner in front of "places within"
  // meanwhile); closer in needs no new search.
  assert.equal(await page.locator('.radius-ring').count(), 0);
  const slider = page.locator('.radius-slider');
  assert.deepEqual([await slider.getAttribute('min'), await slider.getAttribute('max'), await slider.inputValue()], ['100', '1000', '800']);
  assert.match(await page.textContent('.radius-label'), /^\s*\d+\s*places within\s*800 m\s*$/);
  const slide = (v) => slider.evaluate((el, x) => {
    el.value = x;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, String(v));
  const askedBefore = overpassAsked;
  await slide(1000);
  await page.waitForSelector('.radius-ring');
  await page.waitForSelector('.radius-label .radius-spin');
  await page.waitForFunction(() => !document.querySelector('.radius-spin') && /places within\s*1 km/.test(document.querySelector('.radius-label')?.textContent || ''));
  assert.equal(overpassAsked, askedBefore + 1, 'further out: asked again');
  const within1km = Number(await page.textContent('.radius-count'));
  await slide(300);
  await page.waitForFunction(() => /places within\s*300 m/.test(document.querySelector('.radius-label')?.textContent || ''));
  const within300 = Number(await page.textContent('.radius-count'));
  assert.ok(within300 < within1km, `${within300} places within 300 m, ${within1km} within 1 km`);
  await slide(1000);
  await page.waitForFunction(() => /places within\s*1 km/.test(document.querySelector('.radius-label')?.textContent || ''));
  assert.equal(overpassAsked, askedBefore + 1, 'within what was found already: no new search');
  assert.equal(Number(await page.textContent('.radius-count')), within1km);
  await page.waitForTimeout(700);
  await shot('05b-radius');
  const italian = page.locator('[data-action=group]', { hasText: 'Italian' });
  assert.equal((await italian.locator('.cell-end').textContent()).trim(), '4', 'Italian count');

  // Going from page to page: the next page slides in over the last (counted as the page leaving gets its own layer).
  await page.evaluate(() => {
    window.__turns = 0;
    new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) if (n.classList?.contains('page-leaving')) window.__turns++; })
      .observe(document.getElementById('panel'), { childList: true });
  });
  // Your route: just your way to the meeting point (the others' lines leave the map), its steps open.
  await page.click('[data-action=your-route]');
  await page.waitForSelector('.dirs > li');
  assert.equal(await page.locator('.dirs > li').count(), 1, 'only your route');
  assert.match(await page.textContent('.dirs > li'), /You/);
  assert.equal(await page.locator('.growth-canvas.away').count(), 1, 'the others’ routes give way to yours');
  await page.waitForSelector('.dirs > li.open .itin');
  await page.waitForTimeout(600);
  assert.equal(await page.locator('.page-leaving').count(), 0, 'the page that left is gone once the new one is in');
  await shot('05c-your-route');
  await page.click('[data-action=back-results]');
  await page.waitForSelector('.panel .pills');
  assert.equal(await page.locator('.growth-canvas.away').count(), 0, 'everyone’s routes again');
  // Send, straight from the results; Back comes back to them.
  await page.click('[data-action=send-meet]');
  await page.waitForSelector('#share-text');
  assert.match(await page.inputValue('#share-text'), /Let's meet at/);
  await page.click('[data-action=back-share]');
  await page.waitForSelector('.panel .pills');
  assert.equal(await page.evaluate(() => window.__turns), 4, 'each change of page slid');

  // Category → POI map
  await italian.click();
  await page.waitForSelector('.poi');
  assert.equal(await page.locator('.poi').count(), 4);
  assert.equal(await page.locator('.poi-pin').count(), 4);
  // Each place: its name, then a very short summary of it, and about how long the longest trip there is.
  assert.deepEqual(await page.locator('.poi .p-sum').allTextContents(), ['Italian', 'Italian', 'Italian', 'Italian']);
  for (const end of await page.locator('.poi .cell-end').allTextContents()) assert.match(end, /~\d+ min$/, `trip time: ${end}`);
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
  // Arrive by, then Reset in the date picker (an emptied box): leaving now again.
  const empty = (sel) => page.evaluate((q) => {
    const box = document.querySelector(q);
    box.value = '';
    box.dispatchEvent(new Event('input', { bubbles: true }));
    box.dispatchEvent(new Event('change', { bubbles: true }));
  }, sel);
  await page.selectOption('#dir-when-type', 'arrive');
  await page.waitForSelector('#dir-when-time');
  await empty('#dir-when-time');
  await page.waitForSelector('#dir-when-time', { state: 'detached' });
  assert.equal(await page.inputValue('#dir-when-type'), 'now', 'Reset: leaving now');
  await page.click('[data-action=choose]');
  await page.waitForSelector('#share-text');
  const text = await page.inputValue('#share-text');
  assert.match(text, /Let's meet at/);
  assert.match(text, /google\.com\/maps/);
  // Reset on the time to send: the time it is now, in the message too.
  await empty('#share-when');
  const sendAt = await page.inputValue('#share-when');
  assert.ok(Math.abs(new Date(sendAt).getTime() - Date.now()) < 120000, `Reset: the time it is now (${sendAt})`);
  assert.notEqual(await page.inputValue('#share-text'), text, 'the message has the time');
  await shot('08-share');

  // History is in the menu; there's nothing to sign in to.
  await page.click('#btn-menu');
  await page.waitForSelector('#history-list [data-hid]');
  await shot('09-menu');
  assert.equal(await page.locator('#drawer :text("Sign in")').count(), 0, 'no sign-in in the menu');
  await page.click('#drawer-close');

  // Reload: everything was saved on this device.
  await page.reload();
  await page.waitForSelector('.person');
  assert.equal(await page.locator('.person').count(), 3, 'addresses saved on the device');
  assert.match(await page.locator('.person', { hasText: 'Sam' }).locator('.mode-pill').textContent(), /Bike/, "Sam's travel mode is remembered");
  await page.click('#btn-menu');
  assert.equal(await page.locator('#history-list [data-hid]').count(), 2, 'history saved on the device (the meeting point and the place sent)');
  await page.click('#drawer-close');

  // Exclude Jo and search again with just two people.
  // Tapping someone's switch leaves them out, without opening their row.
  await page.locator('.person', { hasText: 'Jo' }).locator('.switch span').click();
  await page.waitForFunction(() => document.querySelectorAll('.person.inactive').length === 1);
  await page.waitForTimeout(400);
  assert.equal(await page.locator('.person.open').count(), 0, 'the switch does not open the row');
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
  assert.equal(await page.locator('.result-head[data-rule=similar]').count(), 1);
  await page.click('#btn-menu');
  await page.click('#set-mode [data-value=total]');
  await page.waitForSelector('#drawer', { state: 'hidden' });
  await page.waitForSelector('.panel:not(.away) .result-head[data-rule=total]', { timeout: 45000 });

  // Mobile layout check
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  await shot('12-mobile-results');
  // The sheet pulled up stays up from page to page (and back again).
  await page.focus('#panel-handle');
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(450);
  const pulledUp = await page.evaluate(() => document.getElementById('panel').offsetHeight);
  assert.ok(pulledUp > 700, `pulled all the way up: ${pulledUp}px`);
  await page.locator('[data-action=group]').first().click();
  await page.waitForSelector('.poi');
  await page.click('[data-action=back-results]');
  await page.waitForSelector('.panel .pills');
  await page.waitForTimeout(450);
  assert.equal(await page.evaluate(() => document.getElementById('panel').offsetHeight), pulledUp, 'back keeps the size it was pulled to');
  await page.click('[data-action=edit-people]');
  await page.waitForSelector('.person');
  await page.waitForTimeout(500);
  await shot('13-mobile-people');

  assert.ok(routingAsked > 0, 'walking, cycling and driving routes came straight from the routing service');
  assert.equal(tablesAsked, 0, 'travel times for finding the spot and for lists of places were worked out over the streets loaded, not asked for');
  assert.deepEqual(errors, [], `page errors: ${errors.join('\n')}`);
  console.log('E2E passed ✔');
} catch (err) {
  await shot('zz-failure');
  console.error('E2E failed:', err.message, '\nWhere:', (err.stack || '').split('\n').find((l) => l.includes('e2e.mjs')), '\nPage errors:', errors);
  process.exitCode = 1;
} finally {
  await browser.close();
  server.kill();
  fs.rmSync(dataFile, { force: true });
}
