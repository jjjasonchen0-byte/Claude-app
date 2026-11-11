// Ratings, photos and reviews for places.
//
//  • Tripadvisor, when the Meet server has a TRIPADVISOR_API_KEY: ratings in
//    lists, a photo per place, and a full page of photos and reviews.
//  • Always, for free: photos from Wikimedia Commons for places that
//    OpenStreetMap links to Wikidata or Commons (museums, parks, landmarks and
//    some restaurants).

let configPromise = null;

/** What the Meet server offers: { ratings: 'tripadvisor' | null, basemapKey }. */
export function getConfig() {
  configPromise ||= fetch('/api/config', { credentials: 'same-origin' })
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}));
  return configPromise;
}

/** 'tripadvisor' when the server provides ratings, otherwise null. */
export function ratingsSource() {
  return getConfig().then((c) => c.ratings || null);
}

const TAB_CATEGORY = { food: 'RESTAURANT', drinks: 'RESTAURANT', fun: 'ATTRACTION', culture: 'ATTRACTION', outdoors: 'ATTRACTION' };

async function postJson(url, body) {
  const res = await fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'Ratings unavailable'), { status: res.status });
  return data;
}

async function getJson(url) {
  const res = await fetch(url, { credentials: 'same-origin' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'Unavailable'), { status: res.status });
  return data;
}

/**
 * Fill in `p.rating` ({ id, rating, count, ratingImage, priceLevel, url } or
 * null) for places that do not have one yet. Up to 12 per request.
 */
export async function rateAll(pois) {
  if (!(await ratingsSource())) return;
  const todo = pois.filter((p) => p.rating === undefined && !p.ratingPending);
  for (let i = 0; i < todo.length; i += 12) {
    const batch = todo.slice(i, i + 12);
    for (const p of batch) p.ratingPending = true;
    try {
      const { ratings } = await postJson('/api/places/ratings', {
        items: batch.map((p) => ({ key: p.id, name: p.name, lat: p.lat, lon: p.lon, category: TAB_CATEGORY[p.tab] })),
      });
      for (const p of batch) p.rating = ratings[p.id] || null;
    } catch (err) {
      for (const p of batch) p.rating = null;
      if (err.status === 429 || err.status === 503) throw err;
    } finally {
      for (const p of batch) p.ratingPending = false;
    }
  }
}

/** A photo URL for a list row, or null. */
export async function thumbFor(p) {
  if (p.thumb !== undefined) return p.thumb;
  if (p.rating?.id) {
    try {
      const { photo } = await getJson(`/api/places/photo/${encodeURIComponent(p.rating.id)}`);
      if (photo?.url) return (p.thumb = photo.url);
    } catch { /* fall through to free photos */ }
  }
  const free = await freeImage(p).catch(() => null);
  return (p.thumb = free ? commonsUrl(free, 240) : null);
}

/**
 * Everything for the place page: { photos: [{ url, caption, by, credit }],
 * reviews, rating, …, source }. Tripadvisor when available, then free photos.
 */
export async function detailsFor(p) {
  let details = null;
  if (p.rating?.id) {
    try { details = (await getJson(`/api/places/details/${encodeURIComponent(p.rating.id)}`)).place; } catch { details = null; }
  }
  const out = { ...(details || {}), source: details ? 'tripadvisor' : null, photos: details?.photos || [], reviews: details?.reviews || [] };
  if (out.photos.length < 3) {
    const free = await freeGallery(p).catch(() => []);
    out.photos = [...out.photos, ...free];
  }
  return out;
}

// ---------------------------------------------------------------- Wikimedia (free)

const WIKIDATA = 'https://www.wikidata.org/w/api.php';
const COMMONS = 'https://commons.wikimedia.org/w/api.php';
const wikidataCache = new Map(); // Q-id → Promise<{ image, category }>

/** A Commons thumbnail URL (the server redirects to the right size). */
export const commonsUrl = (file, width = 640) => `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(String(file).replace(/^File:/i, ''))}?width=${width}`;

/** A Wikidata item's picture (P18) and Commons category (P373): two tiny requests. */
function wikidataInfo(qid) {
  if (!wikidataCache.has(qid)) {
    const claim = (property) => fetch(`${WIKIDATA}?${new URLSearchParams({ action: 'wbgetclaims', entity: qid, property, format: 'json', origin: '*' })}`)
      .then((r) => r.json())
      .then((j) => j.claims?.[property]?.[0]?.mainsnak?.datavalue?.value || '')
      .catch(() => '');
    wikidataCache.set(qid, Promise.all([claim('P18'), claim('P373')]).then(([image, category]) => ({ image, category })));
  }
  return wikidataCache.get(qid);
}

/** The main free picture of a place: its Commons file, else its Wikidata image. */
async function freeImage(p) {
  if (/^File:/i.test(p.commons || '')) return p.commons;
  if (p.wikidata) return (await wikidataInfo(p.wikidata)).image || null;
  return null;
}

/** Up to 10 free photos with credits, from the place's Commons file, Wikidata image and Commons category. */
async function freeGallery(p) {
  const files = [];
  const first = await freeImage(p).catch(() => null);
  if (first) files.push(`File:${String(first).replace(/^File:/i, '')}`);
  const category = /^Category:/i.test(p.commons || '') ? p.commons.replace(/^Category:/i, '') : p.wikidata ? (await wikidataInfo(p.wikidata)).category : '';
  const q = new URLSearchParams({ action: 'query', format: 'json', origin: '*', prop: 'imageinfo', iiprop: 'url|extmetadata', iiurlwidth: '1000', iiextmetadatafilter: 'Artist|LicenseShortName' });
  if (category) {
    q.set('generator', 'categorymembers'); q.set('gcmtitle', `Category:${category}`); q.set('gcmtype', 'file'); q.set('gcmlimit', '10');
  } else if (files.length) {
    q.set('titles', files.join('|'));
  } else {
    return [];
  }
  const j = await (await fetch(`${COMMONS}?${q}`)).json();
  const pages = Object.values(j.query?.pages || {});
  // The place's own picture first.
  pages.sort((a, b) => (files.includes(b.title) ? 1 : 0) - (files.includes(a.title) ? 1 : 0));
  const strip = (html) => String(html || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  return pages.map((pg) => {
    const info = pg.imageinfo?.[0];
    if (!info?.thumburl || !/\.(jpe?g|png|webp)$/i.test(pg.title)) return null;
    const meta = info.extmetadata || {};
    return {
      url: info.thumburl,
      caption: '',
      by: strip(meta.Artist?.value).slice(0, 60),
      credit: [strip(meta.LicenseShortName?.value), 'Wikimedia Commons'].filter(Boolean).join(' · '),
      link: info.descriptionurl || '',
    };
  }).filter(Boolean).slice(0, 10);
}
