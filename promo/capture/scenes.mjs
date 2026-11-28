// The advert's app footage, captured in one session of the live site (meet-hhdt.onrender.com: its real
// map, routing and places), with a fictional group in New York on a US phone (miles, Eastern time).
// Usage: node scenes.mjs [--dark] [--until <clip>]   (--dark: the phone in dark mode, into captures-dark/)
import fs from 'node:fs';
import path from 'node:path';
import { openRig, LIVE } from './rig.mjs';

const until = process.argv.includes('--until') ? process.argv[process.argv.indexOf('--until') + 1] : null;
const DARK = process.argv.includes('--dark');
const OUT = path.resolve(`/home/user/Claude-app/promo/public/captures${DARK ? '-dark' : ''}`);
fs.mkdirSync(OUT, { recursive: true });
const rig = await openRig({ out: OUT, url: LIVE, dark: DARK });
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

// The share page's map-app buttons, without the one named after a phone maker (the advert's brand rule);
// and the place page without Google's embedded place card (its photos can't load from the capture
// machine: the app's own place page instead, as it shows when Google has no match)
await page.evaluate(() => {
  const hide = () => { for (const a of document.querySelectorAll('a.btn')) if (/^\s*Apple Maps\s*$/.test(a.textContent)) a.remove(); };
  new MutationObserver(hide).observe(document.body, { childList: true, subtree: true });
  document.head.appendChild(Object.assign(document.createElement('style'), { textContent: 'gmp-place-details { display: none !important; }' }));
});

// The date and time fields as an iPhone shows them ("Dec 4, 2026 at 8:00 PM"), not as the desktop
// field the capture browser draws ("12/04/2026, 08:00 PM" and a calendar button): the field's own text
// hidden, the phone's wording drawn in its place in the field's own font, kept in step every frame.
await page.evaluate(() => {
  document.head.appendChild(Object.assign(document.createElement('style'), { textContent:
    'input[type=datetime-local]::-webkit-datetime-edit{opacity:0}input[type=datetime-local]::-webkit-calendar-picker-indicator{opacity:0}' +
    '.ios-when{position:absolute;display:flex;align-items:center;pointer-events:none;white-space:nowrap;overflow:hidden}' }));
  const say = (v) => {
    const d = new Date(v);
    if (!v || Number.isNaN(d.getTime())) return '';
    return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} at ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
  };
  const tick = () => {
    for (const el of document.querySelectorAll('input[type=datetime-local]')) {
      const host = el.parentElement;
      if (!host) continue;
      if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
      let lab = el.nextElementSibling?.classList?.contains('ios-when') ? el.nextElementSibling : null;
      if (!lab) { lab = Object.assign(document.createElement('span'), { className: 'ios-when' }); el.after(lab); }
      const cs = getComputedStyle(el);
      Object.assign(lab.style, {
        left: `${el.offsetLeft}px`, top: `${el.offsetTop}px`, width: `${el.offsetWidth}px`, height: `${el.offsetHeight}px`,
        font: cs.font, color: cs.color, paddingLeft: cs.paddingLeft, paddingRight: cs.paddingRight, boxSizing: 'border-box',
        justifyContent: cs.textAlign === 'right' || cs.textAlign === 'end' ? 'flex-end' : cs.textAlign === 'center' ? 'center' : 'flex-start',
      });
      const text = say(el.value);
      if (lab.textContent !== text) lab.textContent = text;
    }
    requestAnimationFrame(tick);
  };
  tick();
});

// ---------------------------------------------------------------- the start screen (still)
await rig.idle(1500);
await page.evaluate(() => document.fonts.ready);
await rig.still('start');
log('start still');

// ---------------------------------------------------------------- off camera: the group (Ryan comes later)
// The group: fictional people at public places in New York (You by McCarren Park in Williamsburg, Jake
// on the Upper West Side, Emily in Greenpoint, and Ryan across the river in Hoboken)
const g = {
  home: { address: 'McCarren Park, Brooklyn', lat: 40.7200, lon: -73.9510 },
  friends: [
    { address: 'Broadway & West 86th Street, New York', lat: 40.7885, lon: -73.9770, nickname: 'Jake' },
    { address: 'Transmitter Park, Greenpoint, Brooklyn', lat: 40.7296, lon: -73.9603, nickname: 'Emily' },
    { address: 'Hoboken Terminal, 1 Hudson Pl, Hoboken', lat: 40.7349, lon: -74.0279, nickname: 'Ryan' },
  ],
};
/** Where the race sends them (the live site's answer for this group on a Friday evening): the invite goes there. */
const SPOT_NAME = 'Handcraft';
meta.group = g;
await page.evaluate(async (g) => {
  const { api, onUser } = window.__meet;
  // You, Emily and Ryan take the subway (Ryan the PATH train), Jake bikes (he switches on camera): on the
  // live site, on a Friday evening, the fairest spot is Handcraft on 3rd Avenue (30 · 29 · 34 · 31 min).
  await api.updateMe({ home: { ...g.home, mode: 'transit' } });
  await api.addPlace({ ...g.friends[0], mode: 'walk' }); // Jake
  await api.addPlace({ ...g.friends[1], mode: 'transit' }); // Emily
  const me = await api.me();
  await api.updateMe({ settings: { ...(me.user.settings || {}), travel: 'transit' } }); // so Ryan, added on camera, takes the train
  onUser((await api.me()).user);
}, g);
await rig.idle(3000);
// Leo's corner of the map in view: everyone (him included) fitted above the sheet.
await page.evaluate((g) => {
  const m = window.__meet.map;
  const pts = [g.home, ...g.friends].map((p) => [p.lat, p.lon]);
  // Close on Leo's corner of Hoboken, his spot a third of the way down: his address card then opens
  // clear of the buttons at the top.
  const leo = g.friends[2];
  m.setView([leo.lat, leo.lon], 13.25, { animate: false });
  m.panBy([-30, 122], { animate: false }); // (Leo ~300 down: his card opens below the status bar and the buttons)
}, g);
await rig.idle(2500);
await tilesDrawn('crew');
await rig.freeze();

// ---------------------------------------------------------------- 1. crew: Ryan is added from the map
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
for (const ch of 'Ryan') { await page.keyboard.type(ch); await rig.step(5); }
await rig.step(14);
const add = await box('[data-action=add-person]');
meta.crew.tapAdd = { x: add.x, y: add.y, frame: rig.frame() };
await page.touchscreen.tap(add.x, add.y);
await rig.step(75);
await done('crew');

// ---------------------------------------------------------------- 2. modes: Jake walks → bikes
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
// the sheet is down)
await rig.thaw();
await page.evaluate((g) => {
  const m = window.__meet.map;
  const pts = [g.home, ...g.friends].map((p) => [p.lat, p.lon]);
  m.fitBounds(pts, { paddingTopLeft: [48, 200], paddingBottomRight: [48, 250], animate: false });
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
// (each tab found again just before it's tapped: a shorter list under one tab can shift the sheet)
const tabAt = async (re) => (await page.$$eval('.pills .pill', (els) => els.map((e) => { const r = e.getBoundingClientRect(); return { text: e.textContent.trim(), x: r.x + r.width / 2, y: r.y + r.height / 2 }; }))).find((t) => re.test(t.text));
// Drinks (the highlight slides along), then Food (back): the restaurants, nearest first: the meeting
// point itself (Handcraft) is the first of them
const drinks = await tabAt(/Drinks/);
if (!(drinks && drinks.y > 80 && drinks.y < 800)) throw new Error('tabs not in sight ' + JSON.stringify(tabs));
await page.touchscreen.tap(drinks.x, drinks.y);
meta.places.tapTab1 = { ...drinks, frame: rig.frame() };
await rig.step(36);
const food = await tabAt(/Food/);
await page.touchscreen.tap(food.x, food.y);
meta.places.tapTab2 = { ...food, frame: rig.frame() };
await rig.step(36);
const rest = await page.locator('[data-action=group]', { hasText: 'Restaurants' }).first().boundingBox();
if (!rest) throw new Error('no Restaurants group: ' + (await page.textContent('#panel-body')).replace(/\s+/g, ' ').slice(0, 300));
meta.places.tapGroup = { x: rest.x + rest.width / 2, y: rest.y + rest.height / 2, frame: rig.frame() };
await page.touchscreen.tap(meta.places.tapGroup.x, meta.places.tapGroup.y);
for (let i = 0; i < 60 && !(await page.$('[data-action=place]')); i++) await rig.step(1);
await rig.step(34);
// the meeting point's own row (or, failing that, the nearest)
const named = await page.locator('[data-action=place]', { hasText: SPOT_NAME }).first().boundingBox().catch(() => null);
if (!named) log('no row named', SPOT_NAME, ': taking the first');
const place = named ? { x: named.x + named.width / 2, y: named.y + named.height / 2 } : await box('[data-action=place]');
meta.places.tapPlace = { x: place.x, y: place.y, frame: rig.frame() };
await page.touchscreen.tap(place.x, place.y);
for (let i = 0; i < 60 && !(await page.$('[data-action=choose]')); i++) await rig.step(1);
await rig.step(44);
await page.evaluate(() => document.querySelector('[data-action=choose]')?.scrollIntoView({ block: 'nearest' }));
await rig.step(2);
const send = await box('[data-action=choose]');
meta.places.tapSend = { x: send.x, y: send.y, frame: rig.frame() };
await page.touchscreen.tap(send.x, send.y);
for (let i = 0; i < 60 && !(await page.$('[data-action=native-share]')); i++) await rig.step(1);
if (!(await page.$('#share-when'))) throw new Error('the invite page did not open: ' + (await page.textContent('#panel-body')).replace(/\s+/g, ' ').slice(0, 300));
await rig.step(6);
// when: tonight, 8 pm (picked in the date field)
await page.evaluate(() => {
  const w = document.querySelector('#share-when');
  w.value = '2026-12-04T20:00';
  w.dispatchEvent(new Event('change', { bubbles: true }));
});
await rig.step(38);
meta.shareText = await page.inputValue('#share-text').catch(() => '');
const share = await box('[data-action=native-share]');
meta.places.shareBtn = share && { x: share.x, y: share.y };
await done('places');
await finish();
