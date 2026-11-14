// The server itself: it must answer every request (however odd) with a
// status and stay up, serve the app, and keep its request limits per visitor.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

process.env.DATA_FILE = path.join(os.tmpdir(), `meet-server-test-${process.pid}.json`);
const { server, clientOf } = await import('../../server.js');

let port;
before(async () => { await new Promise((r) => server.listen(0, '127.0.0.1', r)); port = server.address().port; });
after(() => new Promise((r) => { server.closeAllConnections?.(); server.close(r); }));

/** A raw request, so the path reaches the server exactly as written. */
function request(pathAsIs, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: pathAsIs, method, headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.setTimeout(5000, () => req.destroy(new Error('timeout')));
    req.end(body);
  });
}

test('serves the app and its files', async () => {
  const home = await request('/');
  assert.equal(home.status, 200);
  assert.match(home.headers['content-type'], /text\/html/);
  assert.match(home.text, /<title>Meet<\/title>/);
  const js = await request('/js/app.js');
  assert.equal(js.status, 200);
  assert.match(js.headers['content-type'], /javascript/);
  const config = await request('/api/config');
  assert.equal(config.status, 200);
  assert.equal(JSON.parse(config.text).google, false);
});

test('an unknown page gets the app, an unknown file a 404', async () => {
  for (const p of ['/foo', '/foo/bar', '/.env', '/login']) {
    const r = await request(p);
    assert.equal(r.status, 200, p);
    assert.match(r.text, /<title>Meet<\/title>/, p);
  }
  assert.equal((await request('/missing.png')).status, 404);
  const head = await request('/foo', { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(head.text, '');
});

test('odd and hostile addresses get an answer and the server stays up', async () => {
  const cases = {
    '//': [400, 404], '/%': [400, 404], '/%E0%A4%A': [400, 404], '/api/places/photo/%E0%A4%A': [400, 404],
    '/../server.js': [200, 400, 404], '/%2e%2e/server.js': [200, 400, 404], '/vendor/leaflet/../../../server.js': [200, 400, 404],
    '/js/%00': [200, 400, 404], '/api/directions?mode=walk&from=1,2&to=abc': [400], '/api/traveltimes?mode=walk': [400],
    '/api/nothing': [404], '/api/directions?mode=fly&from=1,2&to=3,4': [400],
  };
  for (const [p, ok] of Object.entries(cases)) {
    const r = await request(p);
    assert.ok(ok.includes(r.status), `${p} → ${r.status}`);
    assert.doesNotMatch(r.text, /createServer|import http/, `${p} must not leak the server's code`);
  }
  assert.equal((await request('/', { method: 'POST' })).status, 405);
  const bad = await request('/api/places/ratings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad' });
  assert.ok([400, 404].includes(bad.status));
  assert.equal((await request('/')).status, 200, 'still serving');
});

test('visitors are told apart behind a hosting proxy', () => {
  const req = (remoteAddress, xff) => ({ socket: { remoteAddress }, headers: xff ? { 'x-forwarded-for': xff } : {} });
  assert.equal(clientOf(req('203.0.113.9')), '203.0.113.9');
  // Behind a proxy every request arrives from the proxy: the visitor is the address it reports.
  assert.equal(clientOf(req('10.0.0.5', '198.51.100.7, 172.68.1.1')), '198.51.100.7');
  assert.equal(clientOf(req('10.0.0.5', '198.51.100.8')), '198.51.100.8');
  assert.notEqual(clientOf(req('10.0.0.5', '198.51.100.7')), clientOf(req('10.0.0.5', '198.51.100.8')));
  // A header from a visitor connecting directly is not believed.
  assert.equal(clientOf(req('203.0.113.9', '1.2.3.4')), '203.0.113.9');
  assert.equal(clientOf(req(undefined)), 'unknown');
});
