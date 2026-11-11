// Free photos from Wikimedia for places OpenStreetMap links to Wikidata or
// Commons. The sandbox that runs these tests is rate-limited by Wikimedia, so
// the two APIs are stood in for with responses in their documented format
// (Wikidata wbgetclaims; Commons query + imageinfo).
import test from 'node:test';
import assert from 'node:assert/strict';
import { thumbFor, detailsFor, commonsUrl } from '../../public/js/rated.js';

function stub() {
  const real = globalThis.fetch;
  const asked = [];
  globalThis.fetch = async (url) => {
    const u = new URL(url);
    asked.push(`${u.host}:${u.searchParams.get('action')}:${u.searchParams.get('property') || u.searchParams.get('gcmtitle') || ''}`);
    const json = (b) => new Response(JSON.stringify(b), { status: 200, headers: { 'Content-Type': 'application/json' } });
    if (u.host === 'www.wikidata.org') {
      const values = { P18: 'British Museum from NE 2 (cropped).JPG', P373: 'British Museum' };
      const p = u.searchParams.get('property');
      return json({ claims: { [p]: [{ mainsnak: { snaktype: 'value', property: p, datavalue: { value: values[p], type: 'string' } } }] } });
    }
    if (u.host === 'commons.wikimedia.org') {
      return json({ query: { pages: {
        1: { title: 'File:Great Court.jpg', imageinfo: [{ thumburl: 'https://upload.wikimedia.org/thumb/great-court.jpg', descriptionurl: 'https://commons.wikimedia.org/wiki/File:Great_Court.jpg', extmetadata: { Artist: { value: '<a href="x">Jane Doe</a>' }, LicenseShortName: { value: 'CC BY-SA 4.0' } } }] },
        2: { title: 'File:British Museum from NE 2 (cropped).JPG', imageinfo: [{ thumburl: 'https://upload.wikimedia.org/thumb/front.jpg', extmetadata: {} }] },
        3: { title: 'File:Floor plan.pdf', imageinfo: [{ thumburl: 'https://upload.wikimedia.org/thumb/plan.png' }] },
      } } });
    }
    return new Response('{}', { status: 404 });
  };
  return { asked, restore: () => { globalThis.fetch = real; } };
}

test('a place linked to Wikidata gets its picture as a thumbnail', async () => {
  const s = stub();
  try {
    const p = { id: 'way/1', name: 'British Museum', wikidata: 'Q6373', tab: 'culture' };
    assert.equal(await thumbFor(p), commonsUrl('British Museum from NE 2 (cropped).JPG', 240));
    assert.match(p.thumb, /^https:\/\/commons\.wikimedia\.org\/wiki\/Special:FilePath\/British%20Museum/);
    assert.ok(s.asked.every((a) => a.startsWith('www.wikidata.org:wbgetclaims')), 'only two tiny claim lookups');
  } finally { s.restore(); }
});

test('the place page gets a gallery from its Commons category, own picture first, with credits', async () => {
  const s = stub();
  try {
    const d = await detailsFor({ id: 'way/2', name: 'British Museum', wikidata: 'Q6374', tab: 'culture' });
    assert.equal(d.source, null);
    assert.deepEqual(d.photos.map((x) => x.url), ['https://upload.wikimedia.org/thumb/front.jpg', 'https://upload.wikimedia.org/thumb/great-court.jpg']);
    assert.equal(d.photos[1].by, 'Jane Doe');
    assert.equal(d.photos[1].credit, 'CC BY-SA 4.0 · Wikimedia Commons');
    assert.ok(s.asked.some((a) => a === 'commons.wikimedia.org:query:Category:British Museum'));
  } finally { s.restore(); }
});

test('places with no Wikimedia link ask nothing and show their category art', async () => {
  const s = stub();
  try {
    const p = { id: 'node/3', name: 'Corner Café', tab: 'drinks' };
    assert.equal(await thumbFor(p), null);
    assert.deepEqual((await detailsFor(p)).photos, []);
    assert.deepEqual(s.asked, []);
  } finally { s.restore(); }
});
