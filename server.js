// Meet server: static file hosting + a small JSON API for accounts,
// saved addresses and meetup history. Zero runtime dependencies besides
// Leaflet, which is served to the browser from node_modules.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { Store } from './lib/store.js';
import { osrmRouteUrl, osrmTableUrl, transitUrl, transitReachUrl, normalizeOsrm, normalizeOsrmTable, normalizeTransit, reduceReach } from './public/js/directions.js';
import { simplify } from './public/js/geo.js';
import { createTripadvisor } from './lib/tripadvisor.js';
import { createGoogle, TILE_STYLES, normalizeGooglePlace } from './lib/google.js';
import { nameSimilarity } from './public/js/match.js';
import { haversine } from './public/js/geo.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data', 'db.json');
const SESSION_DAYS = 30;
const MAX_BODY = 64 * 1024;
// Directions providers ask apps to identify themselves. Set MEET_CONTACT to a
// website or email address people can reach you at (Transitous requires it).
const CONTACT = (process.env.MEET_CONTACT || '').trim();
const USER_AGENT = `Meet/1.0${CONTACT ? ` (+${CONTACT})` : ''}`;
// Transitous is a volunteer service: stay well under ~720 journey searches a day.
const TRANSIT_DAILY_LIMIT = Number(process.env.TRANSIT_DAILY_LIMIT) || 600;

const store = new Store(DATA_FILE);

// Optional: ratings, photos and reviews from Tripadvisor (see README).
const NO_MATCH_DAYS = 30; // look a place up again after this long if it had no listing
const tripadvisor = createTripadvisor({
  apiKey: (process.env.TRIPADVISOR_API_KEY || '').trim(),
  dailyLimit: Number(process.env.TRIPADVISOR_DAILY_LIMIT) || 150,
  ids: {
    get(key) {
      const v = store.data.taIds[key];
      if (v === undefined) return undefined;
      if (typeof v === 'number') return v;
      return Date.now() - (v?.none || 0) < NO_MATCH_DAYS * 864e5 ? null : undefined;
    },
    set(key, id) {
      if (Object.keys(store.data.taIds).length > 50000) store.data.taIds = {};
      store.data.taIds[key] = id == null ? { none: Date.now() } : id;
    },
  },
  onIdsChanged: () => store.save(),
});

// Optional: Google directions and map (see README). Daily caps keep it inside
// Google's free monthly allowance unless raised.
const positive = (v) => (Number(v) > 0 ? Number(v) : undefined);
const googleLimits = Object.fromEntries(Object.entries({
  routes: positive(process.env.GOOGLE_DAILY_ROUTES), elements: positive(process.env.GOOGLE_DAILY_ELEMENTS), tiles: positive(process.env.GOOGLE_DAILY_TILES),
  places: positive(process.env.GOOGLE_DAILY_PLACES), photos: positive(process.env.GOOGLE_DAILY_PHOTOS),
}).filter(([, v]) => v));
const google = createGoogle({
  apiKey: process.env.GOOGLE_MAPS_API_KEY,
  limits: googleLimits,
  traffic: process.env.GOOGLE_TRAFFIC === '1',
  region: (process.env.GOOGLE_MAP_REGION || 'US').toUpperCase(),
});

const STATIC_ROOTS = [
  { prefix: '/vendor/leaflet/', dir: path.join(__dirname, 'node_modules', 'leaflet', 'dist') },
  { prefix: '/vendor/maplibre/', dir: path.join(__dirname, 'node_modules', 'maplibre-gl', 'dist') },
  { prefix: '/vendor/maplibre-leaflet/', dir: path.join(__dirname, 'node_modules', '@maplibre', 'maplibre-gl-leaflet') },
  { prefix: '/', dir: path.join(__dirname, 'public') },
];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.map': 'application/json',
};

// ---------------------------------------------------------------- helpers

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function send(res, status, body, headers = {}) {
  const payload = body === undefined ? '' : JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new HttpError(413, 'Request too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(new HttpError(400, 'Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

function verifyPassword(password, user) {
  const { hash } = hashPassword(password, user.salt);
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(user.hash, 'hex'));
}

const newId = () => crypto.randomBytes(9).toString('base64url');
const normEmail = (e) => String(e || '').trim().toLowerCase();
const isEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

function sessionCookie(token, maxAgeSec) {
  return `sid=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAgeSec}`;
}

function createSession(res, user) {
  const token = crypto.randomBytes(32).toString('base64url');
  store.sessions[token] = { userId: user.id, expires: Date.now() + SESSION_DAYS * 864e5 };
  store.save();
  res.setHeader('Set-Cookie', sessionCookie(token, SESSION_DAYS * 86400));
}

function currentUser(req) {
  const token = parseCookies(req).sid;
  if (!token) return null;
  const s = store.sessions[token];
  if (!s) return null;
  if (s.expires < Date.now()) { delete store.sessions[token]; store.save(); return null; }
  return Object.values(store.users).find((u) => u.id === s.userId) || null;
}

function requireUser(req) {
  const u = currentUser(req);
  if (!u) throw new HttpError(401, 'Please sign in');
  return u;
}

function publicUser(u) {
  return {
    id: u.id,
    email: u.email,
    name: u.name || '',
    home: u.home || null,
    places: u.places || [],
    history: (u.history || []).slice(0, 50),
    settings: u.settings || {},
  };
}

// Validate and clean an address object coming from the client.
const TRAVEL_MODES = ['transit', 'walk', 'bike', 'drive'];

function cleanPlace(p, { requireAddress = true } = {}) {
  const lat = Number(p?.lat);
  const lon = Number(p?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    throw new HttpError(400, 'A valid location is required');
  }
  const address = String(p.address || '').trim().slice(0, 300);
  if (requireAddress && !address) throw new HttpError(400, 'Address is required');
  return {
    address,
    nickname: String(p.nickname || '').trim().slice(0, 60),
    lat: Math.round(lat * 1e6) / 1e6,
    lon: Math.round(lon * 1e6) / 1e6,
    ...(TRAVEL_MODES.includes(p.mode) ? { mode: p.mode } : {}), // how this person travels
  };
}

// ---------------------------------------------------------------- routes

const routes = [];
const route = (method, pattern, handler) => {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
  routes.push({ method, re, keys, handler });
};

route('POST', '/api/signup', async (req, res) => {
  const { email, password, name } = await readBody(req);
  const e = normEmail(email);
  if (!isEmail(e)) throw new HttpError(400, 'Enter a valid email address');
  if (typeof password !== 'string' || password.length < 6) throw new HttpError(400, 'Password must be at least 6 characters');
  if (store.users[e]) throw new HttpError(409, 'An account with that email already exists — try signing in');
  const user = {
    id: newId(), email: e, name: String(name || '').trim().slice(0, 60),
    ...hashPassword(password), created: Date.now(),
    home: null, places: [], history: [], settings: {},
  };
  store.users[e] = user;
  createSession(res, user);
  send(res, 201, { user: publicUser(user) });
});

route('POST', '/api/login', async (req, res) => {
  const { email, password } = await readBody(req);
  const user = store.users[normEmail(email)];
  if (!user || typeof password !== 'string' || !verifyPassword(password, user)) {
    throw new HttpError(401, 'Email or password is incorrect');
  }
  createSession(res, user);
  send(res, 200, { user: publicUser(user) });
});

route('POST', '/api/logout', async (req, res) => {
  const token = parseCookies(req).sid;
  if (token) { delete store.sessions[token]; store.save(); }
  send(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie('', 0) });
});

route('GET', '/api/me', async (req, res) => {
  const user = currentUser(req);
  send(res, 200, { user: user ? publicUser(user) : null });
});

route('PATCH', '/api/me', async (req, res) => {
  const user = requireUser(req);
  const body = await readBody(req);
  if ('name' in body) user.name = String(body.name || '').trim().slice(0, 60);
  if ('home' in body) user.home = body.home ? cleanPlace(body.home) : null;
  if ('settings' in body && body.settings && typeof body.settings === 'object') {
    user.settings = { ...user.settings, ...body.settings };
  }
  store.save();
  send(res, 200, { user: publicUser(user) });
});

route('POST', '/api/places', async (req, res) => {
  const user = requireUser(req);
  const body = await readBody(req);
  user.places ||= [];
  if (user.places.length >= 50) throw new HttpError(400, 'You can save up to 50 addresses');
  const place = { id: newId(), ...cleanPlace(body), active: body.active !== false };
  user.places.push(place);
  store.save();
  send(res, 201, { place });
});

route('PATCH', '/api/places/:id', async (req, res, { id }) => {
  const user = requireUser(req);
  const body = await readBody(req);
  const place = (user.places || []).find((p) => p.id === id);
  if (!place) throw new HttpError(404, 'Address not found');
  if ('lat' in body || 'lon' in body || 'address' in body) Object.assign(place, cleanPlace({ ...place, ...body }));
  if ('nickname' in body) place.nickname = String(body.nickname || '').trim().slice(0, 60);
  if ('active' in body) place.active = !!body.active;
  if ('mode' in body) { if (TRAVEL_MODES.includes(body.mode)) place.mode = body.mode; else delete place.mode; }
  store.save();
  send(res, 200, { place });
});

route('DELETE', '/api/places/:id', async (req, res, { id }) => {
  const user = requireUser(req);
  const before = (user.places || []).length;
  user.places = (user.places || []).filter((p) => p.id !== id);
  if (user.places.length === before) throw new HttpError(404, 'Address not found');
  store.save();
  send(res, 200, { ok: true });
});

route('POST', '/api/history', async (req, res) => {
  const user = requireUser(req);
  const b = await readBody(req);
  const entry = {
    id: newId(),
    at: Date.now(),
    name: String(b.name || 'Meeting spot').slice(0, 120),
    category: String(b.category || '').slice(0, 60),
    address: String(b.address || '').slice(0, 300),
    lat: Number(b.lat), lon: Number(b.lon),
    people: Array.isArray(b.people) ? b.people.slice(0, 20).map((s) => String(s).slice(0, 60)) : [],
  };
  if (!Number.isFinite(entry.lat) || !Number.isFinite(entry.lon)) throw new HttpError(400, 'A valid location is required');
  user.history = [entry, ...(user.history || [])].slice(0, 50);
  store.save();
  send(res, 201, { entry });
});

route('DELETE', '/api/history/:id', async (req, res, { id }) => {
  const user = requireUser(req);
  user.history = (user.history || []).filter((h) => h.id !== id);
  store.save();
  send(res, 200, { ok: true });
});

// ---------------------------------------------------------------- directions

const upstreamCache = new Map(); // url -> { at, ttl, data }
let transitDay = '', transitCount = 0;
const visitors = new Map(); // ip -> { start, n }

function rateLimit(req, max = 240, windowMs = 10 * 60 * 1000) {
  const ip = req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const v = visitors.get(ip);
  if (!v || now - v.start > windowMs) { visitors.set(ip, { start: now, n: 1 }); return; }
  if (++v.n > max) throw new HttpError(429, 'Too many requests — try again in a few minutes');
}

/**
 * GET JSON. With `hedgeAfterMs` (a list of delays), a request that has not
 * answered by each delay is sent once more, and the first answer wins: the
 * public routing server usually replies in under a second but now and then
 * stalls for ten.
 */
async function fetchJson(url, { hedgeAfterMs = [] } = {}) {
  const ctrls = [];
  const once = async () => {
    const ctrl = new AbortController();
    ctrls.push(ctrl);
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, signal: AbortSignal.any([ctrl.signal, AbortSignal.timeout(20000)]) });
    let data = null;
    try { data = await res.json(); } catch { /* not JSON */ }
    return { res, data };
  };
  const timers = [];
  try {
    return await new Promise((resolve, reject) => {
      let pending = 0, failed = null, launched = 0;
      const total = 1 + hedgeAfterMs.length;
      const launch = () => {
        launched++; pending++;
        once().then(resolve, (err) => {
          failed = err;
          if (--pending === 0 && launched === total) reject(failed);
          else if (pending === 0) { for (const t of timers) clearTimeout(t); launch(); } // failed fast: try the next copy now
        });
      };
      launch();
      for (const ms of hedgeAfterMs) timers.push(setTimeout(() => { if (launched < total) launch(); }, ms));
    });
  } finally {
    for (const t of timers) clearTimeout(t);
    for (const c of ctrls) c.abort(); // stop the slower copies
  }
}

/** One public transport request from today's budget (Transitous is a volunteer service). */
function spendTransit() {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== transitDay) { transitDay = today; transitCount = 0; }
  if (transitCount >= TRANSIT_DAILY_LIMIT) throw new HttpError(429, 'Public transport directions are paused until tomorrow (daily limit reached)');
  transitCount++;
}

async function upstream(url, ttlMs, { transit = false } = {}) {
  const hit = upstreamCache.get(url);
  if (hit && Date.now() - hit.at < hit.ttl) return hit.data;
  if (transit) spendTransit();
  let res, data;
  try {
    // Transitous is a volunteer service with a daily budget: never sent twice.
    ({ res, data } = await fetchJson(url, { hedgeAfterMs: transit ? [] : [1000, 3500] }));
  } catch {
    throw new HttpError(502, 'The directions service could not be reached');
  }
  if (!res.ok && !data) throw new HttpError(502, `The directions service answered ${res.status}`);
  if (upstreamCache.size > 800) upstreamCache.delete(upstreamCache.keys().next().value);
  upstreamCache.set(url, { at: Date.now(), ttl: ttlMs, data });
  return data;
}

function parsePoint(s) {
  const [lat, lon] = String(s || '').split(',').map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) throw new HttpError(400, 'Invalid coordinates');
  return { lat, lon };
}
// Routes are simplified to about 2 m and rounded to ~1 m: same look, a fraction of the download.
const roundGeom = (pts) => simplify(pts, 2).map(([a, b]) => [Math.round(a * 1e5) / 1e5, Math.round(b * 1e5) / 1e5]);
const ROAD_MODES = ['walk', 'bike', 'drive'];

/**
 * Google directions, when the page is showing Google's map (g=1; Google's
 * terms allow its routes only on its own map) and today's cap allows.
 * Null when Google isn't used, so the free services answer instead.
 */
async function googleDirections(q, mode, from, to) {
  if (q.get('g') !== '1' || !google.available('routes') || ![...ROAD_MODES, 'transit'].includes(mode)) return null;
  const arriveBy = q.get('arriveBy') === '1';
  const time = q.get('time') || null;
  const key = `google|${mode}|${from.lat},${from.lon}|${to.lat},${to.lon}|${time ? String(time).slice(0, 16) : ''}|${arriveBy}`;
  const hit = upstreamCache.get(key);
  if (hit && Date.now() - hit.at < hit.ttl) return hit.data;
  try {
    const out = await google.route(mode, from, to, { time, arriveBy });
    if (out.options) for (const o of out.options) for (const l of o.legs) l.geometry = roundGeom(l.geometry);
    out.geometry = roundGeom(out.geometry);
    if (upstreamCache.size > 800) upstreamCache.delete(upstreamCache.keys().next().value);
    upstreamCache.set(key, { at: Date.now(), ttl: 10 * 60 * 1000, data: out });
    return out;
  } catch (err) {
    if (err.status !== 404 && !err.limit) console.warn('Google directions:', err.message);
    return null; // no route, over the cap or unreachable: try the free services
  }
}

route('GET', '/api/directions', async (req, res) => {
  rateLimit(req);
  const q = new URL(req.url, 'http://x').searchParams;
  const mode = q.get('mode');
  const from = parsePoint(q.get('from'));
  const to = parsePoint(q.get('to'));
  let out = await googleDirections(q, mode, from, to);
  if (out) {
    // Google's answer.
  } else if (mode === 'transit') {
    const arriveBy = q.get('arriveBy') === '1';
    const time = q.get('time') ? new Date(q.get('time')) : new Date();
    if (Number.isNaN(time.getTime())) throw new HttpError(400, 'Invalid time');
    time.setSeconds(0, 0); // so nearby requests share a cache entry
    const data = await upstream(transitUrl(from, to, { time, arriveBy }), 5 * 60 * 1000, { transit: true });
    if (data?.error) throw new HttpError(502, String(data.error).slice(0, 200));
    try { out = normalizeTransit(data, { arriveBy }); } catch (err) { throw new HttpError(err.status || 502, err.message); }
    for (const o of out.options) for (const l of o.legs) l.geometry = roundGeom(l.geometry);
    out.geometry = roundGeom(out.geometry);
  } else if (ROAD_MODES.includes(mode)) {
    const via = q.get('via') ? parsePoint(q.get('via')) : null;
    const data = await upstream(osrmRouteUrl(mode, from, to, { alternatives: q.get('alt') === '1', via }), 24 * 3600 * 1000);
    try { out = normalizeOsrm(data, mode); } catch (err) { throw new HttpError(err.status || 502, err.message); }
    out.geometry = roundGeom(out.geometry);
    for (const a of out.alternatives) a.geometry = roundGeom(a.geometry);
  } else {
    throw new HttpError(400, 'mode must be transit, walk, bike or drive');
  }
  send(res, 200, out, { 'Cache-Control': 'private, max-age=60' });
});

route('GET', '/api/traveltimes', async (req, res) => {
  rateLimit(req);
  const q = new URL(req.url, 'http://x').searchParams;
  const mode = q.get('mode');
  if (!ROAD_MODES.includes(mode)) throw new HttpError(400, 'Travel times are available for walk, bike or drive');
  const sources = String(q.get('from') || '').split(';').filter(Boolean).map(parsePoint);
  const destinations = String(q.get('to') || '').split(';').filter(Boolean).map(parsePoint);
  if (!sources.length || !destinations.length) throw new HttpError(400, 'from and to are required');
  if (sources.length > 12 || destinations.length > 80) throw new HttpError(400, 'Too many points');
  const data = await upstream(osrmTableUrl(mode, sources, destinations), 24 * 3600 * 1000);
  try { send(res, 200, normalizeOsrmTable(data), { 'Cache-Control': 'private, max-age=300' }); }
  catch (err) { throw new HttpError(err.status || 502, err.message); }
});

// Public transport: real travel times from one person to every stop in an
// area (Transitous "one to all"), for picking the meeting point. The answer
// is large (every stop within reach, about 1 MB), so only the stops in the
// group's area are kept, about 100 m apart, and only that is cached.
const reachCache = new Map();
route('GET', '/api/transit/reach', async (req, res) => {
  rateLimit(req);
  const q = new URL(req.url, 'http://x').searchParams;
  const from = parsePoint(q.get('from'));
  const max = Math.round(Number(q.get('max')) || 60);
  if (max < 10 || max > 120) throw new HttpError(400, 'max must be 10 to 120 minutes');
  const [s0, w0, n0, e0] = String(q.get('box') || '').split(',').map(Number);
  const box = { s: s0, w: w0, n: n0, e: e0 };
  if (![s0, w0, n0, e0].every(Number.isFinite) || n0 - s0 > 1.5 || e0 - w0 > 1.5 || n0 <= s0 || e0 <= w0) throw new HttpError(400, 'Invalid area');
  const time = q.get('time') ? new Date(q.get('time')) : new Date();
  if (Number.isNaN(time.getTime())) throw new HttpError(400, 'Invalid time');
  time.setSeconds(0, 0);
  const url = transitReachUrl(from, { time, max });
  const key = `${url}|${[s0, w0, n0, e0].map((v) => v.toFixed(3)).join(',')}`;
  const hit = reachCache.get(key);
  if (hit && Date.now() - hit.at < 5 * 60 * 1000) return send(res, 200, hit.data, { 'Cache-Control': 'private, max-age=300' });
  spendTransit();
  let data;
  try {
    const { res: r, data: json } = await fetchJson(url);
    if (!r.ok || !json) throw new Error(`status ${r.status}`);
    data = reduceReach(json, box);
  } catch {
    throw new HttpError(502, 'Public transport times could not be loaded');
  }
  if (reachCache.size > 100) reachCache.delete(reachCache.keys().next().value);
  reachCache.set(key, { at: Date.now(), data });
  send(res, 200, data, { 'Cache-Control': 'private, max-age=300' });
});

// Real travel times from Google for a few spots (the best candidates for a
// meeting point), for everyone travelling one way: sources × destinations.
route('GET', '/api/checktimes', async (req, res) => {
  rateLimit(req);
  const q = new URL(req.url, 'http://x').searchParams;
  if (q.get('g') !== '1' || !google.enabled) throw new HttpError(404, 'Travel time checks are not set up on this server');
  const mode = q.get('mode');
  if (![...ROAD_MODES, 'transit'].includes(mode)) throw new HttpError(400, 'mode must be transit, walk, bike or drive');
  const sources = String(q.get('from') || '').split(';').filter(Boolean).map(parsePoint);
  const destinations = String(q.get('to') || '').split(';').filter(Boolean).map(parsePoint);
  if (!sources.length || !destinations.length) throw new HttpError(400, 'from and to are required');
  if (sources.length > 12 || destinations.length > 4) throw new HttpError(400, 'Too many points');
  try {
    send(res, 200, await google.matrix(mode, sources, destinations, { time: q.get('time') }), { 'Cache-Control': 'private, max-age=300' });
  } catch (err) {
    throw new HttpError(err.limit ? 429 : err.status || 502, err.limit ? 'Travel time checks are paused until tomorrow' : 'Travel times unavailable');
  }
});

// ---------------------------------------------------------------- Google's map (tiles and their credits)

const TILE_STYLE = new Set(TILE_STYLES);
route('GET', '/api/gmap/:style/:z/:x/:y', async (req, res, { style, z, x, y }) => {
  if (!google.enabled) throw new HttpError(404, 'Not found');
  const [Z, X, Y] = [z, x, y].map(Number);
  if (!TILE_STYLE.has(style) || ![Z, X, Y].every(Number.isInteger) || Z < 0 || Z > 22 || X < 0 || Y < 0 || X >= 2 ** Z || Y >= 2 ** Z) throw new HttpError(400, 'Invalid tile');
  let t;
  try { t = await google.tile(style, Z, X, Y); } catch (err) { throw new HttpError(err.limit ? 429 : 502, 'Map tile unavailable'); }
  res.writeHead(t.status, {
    'Content-Type': t.type, 'Content-Length': t.body.length,
    // As Google sends them (it asks apps to respect its caching headers, and to store nothing else).
    ...(t.cacheControl ? { 'Cache-Control': t.cacheControl } : {}),
    ...(t.etag ? { ETag: t.etag } : {}),
  });
  res.end(t.body);
});

route('GET', '/api/gmap/:style/viewport', async (req, res, { style }) => {
  if (!google.enabled) throw new HttpError(404, 'Not found');
  if (!TILE_STYLE.has(style)) throw new HttpError(400, 'Invalid style');
  const q = new URL(req.url, 'http://x').searchParams;
  const area = {};
  for (const k of ['zoom', 'north', 'south', 'east', 'west']) {
    const v = Number(q.get(k));
    if (!Number.isFinite(v)) throw new HttpError(400, `Invalid ${k}`);
    area[k] = k === 'zoom' ? Math.max(0, Math.min(22, Math.round(v))) : Math.round(v * 1e4) / 1e4;
  }
  try { send(res, 200, await google.viewport(style, area), { 'Cache-Control': 'private, max-age=600' }); }
  catch { throw new HttpError(502, 'Map credits unavailable'); }
});

// ---------------------------------------------------------------- Google: a place's photos and reviews

/**
 * Rating, reviews and photos from Google for a place from OpenStreetMap,
 * when the page shows Google's map (g=1). The place is found by name near
 * its position (free), its details are fetched once per visit (billed), and
 * they are used only if the name and position agree. Only the Google ID is
 * kept (Google allows nothing else to be stored).
 */
route('GET', '/api/gplaces/details', async (req, res) => {
  rateLimit(req);
  const q = new URL(req.url, 'http://x').searchParams;
  if (q.get('g') !== '1' || !google.enabled) throw new HttpError(404, 'Not set up on this server');
  const key = String(q.get('key') || '').slice(0, 80);
  const name = String(q.get('name') || '').trim().slice(0, 120);
  const at = parsePoint(q.get('at'));
  if (!key || !name) throw new HttpError(400, 'key and name are required');
  if (!google.available('places')) throw new HttpError(429, 'Google place details are paused until tomorrow');
  const known = store.data.gIds[key];
  if (known && typeof known === 'object' && Date.now() - (known.none || 0) < NO_MATCH_DAYS * 864e5) throw new HttpError(404, 'Not on Google');
  const remember = (v) => {
    if (Object.keys(store.data.gIds).length > 50000) store.data.gIds = {};
    store.data.gIds[key] = v;
    store.save();
  };
  let place;
  try {
    const id = typeof known === 'string' ? known : (await google.findPlace(name, at.lat, at.lon))[0];
    if (!id) { remember({ none: Date.now() }); throw new HttpError(404, 'Not on Google'); }
    const json = await google.place(id);
    const near = json.location ? haversine(at.lat, at.lon, json.location.latitude, json.location.longitude) : Infinity;
    if (near > 250 || nameSimilarity(name, json.displayName?.text || '') < 0.6) { remember({ none: Date.now() }); throw new HttpError(404, 'Not on Google'); }
    if (known !== id) remember(id);
    place = normalizeGooglePlace(json, { photoUrl: (n, w) => `/api/gplaces/photo?${new URLSearchParams({ name: n, w })}`, maxPhotos: Math.min(6, google.left('photos')) });
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(err.limit ? 429 : 502, 'Google place details unavailable');
  }
  send(res, 200, { place }, { 'Cache-Control': 'private, max-age=600' });
});

// A place's photo: sends the browser on to Google's short-lived picture address.
route('GET', '/api/gplaces/photo', async (req, res) => {
  if (!google.enabled) throw new HttpError(404, 'Not found');
  const q = new URL(req.url, 'http://x').searchParams;
  const name = String(q.get('name') || '');
  const w = Math.round(Number(q.get('w')) || 1200);
  if (!/^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/.test(name) || w < 100 || w > 1600) throw new HttpError(400, 'Invalid photo');
  let uri;
  try { uri = await google.photo(name, w); } catch (err) { throw new HttpError(err.limit ? 429 : 502, 'Photo unavailable'); }
  // The browser keeps the redirect for an hour, so a photo seen twice is fetched (and billed) once.
  res.writeHead(302, { Location: uri, 'Cache-Control': 'private, max-age=3600' });
  res.end();
});

// ---------------------------------------------------------------- places: ratings, photos, reviews

route('GET', '/api/config', async (req, res) => {
  send(res, 200, {
    ratings: tripadvisor.enabled ? 'tripadvisor' : null,
    // Google's map (and with it Google directions) while today's map tiles last.
    google: google.available('tiles'),
    // Which code is running (Render sets RENDER_GIT_COMMIT), shown in the menu.
    version: String(process.env.RENDER_GIT_COMMIT || '').slice(0, 7),
    // A browser key for Google's place card (Places UI Kit). It is public by
    // nature: restrict it to this site and to the Maps JavaScript and Places APIs.
    placesKit: (process.env.GOOGLE_MAPS_BROWSER_KEY || '').trim() || null,
  }, { 'Cache-Control': 'private, max-age=300' });
});

function requireRatings() {
  if (!tripadvisor.enabled) throw new HttpError(404, 'Ratings are not set up on this server');
}
const TA_CATEGORIES = ['RESTAURANT', 'ATTRACTION'];
const taId = (s) => {
  if (!/^\d{1,12}$/.test(String(s || ''))) throw new HttpError(400, 'Invalid place');
  return Number(s);
};

route('POST', '/api/places/ratings', async (req, res) => {
  requireRatings();
  rateLimit(req);
  const body = await readBody(req);
  const items = Array.isArray(body.items) ? body.items.slice(0, 12) : [];
  const clean = items.map((it) => {
    const lat = Number(it.lat), lon = Number(it.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) throw new HttpError(400, 'Invalid coordinates');
    const key = String(it.key || '').slice(0, 40);
    if (!key) throw new HttpError(400, 'Each place needs a key');
    return { key, name: String(it.name || '').slice(0, 120), lat, lon, category: TA_CATEGORIES.includes(it.category) ? it.category : undefined };
  });
  send(res, 200, { ratings: clean.length ? await tripadvisor.ratings(clean) : {}, source: 'tripadvisor' });
});

route('GET', '/api/places/photo/:id', async (req, res, { id }) => {
  requireRatings();
  rateLimit(req);
  send(res, 200, { photo: await tripadvisor.photo(taId(id)) });
});

route('GET', '/api/places/details/:id', async (req, res, { id }) => {
  requireRatings();
  rateLimit(req);
  send(res, 200, { place: await tripadvisor.place(taId(id)), source: 'tripadvisor' });
});

// ---------------------------------------------------------------- static

// Text files are sent compressed (the map library is ~1 MB raw, ~300 KB as Brotli).
const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.webmanifest', '.map']);
const compressed = new Map(); // file -> { mtimeMs, br, gzip }
function compressedBody(file, stat, encoding) {
  let c = compressed.get(file);
  if (!c || c.mtimeMs !== stat.mtimeMs) {
    c = { mtimeMs: stat.mtimeMs };
    compressed.set(file, c);
  }
  if (!c[encoding]) {
    const raw = fs.readFileSync(file);
    c[encoding] = encoding === 'br'
      ? zlib.brotliCompressSync(raw, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 9, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: raw.length } })
      : zlib.gzipSync(raw, { level: 9 });
  }
  return c[encoding];
}

function serveStatic(req, res) {
  const url = new URL(req.url, 'http://x');
  let pathname = decodeURIComponent(url.pathname);
  for (const { prefix, dir } of STATIC_ROOTS) {
    if (!pathname.startsWith(prefix)) continue;
    let rel = pathname.slice(prefix.length) || 'index.html';
    const file = path.join(dir, rel);
    if (!file.startsWith(dir)) break; // path traversal guard
    let stat;
    try { stat = fs.statSync(file); } catch { stat = null; }
    if (stat?.isFile()) {
      const ext = path.extname(file).toLowerCase();
      const vendor = prefix.startsWith('/vendor/'); // pinned versions: safe to keep a day
      const headers = {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Cache-Control': ext === '.html' ? 'no-cache' : vendor ? 'public, max-age=86400' : 'public, max-age=300',
        Vary: 'Accept-Encoding',
      };
      const accept = String(req.headers['accept-encoding'] || '');
      const encoding = COMPRESSIBLE.has(ext) && stat.size > 1024 ? (/\bbr\b/.test(accept) ? 'br' : /\bgzip\b/.test(accept) ? 'gzip' : null) : null;
      if (encoding) {
        const body = compressedBody(file, stat, encoding);
        res.writeHead(200, { ...headers, 'Content-Encoding': encoding, 'Content-Length': body.length });
        return res.end(req.method === 'HEAD' ? undefined : body);
      }
      res.writeHead(200, { ...headers, 'Content-Length': stat.size });
      if (req.method === 'HEAD') return res.end();
      fs.createReadStream(file).pipe(res);
      return;
    }
    if (prefix === '/' && !path.extname(rel)) {
      // Single-page app fallback.
      return serveStatic({ ...req, url: '/index.html', method: req.method }, res);
    }
    break;
  }
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
}

// ---------------------------------------------------------------- server

export const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  const { pathname } = new URL(req.url, 'http://x');
  if (pathname.startsWith('/api/')) {
    for (const r of routes) {
      if (r.method !== req.method) continue;
      const m = pathname.match(r.re);
      if (!m) continue;
      const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
      try { await r.handler(req, res, params); }
      catch (err) {
        const status = err.status || 500;
        if (status === 500) console.error(err);
        send(res, status, { error: status === 500 ? 'Something went wrong' : err.message });
      }
      return;
    }
    return send(res, 404, { error: 'Not found' });
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'Method not allowed' });
  serveStatic(req, res);
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  server.listen(PORT, HOST, () => {
    console.log(`Meet running at http://localhost:${PORT}`);
    if (!CONTACT) console.warn('Tip: set MEET_CONTACT to a website or email so the directions services can reach you (Transitous asks every app for this).');
    console.log(tripadvisor.enabled ? 'Ratings, photos and reviews: Tripadvisor' : 'Ratings: off (set TRIPADVISOR_API_KEY to show Tripadvisor ratings, photos and reviews)');
    console.log(google.enabled ? `Map and directions: Google (daily caps: ${JSON.stringify(google.usage().caps)})` : 'Map and directions: OpenFreeMap, OSRM and Transitous (set GOOGLE_MAPS_API_KEY for Google)');
  });
  const shutdown = () => { store.flush(); process.exit(0); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
