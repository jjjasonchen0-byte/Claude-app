// Which ways of travelling give the group the most even trip times? Runs Meet's own search for each
// combination (Sam bikes: he switches on camera) and prints the travel times it finds.
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const html = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' + fs.readFileSync('/home/user/Claude-app/dist/meet-test.html', 'utf8');
const server = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end(html); }).listen(0);
const browser = await chromium.launch();
const modes = ['walk', 'bike', 'drive'];
const combos = [];
for (const you of modes) for (const priya of modes) for (const leo of modes) combos.push({ you, sam: 'bike', priya, leo });
const only = process.argv[2] ? combos.filter((c) => `${c.you},${c.priya},${c.leo}` === process.argv[2]) : combos;
const results = [];
for (const c of only) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Australia/Sydney', locale: 'en-AU' });
  await ctx.route('https://cdnjs.cloudflare.com/**', (r) => r.fulfill({ path: '/home/user/Claude-app/node_modules/leaflet/dist/leaflet.js', contentType: 'text/javascript' }));
  await ctx.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ body: '', contentType: 'text/css' }));
  const page = await ctx.newPage();
  await page.goto(`http://localhost:${server.address().port}/`);
  await page.waitForTimeout(800);
  await page.evaluate(async (c) => {
    const g = __m.demo.sampleGroup();
    const { api, onUser } = window.__meet;
    await api.updateMe({ home: { ...g.home, mode: c.you } });
    await api.addPlace({ ...g.friends[0], mode: c.sam });
    await api.addPlace({ ...g.friends[1], mode: c.priya });
    await api.addPlace({ ...g.friends[2], mode: c.leo });
    onUser((await api.me()).user);
    const s = await api.me();
    await api.updateMe({ settings: { ...(s.user.settings || {}), speed: 'fast' } });
  }, c);
  await page.waitForTimeout(1200);
  await page.click('[data-action=find]');
  try {
    await page.waitForSelector('.panel:not(.away) .pills', { timeout: 90000 });
    await page.waitForTimeout(500);
    const times = await page.$$eval('.panel .trip', (els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim()));
    const place = await page.textContent('.panel h2, .panel .result-head').catch(() => '');
    const mins = times.map((t) => Number((t.match(/(\d+) min/) || [])[1])).filter(Number.isFinite);
    const spread = Math.max(...mins) - Math.min(...mins);
    results.push({ ...c, mins, spread, place: place.replace(/\s+/g, ' ').trim().slice(0, 40) });
    console.log(JSON.stringify(results[results.length - 1]));
  } catch (e) { console.log('failed', JSON.stringify(c), e.message.split('\n')[0]); }
  await ctx.close();
}
results.sort((a, b) => a.spread - b.spread || Math.max(...a.mins) - Math.max(...b.mins));
console.log('BEST', JSON.stringify(results.slice(0, 5)));
await browser.close();
server.close();
