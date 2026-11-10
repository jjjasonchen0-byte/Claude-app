// Meet server: static file hosting + a small JSON API for accounts,
// saved addresses and meetup history. Zero runtime dependencies besides
// Leaflet, which is served to the browser from node_modules.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Store } from './lib/store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data', 'db.json');
const SESSION_DAYS = 30;
const MAX_BODY = 64 * 1024;

const store = new Store(DATA_FILE);

const STATIC_ROOTS = [
  { prefix: '/vendor/leaflet/', dir: path.join(__dirname, 'node_modules', 'leaflet', 'dist') },
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

// ---------------------------------------------------------------- static

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
      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Content-Length': stat.size,
        'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=300',
      });
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
  server.listen(PORT, HOST, () => console.log(`Meet running at http://localhost:${PORT}`));
  const shutdown = () => { store.flush(); process.exit(0); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
