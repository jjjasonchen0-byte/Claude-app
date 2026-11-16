// Google's place card (Places UI Kit): photos, rating, reviews, opening
// hours, website and phone, drawn by Google in the place's page. Used when
// the Meet server offers a browser key (GOOGLE_MAPS_BROWSER_KEY). It works
// beside any map, and costs far less than fetching the same content
// through the Places API (one card is one "Places UI Kit Query": 10,000 a
// month free, then $1 per 1,000).
//
// The place comes from OpenStreetMap; it is found on Google by name close
// to its position (an IDs-only search, which Google doesn't bill), and the
// card is checked once it has loaded: if Google's place is somewhere else
// (or has another name, when Google says), the card is dropped.
import { nameSimilarity } from './match.js';
import { haversine } from './geo.js';

let loader = null;

/** Load Google's Maps JavaScript library with the places elements (once). */
export function loadPlacesKit(key) {
  loader ||= new Promise((resolve, reject) => {
    window.__meetPlacesKit = resolve;
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?${new URLSearchParams({ key, v: 'weekly', loading: 'async', callback: '__meetPlacesKit' })}`;
    s.async = true;
    s.onerror = () => { loader = null; reject(new Error('Google could not be loaded')); };
    document.head.append(s);
  }).then(() => window.google.maps.importLibrary('places'));
  return loader;
}

/** Google's ID for a place (name and position from OpenStreetMap), or null. Asks for IDs only, which is free. */
export async function findPlaceId(p, maps = window.google.maps) {
  const { Place } = await maps.importLibrary('places');
  const dLat = 0.0018, dLon = 0.0018 / Math.cos((p.lat * Math.PI) / 180); // about 200 m each way
  const { places } = await Place.searchByText({
    textQuery: String(p.name).slice(0, 120),
    fields: ['id'],
    locationRestriction: { south: p.lat - dLat, west: p.lon - dLon, north: p.lat + dLat, east: p.lon + dLon },
    maxResultCount: 1,
  });
  return places?.[0]?.id || null;
}

const ids = new Map(); // a place from OpenStreetMap → Promise of its Google ID (or null), looked for once a visit

/** Google's ID for a place, looked for once a visit (for its list photo and its card alike). */
export function placeIdFor(p, maps = window.google.maps) {
  const key = `${p.id}|${p.name}|${Number(p.lat).toFixed(5)},${Number(p.lon).toFixed(5)}`;
  if (!ids.has(key)) ids.set(key, findPlaceId(p, maps).catch((err) => { ids.delete(key); throw err; }));
  return ids.get(key);
}

/**
 * A photo of a place for a list, and the kinds of place Google says it is:
 * { url, by, types }, or null when Google doesn't know it there. Looking for
 * the place and its photos is free; its position (to check it's the same
 * place) and kinds are a Place Details Essentials request (10,000 a month
 * free, then $5 per 1,000); the photo itself, once shown, is a Place Details
 * Photos request (1,000 a month free, then $7 per 1,000).
 */
export async function rowPhoto(p, { size = 240, maps = window.google.maps } = {}) {
  const id = await placeIdFor(p, maps);
  if (!id) return null;
  const { Place } = await maps.importLibrary('places');
  const place = new Place({ id });
  await place.fetchFields({ fields: ['location', 'photos', 'types'] });
  if (!samePlace(p, place)) return null;
  const photo = place.photos?.[0];
  return {
    url: photo ? photo.getURI({ maxWidth: size, maxHeight: size }) : null,
    by: (photo?.authorAttributions || []).map((a) => a.displayName).filter(Boolean).join(', '),
    types: Array.isArray(place.types) ? place.types : [],
  };
}

/**
 * Is the place Google loaded the same as ours? Google's card brings its
 * place's position but not its name (and nothing in the card can be read
 * from outside it), so: when Google gives a name, the same kind of name
 * within 250 m; otherwise within 80 m. The place was found by its name
 * within about 200 m already (findPlaceId); the same place in OpenStreetMap
 * and on Google is usually a few tens of metres apart.
 */
export function samePlace(p, loaded) {
  const loc = loaded?.location;
  const lat = typeof loc?.lat === 'function' ? loc.lat() : loc?.lat;
  const lng = typeof loc?.lng === 'function' ? loc.lng() : loc?.lng;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  const d = haversine(p.lat, p.lon, lat, lng);
  const name = typeof loaded.displayName === 'string' ? loaded.displayName : loaded.displayName?.text || '';
  if (name) return d <= 250 && nameSimilarity(p.name, name) >= 0.6;
  return d <= 80;
}

/**
 * The card for a place, made once: it loads its content (and is billed)
 * when it is first put in the page. onLoad(place) / onError() follow.
 */
export function placeCard(id, { dark = false, onLoad, onError } = {}) {
  const el = document.createElement('gmp-place-details');
  el.className = 'gcard';
  el.style.colorScheme = dark ? 'dark' : 'light';
  el.innerHTML = `<gmp-place-details-place-request place="${String(id).replace(/[^\w-]/g, '')}"></gmp-place-details-place-request>
    <gmp-place-content-config>
      <gmp-place-media lightbox-preferred></gmp-place-media>
      <gmp-place-rating></gmp-place-rating>
      <gmp-place-type></gmp-place-type>
      <gmp-place-price></gmp-place-price>
      <gmp-place-accessible-entrance-icon></gmp-place-accessible-entrance-icon>
      <gmp-place-opening-hours></gmp-place-opening-hours>
      <gmp-place-website></gmp-place-website>
      <gmp-place-phone-number></gmp-place-phone-number>
      <gmp-place-summary></gmp-place-summary>
      <gmp-place-type-specific-highlights></gmp-place-type-specific-highlights>
      <gmp-place-review-summary></gmp-place-review-summary>
      <gmp-place-reviews></gmp-place-reviews>
      <gmp-place-feature-list></gmp-place-feature-list>
      <gmp-place-attribution light-scheme-color="gray" dark-scheme-color="white"></gmp-place-attribution>
    </gmp-place-content-config>`;
  el.addEventListener('gmp-load', () => onLoad?.(el.place), { once: true });
  el.addEventListener('gmp-error', () => onError?.(), { once: true });
  return el;
}
