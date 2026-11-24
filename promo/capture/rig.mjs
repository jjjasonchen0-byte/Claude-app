// Frame-exact capture of Meet's test build for the advert.
//
// The page runs on a clock we hold: Playwright's fake clock drives JavaScript time (Date,
// performance.now, timers, requestAnimationFrame) and DevTools freezes the document timeline,
// so CSS transitions, CSS animations and Web Animations are stepped by hand too. Each `step()`
// moves the whole page on by exactly one video frame; a screenshot then records it. However slow
// the screenshots are, the footage plays back perfectly smoothly at 30fps.
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const REPO = '/home/user/Claude-app';
export const FPS = 30;
const DT = 1000 / FPS;

export async function openRig({ scale = 3, start = '2026-11-27T18:30:00+11:00', dark = false, out = path.join(REPO, 'promo/public/captures') } = {}) {
  const html = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">' + fs.readFileSync(path.join(REPO, 'dist/meet-test.html'), 'utf8');
  const server = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end(html); }).listen(0);
  // (an Australian phone: dates as 27/11/2026 in the date fields; the browser takes it from the environment)
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'], env: { ...process.env, LANG: 'en_AU.UTF-8', LANGUAGE: 'en_AU:en', LC_ALL: 'en_AU.UTF-8' } });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: scale, hasTouch: true, isMobile: true, colorScheme: dark ? 'dark' : 'light', timezoneId: 'Australia/Sydney', locale: 'en-AU' });
  await ctx.route('https://cdnjs.cloudflare.com/**', (r) => r.fulfill({ path: path.join(REPO, 'node_modules/leaflet/dist/leaflet.js'), contentType: 'text/javascript' }));
  await ctx.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ body: '', contentType: 'text/css' }));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.clock.install({ time: new Date(start) });
  await page.goto(`http://localhost:${server.address().port}/`);
  // Playwright's fake requestAnimationFrame hands callbacks a timestamp on another time base than
  // its fake performance.now(); animations that compare the two (Meet's route race does) would jump
  // to their end. Each callback gets the page's own performance.now() instead.
  await page.evaluate(() => {
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => raf(() => cb(performance.now()));
  });
  // Installed, the fake clock still flows with real time; paused, it moves only when stepped (or
  // run on while idle). Otherwise each slow screenshot would let the page race ahead.
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 5));
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Animation.enable');

  let frozen = false;
  /** Hold the document timeline still (animations then move only when stepped). */
  async function freeze() {
    await cdp.send('Animation.setPlaybackRate', { playbackRate: 0 });
    frozen = true;
  }
  /** Let real time run (for setting things up off camera). */
  async function thaw() {
    await cdp.send('Animation.setPlaybackRate', { playbackRate: 1 });
    frozen = false;
  }
  /** Off camera: let `ms` of page time pass quickly (timers and animations alike). */
  async function idle(ms) {
    if (frozen) { for (let t = 0; t < ms; t += DT) await advance(); return; }
    const steps = Math.ceil(ms / 50);
    for (let i = 0; i < steps; i++) { await page.clock.runFor(50); await page.waitForTimeout(50); }
  }
  async function advance() {
    await page.clock.runFor(DT);
    await page.evaluate((dt) => {
      for (const a of document.getAnimations()) {
        if (a.playState === 'paused' || a.playState === 'idle') continue;
        if (a.playState === 'finished' && a.playbackRate >= 0) continue;
        a.currentTime = (a.currentTime ?? 0) + dt * a.playbackRate;
      }
    }, DT);
  }

  let clip = null;
  const clips = [];
  /** Start recording frames into a named clip. */
  function record(name) {
    const dir = path.join(out, 'raw', name);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    clip = { name, dir, n: 0 };
  }
  async function snap() {
    if (!clip) return;
    clip.n++;
    await page.screenshot({ path: path.join(clip.dir, `${String(clip.n).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 93 });
  }
  /** On camera: n frames, each one step of page time and a picture of it. */
  async function step(n = 1, each) {
    for (let i = 0; i < n; i++) {
      if (each) await each(i);
      await advance();
      await snap();
    }
  }
  /** Stop recording; encode the clip (a high-quality H.264 file next to the raw frames). */
  function cut() {
    if (!clip) return null;
    const file = path.join(out, `${clip.name}.mp4`);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(clip.dir, '%05d.jpg'),
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '12', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', file]);
    clips.push({ name: clip.name, frames: clip.n, file });
    const done = clip;
    clip = null;
    return done;
  }
  /** A still picture (for the start of a shot, or a hi-res crop). */
  async function still(name, opts = {}) {
    await page.screenshot({ path: path.join(out, `${name}.png`), ...opts });
  }
  async function close() {
    await browser.close();
    server.close();
  }
  /** The number of frames recorded so far in the current clip (a tap made now shows from the next one). */
  const frame = () => (clip ? clip.n : 0);
  return { page, cdp, errors, freeze, thaw, idle, advance, step, record, cut, still, close, clips, DT, frame };
}

/** A touch at (x, y) in page px: down, a few frames held, up. */
export async function tapAt(rig, x, y, { hold = 3 } = {}) {
  await rig.page.touchscreen.tap(x, y);
  await rig.step(hold);
}
