// The advert's app footage, captured in one session of Meet's test build (central Sydney, fictional
// people). Usage: node scenes.mjs [--until <clip>]
import fs from 'node:fs';
import path from 'node:path';
import { openRig } from './rig.mjs';

const until = process.argv.includes('--until') ? process.argv[process.argv.indexOf('--until') + 1] : null;
const OUT = path.resolve('/home/user/Claude-app/promo/public/captures');
fs.mkdirSync(OUT, { recursive: true });
const rig = await openRig({ out: OUT });
const { page } = rig;
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const meta = {};
const box = async (sel) => { const b = await page.locator(sel).first().boundingBox(); return b && { x: b.x + b.width / 2, y: b.y + b.height / 2, b }; };
/** Step (recording) until a condition holds, at most `max` frames. */
async function stepUntil(cond, max = 120, label = '') {
  for (let i = 0; i < max; i++) {
    if (await page.evaluate(cond)) return i;
    await rig.step(1);
  }
  throw new Error(`timed out waiting: ${label}`);
}
// (merged into what's there, so one clip can be re-shot on its own with --until)
const writeMeta = () => {
  const file = path.join(OUT, 'meta.json');
  const old = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  fs.writeFileSync(file, JSON.stringify({ ...old, ...meta, frames: { ...(old.frames || {}), ...(meta.frames || {}) } }, null, 2));
};
/** Off camera: let the clock run until every map tile in view has been drawn. */
async function tilesDrawn(label) {
  for (let i = 0; i < 80; i++) {
    const left = await page.evaluate(() => [...document.querySelectorAll('.leaflet-tile')].filter((t) => !t.classList.contains('leaflet-tile-loaded')).length);
    if (!left && i > 2) return log('tiles drawn', label, i);
    await rig.idle(250);
  }
  log('tiles still drawing', label);
}
const done = async (name) => { const c = rig.cut(); log('clip', name, c?.n, 'frames'); (meta.frames ||= {})[name] = c?.n; writeMeta(); if (until === name) await finish(); };
async function finish() {
  writeMeta();
  log('errors:', rig.errors);
  await rig.close();
  process.exit(0);
}

// ---------------------------------------------------------------- the start screen (still)
await rig.idle(1500);
await page.evaluate(() => document.fonts.ready);
await rig.still('start');
log('start still');

// ---------------------------------------------------------------- off camera: the group (Leo comes later)
const g = await page.evaluate(() => __m.demo.sampleGroup());
meta.group = g;
await page.evaluate(async (g) => {
  const { api, onUser } = window.__meet;
  // The ways of travelling that give this group the most even trips (capture/fairest.mjs):
  // you walk, Sam bikes (he switches on camera), Priya and Leo drive (17 · 11 · 11 · 16 min).
  await api.updateMe({ home: { ...g.home, mode: 'walk' } });
  await api.addPlace({ ...g.friends[0], mode: 'walk' }); // Sam
  await api.addPlace({ ...g.friends[1], mode: 'drive' }); // Priya
  const me = await api.me();
  await api.updateMe({ settings: { ...(me.user.settings || {}), travel: 'drive' } }); // so Leo, added on camera, drives
  onUser((await api.me()).user);
}, g);
await rig.idle(3000);
// Leo's corner of the map in view: everyone (him included) fitted above the sheet.
await page.evaluate((g) => {
  const m = window.__meet.map;
  const pts = [g.home, ...g.friends].map((p) => [p.lat, p.lon]);
  // Close on Leo's corner of North Sydney, his spot a third of the way down: his address card then
  // opens clear of the buttons at the top, and the view stays inside the built-in map.
  const leo = g.friends[2];
  m.setView([leo.lat, leo.lon], 13.25, { animate: false });
  m.panBy([-30, 180], { animate: false });
}, g);
await rig.idle(2500);
await tilesDrawn('crew');
await rig.freeze();

// ---------------------------------------------------------------- 1. crew: Leo is added from the map
rig.record('crew');
await rig.step(15);
const leo = g.friends[2];
const pt = await page.evaluate((p) => { const c = window.__meet.map.latLngToContainerPoint([p.lat, p.lon]); return { x: c.x, y: c.y }; }, leo);
meta.crew = { tapMap: pt };
await page.touchscreen.tap(pt.x, pt.y);
meta.crew.tapMap.frame = rig.frame();
await stepUntil(() => !!document.querySelector('.map-popup .btn'), 90, 'use this address');
await rig.step(22);
const use = await box('.map-popup .btn');
meta.crew.tapUse = { x: use.x, y: use.y, frame: rig.frame() };
await page.touchscreen.tap(use.x, use.y);
await rig.step(24);
meta.crew.typeFrom = rig.frame();
for (const ch of 'Leo') { await page.keyboard.type(ch); await rig.step(5); }
await rig.step(14);
const add = await box('[data-action=add-person]');
meta.crew.tapAdd = { x: add.x, y: add.y, frame: rig.frame() };
await page.touchscreen.tap(add.x, add.y);
await rig.step(75);
await done('crew');

// ---------------------------------------------------------------- 2. modes: Sam walks → bikes
rig.record('modes');
await rig.step(12);
const pill = await box('.person:nth-child(2) .mode-pill');
meta.modes = { tapPill: { x: pill.x, y: pill.y, frame: rig.frame() } };
await page.touchscreen.tap(pill.x, pill.y);
await rig.step(26);
const bike = await box('.menu [data-mode=bike]');
meta.modes.tapBike = { x: bike.x, y: bike.y, frame: rig.frame() };
await page.touchscreen.tap(bike.x, bike.y);
await rig.step(40);
await done('modes');

// ---------------------------------------------------------------- 3. go: the sheet down, the play button, the race, the spot
// (off camera, between shots: the map closer in on the four of them, so the whole screen is map once
// the sheet is down: the built-in map of central Sydney ends a little south of Newtown)
await rig.thaw();
await page.evaluate((g) => {
  const m = window.__meet.map;
  const pts = [g.home, ...g.friends].map((p) => [p.lat, p.lon]);
  m.fitBounds(pts, { paddingTopLeft: [48, 150], paddingBottomRight: [48, 230], animate: false });
}, g);
await rig.idle(2500);
await tilesDrawn('go');
await rig.freeze();
rig.record('go');
await rig.step(10);
const h = await box('#panel-handle');
meta.go = { drag: { x: h.x, y: h.y, frame: rig.frame(), to: h.y + 520 } };
await page.mouse.move(h.x, h.y);
await page.mouse.down();
const peekDrop = 520;
for (let i = 1; i <= 14; i++) {
  const t = i / 14;
  const e = 1 - Math.pow(1 - t, 2);
  await page.mouse.move(h.x, h.y + peekDrop * e);
  await rig.step(1);
}
await page.mouse.up();
await stepUntil(() => Number(getComputedStyle(document.querySelector('#btn-go')).opacity) > 0.98, 60, 'play button');
await rig.step(24);
const go = await box('#btn-go');
meta.go.tapPlay = { x: go.x, y: go.y, frame: rig.frame() };
await page.touchscreen.tap(go.x, go.y);
let f = 0;
for (; f < 1400; f++) {
  if (await page.evaluate(() => !!document.querySelector('.panel:not(.away) .pills'))) break;
  await rig.step(1);
}
meta.go.resultsAt = rig.frame();
log('race frames until results', f);
await rig.step(80);
await done('go');

// ---------------------------------------------------------------- a sharp picture of the spot (for the crash zoom)
const spot = await page.evaluate(() => {
  const s = window.__meet.map && document.querySelector('.meet-halo, .meet-pin, .leaflet-marker-icon.meet');
  const r = s?.getBoundingClientRect();
  return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
});
meta.spot = spot;
log('spot', spot);

// ---------------------------------------------------------------- 4. places: tabs, a group, a place, send invite
rig.record('places');
await rig.step(16);
// the sheet pulled all the way up by its tab (it opened as small as it was left)
const hp = await box('#panel-handle');
meta.places = { pull: { x: hp.x, y: hp.y, frame: rig.frame() } };
await page.mouse.move(hp.x, hp.y);
await page.mouse.down();
const rise = hp.y - 110;
for (let i = 1; i <= 18; i++) {
  const t = i / 18;
  await page.mouse.move(hp.x, hp.y - rise * (1 - Math.pow(1 - t, 2.2)));
  await rig.step(1);
}
await page.mouse.up();
meta.places.pull.to = 110;
await rig.step(40); // everyone's time, held
// the tabs into sight: the list scrolled on with a finger's flick if they're still below
const pillsY = async () => page.evaluate(() => document.querySelector('.panel:not(.away) .pills')?.getBoundingClientRect().top ?? 9999);
let need = (await pillsY()) - 560;
meta.places.scroll = need > 0 ? { by: need, frame: rig.frame() } : null;
if (need > 0) {
  const start = await page.evaluate(() => document.querySelector('.panel:not(.away) #panel-body, #panel-body').scrollTop);
  for (let i = 1; i <= 16; i++) {
    const e = 1 - Math.pow(1 - i / 16, 3);
    await page.evaluate((y) => { document.querySelector('#panel-body').scrollTop = y; }, start + need * e);
    await rig.step(1);
  }
  await rig.step(16);
}
log('pills at', await pillsY());
const tabs = await page.$$eval('.pills .pill', (els) => els.map((e) => { const r = e.getBoundingClientRect(); return { text: e.textContent.trim(), x: r.x + r.width / 2, y: r.y + r.height / 2 }; }));
meta.places.tabs = tabs;
const drinks = tabs.find((t) => /Drinks/.test(t.text)) || tabs[1];
if (!(drinks.y > 80 && drinks.y < 800)) throw new Error('tabs not in sight ' + JSON.stringify(tabs));
await page.touchscreen.tap(drinks.x, drinks.y);
meta.places.tapDrinks = { ...drinks, frame: rig.frame() };
await rig.step(36);
const food = tabs.find((t) => /Food/.test(t.text)) || tabs[0];
await page.touchscreen.tap(food.x, food.y);
meta.places.tapFood = { ...food, frame: rig.frame() };
await rig.step(36);
const grp = await box('[data-action=group]');
meta.places.tapGroup = { x: grp.x, y: grp.y, frame: rig.frame() };
await page.touchscreen.tap(grp.x, grp.y);
for (let i = 0; i < 60 && !(await page.$('[data-action=place]')); i++) await rig.step(1);
if (!(await page.$('[data-action=place]'))) { console.log('panel:', (await page.textContent('#panel-body')).slice(0, 600)); }
await rig.step(34);
const place = await box('[data-action=place]');
meta.places.tapPlace = { x: place.x, y: place.y, frame: rig.frame() };
await page.touchscreen.tap(place.x, place.y);
for (let i = 0; i < 60 && !(await page.$('[data-action=choose]')); i++) await rig.step(1);
await rig.step(44);
const send = await box('[data-action=choose]');
meta.places.tapSend = { x: send.x, y: send.y, frame: rig.frame() };
await page.touchscreen.tap(send.x, send.y);
for (let i = 0; i < 60 && !(await page.$('[data-action=native-share]')); i++) await rig.step(1);
await rig.step(6);
// when: this Friday, 6:30 pm (picked in the date field)
await page.evaluate(() => {
  const w = document.querySelector('#share-when');
  w.value = '2026-11-27T18:30';
  w.dispatchEvent(new Event('change', { bubbles: true }));
});
await rig.step(38);
meta.shareText = await page.inputValue('#share-text').catch(() => '');
const share = await box('[data-action=native-share]');
meta.places.shareBtn = share && { x: share.x, y: share.y };
await done('places');
await finish();
