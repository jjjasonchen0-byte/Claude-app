// Ratings, photos and reviews from Tripadvisor's Terra API (Discover plan).
// https://docs.terra.tripadvisor.com
//
// Off unless TRIPADVISOR_API_KEY is set. The key stays on the server.
//
// How Terra works, and what that means here:
//  • Content (details, photos, reviews) is only returned for locations on your
//    account's allowlist. Meet finds a place's Tripadvisor ID with the catalog
//    search, adds it to the allowlist (free), then asks for content.
//  • It is pay-per-use after a one-time 1,000 free "billable entities": each
//    location returned by a search or details call counts once, and each
//    photos or reviews call counts once per location. TRIPADVISOR_DAILY_LIMIT
//    caps how many Meet will use per day (default 150).
//  • Tripadvisor does not allow caching its content, except location IDs. Meet
//    remembers which Tripadvisor ID belongs to which OpenStreetMap place, and
//    nothing else.
import { bestMatch } from '../public/js/match.js';

const BASE = 'https://terra.tripadvisor.com/api';

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const text = (arr, lang = 'en') => {
  if (!Array.isArray(arr) || !arr.length) return '';
  return (arr.find((t) => t.primary && t.language === lang) || arr.find((t) => t.language === lang) || arr.find((t) => t.primary) || arr[0]).value || '';
};

/** Catalog / location record → the fields Meet shows in lists. */
export function normalizeSummary(loc) {
  if (!loc || loc.id == null) return null;
  const overall = loc.overall_rating || loc.traveler_ratings?.overall || {};
  return {
    id: loc.id,
    name: text(loc.names),
    lat: loc.coordinates?.latitude ?? null,
    lon: loc.coordinates?.longitude ?? null,
    rating: overall.rating ?? null,
    count: overall.count ?? 0,
    ratingImage: overall.icon_url || '',
    priceLevel: loc.price_level || '',
    url: loc.urls?.tripadvisor?.main || '',
  };
}

/** Location details + photos + reviews → one object for the place page. */
export function normalizePlace(loc, photos = [], reviews = []) {
  const base = normalizeSummary(loc) || {};
  const tr = loc.traveler_ratings || {};
  return {
    ...base,
    address: loc.addresses?.[0]?.formatted || '',
    phone: loc.phone_numbers?.find((p) => p.value)?.value || '',
    website: loc.urls?.official || '',
    menu: loc.urls?.menu || '',
    writeReview: loc.urls?.tripadvisor?.write_review || '',
    photosUrl: loc.urls?.tripadvisor?.photos || '',
    description: text(loc.descriptions),
    categories: (loc.categories || []).map((c) => c.display_name).filter(Boolean),
    features: (loc.attributes || []).map((a) => a.name).filter(Boolean).slice(0, 24),
    ranking: loc.rankings?.[0]?.display_text || '',
    awards: (loc.awards || []).map((a) => [a.name || a.type, a.year].filter(Boolean).join(' ')).filter(Boolean),
    hours: loc.opening_hours?.formatted || [],
    status: loc.status?.value || 'OPEN',
    breakdown: (tr.breakdowns || []).map((b) => ({ rating: b.rating, count: b.count })).sort((a, b) => b.rating - a.rating),
    subratings: (tr.subratings || []).map((s) => ({ name: s.type_name || s.type, rating: s.rating })).filter((s) => s.name && s.rating != null),
    photoCount: loc.photos?.total_count ?? photos.length,
    photos: photos.map((p) => ({
      url: p.photo?.original_size_url || '',
      width: p.photo?.original_width || null,
      height: p.photo?.original_height || null,
      caption: p.caption || '',
      by: p.user?.username || p.source?.name || '',
    })).filter((p) => p.url),
    reviews: reviews.map((r) => ({
      id: r.id,
      title: text(r.title),
      text: text(r.text),
      rating: r.rating,
      ratingImage: r.rating_icon_url?.url || '',
      date: r.publish_ts || '',
      visited: r.travel_date || '',
      tripType: r.trip_type && r.trip_type !== 'NONE' ? r.trip_type : '',
      user: r.user?.username || 'Tripadvisor member',
      avatar: r.user?.avatar_url?.url || '',
      url: r.url || '',
      reply: r.owner_response ? text(r.owner_response.text) : '',
    })),
  };
}

export function createTripadvisor({ apiKey, dailyLimit = 150, fetchImpl = fetch, ids = new Map(), onIdsChanged = () => {} } = {}) {
  const enabled = !!apiKey;
  let day = '', used = 0;
  const allowed = new Set(); // IDs known to be on the allowlist (IDs may be kept)

  function spend(n) {
    const today = new Date().toISOString().slice(0, 10);
    if (today !== day) { day = today; used = 0; }
    if (used + n > dailyLimit) throw new HttpError(429, 'Ratings and photos are paused until tomorrow (daily limit reached)');
    used += n;
  }

  async function call(path, { method = 'GET', body, query = {} } = {}) {
    const q = new URLSearchParams({ version: '1' });
    for (const [k, v] of Object.entries(query)) for (const x of [].concat(v)) q.append(k, String(x));
    let res;
    try {
      res = await fetchImpl(`${BASE}${path}?${q}`, {
        method,
        headers: { 'X-API-Key': apiKey, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(12000),
      });
    } catch {
      throw new HttpError(502, 'Tripadvisor could not be reached');
    }
    let data = null;
    try { data = await res.json(); } catch { /* empty */ }
    if (res.status === 401 || res.status === 403) throw new HttpError(503, 'Tripadvisor turned the API key down. Check TRIPADVISOR_API_KEY and your plan.');
    if (res.status === 429) throw new HttpError(429, 'Tripadvisor is busy. Try again in a moment.');
    if (res.status === 404) throw new HttpError(404, 'Not on Tripadvisor');
    if (!res.ok) throw new HttpError(502, `Tripadvisor answered ${res.status}`);
    return data;
  }

  async function allow(list) {
    const fresh = [...new Set(list)].filter((id) => id != null && !allowed.has(id));
    if (!fresh.length) return;
    try {
      await call('/allowlist', { method: 'POST', body: { operation_type: 'APPEND', allowlist: fresh } });
    } catch (err) {
      if (err.status !== 409) throw err; // 409: someone else changed it at the same time; retry once
      await call('/allowlist', { method: 'POST', body: { operation_type: 'APPEND', allowlist: fresh } });
    }
    for (const id of fresh) allowed.add(id);
  }

  /** Catalog search right around one place: a few nearby listings. */
  async function nearbyCatalog(p) {
    spend(3);
    const data = await call('/catalog/locations/nearby', {
      query: { lat: p.lat.toFixed(6), lon: p.lon.toFixed(6), radius: '0.12', unit: 'KM', size: 3, sort: 'distance,asc', ...(p.category ? { category: p.category } : {}) },
    });
    const list = (data?.data || []).map((r) => normalizeSummary(r.location)).filter(Boolean);
    used -= Math.max(0, 3 - list.length); // only listings returned are billed
    return list;
  }

  /**
   * Ratings for places on screen. items: [{ key, name, lat, lon, category }]
   * → { [key]: summary | null }. Known Tripadvisor IDs are looked up in one
   * batch; unknown places are matched by name and distance first.
   */
  async function ratings(items) {
    const out = {};
    const known = [];
    const unknown = [];
    for (const it of items) {
      const hit = ids.get(it.key);
      if (hit === undefined) unknown.push(it);
      else if (hit === null) out[it.key] = null;
      else known.push({ ...it, id: hit });
    }
    let changed = false;
    await Promise.all(unknown.map(async (it) => {
      try {
        const match = bestMatch(it, await nearbyCatalog(it));
        ids.set(it.key, match ? match.id : null);
        changed = true;
        out[it.key] = match;
      } catch (err) {
        if (err.status === 429 || err.status === 503) throw err;
        out[it.key] = null;
      }
    }));
    if (changed) onIdsChanged();
    if (known.length) {
      spend(known.length);
      await allow(known.map((k) => k.id));
      const data = await call('/locations', { query: { id: known.map((k) => k.id).join(',') } });
      const byId = new Map((data?.data || []).map((l) => [l.id, normalizeSummary(l)]));
      used -= known.length - byId.size;
      for (const k of known) out[k.key] = byId.get(k.id) || null;
    }
    const matched = Object.values(out).filter(Boolean).map((s) => s.id);
    if (matched.length) await allow(matched);
    return out;
  }

  /** The first photo of a place (for list thumbnails). */
  async function photo(id) {
    spend(1);
    await allow([id]);
    const data = await call(`/locations/${encodeURIComponent(id)}/photos`, { query: { size: 1 } });
    const p = data?.data?.[0]?.photo;
    return p?.original_size_url ? { url: p.original_size_url, width: p.original_width || null, height: p.original_height || null } : null;
  }

  /** Everything for the place page: details, up to 12 photos, 6 recent reviews. */
  async function place(id) {
    spend(3);
    await allow([id]);
    const [loc, photos, reviews] = await Promise.all([
      call(`/locations/${encodeURIComponent(id)}`),
      call(`/locations/${encodeURIComponent(id)}/photos`, { query: { size: 12 } }).catch(() => ({ data: [] })),
      call(`/locations/${encodeURIComponent(id)}/reviews`, { query: { size: 6 } }).catch(() => ({ data: [] })),
    ]);
    return normalizePlace(loc, photos?.data || [], reviews?.data || []);
  }

  return { enabled, ratings, photo, place, usage: () => ({ day, used, dailyLimit }) };
}
