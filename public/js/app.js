// Midway — app controller: screens, map, panel views and the search flow.
import { api } from './api.js';
import { searchAddress, reverseGeocode, currentPosition } from './geocode.js';
import { loadNetwork } from './network.js';
import { solveMeeting, roadDistanceTo } from './meet.js';
import { GrowthAnimation } from './growth.js';
import { TABS, findPois, groupPois } from './pois.js';
import { mapLinks, shareText, messagingLinks, nativeShare, copyText, calendarInvite, download } from './share.js';

// ---------------------------------------------------------------- constants

const COLORS = ['#5b5bf0', '#ff6b6b', '#12b5a5', '#f5a524', '#d63fb0', '#2f9e44', '#1c9bd6', '#8b5cf6', '#e8590c', '#495057'];
const SPEEDS = { walk: 1.35, bike: 4.2, transit: 6.5, drive: 9.5 }; // m/s, urban averages
const TRAVEL_LABEL = { walk: 'walk', bike: 'bike', transit: 'by transit', drive: 'drive' };
const ANIM_MS = { slow: 9000, normal: 6000, fast: 3200 };
const RADII = [500, 1000, 2000, 5000];
const DEFAULT_SETTINGS = { mode: 'fair', travel: 'transit', speed: 'normal', theme: 'auto' };

// ---------------------------------------------------------------- state

const state = {
  user: null,
  places: [],
  settings: { ...DEFAULT_SETTINGS },
  view: 'people',
  search: null, // { people, graph, solution, source, reason, pois, grouped, radius, tab, group, place, area }
  editingId: null,
};

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
function fmtTravel(m) {
  return `${fmtTime(travelMinutes(m))} ${TRAVEL_LABEL[state.settings.travel]}`;
}
const initial = (name) => (name || '?').trim().charAt(0).toUpperCase() || '?';
const shortAddr = (a) => (a || '').split(', ').slice(0, 2).join(', ');

function toast(msg, { error = false, action, onAction, ms = 3800 } = {}) {
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

function personColor(index) { return COLORS[index % COLORS.length]; }

/** Everyone: you (home) first, then saved addresses. */
function everyone() {
  const list = [];
  if (state.user?.home) {
    list.push({ id: 'home', isHome: true, name: 'You', nickname: 'You', ...state.user.home, active: true, color: personColor(0) });
  }
  state.places.forEach((p, i) => list.push({
    ...p, name: p.nickname || shortAddr(p.address) || `Friend ${i + 1}`, color: personColor(i + 1),
  }));
  return list;
}
const activePeople = () => everyone().filter((p) => p.active);

// ---------------------------------------------------------------- address search widget

function attachSearch(root, { near, onPick, placeholder }) {
  const input = $('input', root);
  const list = $('.suggestions', root);
  if (placeholder) input.placeholder = placeholder;
  let items = [];
  let sel = -1;
  let timer;
  let ctrl;

  const close = () => { list.hidden = true; sel = -1; };
  const render = () => {
    list.innerHTML = items.length
      ? items.map((r, i) => `<li role="option" data-i="${i}" aria-selected="${i === sel}">
          <div class="s-title">${esc(r.title)}</div><div class="s-sub">${esc(r.subtitle)}</div></li>`).join('')
      : '<li class="s-empty">No matches — try adding a city or postcode</li>';
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
    }, 320);
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

// ---------------------------------------------------------------- auth

let authMode = 'login';
function setAuthMode(mode) {
  authMode = mode;
  for (const b of $$('[data-auth-mode]')) {
    b.classList.toggle('active', b.dataset.authMode === mode);
    b.setAttribute('aria-selected', String(b.dataset.authMode === mode));
  }
  for (const el of $$('[data-signup-only]')) el.hidden = mode !== 'signup';
  $('#auth-submit').textContent = mode === 'signup' ? 'Create account' : 'Sign in';
  $('#auth-form [name=password]').autocomplete = mode === 'signup' ? 'new-password' : 'current-password';
  $('#auth-error').hidden = true;
}

function initAuth() {
  for (const b of $$('[data-auth-mode]')) b.onclick = () => setAuthMode(b.dataset.authMode);
  $('#toggle-password').onclick = () => {
    const pw = $('#auth-form [name=password]');
    pw.type = pw.type === 'password' ? 'text' : 'password';
  };
  $('#auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const email = f.email.value.trim();
    const password = f.password.value;
    const err = $('#auth-error');
    err.hidden = true;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { err.textContent = 'Enter a valid email address'; err.hidden = false; return; }
    if (password.length < 6) { err.textContent = 'Password must be at least 6 characters'; err.hidden = false; return; }
    const btn = $('#auth-submit');
    btn.disabled = true;
    try {
      const { user } = authMode === 'signup'
        ? await api.signup(email, password, f.name.value)
        : await api.login(email, password);
      f.reset();
      onSignedIn(user);
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
      if (ex.status === 409) setTimeout(() => setAuthMode('login'), 50);
    } finally {
      btn.disabled = false;
    }
  });
}

function onSignedIn(user) {
  state.user = user;
  state.places = user.places || [];
  state.settings = { ...DEFAULT_SETTINGS, ...(user.settings || {}) };
  applyTheme();
  if (!user.home) showHomeScreen(false);
  else enterMain();
}

// ---------------------------------------------------------------- home address

function showHomeScreen(cancellable) {
  showScreen('screen-home');
  $('#home-cancel').hidden = !cancellable;
  $('.step', $('#screen-home')).hidden = cancellable;
  homeSearchCtl.clear();
  setTimeout(() => homeSearchCtl.input.focus(), 50);
}

async function saveHome(loc) {
  try {
    const { user } = await api.updateMe({ home: { address: loc.address, lat: loc.lat, lon: loc.lon } });
    state.user = user;
    toast('Home saved');
    enterMain(true);
  } catch (err) {
    toast(err.message, { error: true });
  }
}

function initHome() {
  homeSearchCtl = attachSearch($('#home-search'), { near: () => null, onPick: saveHome });
  $('#home-locate').onclick = async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = 'Locating…';
    try {
      const pos = await currentPosition();
      const loc = await reverseGeocode(pos.lat, pos.lon);
      await saveHome(loc);
    } catch (err) {
      toast(err.message, { error: true });
    } finally {
      btn.disabled = false;
      btn.textContent = '📍 Use my current location';
    }
  };
  $('#home-cancel').onclick = () => enterMain();
}

// ---------------------------------------------------------------- map

function initMap() {
  map = L.map('map', { zoomControl: false, worldCopyJump: true, preferCanvas: false });
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);
  peopleLayer = L.layerGroup().addTo(map);
  resultLayer = L.layerGroup().addTo(map);
  poiLayer = L.layerGroup().addTo(map);

  // Click the map to add an address there.
  map.on('click', async (e) => {
    if (state.view !== 'people') return;
    const { lat, lng } = e.latlng;
    const popup = L.popup({ className: 'map-popup' }).setLatLng(e.latlng)
      .setContent('<div class="muted small">Looking up address…</div>').openOn(map);
    const loc = await reverseGeocode(lat, lng);
    if (!map.hasLayer(popup)) return;
    const div = document.createElement('div');
    div.innerHTML = `<div style="font-weight:600;max-width:220px">${esc(shortAddr(loc.address))}</div>
      <button class="btn btn-primary">＋ Add this address</button>`;
    $('button', div).onclick = () => { map.closePopup(popup); addPlace({ ...loc, lat, lon: lng }); };
    popup.setContent(div);
  });
}

function pinIcon(person) {
  return L.divIcon({
    className: 'pin',
    html: `<div class="pin-dot" style="background:${person.color}"><span>${esc(initial(person.name))}</span></div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 40],
    tooltipAnchor: [0, -40],
  });
}

function drawPeople() {
  peopleLayer.clearLayers();
  for (const p of everyone()) {
    if (!p.active && state.view !== 'people') continue;
    const m = L.marker([p.lat, p.lon], { icon: pinIcon(p), draggable: state.view === 'people', opacity: p.active ? 1 : 0.45, riseOnHover: true })
      .bindTooltip(esc(p.name), { permanent: true, direction: 'top', className: 'label', offset: [0, 0] })
      .addTo(peopleLayer);
    m.on('dragend', () => moveAddress(p, m.getLatLng()));
  }
}

async function moveAddress(p, ll) {
  const loc = await reverseGeocode(ll.lat, ll.lng);
  const patch = { address: loc.address, lat: ll.lat, lon: ll.lng };
  try {
    if (p.isHome) {
      const { user } = await api.updateMe({ home: patch });
      state.user = user;
    } else {
      const { place } = await api.updatePlace(p.id, patch);
      Object.assign(state.places.find((x) => x.id === p.id), place);
    }
    toast(`Moved ${p.isHome ? 'your home' : p.name}`);
  } catch (err) { toast(err.message, { error: true }); }
  render();
}

/** Fit the map to points, leaving room for the panel. */
function fitTo(latlngs, { maxZoom = 16, animate = true } = {}) {
  if (!latlngs.length) return;
  const panel = $('#panel');
  const hidden = panel.classList.contains('away');
  let tl = [50, state.view === 'searching' ? 130 : 90], br = [50, 50];
  if (!hidden) {
    if (isMobile()) br = [40, panel.offsetHeight + 30];
    else tl = [panel.offsetWidth + 60, 90];
  }
  const b = L.latLngBounds(latlngs);
  if (latlngs.length === 1 || b.getNorthEast().equals(b.getSouthWest())) {
    map.setView(latlngs[0], Math.min(maxZoom, 15), { animate });
    return;
  }
  map.fitBounds(b, { paddingTopLeft: tl, paddingBottomRight: br, maxZoom, animate });
}

// ---------------------------------------------------------------- main screen & panel

function enterMain(recentre = false) {
  showScreen('screen-main');
  if (!map) initMap();
  setTimeout(() => {
    map.invalidateSize();
    if (recentre || !state.mapCentred) {
      map.setView([state.user.home.lat, state.user.home.lon], 14, { animate: false });
      state.mapCentred = true;
    }
  }, 0);
  setView('people');
}

function setView(view, { pop = false } = {}) {
  state.view = view;
  const panel = $('#panel');
  panel.classList.remove('away', 'mini', 'tall', 'half');
  if (view === 'searching') panel.classList.add('away');
  if (view === 'group' && isMobile()) panel.classList.add('half');
  anim?.canvas.classList.toggle('dim', ['group', 'place', 'share'].includes(view));
  if (pop) { panel.classList.remove('pop'); void panel.offsetWidth; panel.classList.add('pop'); }
  render();
}

function render() {
  const body = $('#panel-body');
  const views = { people: renderPeople, results: renderResults, group: renderGroup, place: renderPlace, share: renderShare };
  if (views[state.view]) {
    body.innerHTML = views[state.view]();
    afterRender[state.view]?.();
    body.scrollTop = 0;
  }
  drawPeople();
}

const afterRender = {};

// ------------------------------------------------ people view

function renderPeople() {
  const all = everyone();
  const active = all.filter((p) => p.active).length;
  const rows = all.map((p) => {
    const editing = state.editingId === p.id;
    return `<li class="person${p.active ? '' : ' inactive'}" data-id="${esc(p.id)}">
      <div class="avatar" style="background:${p.color};color:${p.color}"><span>${esc(initial(p.name))}</span></div>
      <div class="person-main" data-action="focus">
        <div class="person-name">${esc(p.isHome ? `You${state.user.name ? ` (${state.user.name})` : ''}` : p.name)}</div>
        <div class="person-addr" title="${esc(p.address)}">${esc(p.isHome ? `Home · ${shortAddr(p.address)}` : (p.nickname ? shortAddr(p.address) : p.address))}</div>
        ${editing ? `<form class="edit-inline" data-action="save-nick"><input name="nick" value="${esc(p.nickname || '')}" maxlength="60" placeholder="Nickname"><button class="btn btn-sm btn-primary" style="margin:0">Save</button></form>` : ''}
      </div>
      <div class="person-actions">
        ${p.isHome
          ? '<button class="icon-btn" data-action="edit-home" title="Change home address" aria-label="Change home address">✎</button>'
          : `<button class="icon-btn" data-action="edit" title="Edit nickname" aria-label="Edit nickname">✎</button>
             <button class="icon-btn" data-action="delete" title="Remove" aria-label="Remove address">🗑</button>
             <label class="switch" title="${p.active ? 'Included' : 'Not included'} in this search">
               <input type="checkbox" data-action="toggle" ${p.active ? 'checked' : ''} aria-label="Include ${esc(p.name)}"><span></span></label>`}
      </div>
    </li>`;
  }).join('');
  return `
    <div class="panel-title"><h2>Who's coming?</h2><span class="muted small">${active} of ${all.length} included</span></div>
    <ul class="people">${rows}</ul>
    <div class="add-box">
      <div class="search" id="add-search">
        <input type="search" placeholder="Add a friend's address…" autocomplete="off" aria-label="Friend's address">
        <ul class="suggestions" role="listbox" hidden></ul>
      </div>
      <div class="add-row">
        <input id="add-nick" maxlength="60" placeholder="Nickname (optional) — e.g. Sam" aria-label="Nickname">
      </div>
      <p class="hint">Tip: you can also tap anywhere on the map to add that spot, and drag pins to fine-tune.</p>
    </div>
    <div class="find-wrap">
      <button class="btn btn-primary btn-block btn-lg" data-action="find" ${active < 2 ? 'disabled' : ''}>✨ Find places</button>
      ${active < 2 ? '<p class="hint" style="text-align:center">Add at least one friend to find a meeting spot.</p>' : ''}
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

function setStatus(text, { skip = false, spinner = true, cancel = true } = {}) {
  const chip = $('#search-status');
  chip.hidden = !text;
  if (!text) return;
  $('.status-text', chip).textContent = text;
  $('.spinner', chip).hidden = !spinner;
  $('#btn-skip').hidden = !skip;
  $('#btn-cancel-search').hidden = !cancel;
  $('#btn-cancel-search').textContent = spinner ? 'Cancel' : 'Close';
}

function clearSearchVisuals() {
  anim?.destroy();
  anim = null;
  resultLayer.clearLayers();
  poiLayer.clearLayers();
}

function cancelSearch() {
  searchAbort?.abort();
  searchAbort = null;
  clearSearchVisuals();
  setStatus('');
  state.search = null;
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
      setStatus('Downloading streets…');
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

    // Start fetching places and the area name while routes animate.
    const poisPromise = prev?.pois ? Promise.resolve() : loadPois(search, ctrl.signal);
    if (!search.area) {
      reverseGeocode(solution.meet.lat, solution.meet.lon, { signal: ctrl.signal })
        .then((r) => { search.area = r.address; if (state.view === 'results') render(); })
        .catch(() => {});
    }

    anim = new GrowthAnimation(map, net.graph, solution, people.map((p) => p.color));
    setStatus('Routes branching out…', { skip: true });
    const done = await anim.play({
      duration: ANIM_MS[state.settings.speed] || ANIM_MS.normal,
      onProgress: (r) => setStatus(`Routes branching out · ${fmtDist(r)} from each address`, { skip: true }),
    });
    if (!done || ctrl.signal.aborted) return;

    L.marker([solution.meet.lat, solution.meet.lon], {
      icon: L.divIcon({ className: '', html: '<div class="meet-pin"></div>', iconSize: [26, 26], iconAnchor: [13, 13] }),
      zIndexOffset: 1000,
    }).bindTooltip('Meeting point', { permanent: true, direction: 'top', className: 'label', offset: [0, -14] }).addTo(resultLayer);

    setStatus('You meet here! Finding places nearby…');
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
    toast(err.message || 'Something went wrong', { error: true });
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
    search.poiError = 'Places could not be loaded right now.';
  }
}

/** Road distances from every person to a POI (cached). */
function distancesTo(poi) {
  const s = state.search;
  if (!s.poiDist.has(poi.id)) {
    s.poiDist.set(poi.id, s.solution.people.map((person) => roadDistanceTo(s.graph, person, poi)));
  }
  return s.poiDist.get(poi.id);
}

// ------------------------------------------------ results view

function renderResults() {
  const s = state.search;
  const { solution } = s;
  const maxReach = Math.max(...solution.people.map((p) => p.reach), 1);
  const travel = s.people.map((p, i) => {
    const d = solution.people[i].reach;
    return `<div class="travel"><span class="dot" style="background:${p.color}"></span>
      <span><b>${esc(p.name)}</b> · ${fmtDist(d)}</span><span class="muted">≈ ${fmtTravel(d)}</span>
      <span class="bar"><i style="width:${Math.max(4, (d / maxReach) * 100)}%;background:${p.color}"></i></span></div>`;
  }).join('');

  const total = s.pois.length;
  const tabs = TABS.map((t) => {
    const n = s.grouped[t.id].reduce((a, g) => a + g.items.length, 0);
    return `<button class="tab${t.id === s.tab ? ' active' : ''}" data-action="tab" data-tab="${t.id}" ${n ? '' : 'disabled'}>
      <span>${t.icon}</span>${t.label}<span class="count">${n}</span></button>`;
  }).join('');

  const groups = s.grouped[s.tab] || [];
  const tabMeta = TABS.find((t) => t.id === s.tab);
  const tabCount = groups.reduce((a, g) => a + g.items.length, 0);
  const grid = groups.length
    ? `<div class="groups">
        ${groups.length > 1 ? `<button class="group-btn all" data-action="group" data-group="*"><span>All ${esc(tabMeta.label.toLowerCase())}</span><span class="n">${tabCount}</span></button>` : ''}
        ${groups.map((g) => `<button class="group-btn" data-action="group" data-group="${esc(g.group)}"><span>${esc(g.group)}</span><span class="n">${g.items.length}</span></button>`).join('')}
      </div>`
    : `<div class="empty"><span class="big">🧭</span>${s.poiError ? esc(s.poiError) : 'Nothing found nearby.'}<br>Try a wider search radius.</div>`;

  const radiusChips = RADII.map((r) => `<button class="chip${r === s.radius ? ' active' : ''}" data-action="radius" data-r="${r}">${fmtDist(r)}</button>`).join('');

  return `
    <div class="result-head">
      <div class="meet-badge">📍</div>
      <div>
        <div class="eyebrow">${state.settings.mode === 'fair' ? 'Fairest meeting point' : 'Least total travel'}</div>
        <h2>${esc(s.area ? shortAddr(s.area) : 'Your meeting point')}</h2>
        <div class="muted small">${total} place${total === 1 ? '' : 's'} within ${fmtDist(s.radius)}</div>
      </div>
    </div>
    <div class="travel-grid">${travel}</div>
    ${s.source === 'synthetic' ? `<div class="notice">ℹ️ ${esc(s.reason)} Distances are estimates.</div>` : ''}
    <div class="tabs" role="tablist">${tabs}</div>
    ${grid}
    <div class="radius-row"><span>Search within</span><div class="chips">${radiusChips}</div></div>
    <div class="row-actions">
      <button class="btn btn-ghost" data-action="surprise" ${total ? '' : 'disabled'}>🎲 Surprise me</button>
      <button class="btn btn-ghost" data-action="replay">↻ Replay</button>
      <button class="btn btn-ghost" data-action="edit-people">✎ Edit people</button>
    </div>`;
}

// ------------------------------------------------ group (category) view

function groupItems() {
  const s = state.search;
  const groups = s.grouped[s.tab] || [];
  const items = s.group === '*' ? groups.flatMap((g) => g.items) : (groups.find((g) => g.group === s.group)?.items || []);
  const enriched = items.map((p) => {
    const ds = distancesTo(p);
    return { ...p, ds, worst: Math.max(...ds) };
  });
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
    <button class="back" data-action="back-results">‹ All categories</button>
    <div class="panel-title"><h2>${esc(title)}</h2><span class="muted small">${items.length} place${items.length === 1 ? '' : 's'}</span></div>
    <div class="sortbar">
      <button class="chip${s.sort !== 'fair' ? ' active' : ''}" data-action="sort" data-sort="near">Closest to meeting point</button>
      <button class="chip${s.sort === 'fair' ? ' active' : ''}" data-action="sort" data-sort="fair">Fairest for everyone</button>
    </div>
    <ul class="poi-list">
      ${items.map((p, i) => `<li class="poi" data-action="place" data-id="${esc(p.id)}" data-i="${i}">
        <span class="poi-num">${i + 1}</span>
        <div><div class="poi-name">${esc(p.name)}</div>
          <div class="poi-meta">${esc([s.group === '*' ? p.group : '', p.address].filter(Boolean).join(' · ') || 'Near the meeting point')}</div></div>
        <div class="poi-dist">${fmtDist(p.fromCenter)} away<br><span title="Longest trip for anyone">max ${fmtTime(travelMinutes(p.worst))}</span></div>
      </li>`).join('')}
    </ul>`;
}

afterRender.group = () => {
  for (const li of $$('.poi')) {
    li.addEventListener('mouseenter', () => highlightPoi(li.dataset.id, true));
    li.addEventListener('mouseleave', () => highlightPoi(li.dataset.id, false));
  }
};

const poiMarkers = new Map();
function drawPoiMarkers(items) {
  poiLayer.clearLayers();
  poiMarkers.clear();
  items.forEach((p, i) => {
    const m = L.marker([p.lat, p.lon], {
      icon: L.divIcon({ className: '', html: `<div class="poi-pin" data-poi="${esc(p.id)}">${i + 1}</div>`, iconSize: [28, 28], iconAnchor: [14, 14] }),
      riseOnHover: true,
    }).bindTooltip(esc(p.name), { permanent: items.length <= 25, direction: 'right', className: 'label', offset: [14, 0] })
      .addTo(poiLayer);
    m.on('click', () => openPlace(p.id));
    m.on('mouseover', () => $(`.poi[data-id="${CSS.escape(p.id)}"]`)?.classList.add('hl'));
    m.on('mouseout', () => $(`.poi[data-id="${CSS.escape(p.id)}"]`)?.classList.remove('hl'));
    poiMarkers.set(p.id, m);
  });
  const s = state.search;
  requestAnimationFrame(() => fitTo([...items.map((p) => [p.lat, p.lon]), [s.solution.meet.lat, s.solution.meet.lon]], { maxZoom: 17 }));
}

function highlightPoi(id, on) {
  const m = poiMarkers.get(id);
  const el = m?.getElement()?.querySelector('.poi-pin');
  el?.classList.toggle('hl', on);
  if (on) m?.setZIndexOffset(1000); else m?.setZIndexOffset(0);
}

function openPlace(id) {
  const s = state.search;
  s.place = s.pois.find((p) => p.id === id);
  if (!s.place) return;
  setView('place');
}

// ------------------------------------------------ place detail view

function renderPlace() {
  const s = state.search;
  const p = s.place;
  const ds = distancesTo(p);
  // Show only this place, plus dashed lines from everyone.
  poiLayer.clearLayers();
  L.marker([p.lat, p.lon], {
    icon: L.divIcon({ className: '', html: '<div class="poi-pin hl">★</div>', iconSize: [28, 28], iconAnchor: [14, 14] }),
    zIndexOffset: 1200,
  }).bindTooltip(esc(p.name), { permanent: true, direction: 'right', className: 'label', offset: [14, 0] }).addTo(poiLayer);
  s.people.forEach((person) => {
    L.polyline([[person.lat, person.lon], [p.lat, p.lon]], { color: person.color, weight: 3, opacity: 0.75, dashArray: '6 8' }).addTo(poiLayer);
  });
  requestAnimationFrame(() => fitTo([...s.people.map((x) => [x.lat, x.lon]), [p.lat, p.lon]], { maxZoom: 16 }));

  const pills = [p.group, p.cuisine && p.cuisine.toLowerCase() !== p.group.toLowerCase() ? p.cuisine.replace(/_/g, ' ').replace(/;/g, ', ') : '',
    p.outdoor ? 'Outdoor seating' : '', p.vegan ? 'Vegan options' : p.vegetarian ? 'Vegetarian options' : '',
    p.wheelchair === 'yes' ? '♿ Accessible' : ''].filter(Boolean);
  const links = mapLinks(p);
  const website = p.website && /^https?:\/\//i.test(p.website) ? p.website : p.website ? `https://${p.website}` : '';
  return `
    <button class="back" data-action="back-group">‹ ${esc(s.group === '*' ? 'Back to list' : s.group)}</button>
    <h2>${esc(p.name)}</h2>
    <div class="tagline-row">${pills.map((x) => `<span class="pill">${esc(x)}</span>`).join('')}</div>
    <ul class="detail-list">
      <li><span>📍</span><span>${esc(p.address || 'Address not listed')} · ${fmtDist(p.fromCenter)} from the meeting point</span></li>
      ${p.hours ? `<li><span>🕒</span><span>${esc(p.hours)}</span></li>` : ''}
      ${p.phone ? `<li><span>📞</span><a href="tel:${esc(p.phone.replace(/\s/g, ''))}">${esc(p.phone)}</a></li>` : ''}
      ${website ? `<li><span>🌐</span><a href="${esc(website)}" target="_blank" rel="noopener">${esc(website.replace(/^https?:\/\//, '').replace(/\/$/, ''))}</a></li>` : ''}
    </ul>
    <h3 style="margin-top:14px">Getting there</h3>
    <div class="travel-grid">
      ${s.people.map((person, i) => `<div class="travel"><span class="dot" style="background:${person.color}"></span>
        <span><b>${esc(person.name)}</b> · ${fmtDist(ds[i])}</span><span class="muted">≈ ${fmtTravel(ds[i])}</span></div>`).join('')}
    </div>
    <button class="btn btn-primary btn-block btn-lg" data-action="choose">📤 Send location</button>
    <div class="row-actions">
      <a class="btn btn-ghost" href="${links.googleDirections}" target="_blank" rel="noopener">🧭 Directions</a>
      <a class="btn btn-ghost" href="${links.osm}" target="_blank" rel="noopener">🗺 View on map</a>
    </div>`;
}

// ------------------------------------------------ share view

function shareContext() {
  const s = state.search;
  return s?.place || state.sharePlace;
}

function renderShare() {
  const p = shareContext();
  const when = state.shareWhen ? new Date(state.shareWhen) : null;
  const text = state.shareText ?? shareText(p, { when });
  state.shareText = text;
  const msg = messagingLinks(text, `Meet up at ${p.name}?`);
  const links = mapLinks(p);
  const canShare = !!navigator.share;
  return `
    <button class="back" data-action="${state.search?.place ? 'back-place' : 'back-people'}">‹ Back</button>
    <div class="eyebrow">Send location</div>
    <h2>${esc(p.name)}</h2>
    <p class="muted small" style="margin:4px 0 12px">${esc(p.address || `${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}`)}</p>
    <label class="field"><span>When? <em>(optional)</em></span><input type="datetime-local" id="share-when" value="${esc(state.shareWhen || '')}"></label>
    <label class="field"><span>Message</span><textarea id="share-text">${esc(text)}</textarea></label>
    <div class="share-grid">
      ${canShare ? '<button class="share-btn" data-action="native-share"><span class="ico">📤</span>Share…</button>' : ''}
      <a class="share-btn" href="${msg.whatsapp}" target="_blank" rel="noopener" data-share><span class="ico">💬</span>WhatsApp</a>
      <a class="share-btn" href="${msg.sms}" data-share><span class="ico">✉️</span>Messages</a>
      <a class="share-btn" href="${msg.email}" data-share><span class="ico">📧</span>Email</a>
      <a class="share-btn" href="${msg.telegram}" target="_blank" rel="noopener" data-share><span class="ico">✈️</span>Telegram</a>
      <button class="share-btn" data-action="copy"><span class="ico">📋</span>Copy</button>
      <button class="share-btn" data-action="calendar"><span class="ico">📅</span>Calendar</button>
      <a class="share-btn" href="${links.google}" target="_blank" rel="noopener"><span class="ico">🗺</span>Google Maps</a>
      <a class="share-btn" href="${links.apple}" target="_blank" rel="noopener"><span class="ico">🍎</span>Apple Maps</a>
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
  const msg = messagingLinks(state.shareText, `Meet up at ${p.name}?`);
  const map_ = { WhatsApp: msg.whatsapp, Messages: msg.sms, Email: msg.email, Telegram: msg.telegram };
  for (const a of $$('[data-share]')) {
    const label = a.textContent.trim();
    if (map_[label]) a.href = map_[label];
  }
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
    renderHistory();
  } catch { /* history is a nice-to-have */ }
}

// ------------------------------------------------ panel interactions

function initPanel() {
  const body = $('#panel-body');
  body.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const action = el.dataset.action;
    const li = el.closest('[data-id]');
    const id = li?.dataset.id;
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
        const r = Number(el.dataset.r);
        el.textContent = '…';
        const ctrl = new AbortController();
        searchAbort = ctrl;
        await loadPois(s, ctrl.signal, r).catch(() => {});
        s.poiDist.clear();
        render();
        break;
      }
      case 'surprise': {
        const pool = s.pois;
        const pick = pool[Math.floor(Math.random() * pool.length)];
        s.tab = pick.tab; s.group = pick.group; s.place = pick;
        setView('place');
        toast(`How about ${pick.name}?`);
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
        if (!ok && await copyText(state.shareText)) toast('Copied to clipboard');
        break;
      }
      case 'copy': if (await copyText(state.shareText)) toast('Copied — paste it to your group chat'); break;
      case 'calendar': {
        const p = shareContext();
        const start = state.shareWhen ? new Date(state.shareWhen) : nextHalfHour();
        download(`meetup-${p.name.replace(/[^\w]+/g, '-').toLowerCase()}.ics`, calendarInvite(p, start));
        if (!state.shareWhen) toast('Invite set for the next half hour — edit it in your calendar');
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

  $('#panel-handle').onclick = () => {
    const panel = $('#panel');
    if (panel.classList.contains('mini')) panel.classList.remove('mini');
    else if (panel.classList.contains('half')) { panel.classList.remove('half'); panel.classList.add('tall'); }
    else panel.classList.add('mini');
  };
  $('#btn-skip').onclick = () => anim?.skip();
  $('#btn-cancel-search').onclick = cancelSearch;
  $('#btn-recenter').onclick = () => {
    const pts = state.search ? state.search.people : activePeople();
    if (state.view === 'people' && pts.length < 2) map.flyTo([state.user.home.lat, state.user.home.lon], 15, { duration: 0.6 });
    else fitTo(pts.map((p) => [p.lat, p.lon]), { maxZoom: 16 });
  };
}

function nextHalfHour() {
  const d = new Date();
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0);
  return d;
}

// ---------------------------------------------------------------- drawer / settings

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
    ? 'Picks the spot where the longest trip is as short as possible — nobody gets stuck with a trek.'
    : 'Picks the spot where everyone’s trips add up to the least travel overall.';
}

function renderHistory() {
  const list = $('#history-list');
  const h = state.user?.history || [];
  list.innerHTML = h.length
    ? h.map((x) => `<li data-hid="${esc(x.id)}"><div><div class="h-name">${esc(x.name)}</div>
        <div class="h-sub">${esc([x.category, new Date(x.at).toLocaleDateString()].filter(Boolean).join(' · '))}${x.people?.length ? ` · ${esc(x.people.join(', '))}` : ''}</div></div>
        <button class="icon-btn" data-del="${esc(x.id)}" aria-label="Remove">✕</button></li>`).join('')
    : '<li class="muted small" style="background:none;cursor:default;padding:0">Places you send will show up here.</li>';
}

function openDrawer(open) {
  $('#drawer').hidden = !open;
  $('#drawer-backdrop').hidden = !open;
  if (open) {
    $('#drawer-name').textContent = state.user.name || 'Your account';
    $('#drawer-email').textContent = state.user.email;
    $('#drawer-home').textContent = state.user.home?.address || 'Not set';
    syncSettingsUI();
    renderHistory();
  }
}

async function saveSettings(patch) {
  const prevMode = state.settings.mode;
  state.settings = { ...state.settings, ...patch };
  applyTheme();
  syncSettingsUI();
  if (state.search && ['results', 'group', 'place'].includes(state.view)) {
    if (patch.mode && patch.mode !== prevMode) toast('Meeting rule changed — run Find places again to use it', { action: 'Run now', onAction: () => { openDrawer(false); findPlaces(); } });
    render();
  }
  try { await api.updateMe({ settings: state.settings }); } catch { /* keep local */ }
}

function initDrawer() {
  $('#btn-menu').onclick = () => openDrawer(true);
  $('#drawer-close').onclick = () => openDrawer(false);
  $('#drawer-backdrop').onclick = () => openDrawer(false);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#drawer').hidden) openDrawer(false); });
  for (const [id, key] of [['#set-mode', 'mode'], ['#set-travel', 'travel'], ['#set-speed', 'speed'], ['#set-theme', 'theme']]) {
    $(id).addEventListener('click', (e) => {
      const b = e.target.closest('.seg');
      if (b) saveSettings({ [key]: b.dataset.value });
    });
  }
  $('#btn-edit-home').onclick = () => { openDrawer(false); showHomeScreen(true); };
  $('#btn-logout').onclick = async () => {
    try { await api.logout(); } catch { /* ignore */ }
    openDrawer(false);
    searchAbort?.abort();
    clearSearchVisuals();
    setStatus('');
    Object.assign(state, { user: null, places: [], search: null, mapCentred: false, view: 'people' });
    showScreen('screen-auth');
    setAuthMode('login');
  };
  $('#history-list').addEventListener('click', async (e) => {
    const del = e.target.closest('[data-del]');
    if (del) {
      e.stopPropagation();
      const id = del.dataset.del;
      state.user.history = state.user.history.filter((h) => h.id !== id);
      renderHistory();
      api.deleteHistory(id).catch(() => {});
      return;
    }
    const li = e.target.closest('[data-hid]');
    if (!li) return;
    const h = state.user.history.find((x) => x.id === li.dataset.hid);
    openDrawer(false);
    searchAbort?.abort();
    clearSearchVisuals();
    state.search = null;
    state.sharePlace = h;
    state.shareText = null;
    state.shareWhen = '';
    L.marker([h.lat, h.lon], {
      icon: L.divIcon({ className: '', html: '<div class="poi-pin hl">★</div>', iconSize: [28, 28], iconAnchor: [14, 14] }),
    }).bindTooltip(esc(h.name), { permanent: true, direction: 'right', className: 'label', offset: [14, 0] }).addTo(poiLayer);
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
  initDrawer();
  window.addEventListener('resize', () => map?.invalidateSize());
  try {
    const { user } = await api.me();
    if (!user) throw new Error('signed out');
    onSignedIn(user);
  } catch {
    showScreen('screen-auth');
    setAuthMode('login');
  }
}

boot();
