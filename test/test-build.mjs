// Smoke test for the test version (dist/meet-test.html): it starts, finds a
// meeting point with the sample group and opens a place, without errors.
//   node scripts/build-test.mjs && node test/test-build.mjs
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const { chromium } = await import('playwright').catch(() => createRequire(import.meta.url)('playwright'));
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 820 } });
  // The page's only outside files: Leaflet from a CDN (served locally here) and a font.
  await ctx.route('https://cdnjs.cloudflare.com/**', (r) => r.fulfill({ path: path.join(root, 'node_modules/leaflet/dist/leaflet.js'), contentType: 'text/javascript' }));
  await ctx.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ body: '', contentType: 'text/css' }));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`file://${path.join(root, 'dist/meet-test.html')}`);
  await page.click('#demo-sample', { timeout: 15000 });
  await page.waitForSelector('.person');
  await page.click('[data-action=find]');
  await page.waitForSelector('#btn-skip:not([hidden])');
  await page.click('#btn-skip');
  await page.waitForSelector('.panel:not(.away) .pills', { timeout: 30000 });
  await page.locator('[data-action=group]').first().click();
  await page.locator('.poi').first().click();
  await page.waitForSelector('.place-title');
  assert.deepEqual(errors, []);
  console.log('Test version passed ✔');
} catch (err) {
  console.error('Test version failed:', err.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
