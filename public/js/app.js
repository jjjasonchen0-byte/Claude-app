// Meet — app controller: start screen, map, panel views, search flow,
// optional sign-in and the draggable bottom sheet on phones.
import { api } from './api.js';
import { searchAddress, reverseGeocode, currentPosition } from './geocode.js';
import { findMeetingPoint, estimateSeconds, SPEEDS } from './meetpoint.js';
import { FloodAnimation } from './flood.js';
import { loadRoads } from './roads.js';
import { TABS, findPois, groupPois } from './pois.js';
import { ratingsSource, rateAll, thumbFor, detailsFor } from './rated.js';
import { openStatus, weekTable } from './hours.js';
import { haversine } from './geo.js';
import { mapLinks, shareText, messagingLinks, nativeShare, copyText, calendarInvite, download } from './share.js';
import { MODES, ATTRIBUTION, getDirections, getTravelTimes, navLinks, vehicleName, isWalkLeg } from './directions.js';

// ---------------------------------------------------------------- constants

const COLORS = ['#007aff', '#ff9500', '#34c759', '#af52de', '#ff3b30', '#30b0c7', '#5856d6', '#ff2d55', '#a2845e', '#8e8e93'];
const PACE = { slow: 1.45, normal: 1, fast: 0.6 }; // how long the search animation takes
const RADII = [500, 1000, 2000, 5000];
const PRICE = { 'Cheap Eats': '£', 'Mid Range': '££', 'Fine Dining': '£££' };
const DEFAULT_SETTINGS = { mode: 'similar', travel: 'transit', speed: 'normal', theme: 'auto' };
const SHEET_DEFAULT = { people: 'mid', results: 'mid', group: 'mid', place: 'mid', share: 'full' };

// Category icons: Settings-style coloured tiles with simple line glyphs.
const TAB_COLOR = { food: '#ff9500', drinks: '#a2845e', fun: '#5856d6', culture: '#af52de', outdoors: '#34c759', shopping: '#007aff', meet: '#007aff' };
const GLYPH = {
  food: '<path d="M7 3v7a2 2 0 0 0 2 2v9M5 3v5M9 3v5M17 21V3c-2.2 1.2-3.5 4-3.5 7.5h3.5"/>',
  drinks: '<path d="M5 9h11v4a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5zM16 10.5h1.5a2.5 2.5 0 0 1 0 5H16M8 3.5v2.5M11.5 3.5v2.5"/>',
  fun: '<path d="M12 3.5l2.5 5.2 5.7.8-4.1 4 1 5.6-5.1-2.7-5.1 2.7 1-5.6-4.1-4 5.7-.8z"/>',
  culture: '<path d="M3.5 9.5L12 4.5l8.5 5M5.5 10v8M10 10v8M14 10v8M18.5 10v8M3.5 20h17"/>',
  outdoors: '<path d="M12 21v-5M12 3.5l6.5 9h-13zM12 8.5l7 8h-14z"/>',
  shopping: '<path d="M5.5 8.5h13l-1 12h-11zM9 8.5V7a3 3 0 0 1 6 0v1.5"/>',
  all: '<path d="M5 6h14M5 12h14M5 18h14"/>',
  pin: '<path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.2"/>',
  pencil: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  transit: '<path d="M7 3.5h10a2 2 0 0 1 2 2V15a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5.5a2 2 0 0 1 2-2zM5 10.5h14M8.5 14h.01M15.5 14h.01M8 17l-1.8 3.5M16 17l1.8 3.5"/>',
  walk: '<circle cx="13" cy="4.5" r="1.7"/><path d="M10 21l2-6 3 3v3.5M9.5 12.5l1.2-4.8 3.8 1.3 1.8 3M10.7 7.7L7.5 10v3"/>',
  bike: '<circle cx="6" cy="16" r="3.4"/><circle cx="18" cy="16" r="3.4"/><path d="M6 16l3.8-7h6.2l2 7M8.5 6h3M12 9l-2.2 7"/>',
  drive: '<path d="M5 15l1.5-4.6A2 2 0 0 1 8.4 9h7.2a2 2 0 0 1 1.9 1.4L19 15M4 15h16v3a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-1H7v1a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  phone: '<path d="M6.6 3.5h2.6l1.5 4.2-2 1.3a11 11 0 0 0 6.3 6.3l1.3-2 4.2 1.5v2.6a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.6 5.7a2 2 0 0 1 2-2.2z"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.4 2.3 3.5 5.2 3.5 8.5s-1.1 6.2-3.5 8.5c-2.4-2.3-3.5-5.2-3.5-8.5s1.1-6.2 3.5-8.5z"/>',
  send: '<path d="M20.5 3.5L3.5 10.6l7.3 2.6 2.6 7.3z"/>',
  route: '<circle cx="6" cy="18" r="2.2"/><circle cx="18" cy="6" r="2.2"/><path d="M8 18h6.5a3.5 3.5 0 0 0 0-7h-5a3.5 3.5 0 0 1 0-7H16"/>',
  menu: '<path d="M6 3.5h12v17H6zM9 8h6M9 12h6M9 16h4"/>',
  photo: '<rect x="3.5" y="5.5" width="17" height="13" rx="2.5"/><circle cx="9" cy="10.5" r="1.8"/><path d="M20.5 15.5l-5-5-8.5 8"/>',
};
GLYPH.meet = GLYPH.pin;
const glyph = (id, size = 16, width = 2.2) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${GLYPH[id]}</svg>`;
const tile = (id, size = '') => `<span class="tile ${size}${id === 'all' ? ' grey' : ''}" style="--c:${TAB_COLOR[id] || '#8e8e93'}">${glyph(id)}</span>`;
const CHEV = '<svg class="chev" viewBox="0 0 8 14" width="8" height="14" aria-hidden="true"><path d="M1.5 1.5L6.5 7l-5 5.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const backBtn = (action, label) => `<button class="back" data-action="${action}">${CHEV}<span>${esc(label)}</span></button>`;

// ---------------------------------------------------------------- state

const state = {
  user: null,
  places: [],
  settings: { ...DEFAULT_SETTINGS },
  view: 'people',
  search: null,
  editingId: null,
};
const sheet = { snap: 'mid', target: 0 };

let map, baseLayer, peopleLayer, resultLayer, poiLayer, fxLayer, anim, searchAbort, homeSearchCtl;

// ---------------------------------------------------------------- helpers

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const isMobile = () => window.matchMedia('(max-width: 759px)').matches;

function fmtDist(m) {
  if (m < 950) return `${Math.max(10, Math.round(m / 10) * 10)} m`;
  return `${(m / 1000).toFixed(m < 9500 ? 1 : 0)} km`;
}
function travelMinutes(m, mode = state.settings.travel) {
  return Math.round(estimateSeconds(mode, m / 1.3) / 60);
}
function fmtTime(min) {
  if (min < 60) return `${Math.max(1, min)} min`;
  const h = Math.floor(min / 60), r = min % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}
const initial = (name) => (name || '?').trim().charAt(0).toUpperCase() || '?';
const shortAddr = (a) => (a || '').split(', ').slice(0, 2).join(', ');

function toast(msg, { error = false, action, onAction, ms = 3600 } = {}) {
  // The same message again replaces the one already showing.
  for (const t of $$('.toast')) if (t.dataset.msg === msg) t.remove();
  const el = document.createElement('div');
  el.dataset.msg = msg;
  el.className = `toast${error ? ' error' : ''}`;
  el.innerHTML = `<span>${esc(msg)}</span>`;
  if (action) {
    const b = document.createElement('button');
    b.textContent = action;
    b.onclick = () => { onAction?.(); el.remove(); };
    el.appendChild(b);
  }
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), ms);
}

function showScreen(id) {
  for (const s of $$('.screen')) s.hidden = s.id !== id;
}

/** Everyone: you first, then saved addresses. */
function everyone() {
  const list = [];
  if (state.user?.home) list.push({ id: 'home', isHome: true, name: 'You', ...state.user.home, mode: state.user.home.mode || state.settings.travel, active: true, color: COLORS[0] });
  state.places.forEach((p, i) => list.push({
    ...p, mode: p.mode || state.settings.travel, name: p.nickname || shortAddr(p.address) || `Friend ${i + 1}`, color: COLORS[(i + 1) % COLORS.length],
  }));
  return list;
}
const activePeople = () => everyone().filter((p) => p.active);

// ---------------------------------------------------------------- address search widget

function attachSearch(root, { near, onPick }) {
  const input = $('input', root);
  const list = $('.suggestions', root);
  let items = [];
  let sel = -1;
  let timer;
  let ctrl;

  const close = () => { list.hidden = true; sel = -1; };
  const render = () => {
    list.innerHTML = items.length
      ? items.map((r, i) => `<li role="option" data-i="${i}" aria-selected="${i === sel}">
          <div class="s-title">${esc(r.title)}</div><div class="s-sub">${esc(r.subtitle)}</div></li>`).join('')
      : '<li class="s-empty">No matches. Try adding a town or postcode.</li>';
    list.hidden = false;
  };
  const pick = (i) => {
    const r = items[i];
    if (!r) return;
    close();
    input.value = r.address;
    onPick(r);
  };
  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value;
    if (q.trim().length < 3) { close(); return; }
    timer = setTimeout(async () => {
      ctrl?.abort();
      ctrl = new AbortController();
      try {
        items = await searchAddress(q, { near: near?.(), signal: ctrl.signal });
        sel = items.length ? 0 : -1;
        if (document.activeElement === input) render();
      } catch (err) {
        if (err.name !== 'AbortError') { items = []; render(); }
      }
    }, 300);
  });
  input.addEventListener('keydown', (e) => {
    if (list.hidden) return;
    if (e.key === 'ArrowDown') { sel = Math.min(items.length - 1, sel + 1); render(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); render(); e.preventDefault(); }
    else if (e.key === 'Enter') { if (sel >= 0) { pick(sel); e.preventDefault(); } }
    else if (e.key === 'Escape') close();
  });
  input.addEventListener('blur', () => setTimeout(close, 150));
  list.addEventListener('mousedown', (e) => {
    const li = e.target.closest('li[data-i]');
    if (li) { e.preventDefault(); pick(Number(li.dataset.i)); }
  });
  return { input, clear: () => { input.value = ''; close(); } };
}

// ---------------------------------------------------------------- user (guest or profile)

function onUser(user) {
  state.user = user;
  state.places = user.places || [];
  state.settings = { ...DEFAULT_SETTINGS, ...(user.settings || {}) };
  if (state.settings.mode !== 'total') state.settings.mode = 'similar'; // "fair" from before is now "similar"
  applyTheme();
  if (!user.home) showHomeScreen(false);
  else enterMain();
}

// ---------------------------------------------------------------- optional sign-in

let authMode = 'login';
function setAuthMode(mode) {
  authMode = mode;
  for (const b of $$('[data-auth-mode]')) {
    b.classList.toggle('active', b.dataset.authMode === mode);
    b.setAttribute('aria-selected', String(b.dataset.authMode === mode));
  }
  for (const el of $$('[data-signup-only]')) el.hidden = mode !== 'signup';
  $('#auth-submit').textContent = mode === 'signup' ? 'Create profile' : 'Sign in';
  $('#auth-password').autocomplete = mode === 'signup' ? 'new-password' : 'current-password';
  $('#auth-error').hidden = true;
}

function openAuth(open, mode = 'login') {
  $('#auth-modal').hidden = !open;
  $('#auth-backdrop').hidden = !open;
  if (open) {
    setAuthMode(mode);
    setTimeout(() => $('#auth-email').focus(), 30);
  }
}

function initAuth() {
  for (const b of $$('[data-auth-mode]')) b.onclick = () => setAuthMode(b.dataset.authMode);
  $('#auth-close').onclick = () => openAuth(false);
  $('#auth-backdrop').onclick = () => openAuth(false);
  $('#auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const email = f.email.value.trim();
    const password = f.password.value;
    const err = $('#auth-error');
    err.hidden = true;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { err.textContent = 'Enter a valid email address.'; err.hidden = false; return; }
    if (password.length < 6) { err.textContent = 'Use at least 6 characters for the password.'; err.hidden = false; return; }
    const btn = $('#auth-submit');
    btn.disabled = true;
    try {
      const { user } = authMode === 'signup'
        ? await api.signup(email, password, f.name.value)
        : await api.login(email, password);
      f.reset();
      openAuth(false);
      openDrawer(false);
      cancelSearchQuietly();
      onUser(user);
      toast(authMode === 'signup' ? 'Profile created. Your places are saved to it.' : 'Signed in');
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
      if (ex.status === 409) setTimeout(() => setAuthMode('login'), 50);
    } finally {
      btn.disabled = false;
    }
  });
}

// ---------------------------------------------------------------- start screen (your address)

function showHomeScreen(cancellable) {
  showScreen('screen-home');
  $('#home-cancel').hidden = !cancellable;
  $('#home-signin-row').hidden = cancellable || !api.isGuest();
  homeSearchCtl.clear();
  setTimeout(() => homeSearchCtl.input.focus(), 50);
}

async function saveHome(loc) {
  try {
    const { user } = await api.updateMe({ home: { address: loc.address, lat: loc.lat, lon: loc.lon, mode: state.user?.home?.mode || state.settings.travel } });
    state.user = user;
    enterMain(true);
  } catch (err) {
    toast(err.message, { error: true });
  }
}

function initHome() {
  homeSearchCtl = attachSearch($('#home-search'), { near: () => null, onPick: saveHome });
  $('#home-locate').onclick = async (e) => {
    const btn = e.currentTarget;
    const span = $('span', btn);
    const label = span.textContent;
    btn.disabled = true;
    span.textContent = 'Locating…';
    try {
      const pos = await currentPosition();
      await saveHome(await reverseGeocode(pos.lat, pos.lon));
    } catch (err) {
      toast(err.message, { error: true });
    } finally {
      btn.disabled = false;
      span.textContent = label;
    }
  };
  $('#home-cancel').onclick = () => enterMain();
  $('#home-signin').onclick = () => openAuth(true, 'login');
}

// ---------------------------------------------------------------- map

const isDark = () => state.settings.theme === 'dark' || (state.settings.theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);

// basemap:start
// A clean, quiet base map in the spirit of Apple Maps: OpenFreeMap's vector
// map (free, no key) drawn with MapLibre, with shop and restaurant icons
// hidden so Meet's own pins stand out; its dark style at night. Devices
// without WebGL get the standard OpenStreetMap map, toned down.
const STYLES = { light: 'https://tiles.openfreemap.org/styles/liberty', dark: 'https://tiles.openfreemap.org/styles/dark' };
// Left out: shop and café icons, bus stops, road numbers, one-way arrows, 3D buildings.
const QUIET = /^(poi_r\d+|building-3d|highway-name-path|highway-shield.*|road_shield.*|road_one_way_arrow.*|.*_hatching)$/;
// Softer colours: white streets, pale land, light blue water, gentle greens.
const SOFT = {
  background: { 'background-color': '#f6f4f0' },
  landuse_residential: { 'fill-opacity': 0.35 },
  park: { 'fill-color': '#d3eac5' },
  water: { 'fill-color': '#a6d2f5' },
  waterway_river: { 'line-color': '#a6d2f5' },
  building: { 'fill-color': '#eae7e1' },
  landuse_hospital: { 'fill-color': '#f7e8ed' },
};
for (const k of ['road', 'bridge', 'tunnel']) {
  for (const id of ['secondary_tertiary', 'trunk_primary', 'link']) {
    SOFT[`${k}_${id}`] = { 'line-color': '#ffffff' };
    SOFT[`${k}_${id}_casing`] = { 'line-color': '#e2ddd4' };
  }
  SOFT[`${k}_motorway`] = { 'line-color': '#fbd994' };
  SOFT[`${k}_motorway_link`] = { 'line-color': '#fbd994' };
  SOFT[`${k}_motorway_casing`] = { 'line-color': '#eec47a' };
  SOFT[`${k}_motorway_link_casing`] = { 'line-color': '#eec47a' };
}
// At night: dark grey land, deep blue water, dark green parks, readable streets.
const DARK = {
  background: { 'background-color': '#1c1c1e' },
  landuse_residential: { 'fill-color': '#202022' },
  water: { 'fill-color': '#1a2d42' },
  waterway: { 'line-color': '#1a2d42' },
  landuse_park: { 'fill-color': '#1c2b20' },
  landcover_wood: { 'fill-color': '#1c2b20' },
  building: { 'fill-color': '#262628' },
  highway_path: { 'line-color': '#29292b' },
  highway_minor: { 'line-color': '#2e2e31' },
  highway_major_casing: { 'line-color': 'rgba(72,72,76,0.8)' },
  highway_major_inner: { 'line-color': '#3a3a3d' },
  highway_major_subtle: { 'line-color': '#343437' },
  highway_motorway_subtle: { 'line-color': '#4a4136' },
  railway: { 'line-color': '#333336' },
  railway_transit: { 'line-color': '#333336' },
  railway_minor: { 'line-color': '#333336' },
  water_name: { 'text-color': '#6b93bd' },
  highway_name_other: { 'text-color': '#8e8e93' },
  highway_name_motorway: { 'text-color': '#a1a1a6' },
};
for (const id of ['other', 'suburb', 'village', 'town', 'city', 'city_large', 'state']) DARK[`place_${id}`] = { 'text-color': '#a1a1a6' };

function quieten(gl, light) {
  for (const layer of gl.getStyle().layers) {
    try {
      if (QUIET.test(layer.id)) gl.setLayoutProperty(layer.id, 'visibility', 'none');
      if (layer.id === 'poi_transit') gl.setFilter(layer.id, ['match', ['get', 'class'], ['airport', 'rail'], true, false]); // stations, not bus stops
      for (const [prop, value] of Object.entries((light ? SOFT : DARK)[layer.id] || {})) gl.setPaintProperty(layer.id, prop, value);
    } catch { /* a layer this style does not have */ }
  }
}
const OSM_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
const OFM_ATTR = `<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> &copy; <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> ${OSM_ATTR}`;
let mapLibre = null;
function loadMapLibre() {
  mapLibre ||= (async () => {
    const gl = document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl');
    if (!gl) throw new Error('WebGL unavailable');
    const css = Object.assign(document.createElement('link'), { rel: 'stylesheet', href: '/vendor/maplibre/maplibre-gl.css' });
    document.head.append(css);
    const mod = await import('/vendor/maplibre/maplibre-gl.mjs');
    window.maplibregl = mod.default || mod;
    await new Promise((resolve, reject) => {
      const s = Object.assign(document.createElement('script'), { src: '/vendor/maplibre-leaflet/leaflet-maplibre-gl.js', onload: resolve, onerror: reject });
      document.head.append(s);
    });
  })();
  return mapLibre;
}
function addBasemap() {
  const want = isDark() ? 'dark' : 'light';
  if (baseLayer?.meetId === want) return;
  loadMapLibre().then(() => {
    if (baseLayer?.meetId === want) return;
    baseLayer?.remove();
    baseLayer = L.maplibreGL({ style: STYLES[want], attributionControl: { customAttribution: OFM_ATTR } });
    baseLayer.meetId = want;
    baseLayer.addTo(map);
    const gl = baseLayer.getMaplibreMap();
    gl.on('style.load', () => quieten(gl, want === 'light'));
  }).catch(() => {
    // No WebGL (or the library could not load): plain map tiles instead.
    const id = `osm|${want}`;
    if (baseLayer?.meetId === id) return;
    baseLayer?.remove();
    baseLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, className: `osm-tiles${want === 'dark' ? ' dark' : ''}`, attribution: OSM_ATTR });
    baseLayer.meetId = id;
    baseLayer.addTo(map).bringToBack();
  });
}
// basemap:end

function initMap() {
  map = L.map('map', { zoomControl: false, worldCopyJump: true });
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  addBasemap();
  map.attributionControl.setPrefix(false);
  map.attributionControl.addAttribution(`Routes <a href="${ATTRIBUTION.routing.url}" target="_blank" rel="noopener">FOSSGIS OSRM</a> · Public transport <a href="${ATTRIBUTION.transit.url}" target="_blank" rel="noopener">Transitous</a>`);
  peopleLayer = L.layerGroup().addTo(map);
  resultLayer = L.layerGroup().addTo(map);
  poiLayer = L.layerGroup().addTo(map);
  fxLayer = L.layerGroup().addTo(map);

  // Tap the map to add an address there.
  map.on('click', async (e) => {
    if (state.view !== 'people') return;
    const { lat, lng } = e.latlng;
    const popup = L.popup({ className: 'map-popup' }).setLatLng(e.latlng)
      .setContent('<div class="muted">Looking up address…</div>').openOn(map);
    const loc = await reverseGeocode(lat, lng);
    if (!map.hasLayer(popup)) return;
    const div = document.createElement('div');
    div.innerHTML = `<div style="font-weight:600;max-width:220px">${esc(shortAddr(loc.address))}</div>
      <button class="btn btn-primary">Add this address</button>`;
    $('button', div).onclick = () => { map.closePopup(popup); addPlace({ ...loc, lat, lon: lng }); };
    popup.setContent(div);
  });
}

function pinIcon(person) {
  return L.divIcon({
    className: '',
    html: `<div class="avatar-pin" style="--c:${person.color}">${esc(initial(person.name))}</div>`,
    iconSize: [38, 47],
    iconAnchor: [19, 47],
  });
}

function drawPeople() {
  peopleLayer.clearLayers();
  for (const p of everyone()) {
    if (!p.active && state.view !== 'people') continue;
    // Names sit above the pins; someone added without a name gets no label
    // (their street address shows only when you point at the pin).
    const named = p.isHome || p.nickname;
    const m = L.marker([p.lat, p.lon], { icon: pinIcon(p), draggable: state.view === 'people', opacity: p.active ? 1 : 0.4, riseOnHover: true })
      .bindTooltip(esc(p.name), { permanent: !!named, direction: 'top', className: 'label', offset: [0, -48] })
      .addTo(peopleLayer);
    m.on('dragend', () => moveAddress(p, m.getLatLng()));
  }
}

async function moveAddress(p, ll) {
  const loc = await reverseGeocode(ll.lat, ll.lng);
  const patch = { address: loc.address, lat: ll.lat, lon: ll.lng };
  try {
    if (p.isHome) {
      state.user = (await api.updateMe({ home: { ...state.user.home, ...patch } })).user;
    } else {
      const { place } = await api.updatePlace(p.id, patch);
      Object.assign(state.places.find((x) => x.id === p.id), place);
    }
    toast(`Moved ${p.isHome ? 'your starting point' : p.name}`);
  } catch (err) { toast(err.message, { error: true }); }
  render();
}

/** Fit the map to points, leaving room for the panel. */
function fitTo(latlngs, { maxZoom = 16, animate = true } = {}) {
  if (!latlngs.length) return;
  const panel = $('#panel');
  const hidden = panel.classList.contains('away');
  // While searching, the heading sits at the top and the status at the bottom.
  const searching = state.view === 'searching';
  let tl = [40, searching ? 130 : 80], br = [40, searching ? 120 : 40];
  if (!hidden) {
    if (isMobile()) br = [30, (sheet.target || panel.offsetHeight) + 24];
    else tl = [panel.offsetWidth + 50, 80];
  }
  const b = L.latLngBounds(latlngs);
  if (latlngs.length === 1 || b.getNorthEast().equals(b.getSouthWest())) {
    map.setView(latlngs[0], Math.min(maxZoom, 15), { animate });
    return;
  }
  map.fitBounds(b, { paddingTopLeft: tl, paddingBottomRight: br, maxZoom, animate });
}

// ---------------------------------------------------------------- bottom sheet (phones)

function sheetSizes() {
  const H = $('#screen-main').clientHeight;
  const inner = $('#panel-body .panel-content');
  const content = 26 + (inner ? inner.offsetHeight : 200) + 22;
  const full = Math.min(content, H - 72);
  const mid = Math.min(Math.round(H * 0.48), full);
  const peek = Math.min(132, mid);
  return { peek, mid, full, max: H - 72 };
}

function setSheet(snap) {
  const panel = $('#panel');
  if (!isMobile()) { panel.style.height = ''; sheet.target = 0; return; }
  sheet.snap = snap;
  sheet.target = sheetSizes()[snap];
  panel.style.height = `${sheet.target}px`;
}

function initSheet() {
  const panel = $('#panel');
  const handle = $('#panel-handle');
  let drag = null;
  handle.addEventListener('pointerdown', (e) => {
    if (!isMobile()) return;
    drag = { y: e.clientY, h: panel.offsetHeight, t: performance.now(), moved: false, lastY: e.clientY, lastT: performance.now(), v: 0 };
    panel.classList.add('dragging');
    handle.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  handle.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dy = e.clientY - drag.y;
    if (Math.abs(dy) > 5) drag.moved = true;
    const now = performance.now();
    drag.v = (e.clientY - drag.lastY) / Math.max(1, now - drag.lastT); // px/ms, + is downward
    drag.lastY = e.clientY; drag.lastT = now;
    const { max } = sheetSizes();
    panel.style.height = `${Math.max(56, Math.min(max, drag.h - dy))}px`;
  });
  const end = () => {
    if (!drag) return;
    panel.classList.remove('dragging');
    const s = sheetSizes();
    const order = ['peek', 'mid', 'full'];
    let snap;
    if (!drag.moved) {
      snap = sheet.snap === 'peek' ? 'mid' : 'peek'; // tap toggles
    } else if (Math.abs(drag.v) > 0.45) {
      // Fling: next snap point in the direction of the flick.
      const cur = panel.offsetHeight;
      snap = drag.v > 0
        ? [...order].reverse().find((k) => s[k] < cur - 4) || 'peek'
        : order.find((k) => s[k] > cur + 4) || 'full';
    } else {
      const cur = panel.offsetHeight;
      snap = order.reduce((a, b) => (Math.abs(s[b] - cur) < Math.abs(s[a] - cur) ? b : a));
    }
    drag = null;
    setSheet(snap);
  };
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', end);
  handle.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSheet(sheet.snap === 'peek' ? 'mid' : 'peek'); }
    if (e.key === 'ArrowUp') setSheet(sheet.snap === 'peek' ? 'mid' : 'full');
    if (e.key === 'ArrowDown') setSheet(sheet.snap === 'full' ? 'mid' : 'peek');
  });
  window.addEventListener('resize', () => setSheet(sheet.snap));
}

// ---------------------------------------------------------------- main screen & panel

function enterMain(recentre = false) {
  showScreen('screen-main');
  if (!map) initMap();
  setTimeout(() => {
    map.invalidateSize();
    if (recentre || !state.mapCentred) {
      const pts = activePeople();
      if (pts.length > 1) fitTo(pts.map((p) => [p.lat, p.lon]), { maxZoom: 15, animate: false });
      else map.setView([state.user.home.lat, state.user.home.lon], 14, { animate: false });
      state.mapCentred = true;
    }
  }, 0);
  setView('people');
}

function setView(view, { pop = false } = {}) {
  state.view = view;
  state.modeMenu = null;
  const panel = $('#panel');
  panel.classList.toggle('away', view === 'searching');
  anim?.canvas.classList.toggle('dim', ['group', 'place', 'share'].includes(view));
  if (pop) { panel.classList.remove('pop'); void panel.offsetWidth; panel.classList.add('pop'); }
  render();
  if (SHEET_DEFAULT[view]) setSheet(SHEET_DEFAULT[view]);
}

/**
 * The search area as a circle around the meeting point, once a radius has
 * been picked. Shown with the categories and with a category's places;
 * hidden on a place's page.
 */
let radiusCircle = null;
function drawRadius({ fit = false } = {}) {
  const s = state.search;
  const r = s?.showRadius;
  if (!r || !s.meet || !['results', 'group'].includes(state.view)) {
    if (radiusCircle) resultLayer.removeLayer(radiusCircle);
    radiusCircle = null;
    return;
  }
  if (!radiusCircle || radiusCircle.getRadius() !== r || !resultLayer.hasLayer(radiusCircle)) {
    if (radiusCircle) resultLayer.removeLayer(radiusCircle);
    radiusCircle = L.circle([s.meet.lat, s.meet.lon], {
      radius: r, color: '#007aff', weight: 1.5, opacity: 0.75, dashArray: '6 6',
      fillColor: '#007aff', fillOpacity: 0.07, interactive: false, className: 'radius-ring',
    }).addTo(resultLayer);
  }
  if (fit) {
    const dLat = r / 111320, dLon = r / (111320 * Math.cos((s.meet.lat * Math.PI) / 180));
    fitTo([[s.meet.lat - dLat, s.meet.lon - dLon], [s.meet.lat + dLat, s.meet.lon + dLon]], { maxZoom: 17 });
  }
}

const afterRender = {};
function render({ keepScroll = false } = {}) {
  const body = $('#panel-body');
  const scroll = body.scrollTop;
  const views = { people: renderPeople, results: renderResults, group: renderGroup, place: renderPlace, share: renderShare };
  if (views[state.view]) {
    body.innerHTML = `<div class="panel-content">${views[state.view]()}</div>`;
    afterRender[state.view]?.();
    body.scrollTop = keepScroll ? scroll : 0;
    if (isMobile() && sheet.snap) setSheet(sheet.snap);
  }
  drawPeople();
  drawRadius();
}

// ------------------------------------------------ people view

function renderPeople() {
  const all = everyone();
  const active = all.filter((p) => p.active).length;
  const rows = all.map((p) => {
    const editing = state.editingId === p.id;
    return `<li class="person${p.active ? '' : ' inactive'}" data-id="${esc(p.id)}">
      <div class="cell">
        <span class="avatar" style="--c:${p.color}">${esc(initial(p.name))}</span>
        <div class="cell-main" data-action="focus" style="cursor:pointer">
          <span class="title-row"><span class="cell-title">${esc(p.isHome ? (state.user.name ? `You (${state.user.name})` : 'You') : p.name)}</span>${modePill(p)}</span>
          <span class="cell-sub" title="${esc(p.address)}">${esc(shortAddr(p.address))}</span>
          ${editing ? `<form class="edit-inline" data-action="save-nick"><input id="nick-${esc(p.id)}" name="nick" value="${esc(p.nickname || '')}" maxlength="60" placeholder="Name"><button class="btn btn-primary">Save</button></form>` : ''}
        </div>
        <div class="person-actions">
          ${p.isHome
            ? '<button class="btn btn-plain" data-action="edit-home" aria-label="Change your starting point">Edit</button>'
            : `<button class="icon-circle" data-action="edit" aria-label="Rename ${esc(p.name)}">${glyph('pencil', 14)}</button>
               <button class="icon-circle" data-action="delete" aria-label="Remove ${esc(p.name)}">${glyph('close', 13, 2.6)}</button>
               <label class="switch" title="${p.active ? 'Included' : 'Left out'}">
                 <input type="checkbox" data-action="toggle" ${p.active ? 'checked' : ''} aria-label="Include ${esc(p.name)}"><span></span></label>`}
        </div>
      </div>
      ${modePicker(p)}
    </li>`;
  }).join('');
  return `
    <div class="sheet-title"><h2>Who's meeting</h2><span class="badge">${active} of ${all.length}</span></div>
    <ul class="group icons">${rows}</ul>
    <div class="add-box">
      <div class="search searchfield" id="add-search">
        <input id="add-input" type="search" placeholder="Add someone's address" autocomplete="off" aria-label="Someone's address">
        <ul class="suggestions" role="listbox" hidden></ul>
      </div>
      <input id="add-nick" maxlength="60" placeholder="Their name (optional)" aria-label="Their name">
    </div>
    <p class="footnote" style="margin:0 6px">Or tap the map to drop a pin. Drag any pin to move it.</p>
    <div class="cta">
      <button class="btn btn-primary btn-block btn-lg" data-action="find" ${active < 2 ? 'disabled' : ''}>Find a place to meet</button>
    </div>`;
}

afterRender.people = () => {
  attachSearch($('#add-search'), {
    near: () => state.user.home,
    onPick: (r) => addPlace({ ...r, nickname: $('#add-nick').value }),
  });
  const nick = $('.edit-inline input');
  if (nick) { nick.focus(); nick.select(); }
};

async function addPlace(loc) {
  try {
    const { place } = await api.addPlace({ address: loc.address, lat: loc.lat, lon: loc.lon, nickname: loc.nickname || '', mode: state.settings.travel });
    state.places.push(place);
    render();
    toast(`Added ${place.nickname || shortAddr(place.address)}`);
    fitTo(activePeople().map((p) => [p.lat, p.lon]), { maxZoom: 15 });
  } catch (err) { toast(err.message, { error: true }); }
}

async function deletePlace(id) {
  const idx = state.places.findIndex((p) => p.id === id);
  const place = state.places[idx];
  if (!place) return;
  state.places.splice(idx, 1);
  render();
  try {
    await api.deletePlace(id);
    toast(`Removed ${place.nickname || shortAddr(place.address)}`, {
      action: 'Undo',
      onAction: async () => {
        const { place: restored } = await api.addPlace(place);
        state.places.splice(idx, 0, restored);
        render();
      },
    });
  } catch (err) {
    state.places.splice(idx, 0, place);
    render();
    toast(err.message, { error: true });
  }
}

async function patchPlace(id, patch) {
  const p = state.places.find((x) => x.id === id);
  const before = { ...p };
  Object.assign(p, patch);
  render();
  try { await api.updatePlace(id, patch); }
  catch (err) { Object.assign(p, before); render(); toast(err.message, { error: true }); }
}

// ------------------------------------------------ search flow

function setStatus(text, { skip = false, spinner = true } = {}) {
  const chip = $('#search-status');
  chip.hidden = !text;
  if (!text) return;
  $('.status-text', chip).textContent = text;
  $('.spinner', chip).hidden = !spinner;
  $('#btn-skip').hidden = !skip;
}

function clearSearchVisuals() {
  anim?.destroy();
  anim = null;
  floodMode(false);
  radiusCircle = null;
  resultLayer?.clearLayers();
  poiLayer?.clearLayers();
}

function cancelSearchQuietly() {
  searchAbort?.abort();
  searchAbort = null;
  clearSearchVisuals();
  setStatus('');
  state.search = null;
}

function cancelSearch() {
  cancelSearchQuietly();
  setView('people');
  fitTo(activePeople().map((p) => [p.lat, p.lon]), { maxZoom: 15 });
}

const withTimeout = (promise, ms) => Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
const routeMode = (r) => (r?.options ? 'transit' : r?.mode);

// ------------------------------------------------ the search animation's captions

const STREETISH = /\d|\b(street|st|road|rd|avenue|ave|lane|ln|way|drive|dr|parade|pde|place|pl|terrace|tce|highway|hwy|crescent|cres|close|court|ct|boulevard|blvd|square|sq|row|walk|esplanade)\b/i;
/** The suburb or area of an address ("12 King St, Newtown, Sydney, …" → "Newtown"). */
function placeOf(address) {
  const parts = String(address || '').split(', ').map((x) => x.trim()).filter(Boolean);
  return parts.slice(1).find((x) => !STREETISH.test(x)) || parts[1] || parts[0] || '';
}
/** The town or city of an address: the part before the state and country. */
const cityOf = (address) => {
  const parts = String(address || '').split(', ').filter(Boolean);
  return parts.length >= 4 ? parts[parts.length - 3] : parts.length === 3 ? parts[1] : '';
};
/** The city most of the group is in, for the corner of the map. */
function groupCity(people) {
  const n = new Map();
  for (const p of people) { const c = cityOf(p.address); if (c) n.set(c, (n.get(c) || 0) + 1); }
  return [...n].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
}
/** A person's name if they have one (no street address: the area instead). */
const whoOf = (p) => p.nickname || (p.isHome ? 'You' : '');
const pillText = (p, extra) => (extra ? `${whoOf(p) || placeOf(p.address)} · ${extra}` : [whoOf(p), placeOf(p.address)].filter(Boolean).join(' · '));

/** What the meeting point is near: a park or landmark right there, or the street. */
function meetName(search) {
  const d = (p) => haversine(p.lat, p.lon, search.meet.lat, search.meet.lon);
  const near = (search.pois || []).filter((p) => ['outdoors', 'culture'].includes(p.tab) && d(p) < 250).sort((a, b) => d(a) - d(b))[0];
  if (near) return near.name;
  const first = (search.area || '').split(', ')[0].trim();
  if (!first || /^-?\d+(\.\d+)?$/.test(first)) return 'the middle';
  return first.replace(/^\d+[a-z]?(-\d+[a-z]?)?\s+/i, '');
}

let pills = [];
/** The dark search map on or off: heading, the city's name, name tags over everyone. */
function floodMode(on, people = []) {
  $('#screen-main').classList.toggle('flooding', on);
  fxLayer?.clearLayers();
  pills = on ? people.map((p) => L.marker([p.lat, p.lon], {
    icon: L.divIcon({ className: 'flood-pill-icon', html: `<span class="flood-pill" style="--c:${p.color}">${esc(pillText(p))}</span>`, iconSize: [0, 0], iconAnchor: [0, 0] }),
    interactive: false, keyboard: false, zIndexOffset: 2000,
  }).addTo(fxLayer)) : [];
  const city = on ? groupCity(people) : '';
  $('#flood-city').hidden = !city;
  $('#flood-city').textContent = city;
  if (!on) setHud({ phase: null });
}
function setPill(i, text) {
  const el = pills[i]?.getElement()?.querySelector('.flood-pill');
  if (el) el.textContent = text;
}

/** The heading over the search map. Leave a field out to keep it; phase null hides it. */
function setHud({ phase, intro, count, sub } = {}) {
  const h = $('#flood-hud');
  if (phase === null) { h.hidden = true; return; }
  h.hidden = false;
  if (phase !== undefined) $('.flood-phase', h).textContent = phase;
  if (intro !== undefined) h.classList.toggle('intro', intro);
  if (count !== undefined) {
    $('.flood-count', h).hidden = count == null;
    if (count != null) $('.flood-num', h).textContent = count.toLocaleString('en');
  }
  if (sub !== undefined) $('.flood-sub', h).textContent = sub;
}

/** The streets the animation floods: what's on screen and a little more. */
function streetsArea() {
  const b = map.getBounds().pad(0.08);
  return { s: b.getSouth(), w: b.getWest(), n: b.getNorth(), e: b.getEast() };
}

/** A trip's length in seconds: the route's, else the estimate the meeting point came with. */
const tripSeconds = (route, estimate) => (route?.options ? route.options[0]?.duration : route?.duration) ?? estimate;

/**
 * One person's route for the animation, timed in seconds after setting off
 * (a straight dotted line if there is no route at all).
 */
function trackFor(person, route, meet, estimate) {
  const door = [person.lat, person.lon], end = [meet.lat, meet.lon];
  const base = { color: person.color, initial: initial(person.name) };
  const straight = { ...base, duration: estimate, pieces: [{ pts: [door, end], t0: 0, t1: estimate, walk: true }] };
  if (!route) return straight;
  if (route.options) {
    // Public transport: the journey shown in directions, each leg at its real times.
    const o = route.options[0];
    const t00 = Date.parse(o?.start);
    let t = 0;
    const pieces = (o?.legs || []).filter((l) => l.geometry.length > 1).map((l) => {
      const a = Date.parse(l.from.time);
      const t0 = Number.isFinite(a) && Number.isFinite(t00) ? Math.max(t, (a - t00) / 1000) : t;
      t = t0 + l.duration;
      return { pts: l.geometry, t0, t1: t, walk: isWalkLeg(l) };
    });
    if (!pieces.length) return straight;
    pieces.unshift({ pts: [door, pieces[0].pts[0]], t0: 0, t1: 0, walk: true });
    return { ...base, pieces, duration: Math.max(t, o.duration || 0) };
  }
  return { ...base, duration: route.duration, pieces: [{ pts: [door, ...route.geometry, end], t0: 0, t1: route.duration, walk: person.mode === 'walk' }] };
}

async function findPlaces({ replay = false } = {}) {
  const prev = replay ? state.search : null;
  const people = prev ? prev.people : activePeople();
  if (people.length < 2) return;
  searchAbort?.abort();
  const ctrl = new AbortController();
  searchAbort = ctrl;
  clearSearchVisuals();
  setView('searching');
  fitTo(people.map((p) => [p.lat, p.lon]), { maxZoom: 16, animate: false });
  const rule = prev?.rule || (state.settings.mode === 'total' ? 'total' : 'similar');
  const fx = anim = new FloodAnimation(map, { people, pace: PACE[state.settings.speed] || PACE.normal });
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) fx.skip();
  const live = () => !ctrl.signal.aborted && anim === fx;
  floodMode(true, people);
  const status = (text) => setStatus(text, { skip: true });

  try {
    // Started together: the fairest spot (a few small requests to the routing
    // service) and the streets for the animation.
    const meetingP = prev ? Promise.resolve(prev.meeting) : findMeetingPoint(people, {
      rule, travelTimes: getTravelTimes, directions: getDirections, signal: ctrl.signal, onStatus: status,
    });
    meetingP.catch(() => {});
    const roadsP = withTimeout(loadRoads(streetsArea(), { signal: ctrl.signal }), 8000).catch(() => null);
    status(prev ? 'Replaying the search' : 'Finding the fairest spot…');
    setHud({ phase: `Where should ${people.length} friends meet?`, intro: true, count: null, sub: '' });
    if (!(await fx.intro())) return;
    const roads = await roadsP;
    if (!live()) return;
    fx.setRoads(roads);
    fx.prepare();

    const meeting = await meetingP;
    if (!live()) return;
    const meet = meeting.meet;
    if (!Number.isFinite(meet?.lat) || !Number.isFinite(meet?.lon)) throw new Error('Couldn’t place a meeting point. Try again, or move someone’s pin.');
    // Keep the meeting point in view (it can lie a little outside the group).
    if (!map.getBounds().pad(-0.06).contains([meet.lat, meet.lon])) fitTo([...people.map((p) => [p.lat, p.lon]), [meet.lat, meet.lon]], { maxZoom: 16, animate: false });
    const search = state.search = {
      people, meeting, meet, routes: prev?.routes || null, rule,
      pois: prev?.pois || null, grouped: prev?.grouped || null, radius: prev?.radius || null, tab: prev?.tab || null,
      group: null, place: null, area: prev?.area || null, poiError: prev?.poiError || null, sort: prev?.sort, showRadius: prev?.showRadius,
    };

    // Places, the area's name and everyone's route load while the floods meet.
    const poisPromise = prev?.pois ? Promise.resolve() : loadPois(search, ctrl.signal);
    const areaP = search.area ? Promise.resolve() : reverseGeocode(meet.lat, meet.lon, { signal: ctrl.signal })
      .then((r) => { search.area = r.address; if (state.view === 'results') render({ keepScroll: true }); })
      .catch(() => {});
    const routesP = search.routes ? Promise.resolve(search.routes)
      : Promise.all(people.map((p) => withTimeout(getDirections(p.mode, p, meet, { signal: ctrl.signal }), 10000).catch(() => null)));
    status('Finding everyone’s routes…');
    setHud({ count: fx.net ? 0 : null });
    const ok2 = await fx.allAtOnce(meet, {
      onProgress: (t) => setHud({
        phase: 'All at once', intro: false,
        sub: t < 0.5 ? `All ${people.length} set off together` : 'The floods meet',
      }),
      onRoads: (n) => setHud({ count: n }),
    });
    if (!ok2 || !live()) return;
    search.routes = await routesP;
    // The meeting point's name, if it comes soon.
    await Promise.race([areaP, new Promise((r) => setTimeout(r, 1200))]);
    if (!live()) return;

    // The meeting point, then everyone travels there along their route.
    const name = meetName(search);
    const pin = L.marker([meet.lat, meet.lon], {
      icon: L.divIcon({ className: '', html: '<div class="meet-dot"></div>', iconSize: [22, 22], iconAnchor: [11, 11] }),
      zIndexOffset: 1000,
    }).bindTooltip(esc(name === 'the middle' ? 'Meeting point' : name), { permanent: true, direction: 'bottom', className: 'label meet-label', offset: [0, 14] }).addTo(resultLayer);
    const times = people.map((p, i) => tripSeconds(search.routes[i], meeting.times[i]));
    setHud({ phase: fx.net ? 'All at once' : 'Found it', intro: false, sub: `Longest trip: ${mins(Math.max(...times))}` });
    status('Found the fairest spot');
    const tracks = people.map((p, i) => trackFor(p, search.routes[i], meet, meeting.times[i]));
    const ok3 = await fx.reveal(meet, tracks, {
      onArrive: () => {
        setHud({ sub: `Meet near ${name}` });
        people.forEach((p, i) => setPill(i, pillText(p, mins(times[i]))));
      },
    });
    if (!ok3 || !live()) return;
    floodMode(false);
    setStatus('');
    if (!(await fx.outro()) || !live()) return;
    pin.unbindTooltip().bindTooltip('Meeting point', { permanent: true, direction: 'top', className: 'label', offset: [0, -14] });

    setStatus('Finding places nearby…');
    await poisPromise;
    if (ctrl.signal.aborted) return;
    setStatus('');
    setView('results', { pop: true });
    fitTo([...people.map((p) => [p.lat, p.lon]), [meet.lat, meet.lon]], { maxZoom: 16 });
  } catch (err) {
    if (ctrl.signal.aborted) return;
    console.error(err);
    clearSearchVisuals();
    setStatus('');
    setView('people');
    toast(err.message || 'Something went wrong. Try again.', { error: true });
  }
}

async function loadPois(search, signal, radius) {
  search.poiError = null;
  try {
    const { pois, radius: used } = await findPois(search.meet, { radius, signal });
    search.pois = pois;
    search.radius = used;
    search.grouped = groupPois(pois);
    search.tab = search.tab && search.grouped[search.tab].length ? search.tab
      : (TABS.find((t) => search.grouped[t.id].length) || TABS[0]).id;
  } catch (err) {
    if (signal?.aborted) throw err;
    search.pois = [];
    search.grouped = groupPois([]);
    search.radius = radius || 800;
    search.tab = TABS[0].id;
    search.poiError = 'Places could not be loaded. Check your connection and try a different radius.';
  }
}

/** Rough road distance from every person to a place (real times load separately). */
const distancesTo = (poi) => state.search.people.map((person) => haversine(person.lat, person.lon, poi.lat, poi.lon) * 1.3);

const modeLabel = (m) => MODES.find((x) => x.id === m)?.label || 'Transit';
const CARET = '<svg class="caret" viewBox="0 0 10 6" width="8" height="5" aria-hidden="true"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/** "Transit ▾" pill next to a person's name; opens a picker just for them. */
const modePill = (person) => `<button class="mode-pill" data-action="mode-menu" data-id="${esc(person.id)}" aria-expanded="${state.modeMenu === person.id}" aria-label="${esc(person.name)} travels by ${modeLabel(person.mode).toLowerCase()}. Change">${glyph(person.mode, 12)}<span>${modeLabel(person.mode)}</span>${CARET}</button>`;
const modePicker = (person) => (state.modeMenu === person.id ? `<div class="mode-picker" role="group" aria-label="How ${esc(person.name)} travels">
  ${MODES.map((m) => `<button class="mode-opt${m.id === person.mode ? ' active' : ''}" data-action="set-mode" data-id="${esc(person.id)}" data-mode="${m.id}" aria-pressed="${m.id === person.mode}">${glyph(m.id, 18)}<span>${m.label}</span></button>`).join('')}
</div>` : '');

/** Change one person's travel mode (saved with them). Returns true if anything changed. */
function applyMode(id, mode) {
  let changed = false;
  if (id === 'home') {
    if (state.user.home && state.user.home.mode !== mode) { state.user.home = { ...state.user.home, mode }; changed = true; }
  } else {
    const p = state.places.find((x) => x.id === id);
    if (p && p.mode !== mode) { p.mode = mode; changed = true; }
  }
  for (const p of state.search?.people || []) if (p.id === id && p.mode !== mode) { p.mode = mode; changed = true; }
  if (changed) (id === 'home' ? api.updateMe({ home: state.user.home }) : api.updatePlace(id, { mode })).catch((err) => toast(err.message, { error: true }));
  return changed;
}

function afterModeChange() {
  if (state.search && ['results', 'group', 'place'].includes(state.view)) {
    toast('The meeting point was picked for the old ways of travelling', { action: 'Update it', onAction: () => findPlaces(), ms: 6000 });
  }
}

function setPersonMode(id, mode) {
  state.modeMenu = null;
  const changed = applyMode(id, mode);
  render({ keepScroll: true });
  if (changed) afterModeChange();
}

/** The Transit / Walk / Bike / Drive bar: everyone travels the same way. */
function setEveryoneMode(mode) {
  state.modeMenu = null;
  const ids = new Set([...activePeople().map((p) => p.id), ...(state.search?.people || []).map((p) => p.id)]);
  let changed = false;
  for (const id of ids) changed = applyMode(id, mode) || changed;
  saveSettings({ travel: mode });
  render({ keepScroll: true });
  if (changed) afterModeChange();
}

const clock = (iso) => (iso ? new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '');
const mins = (sec) => fmtTime(Math.max(1, Math.round(sec / 60)));

/** One person's travel time: real when known (seconds), otherwise an estimate from road distance. */
const tripRow = (person, d, sec) => `<li class="trip"><div class="cell"><span class="avatar sm" style="--c:${person.color}">${esc(initial(person.name))}</span>
  <span class="cell-main"><span class="title-row"><span class="cell-title">${esc(person.name)}</span>${modePill(person)}</span></span>
  <span class="cell-end"><b>${sec != null ? mins(sec) : `≈ ${fmtTime(travelMinutes(d, person.mode))}`}</b>${fmtDist(d)}</span></div>${modePicker(person)}</li>`;

/** Everyone-at-once bar; shows the shared mode, or nothing selected when people differ. */
function modeSwitch(action) {
  const people = state.search?.people || activePeople();
  const common = people.length && people.every((p) => p.mode === people[0].mode) ? people[0].mode : null;
  return `<div class="segmented modes" role="group" aria-label="Set how everyone travels">
  ${MODES.map((m) => `<button class="seg${m.id === common ? ' active' : ''}" data-action="${action}" data-mode="${m.id}" aria-pressed="${m.id === common}">${glyph(m.id, 15)}<span>${m.label}</span></button>`).join('')}
</div>`;
}

/** Real travel times from everyone to the meeting point, each in their own mode. */
function loadMeetTimes() {
  const s = state.search;
  const meet = s.meet;
  const key = `${s.people.map((p) => p.mode).join(',')}|${meet.lat},${meet.lon}`;
  if (s.meetTimes?.key === key) return;
  const mt = s.meetTimes = { key, values: s.people.map(() => null) };
  const refresh = () => { if (state.search === s && s.meetTimes === mt && state.view === 'results') render({ keepScroll: true }); };
  // The routes already fetched for the animation give most of these.
  const known = s.people.map((person, i) => routeMode(s.routes?.[i]) === person.mode);
  known.forEach((k, i) => { if (k) mt.values[i] = s.routes[i].duration; });
  s.people.forEach((person, i) => {
    if (person.mode !== 'transit' || known[i]) return;
    getDirections('transit', person, meet).then((d) => { mt.values[i] = d.duration; refresh(); }).catch(() => {});
  });
  for (const mode of ['walk', 'bike', 'drive']) {
    const idx = s.people.map((p, i) => (p.mode === mode && !known[i] ? i : -1)).filter((i) => i >= 0);
    if (!idx.length) continue;
    getTravelTimes(mode, idx.map((i) => s.people[i]), [meet])
      .then((t) => { t.durations.forEach((row, k) => { mt.values[idx[k]] = row[0]; }); refresh(); }).catch(() => {});
  }
}

// ------------------------------------------------ results view

/** " · 35–42 min": the shortest and longest trip to the meeting point. */
function tripRange(s) {
  const t = s.people.map((p, i) => s.meetTimes?.values[i] ?? s.meeting.times[i]).filter((x) => x != null);
  if (!t.length) return '';
  const lo = Math.max(1, Math.round(Math.min(...t) / 60)), hi = Math.max(1, Math.round(Math.max(...t) / 60));
  return lo === hi ? ` · ${fmtTime(hi)} each` : ` · ${hi < 60 ? `${lo}–${hi} min` : `${fmtTime(lo)} – ${fmtTime(hi)}`}`;
}

function renderResults() {
  const s = state.search;
  loadMeetTimes();
  const total = s.pois.length;
  const tabs = TABS.map((t) => {
    const n = s.grouped[t.id].reduce((a, g) => a + g.items.length, 0);
    return `<button class="pill${t.id === s.tab ? ' active' : ''}" role="tab" aria-selected="${t.id === s.tab}" data-action="tab" data-tab="${t.id}" ${n ? '' : 'disabled'}>
      <span class="pill-ico" style="--c:${TAB_COLOR[t.id]}">${glyph(t.id)}</span>${t.label}<span class="count">${n}</span></button>`;
  }).join('');

  const groups = s.grouped[s.tab] || [];
  const tabMeta = TABS.find((t) => t.id === s.tab);
  const tabCount = groups.reduce((a, g) => a + g.items.length, 0);
  const list = groups.length
    ? `<ul class="group icons">
        ${groups.map((g) => `<li><button class="cell cell-btn" data-action="group" data-group="${esc(g.group)}">${tile(s.tab)}<span class="cell-main cell-title">${esc(g.group)}</span><span class="cell-end count">${g.items.length}</span>${CHEV}</button></li>`).join('')}
        ${groups.length > 1 ? `<li><button class="cell cell-btn" data-action="group" data-group="*">${tile('all')}<span class="cell-main cell-title">All ${esc(tabMeta.label.toLowerCase())}</span><span class="cell-end count">${tabCount}</span>${CHEV}</button></li>` : ''}
      </ul>`
    : `<div class="empty">${s.poiError ? esc(s.poiError) : 'Nothing found nearby. Try a wider radius.'}</div>`;

  const radius = RADII.map((r) => `<button class="seg${r === s.radius ? ' active' : ''}" data-action="radius" data-r="${r}">${fmtDist(r)}</button>`).join('');

  return `
    <div class="result-head">
      <span class="meet-badge"><i></i></span>
      <div style="min-width:0">
        <div class="eyebrow">${s.rule === 'total' ? 'Least total travel' : 'Similar travel times'}${tripRange(s)}</div>
        <h2>${esc(s.area ? shortAddr(s.area) : 'Your meeting point')}</h2>
      </div>
    </div>
    <ul class="group icons">${s.people.map((p, i) => tripRow(p, s.routes?.[i]?.distance ?? s.meeting.dists[i], s.meetTimes?.values[i])).join('')}
      <li><button class="cell cell-btn" data-action="edit-people">${tile('pencil')}<span class="cell-main cell-title">Edit people</span>${CHEV}</button></li>
      <li><button class="cell cell-btn" data-action="meet-place">${tile('meet')}<span class="cell-main cell-title">Routes to this spot &amp; send it</span>${CHEV}</button></li></ul>
    ${s.meeting.approx ? '<p class="notice">Travel times could not be checked right now, so this spot is estimated from distance.</p>' : ''}
    <div class="pills" role="tablist">${tabs}</div>
    ${list}
    <div class="radius-row"><span class="footnote">${total} places within</span><div class="segmented">${radius}</div></div>
    <div class="actions">
      <button class="btn btn-tinted" data-action="replay">Replay</button>
    </div>`;
}

// ------------------------------------------------ ratings & photos

let ratingsOn = false; // the server has ratings (checked at start)
let ratingsName = ''; // who they come from, for the credit line

const thumbArt = (p) => `<span class="thumb-art" style="--c:${TAB_COLOR[p.tab] || '#8e8e93'}">${glyph(p.tab === 'meet' ? 'pin' : p.tab, 22, 1.9)}</span>`;
const stars = (x) => `<span class="stars" style="--r:${Math.max(0, Math.min(100, (x / 5) * 100))}%" aria-hidden="true">★★★★★</span>`;

/** "4.5 ●●●●◐ (1,234)": Tripadvisor's bubble picture when we have it, else stars. */
function ratingHtml(r, { big = false, number = true } = {}) {
  if (!r || r.rating == null) return '';
  const pic = r.ratingImage
    ? `<img class="bubbles" src="${esc(r.ratingImage)}" alt="" width="${big ? 88 : 66}" height="${big ? 17 : 13}">`
    : stars(r.rating);
  const count = r.count ? `<span class="r-count">(${Number(r.count).toLocaleString()})</span>` : '';
  return `<span class="rating${big ? ' big' : ''}" aria-label="Rated ${Number(r.rating).toFixed(1)} out of 5${r.count ? ` from ${r.count} reviews` : ''}">${number ? `<b>${Number(r.rating).toFixed(1)}</b>` : ''}${pic}${count}</span>`;
}

/** "Open · Closes 22:00" with the first word coloured. */
function statusHtml(st) {
  if (!st) return '';
  const [first, ...rest] = st.text.split(' · ');
  const cls = st.open ? (st.soon ? 'soon' : 'open') : 'closed';
  return `<span class="st ${cls}">${esc(first)}</span>${rest.length ? ` · ${esc(rest.join(' · '))}` : ''}`;
}

const hrefOf = (url) => (!url ? '' : /^https?:\/\//i.test(url) ? url : `https://${url}`);
const poiById = (id) => state.search?.pois?.find((p) => p.id === id);

// Rows coming into view get their rating (a batch at a time) and their photo.
let rowObserver = null;
const ratingQueue = new Set();
let ratingTimer = 0;
let ratingsPausedShown = false;
function queueRating(p) {
  if (!ratingsOn || p.rating !== undefined || p.ratingPending) return;
  ratingQueue.add(p);
  clearTimeout(ratingTimer);
  ratingTimer = setTimeout(() => {
    const batch = [...ratingQueue].slice(0, 12);
    for (const x of batch) ratingQueue.delete(x);
    const s = state.search;
    rateAll(batch)
      .catch((err) => { if (!ratingsPausedShown) { ratingsPausedShown = true; toast(err.message, { error: true }); } })
      .finally(() => {
        if (state.search !== s) return;
        if (['group', 'place'].includes(state.view)) render({ keepScroll: true });
        if (ratingQueue.size) queueRating([...ratingQueue][0]);
      });
  }, 120);
}

function loadThumb(el) {
  const p = poiById(el.dataset.thumb);
  if (!p || el.dataset.loading) return;
  if (ratingsOn && p.rating === undefined) { queueRating(p); return; }
  if (p.thumb === null || el.querySelector('img')) return;
  el.dataset.loading = '1';
  thumbFor(p).then((url) => {
    if (!url || !el.isConnected || el.querySelector('img')) return;
    const img = new Image();
    img.alt = '';
    img.decoding = 'async';
    img.onload = () => img.classList.add('in');
    img.onerror = () => { img.remove(); p.thumb = null; };
    img.src = url;
    el.prepend(img);
  }).catch(() => {}).finally(() => { delete el.dataset.loading; });
}

function observeRows() {
  rowObserver?.disconnect();
  if (!('IntersectionObserver' in window)) { $$('[data-thumb]').forEach(loadThumb); return; }
  rowObserver = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) loadThumb(e.target);
  }, { root: $('#panel-body'), rootMargin: '120px 0px' });
  for (const el of $$('[data-thumb]')) rowObserver.observe(el);
}

// ------------------------------------------------ group (category) view

function groupItems() {
  const s = state.search;
  const groups = s.grouped[s.tab] || [];
  const items = s.group === '*' ? groups.flatMap((g) => g.items) : (groups.find((g) => g.group === s.group)?.items || []);
  const times = loadGroupTimes(items);
  const enriched = items.map((p, idx) => {
    const ds = distancesTo(p);
    let real = true;
    const per = s.people.map((person, pi) => {
      const sec = times?.[pi]?.[idx];
      if (sec != null) return sec / 60;
      real = false;
      return travelMinutes(ds[pi], person.mode);
    });
    return { p, ds, worstMin: Math.round(Math.max(...per)), real };
  });
  const rated = (x) => (x.p.rating?.rating ?? -1) * 100000 + (x.p.rating?.count || 0);
  if (s.sort === 'fair') enriched.sort((a, b) => a.worstMin - b.worstMin);
  else if (s.sort === 'top') enriched.sort((a, b) => rated(b) - rated(a) || a.p.fromCenter - b.p.fromCenter);
  else enriched.sort((a, b) => a.p.fromCenter - b.p.fromCenter);
  return enriched;
}

/** Real walk / bike / drive times from each person (in their mode) to each place: one request per mode. */
function loadGroupTimes(items) {
  const s = state.search;
  if (!items.length) return null;
  const list = items.slice(0, 80);
  const key = `${s.people.map((p) => p.mode).join(',')}|${list.map((p) => p.id).join(',')}`;
  if (s.groupTimes?.key === key) return s.groupTimes.durations;
  const gt = s.groupTimes = { key, durations: s.people.map(() => null) };
  const refresh = () => { if (state.search === s && s.groupTimes === gt && state.view === 'group') render({ keepScroll: true }); };
  for (const mode of ['walk', 'bike', 'drive']) {
    const idx = s.people.map((p, i) => (p.mode === mode ? i : -1)).filter((i) => i >= 0);
    if (!idx.length) continue;
    getTravelTimes(mode, idx.map((i) => s.people[i]), list)
      .then((t) => { t.durations.forEach((row, k) => { gt.durations[idx[k]] = row; }); refresh(); }).catch(() => {});
  }
  return gt.durations;
}

function poiRow({ p, worstMin, real }, i) {
  const s = state.search;
  const r = p.rating;
  const ratingPart = r?.rating != null ? ratingHtml(r) : ratingsOn && r === undefined ? '<span class="skel" style="width:92px"></span>' : '';
  const line2 = [ratingPart, esc(PRICE[r?.priceLevel] || '')].filter(Boolean).join('<span class="dot">·</span>');
  const where = [s.group === '*' ? p.group : '', p.address].filter(Boolean).map(esc).join(' · ');
  const st = statusHtml(openStatus(p.hours));
  return `<li><button class="cell cell-btn poi" data-action="place" data-id="${esc(p.id)}">
      <span class="thumb" data-thumb="${esc(p.id)}">${p.thumb ? `<img class="in" src="${esc(p.thumb)}" alt="">` : ''}${thumbArt(p)}<span class="num" style="--c:${TAB_COLOR[p.tab]}">${i + 1}</span></span>
      <span class="cell-main"><span class="cell-title">${esc(p.name)}</span>
        ${line2 ? `<span class="cell-meta">${line2}</span>` : ''}
        <span class="cell-sub">${where || 'Near the meeting point'}</span>
        ${st ? `<span class="cell-sub">${st}</span>` : ''}</span>
      <span class="cell-end"><b>${fmtDist(p.fromCenter)}</b>max ${real ? '' : '≈ '}${fmtTime(worstMin)}</span>
    </button></li>`;
}

function renderGroup() {
  const s = state.search;
  const items = groupItems();
  s.groupList = items.map((x) => x.p);
  const title = s.group === '*' ? `All ${TABS.find((t) => t.id === s.tab).label.toLowerCase()}` : s.group;
  const markersKey = `${s.tab}|${s.group}|${s.sort}|${items.map((x) => x.p.id).join(',')}`;
  if (s.markersKey !== markersKey) { s.markersKey = markersKey; drawPoiMarkers(items.map((x) => x.p)); }
  const anyTa = items.some((x) => x.p.rating?.rating != null);
  const anyFree = items.some((x) => x.p.thumb && !x.p.rating?.id);
  const credits = [anyTa && (ratingsName === 'Tripadvisor' ? 'Ratings and photos from Tripadvisor' : ratingsName), anyFree && 'Some photos from Wikimedia Commons'].filter(Boolean).join(' · ');
  return `
    ${backBtn('back-results', 'Categories')}
    <div class="sheet-title">${tile(s.tab, 'lg')}<div style="flex:1;min-width:0"><h2>${esc(title)}</h2><div class="footnote">${items.length} place${items.length === 1 ? '' : 's'} nearby</div></div></div>
    <div class="segmented" style="margin-top:0">
      <button class="seg${!['fair', 'top'].includes(s.sort) ? ' active' : ''}" data-action="sort" data-sort="near">Nearest</button>
      <button class="seg${s.sort === 'fair' ? ' active' : ''}" data-action="sort" data-sort="fair">Fairest</button>
      ${ratingsOn ? `<button class="seg${s.sort === 'top' ? ' active' : ''}" data-action="sort" data-sort="top">Top rated</button>` : ''}
    </div>
    <ul class="group places">${items.map(poiRow).join('')}</ul>
    ${credits ? `<p class="footnote attrib">${esc(credits)}</p>` : ''}`;
}

afterRender.group = () => {
  for (const b of $$('.poi')) {
    b.addEventListener('mouseenter', () => highlightPoi(b.dataset.id, true));
    b.addEventListener('mouseleave', () => highlightPoi(b.dataset.id, false));
  }
  observeRows();
};

const poiMarkers = new Map();
function drawPoiMarkers(items) {
  poiLayer.clearLayers();
  poiMarkers.clear();
  items.forEach((p, i) => {
    const m = L.marker([p.lat, p.lon], {
      icon: L.divIcon({ className: '', html: `<div class="poi-pin" style="--c:${TAB_COLOR[p.tab]}">${i + 1}</div>`, iconSize: [26, 26], iconAnchor: [13, 13] }),
      riseOnHover: true,
    }).bindTooltip(esc(p.name), { permanent: items.length <= 8, direction: 'right', className: 'label', offset: [14, 0] })
      .addTo(poiLayer);
    m.on('click', () => openPlace(p.id));
    poiMarkers.set(p.id, m);
  });
  const s = state.search;
  requestAnimationFrame(() => fitTo([...items.map((p) => [p.lat, p.lon]), [s.meet.lat, s.meet.lon]], { maxZoom: 17 }));
}

function highlightPoi(id, on) {
  const m = poiMarkers.get(id);
  m?.getElement()?.querySelector('.poi-pin')?.classList.toggle('hl', on);
  m?.setZIndexOffset(on ? 1000 : 0);
  if (m && poiMarkers.size > 8) { if (on) m.openTooltip(); else m.closeTooltip(); }
}

function openPlace(id) {
  const s = state.search;
  const p = s.pois.find((x) => x.id === id);
  if (!p) return;
  s.placeDrawn = null;
  s.place = p;
  state.placeTab = 'overview';
  loadDetails(p);
  setView('place');
}

/** Photos, reviews and more for a place (Tripadvisor and/or Wikimedia), loaded once. */
function loadDetails(p) {
  if (p.id === 'meet' || p.details) return;
  p.details = { status: 'loading', photos: [], reviews: [] };
  (async () => {
    if (ratingsOn && p.rating === undefined) await rateAll([p]).catch(() => {});
    return detailsFor(p);
  })()
    .then((d) => { p.details = { status: 'ok', ...d }; })
    .catch(() => { p.details = { status: 'error', photos: [], reviews: [] }; })
    .finally(() => { if (state.view === 'place' && state.search?.place === p) render({ keepScroll: true }); });
}

// ------------------------------------------------ place view

const PLACE_TABS = { overview: 'Overview', reviews: 'Reviews', photos: 'Photos', about: 'About' };
const TRIP = { BUSINESS: 'Business', COUPLES: 'Couples', FAMILY: 'Family', FRIENDS: 'Friends', SOLO: 'Solo' };

function renderPlace() {
  const s = state.search;
  const p = s.place;
  const ds = distancesTo(p);
  if (s.placeDrawn !== p.id) {
    s.placeDrawn = p.id;
    s.markersKey = null;
    poiLayer.clearLayers();
    L.marker([p.lat, p.lon], {
      icon: L.divIcon({ className: '', html: `<div class="poi-pin hl" style="--c:${TAB_COLOR[p.tab] || '#007aff'}">${glyph(p.tab, 15)}</div>`, iconSize: [26, 26], iconAnchor: [13, 13] }),
      zIndexOffset: 1200,
    }).bindTooltip(esc(p.name), { permanent: true, direction: 'right', className: 'label', offset: [18, 0] }).addTo(poiLayer);
    requestAnimationFrame(() => fitTo([...s.people.map((x) => [x.lat, x.lon]), [p.lat, p.lon]], { maxZoom: 16 }));
  }
  loadPlaceDirections();
  drawDirections();

  const d = p.details || { photos: [], reviews: [] };
  const r = d.rating != null ? d : p.rating;
  const loading = d.status === 'loading';
  const photos = d.photos || [];
  const st = openStatus(p.hours);
  const phone = d.phone || p.phone;
  const site = hrefOf(d.website || p.website);
  const menu = hrefOf(d.menu || p.menu);
  const tabs = ['overview', (d.reviews?.length || r?.count) && 'reviews', photos.length > 1 && 'photos', p.id !== 'meet' && 'about'].filter(Boolean);
  const tab = tabs.includes(state.placeTab) ? state.placeTab : 'overview';

  const gallery = photos.length
    ? `<div class="gallery${photos.length === 1 ? ' single' : ''}">${photos.slice(0, 8).map((ph, k) => `<button class="g-item" data-action="photo" data-i="${k}" aria-label="Photo ${k + 1} of ${photos.length}"><img src="${esc(ph.url)}" alt="${esc(ph.caption || '')}" ${k > 1 ? 'loading="lazy"' : ''} decoding="async"></button>`).join('')}</div>`
    : loading ? '<div class="gallery"><span class="g-item skel"></span><span class="g-item skel"></span></div>'
      : `<div class="hero-art" style="--c:${TAB_COLOR[p.tab] || '#007aff'}">${glyph(p.tab === 'meet' ? 'pin' : p.tab, 40, 1.6)}</div>`;
  const meta = [p.id === 'meet' ? 'Meeting point' : p.group, PRICE[r?.priceLevel], p.id === 'meet' ? '' : `${fmtDist(p.fromCenter)} from the meeting point`].filter(Boolean);
  const quick = [
    `<button class="q primary" data-action="choose">${glyph('send', 19)}<span>Send</span></button>`,
    `<button class="q" data-action="place-tab" data-tab="overview" data-scroll="getting-there">${glyph('route', 19)}<span>Directions</span></button>`,
    phone ? `<a class="q" href="tel:${esc(phone.replace(/[^\d+]/g, ''))}">${glyph('phone', 19)}<span>Call</span></a>` : '',
    site ? `<a class="q" href="${esc(site)}" target="_blank" rel="noopener">${glyph('globe', 19)}<span>Website</span></a>` : '',
    menu ? `<a class="q" href="${esc(menu)}" target="_blank" rel="noopener">${glyph('menu', 19)}<span>Menu</span></a>` : '',
  ].join('');
  const bodies = { overview: placeOverview, reviews: placeReviews, photos: placePhotos, about: placeAbout };
  return `
    ${p.id === 'meet' ? backBtn('back-results', 'Places') : backBtn('back-group', s.group === '*' ? 'Back' : s.group)}
    ${gallery}
    <div class="place-title">
      <h2>${esc(p.name)}</h2>
      ${r?.rating != null ? `<div class="place-rating">${ratingHtml(r, { big: true })}${r.count ? `<button class="btn btn-plain" data-action="place-tab" data-tab="reviews">${Number(r.count).toLocaleString()} reviews</button>` : ''}</div>` : loading && ratingsOn ? '<span class="skel" style="width:150px;height:16px"></span>' : ''}
      <div class="footnote">${esc(meta.join(' · '))}</div>
      ${st ? `<div class="place-status">${statusHtml(st)}</div>` : ''}
    </div>
    <div class="quick">${quick}</div>
    ${tabs.length > 1 ? `<div class="segmented place-tabs" role="tablist">${tabs.map((t) => `<button class="seg${t === tab ? ' active' : ''}" role="tab" aria-selected="${t === tab}" data-action="place-tab" data-tab="${t}">${PLACE_TABS[t]}</button>`).join('')}</div>` : ''}
    ${bodies[tab](p, d, r, ds)}`;
}

function placeOverview(p, d, r, ds) {
  const s = state.search;
  const when = state.when || { type: 'now' };
  const anyTransit = s.people.some((x) => x.mode === 'transit');
  const anyRoad = s.people.some((x) => x.mode !== 'transit');
  const credits = [anyTransit && ATTRIBUTION.transit, anyRoad && ATTRIBUTION.routing].filter(Boolean)
    .map((a) => `<a href="${a.url}" target="_blank" rel="noopener">${esc(a.text)}</a>`).join(' · ');
  const site = hrefOf(d.website || p.website);
  const phone = d.phone || p.phone;
  const week = weekTable(p.hours);
  const st = openStatus(p.hours);
  const hours = week
    ? `<details class="hours"><summary>${st ? statusHtml(st) : 'Opening hours'}</summary><table>${week.map((w) => `<tr${w.today ? ' class="today"' : ''}><th>${w.day}</th><td>${esc(w.text)}</td></tr>`).join('')}</table></details>`
    : d.hours?.length ? d.hours.map(esc).join('<br>') : p.hours ? esc(p.hours) : '';
  const summary = d.ranking || d.description || p.description;
  const links = mapLinks(p);
  return `
    ${summary ? `<p class="place-summary">${esc(d.ranking ? d.ranking : '')}${d.ranking && (d.description || p.description) ? '<br>' : ''}${esc(truncate(d.description || p.description || '', 220))}</p>` : ''}
    <div class="section-title" id="getting-there">Getting there</div>
    ${modeSwitch('dir-mode')}
    ${anyTransit ? `<div class="when-row">
      <select id="dir-when-type" aria-label="When">
        <option value="now"${when.type === 'now' ? ' selected' : ''}>Leave now</option>
        <option value="arrive"${when.type === 'arrive' ? ' selected' : ''}>Arrive by…</option>
      </select>
      ${when.type === 'arrive' ? `<input type="datetime-local" id="dir-when-time" value="${esc(when.time || '')}" aria-label="Arrive by">` : ''}
    </div>` : ''}
    <ul class="group icons dirs">${s.people.map((person, i) => dirRow(person, i, ds[i])).join('')}</ul>
    <p class="footnote attrib">${credits}</p>
    <div class="section-title">Details</div>
    <ul class="group kv">
      <li><div class="cell"><span class="k">Address</span><span class="v">${esc(p.address || d.address || 'Not listed')}</span></div></li>
      ${hours ? `<li><div class="cell"><span class="k">Hours</span><span class="v">${hours}</span></div></li>` : ''}
      ${phone ? `<li><div class="cell"><span class="k">Phone</span><a class="v" href="tel:${esc(phone.replace(/[^\d+]/g, ''))}">${esc(phone)}</a></div></li>` : ''}
      ${site ? `<li><div class="cell"><span class="k">Website</span><a class="v" href="${esc(site)}" target="_blank" rel="noopener">${esc(site.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''))}</a></div></li>` : ''}
    </ul>
    <div class="actions">
      <a class="btn btn-tinted" href="${links.osm}" target="_blank" rel="noopener">Open in maps</a>
    </div>`;
}

const truncate = (t, n) => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t);
const fmtDate = (iso) => { const t = Date.parse(iso); return Number.isFinite(t) ? new Date(t).toLocaleDateString([], { month: 'short', year: 'numeric' }) : ''; };

function placeReviews(p, d, r) {
  if (d.status === 'loading') return '<div class="empty"><span class="spinner"></span></div>';
  const total = (d.breakdown || []).reduce((a, b) => a + b.count, 0);
  const bars = total ? `<div class="bars">${[5, 4, 3, 2, 1].map((n) => {
    const c = d.breakdown.find((b) => b.rating === n)?.count || 0;
    return `<div class="bar"><span>${n}</span><i><b style="width:${((c / total) * 100).toFixed(1)}%"></b></i></div>`;
  }).join('')}</div>` : '';
  const reviews = (d.reviews || []).map((rv) => `<li class="review">
      <div class="rv-head"><span class="avatar sm" style="--c:#8e8e93">${rv.avatar ? `<img src="${esc(rv.avatar)}" alt="" loading="lazy">` : esc(initial(rv.user))}</span>
        <div class="rv-who"><b>${esc(rv.user)}</b><span class="footnote">${esc([fmtDate(rv.date), TRIP[rv.tripType]].filter(Boolean).join(' · '))}</span></div></div>
      <div class="rv-rating">${rv.ratingImage ? `<img class="bubbles" src="${esc(rv.ratingImage)}" alt="${rv.rating} of 5" width="66" height="13">` : stars(rv.rating)}</div>
      ${rv.title ? `<h4>${esc(rv.title)}</h4>` : ''}
      <p class="rv-text" data-action="rv-more">${esc(rv.text)}</p>
      ${rv.reply ? `<div class="rv-reply"><b>Reply from the owner</b><p class="rv-text" data-action="rv-more">${esc(rv.reply)}</p></div>` : ''}
    </li>`).join('');
  const from = d.attribution || (d.source === 'tripadvisor' ? 'Ratings and reviews from Tripadvisor' : '');
  return `
    ${r?.rating != null ? `<div class="rev-summary"><div class="big-num">${Number(r.rating).toFixed(1)}</div>
      <div class="rev-mid">${ratingHtml({ ...r, count: 0 }, { big: true, number: false })}<span class="footnote">${Number(r.count || 0).toLocaleString()} reviews</span></div>${bars}</div>` : ''}
    ${d.subratings?.length ? `<div class="subratings">${d.subratings.map((x) => `<span class="chip">${esc(x.name)} <b>${Number(x.rating).toFixed(1)}</b></span>`).join('')}</div>` : ''}
    ${reviews ? `<ul class="reviews">${reviews}</ul>` : '<div class="empty">No reviews to show here yet.</div>'}
    <div class="actions">
      ${r?.url ? `<a class="btn btn-tinted" href="${esc(r.url)}" target="_blank" rel="noopener">All reviews on Tripadvisor</a>` : ''}
      ${d.writeReview ? `<a class="btn btn-tinted" href="${esc(d.writeReview)}" target="_blank" rel="noopener">Write a review</a>` : ''}
    </div>
    ${from ? `<p class="footnote attrib">${esc(from)}</p>` : ''}`;
}

function placePhotos(p, d) {
  const photos = d.photos || [];
  const free = photos.some((ph) => ph.credit);
  return `<div class="photo-grid">${photos.map((ph, k) => `<button class="g-item" data-action="photo" data-i="${k}" aria-label="Photo ${k + 1}"><img src="${esc(ph.url)}" alt="${esc(ph.caption || '')}" loading="lazy" decoding="async"></button>`).join('')}</div>
    <p class="footnote attrib">${esc([d.source === 'tripadvisor' && 'Photos from Tripadvisor', free && 'Photos from Wikimedia Commons (tap one for its credit)', d.photoNote].filter(Boolean).join(' · '))}</p>`;
}

function placeAbout(p, d) {
  const yes = (v) => v === 'yes' || v === 'only';
  const feats = [
    p.outdoor && 'Outdoor seating', yes(p.takeaway) && 'Takeaway', yes(p.delivery) && 'Delivery', yes(p.reservation) && 'Takes bookings',
    p.wifi && 'Wi-Fi', p.wheelchair === 'yes' && 'Step-free access', p.vegan ? 'Vegan options' : p.vegetarian && 'Vegetarian options',
    yes(p.dogs) && 'Dogs welcome', ...(d.features || []),
  ].filter(Boolean);
  const unique = [...new Set(feats)];
  const cuisines = (p.cuisine || '').split(/[;,]/).map((c) => c.trim().replace(/_/g, ' ')).filter(Boolean);
  return `
    ${d.description || p.description ? `<p class="place-summary">${esc(d.description || p.description)}</p>` : ''}
    ${cuisines.length || d.categories?.length ? `<div class="section-title">Food</div><div class="subratings">${[...new Set([...cuisines.map((c) => c[0].toUpperCase() + c.slice(1)), ...(d.categories || [])])].map((c) => `<span class="chip">${esc(c)}</span>`).join('')}</div>` : ''}
    ${unique.length ? `<div class="section-title">Good to know</div><ul class="group features">${unique.map((f) => `<li><div class="cell"><span class="check">✓</span>${esc(f)}</div></li>`).join('')}</ul>` : ''}
    ${d.ranking || d.awards?.length ? `<div class="section-title">Recognition</div><ul class="group features">${[d.ranking, ...(d.awards || [])].filter(Boolean).map((a) => `<li><div class="cell">${esc(a)}</div></li>`).join('')}</ul>` : ''}
    ${!unique.length && !cuisines.length && !d.description && !p.description ? '<div class="empty">No more details listed for this place.</div>' : ''}
    <p class="footnote attrib">Place details from <a href="https://www.openstreetmap.org/${esc(p.id)}" target="_blank" rel="noopener">OpenStreetMap</a>${d.source === 'tripadvisor' ? ' and Tripadvisor' : ''}</p>`;
}

afterRender.place = () => {
  $('#dir-when-type')?.addEventListener('change', (e) => {
    if (e.target.value === 'arrive') {
      const d = nextHalfHour();
      d.setHours(d.getHours() + 1);
      const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      state.when = { type: 'arrive', time: state.shareWhen || local };
    } else state.when = { type: 'now' };
    render({ keepScroll: true });
  });
  $('#dir-when-time')?.addEventListener('change', (e) => {
    if (e.target.value) { state.when = { type: 'arrive', time: e.target.value }; render({ keepScroll: true }); }
  });
};

// ------------------------------------------------ photo viewer

function openLightbox(photos, start) {
  let i = start;
  const box = document.createElement('div');
  box.className = 'lightbox';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', 'Photos');
  const show = () => {
    const ph = photos[i];
    box.innerHTML = `<button class="lb-close" aria-label="Close">${glyph('close', 18, 2.4)}</button>
      ${photos.length > 1 ? `<button class="lb-prev" aria-label="Previous photo">‹</button><button class="lb-next" aria-label="Next photo">›</button>` : ''}
      <figure><img src="${esc(ph.url)}" alt="${esc(ph.caption || '')}"><figcaption>${esc([ph.caption, ph.by && `by ${ph.by}`, ph.credit].filter(Boolean).join(' · '))}
      ${ph.link ? ` · <a href="${esc(ph.link)}" target="_blank" rel="noopener">Licence &amp; source</a>` : ''}<span class="lb-count">${i + 1} / ${photos.length}</span></figcaption></figure>`;
  };
  const close = () => { box.remove(); document.removeEventListener('keydown', onKey); };
  const step = (k) => { i = (i + k + photos.length) % photos.length; show(); };
  const onKey = (e) => {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowRight') step(1);
    else if (e.key === 'ArrowLeft') step(-1);
  };
  box.addEventListener('click', (e) => {
    if (e.target.closest('.lb-close') || e.target === box) close();
    else if (e.target.closest('.lb-next')) step(1);
    else if (e.target.closest('.lb-prev')) step(-1);
  });
  let x0 = null;
  box.addEventListener('pointerdown', (e) => { x0 = e.clientX; });
  box.addEventListener('pointerup', (e) => { if (x0 != null && Math.abs(e.clientX - x0) > 50) step(e.clientX < x0 ? 1 : -1); x0 = null; });
  document.addEventListener('keydown', onKey);
  show();
  document.body.appendChild(box);
  $('.lb-close', box).focus();
}

/** Fetch each person's real directions to the open place (once per place / mode / time). */
function loadPlaceDirections() {
  const s = state.search;
  const p = s.place;
  const modes = s.people.map((x) => x.mode);
  const when = modes.includes('transit') ? state.when || { type: 'now' } : { type: 'now' };
  const key = [p.id, modes.join(','), when.type, when.time || ''].join('|');
  if (state.dir?.key === key) return;
  const prev = state.dir;
  const dir = state.dir = { key, results: s.people.map(() => ({ status: 'loading' })), expanded: prev?.key?.startsWith(`${p.id}|`) ? prev.expanded : -1, fitted: false };
  const opts = when.type === 'arrive' && when.time ? { time: new Date(when.time), arriveBy: true } : {};
  s.people.forEach((person, i) => {
    getDirections(person.mode, person, p, person.mode === 'transit' ? opts : {})
      .then((data) => { dir.results[i] = { status: 'ok', data, option: 0 }; })
      .catch((err) => { dir.results[i] = { status: 'error', message: friendlyError(err, person.mode) }; })
      .finally(() => {
        if (state.dir !== dir || state.view !== 'place') return;
        drawDirections();
        render({ keepScroll: true });
        if (!dir.fitted && dir.results.every((r) => r.status !== 'loading')) {
          dir.fitted = true;
          const pts = dir.results.flatMap((r) => (r.status === 'ok' ? routeGeometry(r) : []));
          if (pts.length) fitTo([...pts, ...s.people.map((x) => [x.lat, x.lon]), [p.lat, p.lon]], { maxZoom: 16 });
        }
      });
  });
}

function friendlyError(err, mode) {
  if (err.status === 429 || err.friendly) return err.message;
  if (err.status === 404) return mode === 'transit' ? 'No public transport route found' : 'No route found';
  return mode === 'transit' ? 'Public transport times unavailable right now' : 'Directions unavailable right now';
}

const currentOption = (r) => r.data.options?.[r.option || 0];
const routeGeometry = (r) => (r.data.options ? currentOption(r).legs.flatMap((l) => l.geometry) : r.data.geometry);

/** Draw everyone's real routes on the map; walking parts dotted. */
function drawDirections() {
  const dir = state.dir;
  const s = state.search;
  if (!dir) return;
  if (dir.layer) poiLayer.removeLayer(dir.layer);
  const layer = dir.layer = L.layerGroup().addTo(poiLayer);
  s.people.forEach((person, i) => {
    const r = dir.results[i];
    const dim = dir.expanded >= 0 && dir.expanded !== i;
    const opacity = dim ? 0.3 : 1;
    if (r.status !== 'ok') {
      L.polyline([[person.lat, person.lon], [s.place.lat, s.place.lon]], { color: person.color, weight: 3, opacity: 0.6 * opacity, dashArray: '1 8', lineCap: 'round', interactive: false }).addTo(layer);
      return;
    }
    const pieces = r.data.options
      ? currentOption(r).legs.map((l) => ({ pts: l.geometry, walk: isWalkLeg(l) }))
      : [{ pts: r.data.geometry, walk: r.data.mode === 'walk' }];
    for (const piece of pieces) {
      if (piece.pts.length < 2) continue;
      if (piece.walk) {
        L.polyline(piece.pts, { color: person.color, weight: 4, opacity: 0.9 * opacity, dashArray: '0.1 7', lineCap: 'round', interactive: false }).addTo(layer);
      } else {
        L.polyline(piece.pts, { color: '#fff', weight: 8, opacity: 0.9 * opacity, interactive: false }).addTo(layer);
        L.polyline(piece.pts, { color: person.color, weight: 4.5, opacity, interactive: false }).addTo(layer);
      }
    }
  });
}

const legChip = (l) => (isWalkLeg(l)
  ? `<span class="walk-chip">${glyph('walk', 12)}${Math.max(1, Math.round(l.duration / 60))}</span>`
  : `<span class="line-badge" style="background:${l.color || '#8e8e93'};color:${l.textColor}">${esc(l.line || vehicleName(l.mode))}</span>`);

function dirRow(person, i, d) {
  const dir = state.dir;
  const r = dir.results[i];
  const open = dir.expanded === i;
  let sub, end;
  if (r.status === 'loading') {
    sub = 'Finding the best route…';
    end = '<span class="spinner" aria-label="Loading"></span>';
  } else if (r.status === 'error') {
    sub = esc(r.message);
    end = `<b>≈ ${fmtTime(travelMinutes(d, person.mode))}</b>estimate`;
  } else if (r.data.options) {
    const o = currentOption(r);
    const legs = o.legs.filter((l) => !isWalkLeg(l) || l.duration >= 180);
    sub = `<span class="chips">${legs.map(legChip).join('<span class="sep">›</span>')}</span><span class="times">${clock(o.start)} – ${clock(o.end)}${o.transfers ? ` · ${o.transfers} change${o.transfers > 1 ? 's' : ''}` : ''}</span>`;
    end = `<b>${mins(o.duration)}</b>`;
  } else {
    const arrive = new Date(Date.now() + r.data.duration * 1000).toISOString();
    sub = `${fmtDist(r.data.distance)}<span class="times">Arrive about ${clock(arrive)} if you leave now</span>`;
    end = `<b>${mins(r.data.duration)}</b>`;
  }
  return `<li class="dir${open ? ' open' : ''}">
    <div class="cell cell-btn" role="button" tabindex="0" data-action="dir-toggle" data-pi="${i}" aria-expanded="${open}">
      <span class="avatar sm" style="--c:${person.color}">${esc(initial(person.name))}</span>
      <span class="cell-main"><span class="title-row"><span class="cell-title">${esc(person.name)}</span>${modePill(person)}</span><span class="cell-sub">${sub}</span></span>
      <span class="cell-end">${end}</span>${CHEV}
    </div>
    ${modePicker(person)}
    ${open ? itinerary(person, i, r) : ''}
  </li>`;
}

function itinerary(person, i, r) {
  const p = state.search.place;
  const links = navLinks(person.mode, person, p);
  const handoff = `<div class="handoff"><a class="btn btn-tinted btn-sm" href="${links.google}" target="_blank" rel="noopener">Google Maps</a><a class="btn btn-tinted btn-sm" href="${links.apple}" target="_blank" rel="noopener">Apple Maps</a></div>`;
  if (r.status !== 'ok') return `<div class="itin">${handoff}</div>`;
  if (!r.data.options) {
    return `<div class="itin"><p class="footnote">${fmtDist(r.data.distance)} · about ${mins(r.data.duration)}${person.mode === 'drive' ? ' without traffic' : ''}.</p>${handoff}</div>`;
  }
  const opts = r.data.options;
  const o = currentOption(r);
  const choices = opts.length > 1 ? `<div class="opt-row">${opts.map((x, k) => `<button class="chip${k === (r.option || 0) ? ' active' : ''}" data-action="dir-opt" data-pi="${i}" data-opt="${k}">${clock(x.start)} · ${mins(x.duration)}${x.transfers ? ` · ${x.transfers} change${x.transfers > 1 ? 's' : ''}` : ''}</button>`).join('')}</div>` : '';
  const steps = o.legs.map((l) => {
    if (isWalkLeg(l)) {
      const m = Math.max(1, Math.round(l.duration / 60));
      return `<li class="leg walk"><span class="t">${clock(l.from.time)}</span><span class="rail"></span><div class="what">Walk ${m} min${l.to.name && l.to.name !== 'Destination' ? ` to <b>${esc(l.to.name)}</b>` : ` to ${esc(p.name)}`}</div></li>`;
    }
    return `<li class="leg ride" style="--line:${l.color || '#8e8e93'}"><span class="t">${clock(l.from.time)}</span><span class="rail"></span><div class="what">
      <b>${esc(l.from.name)}</b>
      <div class="ride-line"><span class="line-badge" style="background:${l.color || '#8e8e93'};color:${l.textColor}">${esc(l.line || vehicleName(l.mode))}</span> ${esc(vehicleName(l.mode))}${l.headsign ? ` towards ${esc(l.headsign)}` : ''}</div>
      <div class="footnote">${l.stops + 1} stop${l.stops ? 's' : ''} · ${mins(l.duration)}${l.realTime ? ' · live times' : ''}${l.agency ? ` · ${esc(l.agency)}` : ''}</div>
      <div class="footnote">Get off at <b>${esc(l.to.name)}</b> · ${clock(l.to.time)}</div></div></li>`;
  }).join('');
  return `<div class="itin">${choices}<ol class="legs">${steps}<li class="leg end"><span class="t">${clock(o.end)}</span><span class="rail"></span><div class="what">Arrive at <b>${esc(p.name)}</b></div></li></ol>${handoff}</div>`;
}

// ------------------------------------------------ share view

const shareContext = () => state.search?.place || state.sharePlace;

function renderShare() {
  const p = shareContext();
  const when = state.shareWhen ? new Date(state.shareWhen) : null;
  const text = state.shareText ?? shareText(p, { when });
  state.shareText = text;
  const msg = messagingLinks(text, `Meet at ${p.name}?`);
  const links = mapLinks(p);
  return `
    ${backBtn(state.search?.place ? 'back-place' : 'back-people', 'Back')}
    <div class="eyebrow" style="margin-left:4px">Send location</div>
    <div class="sheet-title" style="margin-top:0"><h2>${esc(p.name)}</h2></div>
    <p class="footnote" style="margin:-8px 4px 14px">${esc(p.address || `${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}`)}</p>
    <ul class="group share-form">
      <li><div class="cell"><label for="share-when">When</label><input type="datetime-local" id="share-when" value="${esc(state.shareWhen || '')}"></div></li>
      <li><textarea id="share-text" aria-label="Message">${esc(text)}</textarea></li>
    </ul>
    <button class="btn btn-primary btn-block btn-lg" data-action="native-share">Share…</button>
    <div class="share-grid">
      <button class="btn btn-tinted" data-action="copy">Copy</button>
      <a class="btn btn-tinted" href="${msg.whatsapp}" target="_blank" rel="noopener" data-share="whatsapp">WhatsApp</a>
      <a class="btn btn-tinted" href="${msg.sms}" data-share="sms">Messages</a>
      <a class="btn btn-tinted" href="${msg.email}" data-share="email">Email</a>
      <a class="btn btn-tinted" href="${msg.telegram}" target="_blank" rel="noopener" data-share="telegram">Telegram</a>
      <button class="btn btn-tinted" data-action="calendar">Calendar</button>
      <a class="btn btn-tinted" href="${links.google}" target="_blank" rel="noopener">Google Maps</a>
      <a class="btn btn-tinted" href="${links.apple}" target="_blank" rel="noopener">Apple Maps</a>
    </div>`;
}

afterRender.share = () => {
  const ta = $('#share-text');
  ta.addEventListener('input', () => { state.shareText = ta.value; updateShareLinks(); });
  $('#share-when').addEventListener('change', (e) => {
    state.shareWhen = e.target.value;
    state.shareText = shareText(shareContext(), { when: e.target.value ? new Date(e.target.value) : null });
    ta.value = state.shareText;
    updateShareLinks();
  });
};

function updateShareLinks() {
  const p = shareContext();
  const msg = messagingLinks(state.shareText, `Meet at ${p.name}?`);
  for (const a of $$('[data-share]')) a.href = msg[a.dataset.share];
}

async function enterShare() {
  const s = state.search;
  state.shareText = null;
  state.shareWhen = '';
  setView('share');
  try {
    const { entry } = await api.addHistory({
      name: s.place.name, category: s.place.group, address: s.place.address,
      lat: s.place.lat, lon: s.place.lon, people: s.people.map((p) => p.name),
    });
    state.user.history = [entry, ...(state.user.history || [])];
  } catch { /* history is a nice-to-have */ }
}

// ------------------------------------------------ panel interactions

function initPanel() {
  const body = $('#panel-body');
  body.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const action = el.dataset.action;
    const id = el.closest('[data-id]')?.dataset.id;
    const s = state.search;
    switch (action) {
      case 'find': findPlaces(); break;
      case 'focus': {
        const p = everyone().find((x) => x.id === id);
        if (p) map.flyTo([p.lat, p.lon], Math.max(map.getZoom(), 15), { duration: 0.6 });
        break;
      }
      case 'edit': state.editingId = state.editingId === id ? null : id; render(); break;
      case 'edit-home': showHomeScreen(true); break;
      case 'delete': deletePlace(id); break;
      case 'toggle': patchPlace(id, { active: el.checked }); break;
      case 'tab': s.tab = el.dataset.tab; render(); break;
      case 'group': s.markersKey = null; s.group = el.dataset.group; s.sort = s.sort || 'near'; setView('group'); break;
      case 'radius': {
        const r = Number(el.dataset.r);
        s.showRadius = r;
        drawRadius({ fit: true });
        for (const b of $$('[data-action=radius]')) b.classList.toggle('active', b === el);
        el.textContent = '…';
        const ctrl = new AbortController();
        searchAbort = ctrl;
        await loadPois(s, ctrl.signal, r).catch(() => {});
        render();
        break;
      }
      case 'replay': findPlaces({ replay: true }); break;
      case 'meet-place': {
        const m = s.meet;
        s.place = { id: 'meet', name: s.area ? shortAddr(s.area) : 'Meeting point', lat: m.lat, lon: m.lon, tab: 'meet', group: 'Meeting point', address: s.area || '', fromCenter: 0 };
        s.placeDrawn = null;
        state.placeTab = 'overview';
        setView('place');
        break;
      }
      case 'edit-people': cancelSearch(); break;
      case 'back-results':
        poiLayer.clearLayers();
        s.markersKey = null;
        setView('results');
        fitTo([...s.people.map((p) => [p.lat, p.lon]), [s.meet.lat, s.meet.lon]], { maxZoom: 16 });
        break;
      case 'sort': s.sort = el.dataset.sort; render(); break;
      case 'place': openPlace(id); break;
      case 'back-group': s.markersKey = null; setView('group'); break;
      case 'dir-mode':
        setEveryoneMode(el.dataset.mode);
        break;
      case 'mode-menu':
        state.modeMenu = state.modeMenu === el.dataset.id ? null : el.dataset.id;
        render({ keepScroll: true });
        break;
      case 'set-mode': setPersonMode(el.dataset.id, el.dataset.mode); break;
      case 'dir-toggle': {
        const i = Number(el.dataset.pi);
        state.dir.expanded = state.dir.expanded === i ? -1 : i;
        drawDirections();
        render({ keepScroll: true });
        break;
      }
      case 'dir-opt': {
        const r = state.dir.results[Number(el.dataset.pi)];
        r.option = Number(el.dataset.opt);
        drawDirections();
        render({ keepScroll: true });
        break;
      }
      case 'choose': enterShare(); break;
      case 'place-tab': {
        state.placeTab = el.dataset.tab;
        render({ keepScroll: true });
        const target = el.dataset.scroll ? document.getElementById(el.dataset.scroll) : $('.place-tabs');
        if (isMobile() && sheet.snap === 'peek') setSheet('mid');
        target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        break;
      }
      case 'photo': openLightbox(s.place.details?.photos || [], Number(el.dataset.i)); break;
      case 'rv-more': el.classList.toggle('open'); break;
      case 'back-place': setView('place'); break;
      case 'back-people': state.sharePlace = null; poiLayer.clearLayers(); setView('people'); break;
      case 'native-share': {
        const ok = await nativeShare(shareContext(), state.shareText);
        if (!ok && await copyText(state.shareText)) toast('Copied. Paste it into your group chat.');
        break;
      }
      case 'copy': if (await copyText(state.shareText)) toast('Copied'); break;
      case 'calendar': {
        const p = shareContext();
        const start = state.shareWhen ? new Date(state.shareWhen) : nextHalfHour();
        download(`meet-${p.name.replace(/[^\w]+/g, '-').toLowerCase()}.ics`, calendarInvite(p, start));
        if (!state.shareWhen) toast('Invite set for the next half hour. Change it in your calendar.');
        break;
      }
      default: break;
    }
  });
  // Pictures fade in once loaded; broken ones disappear.
  body.addEventListener('load', (e) => { if (e.target.tagName === 'IMG') e.target.classList.add('in'); }, true);
  body.addEventListener('error', (e) => { if (e.target.tagName === 'IMG') e.target.classList.add('broken'); }, true);
  body.addEventListener('keydown', (e) => {
    const t = e.target;
    if ((e.key === 'Enter' || e.key === ' ') && t.getAttribute?.('role') === 'button' && t.tagName !== 'BUTTON') { e.preventDefault(); t.click(); }
  });
  body.addEventListener('submit', (e) => {
    const form = e.target.closest('[data-action="save-nick"]');
    if (!form) return;
    e.preventDefault();
    const id = form.closest('[data-id]').dataset.id;
    state.editingId = null;
    patchPlace(id, { nickname: form.nick.value });
  });

  $('#btn-skip').onclick = () => anim?.skip();
  $('#btn-cancel-search').onclick = cancelSearch;
  $('#btn-recenter').onclick = () => {
    const pts = state.search ? state.search.people : activePeople();
    if (pts.length < 2) map.flyTo([state.user.home.lat, state.user.home.lon], 15, { duration: 0.6 });
    else fitTo(pts.map((p) => [p.lat, p.lon]), { maxZoom: 16 });
  };
}

function nextHalfHour() {
  const d = new Date();
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0);
  return d;
}

// ---------------------------------------------------------------- menu & settings

function applyTheme() {
  const t = state.settings.theme;
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
  if (map) addBasemap();
}

function syncSettingsUI() {
  for (const [id, key] of [['#set-mode', 'mode'], ['#set-travel', 'travel'], ['#set-speed', 'speed'], ['#set-theme', 'theme']]) {
    for (const b of $$('.seg', $(id))) b.classList.toggle('active', b.dataset.value === state.settings[key]);
  }
  $('#mode-hint').textContent = state.settings.mode === 'total'
    ? 'Everyone’s trips add up to the least time, even if some take longer than others.'
    : 'Everyone’s trip takes about as long, without making anyone travel much further than needed.';
}

function renderHistory() {
  const h = state.user?.history || [];
  $('#history-list').innerHTML = h.length
    ? h.map((x) => `<li data-hid="${esc(x.id)}"><div><div class="h-name">${esc(x.name)}</div>
        <div class="h-sub">${esc([x.category, new Date(x.at).toLocaleDateString()].filter(Boolean).join(' · '))}</div></div>
        <button class="icon-btn" data-del="${esc(x.id)}" aria-label="Remove">✕</button></li>`).join('')
    : '<li class="empty-note">Places you send show up here.</li>';
}

function openDrawer(open) {
  $('#drawer').hidden = !open;
  $('#drawer-backdrop').hidden = !open;
  if (!open) return;
  const guest = api.isGuest();
  $('#drawer-name').textContent = guest ? 'Guest' : (state.user.name || 'Your profile');
  $('#drawer-avatar').textContent = guest ? '?' : initial(state.user.name || state.user.email);
  $('#drawer-email').textContent = guest ? '' : state.user.email;
  $('#drawer-guest').hidden = !guest;
  $('#drawer-account').hidden = guest;
  $('#drawer-home').textContent = state.user.home?.address || 'Not set';
  syncSettingsUI();
  renderHistory();
}

async function saveSettings(patch) {
  const prevMode = state.settings.mode;
  state.settings = { ...state.settings, ...patch };
  applyTheme();
  syncSettingsUI();
  if (state.search && ['results', 'group', 'place', 'searching'].includes(state.view)) {
    if (patch.mode && patch.mode !== prevMode) {
      // A different rule means a different spot: look again straight away.
      openDrawer(false);
      findPlaces();
    } else {
      render({ keepScroll: true });
    }
  }
  try { await api.updateMe({ settings: state.settings }); } catch { /* keep local */ }
}

function initDrawer() {
  $('#btn-menu').onclick = () => openDrawer(true);
  $('#drawer-close').onclick = () => openDrawer(false);
  $('#drawer-backdrop').onclick = () => openDrawer(false);
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!$('#auth-modal').hidden) openAuth(false);
    else if (!$('#drawer').hidden) openDrawer(false);
  });
  for (const [id, key] of [['#set-mode', 'mode'], ['#set-travel', 'travel'], ['#set-speed', 'speed'], ['#set-theme', 'theme']]) {
    $(id).addEventListener('click', (e) => {
      const b = e.target.closest('.seg');
      if (b) saveSettings({ [key]: b.dataset.value });
    });
  }
  $('#btn-signin').onclick = () => { openDrawer(false); openAuth(true, 'signup'); };
  $('#btn-edit-home').onclick = () => { openDrawer(false); showHomeScreen(true); };
  $('#btn-logout').onclick = async () => {
    openDrawer(false);
    cancelSearchQuietly();
    const { user } = await api.logout();
    state.mapCentred = false;
    onUser(user);
    toast('Signed out');
  };
  $('#history-list').addEventListener('click', (e) => {
    const del = e.target.closest('[data-del]');
    if (del) {
      e.stopPropagation();
      state.user.history = state.user.history.filter((h) => h.id !== del.dataset.del);
      renderHistory();
      api.deleteHistory(del.dataset.del).catch(() => {});
      return;
    }
    const li = e.target.closest('[data-hid]');
    if (!li) return;
    const h = state.user.history.find((x) => x.id === li.dataset.hid);
    openDrawer(false);
    cancelSearchQuietly();
    state.sharePlace = h;
    state.shareText = null;
    state.shareWhen = '';
    L.marker([h.lat, h.lon], {
      icon: L.divIcon({ className: '', html: `<div class="poi-pin hl">${glyph('pin', 15)}</div>`, iconSize: [30, 30], iconAnchor: [15, 15] }),
    }).bindTooltip(esc(h.name), { permanent: true, direction: 'right', className: 'label', offset: [20, 0] }).addTo(poiLayer);
    setView('share');
    map.flyTo([h.lat, h.lon], 16, { duration: 0.8 });
  });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
}

// ---------------------------------------------------------------- boot

async function boot() {
  initAuth();
  initHome();
  initPanel();
  initSheet();
  initDrawer();
  window.addEventListener('resize', () => map?.invalidateSize());
  ratingsSource().then((src) => { ratingsOn = !!src; ratingsName = src === 'tripadvisor' ? 'Tripadvisor' : src || ''; });
  onUser(await api.start());
}

window.__meet = { onUser, api, get map() { return map; } };
boot();
