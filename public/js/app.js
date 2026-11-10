// Meet — app controller: start screen, map, panel views, search flow,
// optional sign-in and the draggable bottom sheet on phones.
import { api } from './api.js';
import { searchAddress, reverseGeocode, currentPosition } from './geocode.js';
import { loadNetwork } from './network.js';
import { solveMeeting, roadDistanceTo } from './meet.js';
import { GrowthAnimation } from './growth.js';
import { TABS, findPois, groupPois } from './pois.js';
import { mapLinks, shareText, messagingLinks, nativeShare, copyText, calendarInvite, download } from './share.js';

// ---------------------------------------------------------------- constants

const COLORS = ['#3d5afe', '#e5484d', '#12a594', '#f08c00', '#c2298a', '#2f9e44', '#0b8bd1', '#7c4dff', '#d9480f', '#495057'];
const SPEEDS = { walk: 1.35, bike: 4.2, transit: 6.5, drive: 9.5 }; // m/s, urban averages
const TRAVEL_LABEL = { walk: 'walk', bike: 'bike', transit: 'transit', drive: 'drive' };
const ANIM_MS = { slow: 9000, normal: 6000, fast: 3200 };
const RADII = [500, 1000, 2000, 5000];
const DEFAULT_SETTINGS = { mode: 'fair', travel: 'transit', speed: 'normal', theme: 'auto' };
const SHEET_DEFAULT = { people: 'mid', results: 'mid', group: 'mid', place: 'mid', share: 'full' };

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

let map, peopleLayer, resultLayer, poiLayer, anim, searchAbort, homeSearchCtl;

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
  return Math.round(m / SPEEDS[mode] / 60 + (mode === 'transit' ? 6 : 0));
}
function fmtTime(min) {
  if (min < 60) return `${Math.max(1, min)} min`;
  const h = Math.floor(min / 60), r = min % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}
const fmtTravel = (m) => `${fmtTime(travelMinutes(m))} ${TRAVEL_LABEL[state.settings.travel]}`;
const initial = (name) => (name || '?').trim().charAt(0).toUpperCase() || '?';
const shortAddr = (a) => (a || '').split(', ').slice(0, 2).join(', ');

function toast(msg, { error = false, action, onAction, ms = 3600 } = {}) {
  const el = document.createElement('div');
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
  if (state.user?.home) list.push({ id: 'home', isHome: true, name: 'You', ...state.user.home, active: true, color: COLORS[0] });
  state.places.forEach((p, i) => list.push({
    ...p, name: p.nickname || shortAddr(p.address) || `Friend ${i + 1}`, color: COLORS[(i + 1) % COLORS.length],
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
    const { user } = await api.updateMe({ home: { address: loc.address, lat: loc.lat, lon: loc.lon } });
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
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Locating…';
    try {
      const pos = await currentPosition();
      await saveHome(await reverseGeocode(pos.lat, pos.lon));
    } catch (err) {
      toast(err.message, { error: true });
    } finally {
      btn.disabled = false;
      btn.textContent = label;
    }
  };
  $('#home-cancel').onclick = () => enterMain();
  $('#home-signin').onclick = () => openAuth(true, 'login');
}

// ---------------------------------------------------------------- map

function initMap() {
  map = L.map('map', { zoomControl: false, worldCopyJump: true });
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);
  map.attributionControl.setPrefix(false);
  peopleLayer = L.layerGroup().addTo(map);
  resultLayer = L.layerGroup().addTo(map);
  poiLayer = L.layerGroup().addTo(map);

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
    html: `<div class="pin" style="background:${person.color}">${esc(initial(person.name))}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

function drawPeople() {
  peopleLayer.clearLayers();
  for (const p of everyone()) {
    if (!p.active && state.view !== 'people') continue;
    const m = L.marker([p.lat, p.lon], { icon: pinIcon(p), draggable: state.view === 'people', opacity: p.active ? 1 : 0.4, riseOnHover: true })
      .bindTooltip(esc(p.name), { permanent: true, direction: 'top', className: 'label', offset: [0, -14] })
      .addTo(peopleLayer);
    m.on('dragend', () => moveAddress(p, m.getLatLng()));
  }
}

async function moveAddress(p, ll) {
  const loc = await reverseGeocode(ll.lat, ll.lng);
  const patch = { address: loc.address, lat: ll.lat, lon: ll.lng };
  try {
    if (p.isHome) {
      state.user = (await api.updateMe({ home: patch })).user;
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
  let tl = [40, state.view === 'searching' ? 120 : 80], br = [40, 40];
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
  const panel = $('#panel');
  panel.classList.toggle('away', view === 'searching');
  anim?.canvas.classList.toggle('dim', ['group', 'place', 'share'].includes(view));
  if (pop) { panel.classList.remove('pop'); void panel.offsetWidth; panel.classList.add('pop'); }
  render();
  if (SHEET_DEFAULT[view]) setSheet(SHEET_DEFAULT[view]);
}

const afterRender = {};
function render() {
  const body = $('#panel-body');
  const views = { people: renderPeople, results: renderResults, group: renderGroup, place: renderPlace, share: renderShare };
  if (views[state.view]) {
    body.innerHTML = `<div class="panel-content">${views[state.view]()}</div>`;
    afterRender[state.view]?.();
    body.scrollTop = 0;
    if (isMobile() && sheet.snap) setSheet(sheet.snap);
  }
  drawPeople();
}

// ------------------------------------------------ people view

function renderPeople() {
  const all = everyone();
  const active = all.filter((p) => p.active).length;
  const rows = all.map((p) => {
    const editing = state.editingId === p.id;
    return `<li class="person${p.active ? '' : ' inactive'}" data-id="${esc(p.id)}">
      <div class="row">
        <span class="dot" style="background:${p.color}"></span>
        <div class="row-main" data-action="focus" style="cursor:pointer">
          <div class="row-title">${esc(p.isHome ? (state.user.name ? `You (${state.user.name})` : 'You') : p.name)}</div>
          <div class="row-sub" title="${esc(p.address)}">${esc(shortAddr(p.address))}</div>
          ${editing ? `<form class="edit-inline" data-action="save-nick"><input id="nick-${esc(p.id)}" name="nick" value="${esc(p.nickname || '')}" maxlength="60" placeholder="Name"><button class="btn btn-primary">Save</button></form>` : ''}
        </div>
        <div class="person-actions">
          ${p.isHome
            ? '<button class="icon-btn" data-action="edit-home" aria-label="Change your starting point">Edit</button>'
            : `<button class="icon-btn" data-action="edit" aria-label="Rename">Rename</button>
               <button class="icon-btn" data-action="delete" aria-label="Remove ${esc(p.name)}">✕</button>
               <label class="switch" title="${p.active ? 'Included' : 'Left out'}">
                 <input type="checkbox" data-action="toggle" ${p.active ? 'checked' : ''} aria-label="Include ${esc(p.name)}"><span></span></label>`}
        </div>
      </div>
    </li>`;
  }).join('');
  return `
    <div class="head"><h2>Who's meeting</h2><span class="muted small">${active} of ${all.length}</span></div>
    <ul class="rows">${rows}</ul>
    <div class="add">
      <div class="search" id="add-search">
        <input id="add-input" type="search" placeholder="Add someone's address" autocomplete="off" aria-label="Someone's address">
        <ul class="suggestions" role="listbox" hidden></ul>
      </div>
      <input id="add-nick" maxlength="60" placeholder="Their name (optional)" aria-label="Their name">
      <p class="hint">Or tap the map. Drag a dot to move it.</p>
    </div>
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
    const { place } = await api.addPlace({ address: loc.address, lat: loc.lat, lon: loc.lon, nickname: loc.nickname || '' });
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

  try {
    let net, solution;
    if (prev) {
      net = { graph: prev.graph, source: prev.source, reason: prev.reason };
      solution = prev.solution;
    } else {
      setStatus('Loading streets…');
      net = await loadNetwork(people, { signal: ctrl.signal, onStatus: (s) => setStatus(s) });
      if (ctrl.signal.aborted) return;
      setStatus('Working out routes…');
      await new Promise((r) => setTimeout(r, 30));
      solution = solveMeeting(net.graph, people, { mode: state.settings.mode });
    }
    if (ctrl.signal.aborted) return;

    const search = state.search = {
      people, graph: net.graph, solution, source: net.source, reason: net.reason,
      pois: prev?.pois || null, grouped: prev?.grouped || null, radius: prev?.radius || null, tab: prev?.tab || null,
      group: null, place: null, area: prev?.area || null, poiError: prev?.poiError || null,
      poiDist: prev?.poiDist || new Map(), sort: prev?.sort,
    };

    // Fetch places and the area name while the routes animate.
    const poisPromise = prev?.pois ? Promise.resolve() : loadPois(search, ctrl.signal);
    if (!search.area) {
      reverseGeocode(solution.meet.lat, solution.meet.lon, { signal: ctrl.signal })
        .then((r) => { search.area = r.address; if (state.view === 'results') render(); })
        .catch(() => {});
    }

    anim = new GrowthAnimation(map, net.graph, solution, people.map((p) => p.color));
    const done = await anim.play({
      duration: ANIM_MS[state.settings.speed] || ANIM_MS.normal,
      onProgress: (r) => setStatus(`Routes spreading · ${fmtDist(r)}`, { skip: true }),
    });
    if (!done || ctrl.signal.aborted) return;

    L.marker([solution.meet.lat, solution.meet.lon], {
      icon: L.divIcon({ className: '', html: '<div class="meet-pin"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }),
      zIndexOffset: 1000,
    }).bindTooltip('Meeting point', { permanent: true, direction: 'top', className: 'label', offset: [0, -10] }).addTo(resultLayer);

    setStatus('Finding places nearby…');
    await poisPromise;
    if (ctrl.signal.aborted) return;
    setStatus('');
    setView('results', { pop: true });
    fitTo([...people.map((p) => [p.lat, p.lon]), [solution.meet.lat, solution.meet.lon]], { maxZoom: 16 });
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
    const { pois, radius: used } = await findPois(search.solution.meet, { radius, signal });
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

/** Road distances from every person to a place (cached). */
function distancesTo(poi) {
  const s = state.search;
  if (!s.poiDist.has(poi.id)) s.poiDist.set(poi.id, s.solution.people.map((person) => roadDistanceTo(s.graph, person, poi)));
  return s.poiDist.get(poi.id);
}

const tripRow = (person, d) => `<div class="travel"><span class="dot" style="background:${person.color}"></span>
  <span class="name">${esc(person.name)}</span><span class="row-end">${fmtTime(travelMinutes(d))} <span>· ${fmtDist(d)}</span></span></div>`;

// ------------------------------------------------ results view

function renderResults() {
  const s = state.search;
  const { solution } = s;
  const total = s.pois.length;
  const tabs = TABS.map((t) => {
    const n = s.grouped[t.id].reduce((a, g) => a + g.items.length, 0);
    return `<button class="tab${t.id === s.tab ? ' active' : ''}" role="tab" data-action="tab" data-tab="${t.id}" ${n ? '' : 'disabled'}>${t.label}<span class="count">${n}</span></button>`;
  }).join('');

  const groups = s.grouped[s.tab] || [];
  const tabMeta = TABS.find((t) => t.id === s.tab);
  const tabCount = groups.reduce((a, g) => a + g.items.length, 0);
  const list = groups.length
    ? `<ul class="rows tab-rows">
        ${groups.map((g) => `<li><button class="row" data-action="group" data-group="${esc(g.group)}"><span class="row-main row-title">${esc(g.group)}</span><span class="row-end">${g.items.length}</span><span class="chev">›</span></button></li>`).join('')}
        ${groups.length > 1 ? `<li><button class="row" data-action="group" data-group="*"><span class="row-main row-title muted">All ${esc(tabMeta.label.toLowerCase())}</span><span class="row-end">${tabCount}</span><span class="chev">›</span></button></li>` : ''}
      </ul>`
    : `<div class="empty">${s.poiError ? esc(s.poiError) : 'Nothing found nearby. Try a wider radius.'}</div>`;

  const radiusChips = RADII.map((r) => `<button class="chip${r === s.radius ? ' active' : ''}" data-action="radius" data-r="${r}">${fmtDist(r)}</button>`).join('');

  return `
    <div class="eyebrow">${state.settings.mode === 'fair' ? 'Fairest meeting point' : 'Least total travel'}</div>
    <h2>${esc(s.area ? shortAddr(s.area) : 'Your meeting point')}</h2>
    <div class="trips">${s.people.map((p, i) => tripRow(p, solution.people[i].reach)).join('')}</div>
    ${s.source === 'synthetic' ? `<p class="notice">${esc(s.reason)} Distances are estimates.</p>` : ''}
    <div class="tabs" role="tablist">${tabs}</div>
    ${list}
    <div class="radius-row"><span>${total} places within</span><div class="chips">${radiusChips}</div></div>
    <div class="links">
      <button class="btn-text" data-action="surprise" ${total ? '' : 'disabled'}>Surprise me</button>
      <button class="btn-text" data-action="replay">Replay</button>
      <button class="btn-text" data-action="edit-people">Change people</button>
    </div>`;
}

// ------------------------------------------------ group (category) view

function groupItems() {
  const s = state.search;
  const groups = s.grouped[s.tab] || [];
  const items = s.group === '*' ? groups.flatMap((g) => g.items) : (groups.find((g) => g.group === s.group)?.items || []);
  const enriched = items.map((p) => { const ds = distancesTo(p); return { ...p, ds, worst: Math.max(...ds) }; });
  if (s.sort === 'fair') enriched.sort((a, b) => a.worst - b.worst);
  else enriched.sort((a, b) => a.fromCenter - b.fromCenter);
  return enriched;
}

function renderGroup() {
  const s = state.search;
  const items = groupItems();
  const title = s.group === '*' ? `All ${TABS.find((t) => t.id === s.tab).label.toLowerCase()}` : s.group;
  drawPoiMarkers(items);
  return `
    <button class="back" data-action="back-results">‹ Categories</button>
    <div class="head"><h2>${esc(title)}</h2><span class="muted small">${items.length}</span></div>
    <div class="chips" style="margin-bottom:8px">
      <button class="chip${s.sort !== 'fair' ? ' active' : ''}" data-action="sort" data-sort="near">Nearest</button>
      <button class="chip${s.sort === 'fair' ? ' active' : ''}" data-action="sort" data-sort="fair">Fairest</button>
    </div>
    <ul class="rows">
      ${items.map((p, i) => `<li><button class="row poi" data-action="place" data-id="${esc(p.id)}">
        <span class="num">${i + 1}</span>
        <span class="row-main"><span class="row-title" style="display:block">${esc(p.name)}</span>
          <span class="row-sub" style="display:block">${esc([s.group === '*' ? p.group : '', p.address].filter(Boolean).join(' · ') || 'Near the meeting point')}</span></span>
        <span class="row-end">${fmtDist(p.fromCenter)}<br><span class="muted">max ${fmtTime(travelMinutes(p.worst))}</span></span>
      </button></li>`).join('')}
    </ul>`;
}

afterRender.group = () => {
  for (const b of $$('.poi')) {
    b.addEventListener('mouseenter', () => highlightPoi(b.dataset.id, true));
    b.addEventListener('mouseleave', () => highlightPoi(b.dataset.id, false));
  }
};

const poiMarkers = new Map();
function drawPoiMarkers(items) {
  poiLayer.clearLayers();
  poiMarkers.clear();
  items.forEach((p, i) => {
    const m = L.marker([p.lat, p.lon], {
      icon: L.divIcon({ className: '', html: `<div class="poi-pin">${i + 1}</div>`, iconSize: [24, 24], iconAnchor: [12, 12] }),
      riseOnHover: true,
    }).bindTooltip(esc(p.name), { permanent: items.length <= 25, direction: 'right', className: 'label', offset: [12, 0] })
      .addTo(poiLayer);
    m.on('click', () => openPlace(p.id));
    poiMarkers.set(p.id, m);
  });
  const s = state.search;
  requestAnimationFrame(() => fitTo([...items.map((p) => [p.lat, p.lon]), [s.solution.meet.lat, s.solution.meet.lon]], { maxZoom: 17 }));
}

function highlightPoi(id, on) {
  const m = poiMarkers.get(id);
  m?.getElement()?.querySelector('.poi-pin')?.classList.toggle('hl', on);
  m?.setZIndexOffset(on ? 1000 : 0);
}

function openPlace(id) {
  const s = state.search;
  s.place = s.pois.find((p) => p.id === id);
  if (s.place) setView('place');
}

// ------------------------------------------------ place view

function renderPlace() {
  const s = state.search;
  const p = s.place;
  const ds = distancesTo(p);
  poiLayer.clearLayers();
  L.marker([p.lat, p.lon], {
    icon: L.divIcon({ className: '', html: '<div class="poi-pin hl">★</div>', iconSize: [24, 24], iconAnchor: [12, 12] }),
    zIndexOffset: 1200,
  }).bindTooltip(esc(p.name), { permanent: true, direction: 'right', className: 'label', offset: [12, 0] }).addTo(poiLayer);
  s.people.forEach((person) => {
    L.polyline([[person.lat, person.lon], [p.lat, p.lon]], { color: person.color, weight: 2, opacity: 0.7, dashArray: '4 6' }).addTo(poiLayer);
  });
  requestAnimationFrame(() => fitTo([...s.people.map((x) => [x.lat, x.lon]), [p.lat, p.lon]], { maxZoom: 16 }));

  const tags = [p.group, p.outdoor ? 'Outdoor seating' : '', p.vegan ? 'Vegan options' : p.vegetarian ? 'Vegetarian options' : '', p.wheelchair === 'yes' ? 'Step-free' : ''].filter(Boolean);
  const links = mapLinks(p);
  const website = p.website && /^https?:\/\//i.test(p.website) ? p.website : p.website ? `https://${p.website}` : '';
  return `
    <button class="back" data-action="back-group">‹ ${esc(s.group === '*' ? 'Back' : s.group)}</button>
    <h2>${esc(p.name)}</h2>
    <div class="meta">${esc(tags.join(' · '))}</div>
    <ul class="details">
      <li><span>Address</span><span>${esc(p.address || 'Not listed')} · ${fmtDist(p.fromCenter)} from the meeting point</span></li>
      ${p.hours ? `<li><span>Hours</span><span>${esc(p.hours)}</span></li>` : ''}
      ${p.phone ? `<li><span>Phone</span><a href="tel:${esc(p.phone.replace(/\s/g, ''))}">${esc(p.phone)}</a></li>` : ''}
      ${website ? `<li><span>Website</span><a href="${esc(website)}" target="_blank" rel="noopener">${esc(website.replace(/^https?:\/\//, '').replace(/\/$/, ''))}</a></li>` : ''}
    </ul>
    <h3>Getting there</h3>
    <div class="trips">${s.people.map((person, i) => tripRow(person, ds[i])).join('')}</div>
    <button class="btn btn-primary btn-block btn-lg" data-action="choose">Send location</button>
    <div class="links">
      <a class="btn-text" href="${links.googleDirections}" target="_blank" rel="noopener">Directions</a>
      <a class="btn-text" href="${links.osm}" target="_blank" rel="noopener">Open in maps</a>
    </div>`;
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
    <button class="back" data-action="${state.search?.place ? 'back-place' : 'back-people'}">‹ Back</button>
    <div class="eyebrow">Send location</div>
    <h2>${esc(p.name)}</h2>
    <div class="meta">${esc(p.address || `${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}`)}</div>
    <label class="field"><span>When <em>(optional)</em></span><input type="datetime-local" id="share-when" value="${esc(state.shareWhen || '')}"></label>
    <label class="field"><span>Message</span><textarea id="share-text">${esc(text)}</textarea></label>
    <button class="btn btn-primary btn-block btn-lg" data-action="native-share">Share</button>
    <div class="share-list">
      <button class="btn" data-action="copy">Copy</button>
      <a class="btn" href="${msg.whatsapp}" target="_blank" rel="noopener" data-share="whatsapp">WhatsApp</a>
      <a class="btn" href="${msg.sms}" data-share="sms">Messages</a>
      <a class="btn" href="${msg.email}" data-share="email">Email</a>
      <a class="btn" href="${msg.telegram}" target="_blank" rel="noopener" data-share="telegram">Telegram</a>
      <button class="btn" data-action="calendar">Calendar</button>
      <a class="btn" href="${links.google}" target="_blank" rel="noopener">Google Maps</a>
      <a class="btn" href="${links.apple}" target="_blank" rel="noopener">Apple Maps</a>
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
      case 'group': s.group = el.dataset.group; s.sort = s.sort || 'near'; setView('group'); break;
      case 'radius': {
        el.textContent = '…';
        const ctrl = new AbortController();
        searchAbort = ctrl;
        await loadPois(s, ctrl.signal, Number(el.dataset.r)).catch(() => {});
        s.poiDist.clear();
        render();
        break;
      }
      case 'surprise': {
        const pick = s.pois[Math.floor(Math.random() * s.pois.length)];
        s.tab = pick.tab; s.group = pick.group; s.place = pick;
        setView('place');
        break;
      }
      case 'replay': findPlaces({ replay: true }); break;
      case 'edit-people': cancelSearch(); break;
      case 'back-results':
        poiLayer.clearLayers();
        setView('results');
        fitTo([...s.people.map((p) => [p.lat, p.lon]), [s.solution.meet.lat, s.solution.meet.lon]], { maxZoom: 16 });
        break;
      case 'sort': s.sort = el.dataset.sort; render(); break;
      case 'place': openPlace(id); break;
      case 'back-group': setView('group'); break;
      case 'choose': enterShare(); break;
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
  if (t === 'auto') {
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.toggleAttribute('data-dark-tiles', window.matchMedia('(prefers-color-scheme: dark)').matches);
  } else {
    document.documentElement.setAttribute('data-theme', t);
    document.documentElement.removeAttribute('data-dark-tiles');
  }
}

function syncSettingsUI() {
  for (const [id, key] of [['#set-mode', 'mode'], ['#set-travel', 'travel'], ['#set-speed', 'speed'], ['#set-theme', 'theme']]) {
    for (const b of $$('.seg', $(id))) b.classList.toggle('active', b.dataset.value === state.settings[key]);
  }
  $('#mode-hint').textContent = state.settings.mode === 'fair'
    ? 'The longest trip is as short as possible.'
    : 'Everyone’s trips add up to the least travel.';
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
  if (state.search && ['results', 'group', 'place'].includes(state.view)) {
    if (patch.mode && patch.mode !== prevMode) toast('Run the search again to use this rule', { action: 'Run', onAction: () => { openDrawer(false); findPlaces(); } });
    render();
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
      icon: L.divIcon({ className: '', html: '<div class="poi-pin hl">★</div>', iconSize: [24, 24], iconAnchor: [12, 12] }),
    }).bindTooltip(esc(h.name), { permanent: true, direction: 'right', className: 'label', offset: [12, 0] }).addTo(poiLayer);
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
  onUser(await api.start());
}

window.__meet = { onUser, api };
boot();
