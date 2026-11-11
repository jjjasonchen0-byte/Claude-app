// Places of interest around the meeting point, via OpenStreetMap / Overpass,
// sorted into tabs (Food, Drinks, …) and listings ("Italian · 4").
import { haversine } from './geo.js';

export const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

/** POST an Overpass query, trying mirrors in turn. */
export async function overpass(query, { signal, timeoutMs = 9000, mirrors = 1 } = {}) {
  let lastErr;
  for (const url of OVERPASS_ENDPOINTS.slice(0, mirrors)) {
    const ctrl = new AbortController();
    const onAbort = () => ctrl.abort();
    signal?.addEventListener('abort', onAbort);
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { method: 'POST', body: new URLSearchParams({ data: query }), signal: ctrl.signal });
      if (!res.ok) throw new Error(`Overpass ${res.status}`);
      const json = await res.json();
      if (!json || !Array.isArray(json.elements)) throw new Error('Bad Overpass response');
      return json;
    } catch (err) {
      if (signal?.aborted) throw err;
      lastErr = err;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }
  throw lastErr || new Error('Overpass unavailable');
}

export const TABS = [
  { id: 'food', label: 'Food', icon: '🍽️' },
  { id: 'drinks', label: 'Drinks', icon: '☕' },
  { id: 'fun', label: 'Fun', icon: '🎳' },
  { id: 'culture', label: 'Culture', icon: '🎭' },
  { id: 'outdoors', label: 'Outdoors', icon: '🌳' },
  { id: 'shopping', label: 'Shopping', icon: '🛍️' },
];

const CUISINE = {
  italian: 'Italian', pizza: 'Pizza', burger: 'Burgers', chinese: 'Chinese', japanese: 'Japanese',
  sushi: 'Sushi', ramen: 'Ramen', indian: 'Indian', thai: 'Thai', mexican: 'Mexican', korean: 'Korean',
  vietnamese: 'Vietnamese', french: 'French', greek: 'Greek', turkish: 'Turkish', kebab: 'Kebab',
  american: 'American', mediterranean: 'Mediterranean', middle_eastern: 'Middle Eastern', lebanese: 'Lebanese',
  spanish: 'Spanish', tapas: 'Tapas', seafood: 'Seafood', fish_and_chips: 'Fish & chips', steak_house: 'Steakhouse',
  chicken: 'Chicken', fried_chicken: 'Chicken', sandwich: 'Sandwiches', noodle: 'Noodles', asian: 'Asian',
  vegetarian: 'Vegetarian', vegan: 'Vegan', breakfast: 'Breakfast & brunch', brunch: 'Breakfast & brunch',
  regional: 'Local', german: 'German', british: 'British', portuguese: 'Portuguese', brazilian: 'Brazilian',
  peruvian: 'Peruvian', ethiopian: 'Ethiopian', african: 'African', caribbean: 'Caribbean', malaysian: 'Malaysian',
  indonesian: 'Indonesian', filipino: 'Filipino', taiwanese: 'Taiwanese', dumpling: 'Dumplings', bbq: 'BBQ',
  barbecue: 'BBQ', persian: 'Persian', pakistani: 'Pakistani', nepalese: 'Nepalese', polish: 'Polish',
  russian: 'Russian', ukrainian: 'Ukrainian', hawaiian: 'Hawaiian', poke: 'Poké', crepe: 'Crêpes',
  bagel: 'Bagels', donut: 'Doughnuts', dessert: 'Desserts', cake: 'Desserts', salad: 'Salads', soup: 'Soup',
  hot_dog: 'Hot dogs', falafel: 'Falafel', shawarma: 'Shawarma', fusion: 'Fusion', international: 'International',
  australian: 'Australian', cantonese: 'Chinese', sichuan: 'Chinese', dim_sum: 'Dim sum', hot_pot: 'Hot pot',
  coffee_shop: 'Cafés', tea: 'Tea', bubble_tea: 'Bubble tea', juice: 'Juice & smoothies', smoothie: 'Juice & smoothies',
};

const titleCase = (s) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/** Map OSM tags to { tab, group } or null if uninteresting. */
export function categorize(tags = {}) {
  const a = tags.amenity, l = tags.leisure, t = tags.tourism, s = tags.shop;
  const cuisine = (tags.cuisine || '').split(/[;,]/)[0].trim().toLowerCase();
  const cuisineLabel = cuisine ? CUISINE[cuisine] || titleCase(cuisine) : '';

  if (a === 'restaurant' || a === 'food_court') return { tab: 'food', group: cuisineLabel || 'Restaurants' };
  if (a === 'fast_food') return { tab: 'food', group: cuisineLabel || 'Fast food' };
  if (s === 'bakery' || s === 'pastry') return { tab: 'food', group: 'Bakeries' };
  if (a === 'ice_cream' || s === 'ice_cream') return { tab: 'drinks', group: 'Ice cream' };
  if (a === 'cafe') {
    if (['bubble_tea', 'tea', 'juice', 'smoothie'].includes(cuisine)) return { tab: 'drinks', group: CUISINE[cuisine] };
    return { tab: 'drinks', group: 'Cafés' };
  }
  if (a === 'bar') return { tab: 'drinks', group: tags.bar === 'cocktail' || cuisine === 'cocktail' ? 'Cocktail bars' : 'Bars' };
  if (a === 'pub') return { tab: 'drinks', group: 'Pubs' };
  if (a === 'biergarten') return { tab: 'drinks', group: 'Beer gardens' };
  if (s === 'coffee' || s === 'tea') return { tab: 'drinks', group: 'Coffee & tea shops' };

  if (a === 'cinema') return { tab: 'fun', group: 'Cinemas' };
  if (a === 'nightclub') return { tab: 'fun', group: 'Nightclubs' };
  if (a === 'bowling_alley' || l === 'bowling_alley') return { tab: 'fun', group: 'Bowling' };
  if (l === 'escape_game') return { tab: 'fun', group: 'Escape rooms' };
  if (l === 'amusement_arcade' || a === 'gambling') return { tab: 'fun', group: 'Arcades' };
  if (l === 'miniature_golf') return { tab: 'fun', group: 'Mini golf' };
  if (l === 'sports_centre' || l === 'fitness_centre') return { tab: 'fun', group: 'Sports & fitness' };
  if (l === 'ice_rink') return { tab: 'fun', group: 'Ice skating' };
  if (l === 'water_park') return { tab: 'fun', group: 'Water parks' };
  if (t === 'theme_park') return { tab: 'fun', group: 'Theme parks' };
  if (t === 'zoo' || t === 'aquarium') return { tab: 'fun', group: t === 'zoo' ? 'Zoos' : 'Aquariums' };
  if (a === 'karaoke_box' || l === 'trampoline_park') return { tab: 'fun', group: titleCase(a || l) };

  if (t === 'museum') return { tab: 'culture', group: 'Museums' };
  if (t === 'gallery' || a === 'arts_centre') return { tab: 'culture', group: 'Galleries & arts' };
  if (a === 'theatre') return { tab: 'culture', group: 'Theatres' };
  if (a === 'library') return { tab: 'culture', group: 'Libraries' };
  if (t === 'attraction' || a === 'community_centre') return { tab: 'culture', group: t ? 'Attractions' : 'Community centres' };

  if (l === 'park') return { tab: 'outdoors', group: 'Parks' };
  if (l === 'garden') return { tab: 'outdoors', group: 'Gardens' };
  if (l === 'playground') return { tab: 'outdoors', group: 'Playgrounds' };
  if (l === 'nature_reserve') return { tab: 'outdoors', group: 'Nature reserves' };
  if (t === 'viewpoint') return { tab: 'outdoors', group: 'Viewpoints' };
  if (t === 'picnic_site') return { tab: 'outdoors', group: 'Picnic spots' };
  if (l === 'beach_resort' || tags.natural === 'beach') return { tab: 'outdoors', group: 'Beaches' };

  if (s === 'mall' || s === 'department_store') return { tab: 'shopping', group: 'Malls & department stores' };
  if (s === 'books') return { tab: 'shopping', group: 'Bookshops' };
  if (s === 'games' || s === 'video_games' || s === 'toys') return { tab: 'shopping', group: 'Games & toys' };
  if (s === 'music' || s === 'musical_instrument') return { tab: 'shopping', group: 'Music' };
  if (s === 'gift') return { tab: 'shopping', group: 'Gifts' };
  if (s === 'clothes' || s === 'shoes') return { tab: 'shopping', group: 'Fashion' };
  if (s === 'supermarket' || s === 'convenience') return { tab: 'shopping', group: 'Groceries' };
  if (a === 'marketplace') return { tab: 'shopping', group: 'Markets' };
  return null;
}

export function poiQuery(center, radius) {
  const around = `(around:${Math.round(radius)},${center.lat.toFixed(6)},${center.lon.toFixed(6)})`;
  const sel = [
    `nwr${around}[amenity~"^(restaurant|fast_food|food_court|cafe|bar|pub|biergarten|ice_cream|cinema|nightclub|bowling_alley|theatre|arts_centre|library|marketplace|karaoke_box|community_centre)$"][name]`,
    `nwr${around}[leisure~"^(park|garden|playground|nature_reserve|bowling_alley|escape_game|amusement_arcade|miniature_golf|sports_centre|fitness_centre|ice_rink|water_park|trampoline_park)$"][name]`,
    `nwr${around}[tourism~"^(museum|gallery|attraction|zoo|aquarium|theme_park|viewpoint|picnic_site)$"][name]`,
    `nwr${around}[shop~"^(mall|department_store|books|bakery|pastry|games|video_games|toys|music|gift|clothes|coffee|tea|ice_cream|supermarket)$"][name]`,
  ];
  return `[out:json][timeout:12];(${sel.join(';')};);out center tags 400;`;
}

function formatAddress(tags) {
  const street = [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' ');
  return [street, tags['addr:suburb'] || tags['addr:city']].filter(Boolean).join(', ');
}

/** Turn Overpass elements into categorised POIs (deduplicated by name + spot). */
export function parsePois(elements, center) {
  const seen = new Set();
  const out = [];
  for (const el of elements) {
    const tags = el.tags || {};
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (!tags.name || lat == null || lon == null) continue;
    const cat = categorize(tags);
    if (!cat) continue;
    const key = `${tags.name.toLowerCase()}|${lat.toFixed(3)}|${lon.toFixed(3)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: `${el.type}/${el.id}`,
      name: tags.name,
      lat, lon,
      tab: cat.tab,
      group: cat.group,
      address: formatAddress(tags),
      cuisine: tags.cuisine || '',
      hours: tags.opening_hours || '',
      phone: tags.phone || tags['contact:phone'] || '',
      website: tags.website || tags['contact:website'] || '',
      menu: tags['website:menu'] || '',
      email: tags.email || tags['contact:email'] || '',
      description: tags.description || '',
      brand: tags.brand || '',
      wheelchair: tags.wheelchair || '',
      outdoor: tags.outdoor_seating === 'yes',
      takeaway: tags.takeaway || '',
      delivery: tags.delivery || '',
      reservation: tags.reservation || '',
      wifi: /yes|wlan|free/.test(tags.internet_access || '') ? 'yes' : '',
      dogs: tags.dog || '',
      vegan: /yes|only/.test(tags['diet:vegan'] || ''),
      vegetarian: /yes|only/.test(tags['diet:vegetarian'] || ''),
      // Free photo sources: a Wikidata item or a Wikimedia Commons file.
      wikidata: /^Q\d+$/.test(tags.wikidata || '') ? tags.wikidata : '',
      commons: tags.wikimedia_commons || (/commons\.wikimedia\.org\/wiki\/(File:[^?#]+)/.exec(tags.image || '')?.[1] ? decodeURIComponent(/commons\.wikimedia\.org\/wiki\/(File:[^?#]+)/.exec(tags.image)[1]) : ''),
      fromCenter: haversine(center.lat, center.lon, lat, lon),
    });
  }
  return out.sort((a, b) => a.fromCenter - b.fromCenter);
}

/** { tabId: [{ group, items: [...] }] } with groups sorted by count. */
export function groupPois(pois) {
  const byTab = Object.fromEntries(TABS.map((t) => [t.id, new Map()]));
  for (const p of pois) {
    const m = byTab[p.tab];
    if (!m.has(p.group)) m.set(p.group, []);
    m.get(p.group).push(p);
  }
  const out = {};
  for (const t of TABS) {
    out[t.id] = [...byTab[t.id].entries()]
      .map(([group, items]) => ({ group, items }))
      .sort((a, b) => b.items.length - a.items.length || a.group.localeCompare(b.group));
  }
  return out;
}

/**
 * Places near a point, as fast as possible. One Overpass query (OpenStreetMap,
 * with cuisines) races Photon (which only knows the kind of place): Photon
 * starts if Overpass has not answered within a couple of seconds, and
 * whichever has answered once both had a fair chance wins. Quiet areas get
 * one wider search.
 */
export async function findPois(center, { radius, signal, minResults = 12, photonAfterMs = 2200, graceMs = 1200, overpassTimeoutMs = 9000 } = {}) {
  const r = radius || 1500;
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  signal?.addEventListener('abort', onAbort);
  const viaOverpass = (async () => {
    let json = await overpass(poiQuery(center, r), { signal: ctrl.signal, timeoutMs: overpassTimeoutMs });
    let pois = parsePois(json.elements, center);
    let used = r;
    if (!radius && pois.length < minResults) {
      used = 4000;
      json = await overpass(poiQuery(center, used), { signal: ctrl.signal, timeoutMs: overpassTimeoutMs });
      pois = parsePois(json.elements, center);
    }
    return { pois, radius: used, source: 'overpass' };
  })();
  let photon = null;
  const startPhoton = () => (photon ||= photonPois(center, r, { signal: ctrl.signal }).then((pois) => ({ pois, radius: r, source: 'photon' })));
  const settle = (p) => p.then((v) => ({ ok: true, v }), (e) => ({ ok: false, e }));
  try {
    const o = settle(viaOverpass);
    const first = await Promise.race([o, new Promise((res) => setTimeout(() => res(null), photonAfterMs))]);
    if (first?.ok) return first.v;
    if (signal?.aborted) throw first?.e || new DOMException('Aborted', 'AbortError');
    // Overpass failed or is slow: Photon joins in.
    const p = settle(startPhoton());
    const next = await Promise.race([o, p]);
    if (next.ok) {
      if (next.v.source === 'overpass') return next.v;
      // Photon answered first; Overpass gets a moment longer, since it knows cuisines.
      const late = await Promise.race([o, new Promise((res) => setTimeout(() => res(null), graceMs))]);
      return late?.ok ? late.v : next.v;
    }
    // The first to finish failed: wait for the other one.
    const [ro, rp] = await Promise.all([o, p]);
    if (ro.ok) return ro.v;
    if (rp.ok) return rp.v;
    throw rp.e;
  } finally {
    signal?.removeEventListener('abort', onAbort);
    ctrl.abort(); // stop whichever is still running
  }
}

// ---------------------------------------------------------------- Photon fallback

const PHOTON_REVERSE = 'https://photon.komoot.io/reverse';
// One request per group, so each kind of place gets a fair share of the 50 results.
export const PHOTON_GROUPS = [
  ['amenity:restaurant', 'amenity:fast_food', 'amenity:food_court', 'shop:bakery'],
  ['amenity:cafe', 'amenity:pub', 'amenity:bar', 'amenity:biergarten', 'amenity:ice_cream'],
  ['amenity:cinema', 'amenity:theatre', 'amenity:arts_centre', 'amenity:nightclub', 'amenity:library', 'tourism:museum', 'tourism:gallery',
    'tourism:attraction', 'tourism:zoo', 'leisure:bowling_alley', 'leisure:escape_game', 'leisure:amusement_arcade', 'leisure:sports_centre'],
  ['leisure:park', 'leisure:garden', 'leisure:playground', 'leisure:nature_reserve', 'tourism:viewpoint',
    'shop:mall', 'shop:department_store', 'shop:books', 'shop:games', 'shop:gift', 'shop:clothes', 'amenity:marketplace'],
];

export function photonUrl(center, radiusM, tags) {
  const q = new URLSearchParams({ lat: center.lat.toFixed(6), lon: center.lon.toFixed(6), radius: (radiusM / 1000).toFixed(2), limit: '50' });
  for (const t of tags) q.append('osm_tag', t);
  return `${PHOTON_REVERSE}?${q}`;
}

/** Photon features → Overpass-style elements, so parsePois can sort them into tabs. */
export function photonElements(features) {
  const TYPES = { N: 'node', W: 'way', R: 'relation' };
  return (features || []).filter((f) => f?.properties?.name && f.geometry?.coordinates).map((f) => {
    const p = f.properties;
    const [lon, lat] = f.geometry.coordinates;
    return {
      type: TYPES[p.osm_type] || 'node', id: p.osm_id, lat, lon,
      tags: {
        name: p.name, [p.osm_key]: p.osm_value,
        ...(p.street ? { 'addr:street': p.street } : {}),
        ...(p.housenumber ? { 'addr:housenumber': p.housenumber } : {}),
        ...(p.district || p.city ? { 'addr:suburb': p.district || p.city } : {}),
      },
    };
  });
}

async function photonPois(center, radiusM, { signal } = {}) {
  const results = await Promise.allSettled(PHOTON_GROUPS.map(async (tags) => {
    const res = await fetch(photonUrl(center, radiusM, tags), { signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`Photon ${res.status}`);
    return (await res.json()).features;
  }));
  const ok = results.filter((r) => r.status === 'fulfilled');
  if (!ok.length) throw new Error('Places could not be loaded');
  return parsePois(photonElements(ok.flatMap((r) => r.value)), center)
    .filter((p) => p.fromCenter <= radiusM * 1.1);
}
