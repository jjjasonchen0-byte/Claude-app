// Meet — app controller: start screen, map, panel views, search flow and
// the draggable bottom sheet on phones.
import { api } from './api.js';
import { searchAddress, reverseGeocode, currentPosition } from './geocode.js';
import { findMeetingPoint, estimateSeconds, SPEEDS } from './meetpoint.js';
import { FloodAnimation, LINE_STYLE, prepareNetwork } from './flood.js';
import { createLocalRouter } from './localroute.js';
import { loadRoads } from './roads.js';
import { TABS, findPois, groupPois, summaryOf, cuisineLabels } from './pois.js';
import { KIND_GLYPHS, groupIcon, placeIcon } from './kinds.js';
import { getConfig, ratingsSource, rateAll, thumbFor, detailsFor } from './rated.js';
import { openStatus, weekTable } from './hours.js';
import { haversine } from './geo.js';
import { pickAnchor } from './anchor.js';
import { loadPlacesKit, placeIdFor, rowPhoto, placeCard, samePlace } from './placeskit.js';
import { mapLinks, shareText, messagingLinks, nativeShare, copyText, calendarInvite, download } from './share.js';
import { MODES, ATTRIBUTION, getDirections, getTravelTimes, getCheckTimes, getTransitReach, useGoogle, usingGoogle, navLinks, vehicleName, isWalkLeg } from './directions.js';

// ---------------------------------------------------------------- constants

const COLORS = ['#007aff', '#ff9500', '#34c759', '#af52de', '#ff3b30', '#30b0c7', '#5856d6', '#ff2d55', '#a2845e', '#8e8e93'];
const PACE = { slow: 1.45, normal: 1, fast: 0.6 }; // how long the search animation takes
// How far around the meeting point to look for places (metres): the slider's ends and steps, and where it starts.
const RADIUS = { min: 100, max: 1000, step: 10, start: 800 };
const PRICE = { 'Cheap Eats': '£', 'Mid Range': '££', 'Fine Dining': '£££' };
const DEFAULT_SETTINGS = { mode: 'similar', travel: 'transit', speed: 'normal', theme: 'auto' };
const SHEET_DEFAULT = { people: 'mid', results: 'mid', group: 'mid', place: 'mid', share: 'full' };

// Category icons: Settings-style coloured tiles with simple line glyphs.
const TAB_COLOR = { food: '#ff9500', drinks: '#a2845e', fun: '#5856d6', culture: '#af52de', outdoors: '#34c759', shopping: '#007aff', meet: '#007aff' };
const GLYPH = {
  person: '<circle cx="12" cy="8" r="3.6"/><path d="M5 20.5c0-4 3.1-6.8 7-6.8s7 2.8 7 6.8"/>',
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
  send: '<path d="M21 3L10.5 13.5M21 3l-6.5 18-4-7.5L3 9.5z"/>', // a paper aeroplane
  route: '<circle cx="6" cy="18" r="2.2"/><circle cx="18" cy="6" r="2.2"/><path d="M8 18h6.5a3.5 3.5 0 0 0 0-7h-5a3.5 3.5 0 0 1 0-7H16"/>',
  menu: '<path d="M6 3.5h12v17H6zM9 8h6M9 12h6M9 16h4"/>',
  photo: '<rect x="3.5" y="5.5" width="17" height="13" rx="2.5"/><circle cx="9" cy="10.5" r="1.8"/><path d="M20.5 15.5l-5-5-8.5 8"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
};
/** A heart: filled for an address kept on this device. */
const heart = (on, size = 20) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="${on ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true">${GLYPH.heart}</svg>`;
GLYPH.meet = GLYPH.pin;
for (const [k, v] of Object.entries(KIND_GLYPHS)) GLYPH[k] ??= v; // (each kind of place: Fast food, Bakeries, Pubs…)
const glyph = (id, size = 16, width = 2.2) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${GLYPH[id]}</svg>`;
const tile = (id, size = '', c = TAB_COLOR[id]) => `<span class="tile ${size}${id === 'all' ? ' grey' : ''}" style="--c:${c || '#8e8e93'}">${glyph(id)}</span>`;
/** A listing's tile: its own drawing (a croissant for Bakeries, a beer for Pubs) in its tab's colour. */
const groupTile = (tab, group, size = '') => tile(groupIcon(tab, group) || tab, size, TAB_COLOR[tab]);
/** What a place is, drawn: its listing's drawing, or the pin for the meeting point. */
const placeGlyph = (p) => (p.tab === 'meet' ? 'pin' : placeIcon(p) || p.tab);
const CHEV = '<svg class="chev" viewBox="0 0 8 14" width="8" height="14" aria-hidden="true"><path d="M1.5 1.5L6.5 7l-5 5.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const backBtn = (action, label) => `<button class="back" data-action="${action}">${CHEV}<span>${esc(label)}</span></button>`;

// ---------------------------------------------------------------- state

const state = {
  user: null,
  places: [],
  saved: [], // addresses kept with the heart
  addDraft: null, // someone being added: { loc: the address picked, text: what's in the box, nick }
  settings: { ...DEFAULT_SETTINGS },
  view: 'people',
  search: null,
  open: null, // the person whose row is open (their name and address in full)
  edit: null, // someone's name or address being changed in their open row: { id, field: 'name' | 'address', nick, text, loc }
  pop: null, // the person whose heart is popping (their address just kept)
  leaveAt: '', // when everyone leaves: '' for now, or a local date and time ("2026-11-14T09:00")
};
// On a phone: the size the sheet is at (snap), its height in pixels (target), and the size it
// was last pulled to (chosen), which each page then opens at.
const sheet = { snap: 'mid', target: 0, chosen: null };

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
    b.onclick = () => { onAction?.(); dismissToast(el); };
    el.appendChild(b);
  }
  $('#toasts').appendChild(el);
  setTimeout(() => dismissToast(el), ms);
}
const dismissToast = (el) => leave(el, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(0.94)' }], { duration: 200, remove: true });

/** Said once if this browser won't let Meet save (private browsing, storage blocked or full). */
let warnedUnsaved = false;
function warnIfUnsaved() {
  if (warnedUnsaved || api.saved()) return;
  warnedUnsaved = true;
  toast('Can’t save in this browser. Turn off private browsing to keep your list.', { ms: 7000 });
}

function showScreen(id) {
  for (const s of $$('.screen')) {
    if (s.id === id) { stay(s); s.style.zIndex = ''; s.hidden = false; continue; }
    if (s.hidden) continue;
    // The screen left fades away over the next one (the start screen opening up as it goes), rather than vanishing.
    s.style.zIndex = '5';
    leave(s, s.id === 'screen-home' ? [{ opacity: 1 }, { opacity: 0, transform: 'scale(1.06)' }] : [{ opacity: 1 }, { opacity: 0 }], {
      duration: 420, easing: 'cubic-bezier(0.32, 0.72, 0, 1)', hide: true, then: () => { s.style.zIndex = ''; },
    });
  }
}

/** A person's way of travelling: their own if it is one the app knows, otherwise the default. */
const modeOf = (p) => (MODES.some((m) => m.id === p.mode) ? p.mode : state.settings.travel);

/** Everyone: you first, then saved addresses. */
function everyone() {
  const list = [];
  if (state.user?.home) list.push({ id: 'home', isHome: true, name: 'You', ...state.user.home, mode: modeOf(state.user.home), active: true, color: COLORS[0] });
  state.places.forEach((p, i) => list.push({
    ...p, mode: modeOf(p), name: p.nickname || shortAddr(p.address) || `Friend ${i + 1}`, color: COLORS[1 + (i % (COLORS.length - 1))], // never your blue
  }));
  return list;
}
const activePeople = () => everyone().filter((p) => p.active);

// ---------------------------------------------------------------- address search widget

// The list of suggestions now open, if any: it is fitted again when the part of
// the page in sight changes (an on-screen keyboard opening, a turned phone).
let fitSuggestions = null;
for (const target of [window, window.visualViewport]) {
  for (const type of ['resize', 'scroll']) target?.addEventListener(type, () => fitSuggestions?.());
}

/**
 * A phone's on-screen keyboard: the browser shows less of the page and
 * slides it up to keep the box being typed in clear of the keyboard, which
 * can take that box (and everything else) out of sight. While a keyboard is
 * open the screens fit the part of the page still in sight instead (see
 * .screen in styles.css), and the sheet, the box and its suggestions are
 * placed again. A pinch-zoom (which also shows less of the page) is left alone.
 */
function followKeyboard() {
  const vv = window.visualViewport;
  if (!vv) return;
  const root = document.documentElement;
  const NOT_TYPED = ['checkbox', 'radio', 'range', 'button', 'submit', 'color', 'file', 'date', 'time', 'datetime-local'];
  let open = false;
  const update = () => {
    const el = document.activeElement;
    const typing = !!el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !NOT_TYPED.includes(el.type)));
    const now = typing && vv.scale < 1.05 && window.innerHeight - vv.height > 120;
    if (now) {
      root.style.setProperty('--vv-top', `${Math.max(0, Math.round(vv.offsetTop))}px`);
      root.style.setProperty('--vv-height', `${Math.round(vv.height)}px`);
    } else if (open) {
      root.style.removeProperty('--vv-top');
      root.style.removeProperty('--vv-height');
    }
    root.classList.toggle('keyboard', now);
    if (!now && !open) return;
    open = now;
    // What sits in the screens follows: the sheet's height, the box at its top, the suggestions under it.
    if (map && !$('#screen-main').hidden) { setSheet(sheet.snap); typingBoxToTop(); }
    fitSuggestions?.();
  };
  vv.addEventListener('resize', update);
  vv.addEventListener('scroll', update);
  document.addEventListener('focusin', () => setTimeout(update, 0));
  document.addEventListener('focusout', () => setTimeout(update, 60));
}

/**
 * An iPhone or iPad zooms the page in when a box with small text is tapped,
 * and leaves it zoomed. Every box's text is big enough on a touch screen
 * (styles.css), and on these the page is also told not to zoom for typing:
 * Safari still lets a person pinch to zoom whatever it is told.
 */
function noZoomForTyping() {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const meta = document.querySelector('meta[name=viewport]');
  if (ios && meta && !/maximum-scale/.test(meta.content)) meta.content += ', maximum-scale=1';
}

/** "Sam · 12 King St, Newtown" for an address kept with the heart. */
const savedTitle = (s) => s.nickname || shortAddr(s.address);
/** The saved address at the same spot as this one, if it is kept. */
const savedMatch = (loc) => (loc ? state.saved.find((s) => s.address === loc.address || haversine(s.lat, s.lon, loc.lat, loc.lon) < 15) : null);

/**
 * An address box with suggestions as you type. With `saved`, the addresses
 * kept with the heart come first: all of them in an empty box, the ones
 * whose name or address has what's typed so far after that (`onUnsave(id)`
 * forgets one from the list).
 */
function attachSearch(root, { near, onPick, saved = null, onUnsave = null }) {
  const input = $('input', root);
  const list = $('.suggestions', root);
  let items = [];
  let sel = -1;
  let timer;
  let ctrl;
  let failed = false; // (the last lookup didn't get through)
  const looking = (on) => root.classList.toggle('searching', on);
  /** Saved addresses with these words in their name or address, as suggestions. */
  const savedFor = (q, max) => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return (saved?.() || [])
      .filter((s) => words.every((w) => `${s.nickname || ''} ${s.address}`.toLowerCase().includes(w)))
      .slice(0, max)
      .map((s) => ({ ...s, title: savedTitle(s), subtitle: s.address, saved: true }));
  };
  /** In a box with less than a word in it: the saved addresses (if any), or nothing. */
  const showSaved = () => {
    const q = input.value;
    if (q.trim().length >= 3) return false;
    items = savedFor(q, 8);
    sel = -1;
    if (items.length && document.activeElement === input) render(); else close();
    return true;
  };

  /**
   * Put the list where it can be seen: below the box when there is room
   * there, above it when there isn't (an on-screen keyboard covers the lower
   * part of a phone's screen), and no taller than the room it has.
   */
  const fit = () => {
    if (list.hidden || !list.isConnected) { if (fitSuggestions === fit) fitSuggestions = null; return; }
    const vv = window.visualViewport;
    let top = vv ? vv.offsetTop : 0, bottom = top + (vv ? vv.height : window.innerHeight);
    const panelBody = root.closest('#panel-body'); // in the panel, the list is cut off at the panel's edges
    if (panelBody) {
      const c = panelBody.getBoundingClientRect();
      top = Math.max(top, c.top + ($('#panel-handle')?.offsetHeight || 0)); // (not up under the pull tab)
      bottom = Math.min(bottom, c.bottom);
    }
    const r = input.getBoundingClientRect();
    const below = bottom - r.bottom - 12, above = r.top - top - 12;
    const up = below < 170 && above > below;
    list.classList.toggle('up', up);
    list.style.maxHeight = `${Math.round(Math.max(96, Math.min(300, up ? above : below)))}px`;
  };
  const close = () => { list.hidden = true; sel = -1; if (fitSuggestions === fit) fitSuggestions = null; };
  // A lookup still on its way is dropped when something newer happens (typing on, picking, clearing).
  const stop = () => { clearTimeout(timer); ctrl?.abort(); ctrl = null; looking(false); };
  const render = () => {
    list.innerHTML = items.length
      ? items.map((r, i) => `<li role="option" data-i="${i}" aria-selected="${i === sel}"${r.saved ? ' class="saved"' : ''}>
          ${r.saved ? `<span class="s-heart">${heart(true, 16)}</span>` : ''}
          <div class="s-text"><div class="s-title">${esc(r.title)}</div><div class="s-sub">${esc(r.subtitle)}</div></div>
          ${r.saved && onUnsave ? `<button type="button" class="s-forget" data-forget="${esc(r.id)}" aria-label="Forget ${esc(r.title)}" title="Forget this address">${glyph('close', 11, 2.6)}</button>` : ''}
        </li>`).join('')
      : failed ? '<li class="s-empty failed">Address search didn’t load. Check your connection, then type again.</li>'
        : '<li class="s-empty">No matches. Try adding a town or postcode.</li>';
    list.hidden = false;
    fitSuggestions = fit;
    fit();
  };
  const pick = (i) => {
    const r = items[i];
    if (!r) return;
    stop();
    close();
    input.value = r.address;
    onPick(r);
  };
  input.addEventListener('focus', showSaved);
  input.addEventListener('input', () => {
    stop();
    const q = input.value;
    if (showSaved()) return;
    // Straight away: the saved addresses that match (the list shown a moment ago no longer does).
    items = savedFor(q, 3);
    sel = items.length ? 0 : -1;
    if (items.length && document.activeElement === input) render(); else close();
    looking(true);
    timer = setTimeout(async () => {
      const mine = ctrl = new AbortController();
      try {
        const found = await searchAddress(q, { near: near?.(), signal: mine.signal });
        if (mine.signal.aborted) return;
        failed = false;
        items = [...savedFor(q, 3), ...found];
        sel = items.length ? 0 : -1;
        if (document.activeElement === input) render();
      } catch (err) {
        if (!mine.signal.aborted) { failed = true; items = savedFor(q, 3); if (document.activeElement === input) render(); }
      } finally {
        if (ctrl === mine) { ctrl = null; looking(false); }
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
    const forget = e.target.closest('[data-forget]');
    if (forget) {
      // Forgetting a saved address: it goes from the list, which stays open (as does the keyboard).
      e.preventDefault();
      onUnsave?.(forget.dataset.forget);
      items = items.filter((x) => !(x.saved && x.id === forget.dataset.forget));
      sel = Math.min(sel, items.length - 1);
      if (items.length) render(); else close();
      return;
    }
    const li = e.target.closest('li[data-i]');
    if (li) { e.preventDefault(); pick(Number(li.dataset.i)); }
  });
  return { input, fit, clear: () => { stop(); input.value = ''; close(); } };
}

// ---------------------------------------------------------------- what is saved on this device

function onUser(user) {
  state.user = user;
  state.places = user.places || [];
  state.saved = user.saved || [];
  state.settings = { ...DEFAULT_SETTINGS, ...(user.settings || {}) };
  state.settings.mode = 'similar'; // the meeting point is always the fairest: everyone's trip about as long (no other choice)
  if (!MODES.some((m) => m.id === state.settings.travel)) state.settings.travel = DEFAULT_SETTINGS.travel;
  if (!PACE[state.settings.speed]) state.settings.speed = DEFAULT_SETTINGS.speed;
  if (!['auto', 'light', 'dark'].includes(state.settings.theme)) state.settings.theme = DEFAULT_SETTINGS.theme;
  applyTheme();
  if (!user.home) showHomeScreen(false);
  else enterMain();
}

// ---------------------------------------------------------------- start screen (your address)

function showHomeScreen(cancellable, { focus = true } = {}) {
  showScreen('screen-home');
  $('#home-cancel').hidden = !cancellable;
  homeSearchCtl.clear();
  $('#screen-home').classList.remove('typing');
  // With a keyboard and mouse the cursor goes straight into the box. On a touch
  // screen it waits for a tap (the on-screen keyboard would cover half the page unasked).
  // (Not when just going back there with the wordmark: the saved addresses it opens would cover Cancel.)
  if (focus && window.matchMedia('(hover: hover) and (pointer: fine)').matches) setTimeout(() => homeSearchCtl.input.focus(), 50);
}

async function saveHome(loc) {
  try {
    const { user } = await api.updateMe({ home: { address: loc.address, lat: loc.lat, lon: loc.lon, mode: state.user?.home?.mode || state.settings.travel } });
    state.user = user;
    // Anything found for the old starting point (a search under way, results, routes) no longer applies.
    if (map) cancelSearchQuietly();
    state.sharePlace = null;
    enterMain(true);
    warnIfUnsaved();
  } catch (err) {
    toast(err.message, { error: true });
  }
}

function initHome() {
  homeSearchCtl = attachSearch($('#home-search'), { near: () => null, onPick: saveHome, saved: () => state.saved, onUnsave: forgetAddress });
  // On a small screen the logo and box move to the top while typing: the
  // suggestions then open in the part of the screen the keyboard leaves free.
  const home = $('#screen-home'), box = homeSearchCtl.input;
  box.addEventListener('focus', () => {
    home.classList.toggle('typing', window.matchMedia('(max-width: 759px), (max-height: 620px)').matches);
    homeSearchCtl.fit();
  });
  box.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== box && !box.value.trim()) home.classList.remove('typing'); }, 200));
  // The arrow in the address bar: start from where you are.
  $('#home-locate').onclick = async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.classList.add('busy');
    try {
      const pos = await currentPosition();
      await saveHome(await reverseGeocode(pos.lat, pos.lon));
    } catch (err) {
      toast(err.message, { error: true });
    } finally {
      btn.disabled = false;
      btn.classList.remove('busy');
    }
  };
  // Cancel: back to the map exactly as it was (results and all).
  $('#home-cancel').onclick = () => { showScreen('screen-main'); map?.invalidateSize(); };
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
// With a Google key on the server: Google's map, quietly styled (Google's
// terms allow its directions only on its own map). Tiles come through the
// server, which keeps the key. Google's name and its map credits for the
// area in view sit top right, apart from the other credits.
let googleCredit = null; // { el, update }: Google's name and map credits, top right
let googleOff = false; // Google's map stopped answering (say, today's allowance ran out): the free map for the rest of this visit
const OSM_DATA_CREDIT = `Places, addresses and the search animation's streets ${OSM_ATTR} contributors`;
function addGoogleBasemap(want) {
  const style = `${want}${(window.devicePixelRatio || 1) > 1.3 ? '2x' : ''}`;
  const id = `google|${style}`;
  if (baseLayer?.meetId === id) return;
  baseLayer?.remove();
  const layer = baseLayer = L.tileLayer(`/api/gmap/${style}/{z}/{x}/{y}`, { maxZoom: 21 });
  baseLayer.meetId = id;
  // Tiles that keep failing (the day's allowance used up, or Google unreachable)
  // would leave a blank map: the free map takes over instead.
  let failed = 0;
  layer.on('tileload', () => { failed = 0; });
  layer.on('tileerror', () => { if (++failed >= 6 && baseLayer === layer) leaveGoogle(); });
  baseLayer.addTo(map).bringToBack();
  if (!usingGoogle()) {
    useGoogle(true);
    map.attributionControl.removeAttribution(ROUTES_CREDIT);
    map.attributionControl.addAttribution(OSM_DATA_CREDIT);
  }
  if (!googleCredit) {
    const el = Object.assign(document.createElement('div'), { className: 'gmap-credit', innerHTML: '<b>Google Maps</b><span></span>' });
    $('#screen-main').append(el);
    let timer = 0, last = '';
    const update = () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        if (!googleCredit || !String(baseLayer?.meetId).startsWith('google|')) return;
        const b = map.getBounds();
        const q = new URLSearchParams({ zoom: Math.round(map.getZoom()), north: b.getNorth().toFixed(3), south: b.getSouth().toFixed(3), east: b.getEast().toFixed(3), west: b.getWest().toFixed(3) });
        const url = `/api/gmap/${baseLayer.meetId.split('|')[1]}/viewport?${q}`;
        if (url === last) return;
        last = url;
        try {
          const r = await fetch(url);
          if (r.ok) $('span', el).textContent = (await r.json()).copyright || '';
        } catch { /* keep the last credits */ }
      }, 400);
    };
    googleCredit = { el, update };
    map.on('moveend', update);
    update();
  }
}

/** Back to the free map and the free routing services (Google's directions only go with Google's map). */
function leaveGoogle() {
  googleOff = true;
  useGoogle(false);
  if (googleCredit) { map.off('moveend', googleCredit.update); googleCredit.el.remove(); googleCredit = null; }
  map.attributionControl.removeAttribution(OSM_DATA_CREDIT);
  map.attributionControl.addAttribution(ROUTES_CREDIT);
  addFreeBasemap(isDark() ? 'dark' : 'light');
}

function addBasemap() {
  const want = isDark() ? 'dark' : 'light';
  getConfig().then((c) => (c.google && !googleOff ? addGoogleBasemap(want) : addFreeBasemap(want)));
}

function addFreeBasemap(want) {
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

// (The routing service asks apps to credit it and to link to "fix the map".)
const ROUTES_CREDIT = `Routes <a href="${ATTRIBUTION.routing.url}" target="_blank" rel="noopener">FOSSGIS OSRM</a> (<a href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noopener">fix the map</a>) · Public transport <a href="${ATTRIBUTION.transit.url}" target="_blank" rel="noopener">Transitous</a>`;

/**
 * The map's credits, as OpenStreetMap's licence asks (and its guidelines
 * allow): shown in full when the map appears, then folded into a small (i) in
 * the corner after five seconds, or as soon as the map is touched. The (i)
 * shows them again, and they fold the same way.
 */
function foldingCredits() {
  const credits = map.attributionControl.getContainer();
  const Info = L.Control.extend({
    options: { position: 'bottomright' },
    onAdd() {
      const b = L.DomUtil.create('button', 'credits-btn');
      b.type = 'button';
      b.title = 'Map credits';
      b.setAttribute('aria-label', 'Map credits');
      b.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 11.2v5.3M12 7.8h.01"/></svg>';
      L.DomEvent.disableClickPropagation(b);
      L.DomEvent.on(b, 'click', () => show());
      return b;
    },
  });
  const btn = new Info().addTo(map).getContainer();
  let timer = 0;
  const fold = () => {
    clearTimeout(timer);
    credits.classList.add('folded');
    btn.classList.add('shown');
  };
  const show = () => {
    credits.classList.remove('folded');
    btn.classList.remove('shown');
    clearTimeout(timer);
    timer = setTimeout(fold, 5000);
  };
  // Touching the map (to move it, zoom or tap it) folds them; touching the credits themselves (their links) doesn't.
  const touched = (e) => { if (!credits.classList.contains('folded') && !e.target.closest?.('.leaflet-control')) fold(); };
  map.getContainer().addEventListener('pointerdown', touched, true);
  map.getContainer().addEventListener('wheel', touched, { capture: true, passive: true });
  show();
}

function initMap() {
  map = L.map('map', { zoomControl: false, worldCopyJump: true });
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  addBasemap();
  map.attributionControl.setPrefix(false);
  map.attributionControl.addAttribution(ROUTES_CREDIT);
  foldingCredits();
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
    if (state.view !== 'people') { map.closePopup(popup); return; }
    const div = document.createElement('div');
    div.innerHTML = `<div style="font-weight:600;max-width:220px">${esc(shortAddr(loc.address))}</div>
      <button class="btn btn-primary">Use this address</button>`;
    // Into the form, like a picked suggestion: their name next, then Add (or the heart).
    $('button', div).onclick = () => { map.closePopup(popup); chooseAddress({ ...loc, lat, lon: lng }); };
    popup.setContent(div);
  });
}

function pinIcon(person) {
  // (Someone without a name: a person, not the first figure of their street address.)
  const face = person.isHome || person.nickname ? esc(initial(person.name)) : glyph('person', 18, 2.4);
  return L.divIcon({
    className: '',
    html: `<div class="avatar-pin" style="--c:${person.color}">${face}</div>`,
    iconSize: [38, 47],
    iconAnchor: [19, 47],
  });
}

function drawPeople() {
  peopleLayer.clearLayers();
  for (const p of everyone()) {
    if (!p.active && state.view !== 'people') continue;
    // Names sit above the pins (someone added without a name gets none). Addresses aren't
    // shown on the map: tapping someone's pin shows theirs.
    const named = p.isHome || p.nickname;
    const m = L.marker([p.lat, p.lon], { icon: pinIcon(p), draggable: state.view === 'people', opacity: p.active ? 1 : 0.4, riseOnHover: true })
      .bindPopup(`<div class="pin-pop">${named ? `<b>${esc(p.name)}</b>` : ''}<span>${esc(p.address)}</span></div>`, { className: 'map-popup', offset: [0, -40], closeButton: false, autoPan: false })
      .addTo(peopleLayer);
    if (named) m.bindTooltip(esc(p.name), { permanent: true, direction: 'top', className: 'label', offset: [0, -48] });
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
      const mine = state.places.find((x) => x.id === p.id);
      if (mine) Object.assign(mine, place);
    }
    toast(`Moved ${p.isHome ? 'your starting point' : p.name}`);
  } catch (err) { toast(err.message, { error: true }); }
  render();
}

/**
 * The map's margins (top left, bottom right) left clear of the panel and the
 * headings: [x, y] pixels each. `cover`: how far the panel itself reaches in
 * from the left (beside the map) or up from the bottom (a phone's sheet).
 */
function mapPadding() {
  const panel = $('#panel');
  const hidden = panel.classList.contains('away');
  // Room at the top for people's name tags (above their pins), clear of the top bar and, while
  // searching, the heading; while searching the status sits at the bottom.
  const searching = state.view === 'searching';
  let tl = [40, 130], br = [40, searching ? 120 : 40];
  const cover = { left: 0, bottom: 0 };
  if (!hidden) {
    if (isMobile()) { cover.bottom = sheet.target || panel.offsetHeight; br = [30, cover.bottom + 24]; }
    else { cover.left = panel.offsetLeft + panel.offsetWidth; tl = [panel.offsetWidth + 50, 130]; }
  }
  return { tl, br, cover };
}

/** Fit the map to points, leaving room for the panel. With `fly`, the map glides there (more slowly). */
function fitTo(latlngs, { maxZoom = 16, animate = true, fly = false } = {}) {
  if (!latlngs.length) return;
  const { tl, br } = mapPadding();
  const b = L.latLngBounds(latlngs);
  if (latlngs.length === 1 || b.getNorthEast().equals(b.getSouthWest())) {
    if (fly) map.flyTo(latlngs[0], Math.min(maxZoom, 15), { duration: 0.8 });
    else map.setView(latlngs[0], Math.min(maxZoom, 15), { animate });
    return;
  }
  if (fly) map.flyToBounds(b, { paddingTopLeft: tl, paddingBottomRight: br, maxZoom, duration: 0.8 });
  else map.fitBounds(b, { paddingTopLeft: tl, paddingBottomRight: br, maxZoom, animate });
}

/**
 * Are these points all in sight beside (or above) the panel and clear of the
 * headings? With `share` under 1, only that much of each margin needs to be
 * clear (never any of the panel's own room), so the map moves only for
 * someone at the very edge or beyond it. Or with `margins`: [left, top,
 * right, bottom] pixels.
 */
function inSight(latlngs, { share = 1, margins = null } = {}) {
  let left, top, right, bottom;
  if (margins) [left, top, right, bottom] = margins;
  else {
    const { tl, br, cover } = mapPadding();
    left = Math.max(tl[0] * share, cover.left ? cover.left + 8 : 0);
    top = tl[1] * share;
    right = br[0] * share;
    bottom = Math.max(br[1] * share, cover.bottom ? cover.bottom + 8 : 0);
  }
  const size = map.getSize();
  return latlngs.every((ll) => {
    const p = map.latLngToContainerPoint(ll);
    return p.x >= left && p.y >= top && p.x <= size.x - right && p.y <= size.y - bottom;
  });
}
// While searching (the panel away): on the screen, and their name tag not up under the heading.
// Anyone the map was fitted to before (see mapPadding) is inside these.
const SEARCH_MARGINS = [20, 120, 20, 30];

/**
 * Before the search animation: the map stays just as it is when everyone is
 * in sight, and otherwise glides to them. (The animation is drawn for one
 * view of the map, so it starts once the map has settled.)
 */
function bringIntoSight(latlngs, signal) {
  if (inSight(latlngs, { margins: SEARCH_MARGINS })) return Promise.resolve();
  return new Promise((resolve) => {
    let timer = 0;
    const done = () => { clearTimeout(timer); map.off('moveend', done); signal?.removeEventListener('abort', done); resolve(); };
    timer = setTimeout(done, 1600);
    map.on('moveend', done);
    signal?.addEventListener('abort', done);
    fitTo(latlngs, { maxZoom: 16, fly: !reducedMotion(), animate: false });
  });
}

// ---------------------------------------------------------------- bottom sheet (phones)

function sheetSizes() {
  const H = $('#screen-main').clientHeight;
  const inner = $('#panel-body .panel-content');
  // (and the room kept below what scrolls for a phone's home bar)
  const below = parseFloat(getComputedStyle($('#panel')).paddingBottom) || 0;
  const pad = getComputedStyle($('#panel-body'));
  // (its content from just under the pull tab to its own padding at the foot)
  const content = parseFloat(pad.paddingTop) - 4 + (inner ? inner.offsetHeight : 200) + parseFloat(pad.paddingBottom) + 2 + below;
  const full = Math.min(content, H - 72);
  const mid = Math.min(Math.round(H * 0.48), full);
  const peek = Math.min(136, mid);
  return { peek, mid, full, max: H - 72 };
}

function setSheet(snap) {
  const panel = $('#panel');
  if (!isMobile()) { panel.style.height = ''; panel.classList.remove('edge'); document.documentElement.style.removeProperty('--sheet-lift'); sheet.target = 0; return; }
  sheet.snap = snap;
  // While an address is being typed the sheet is as tall as it goes (see typingSheet); its position is remembered.
  const sizes = sheetSizes();
  sheet.target = panel.classList.contains('typing') ? sizes.max : sizes[snap];
  panel.style.height = `${sheet.target}px`;
  // The sheet floats above the bottom of the screen; pulled all the way up, it meets the screen's edges.
  const edge = sheet.target >= sizes.max - 1;
  panel.classList.toggle('edge', edge);
  // The map's credits sit just above it (see .leaflet-bottom in styles.css).
  document.documentElement.style.setProperty('--sheet-lift', `${edge ? 0 : sheet.target + 12}px`);
  placeGo();
}

/**
 * Let's meet as a play button of Liquid Glass, just above the sheet while it
 * is pulled all the way down on the people page (with the Let's meet button
 * at the foot of the list out of sight). It rides on the sheet's top and
 * fades away as the sheet is pulled up. `at`: where the sheet is while a
 * finger holds it ({ top, h, peek }: its top, from the top of the screen, how
 * much of it shows and how much at its smallest); otherwise where it is going.
 */
const GO = { size: 60, gap: 12, fade: 64 };
const SHEET_FLOAT = 8; // (how far the sheet floats above the bottom of the screen: .panel's bottom in styles.css)
function placeGo(at = null) {
  const btn = $('#btn-go');
  const panel = $('#panel');
  const screen = $('#screen-main');
  if (!btn) return;
  let { top, h, peek } = at || {};
  if (!at) {
    if (!isMobile()) { btn.style.opacity = '0'; btn.inert = true; return; }
    h = sheet.target || panel.offsetHeight;
    top = screen.clientHeight - SHEET_FLOAT - h;
    peek = sheetSizes().peek;
  }
  const can = state.view === 'people' && !panel.classList.contains('away') && !panel.classList.contains('typing');
  const o = can ? Math.min(1, Math.max(0, 1 - (h - peek) / GO.fade)) : 0;
  btn.style.translate = `0 ${Math.round(top - GO.gap - GO.size)}px`;
  btn.style.transform = `scale(${(0.82 + 0.18 * o).toFixed(3)})`;
  btn.style.opacity = o.toFixed(3);
  if (btn.inert !== o < 0.5) btn.inert = o < 0.5;
  if (!at) btn.disabled = activePeople().length < 2; // (not while held: who's in doesn't change then)
}

/**
 * Typing someone's address on a phone: the sheet opens all the way with the
 * address box at its top, so the suggestions open in the part of the screen
 * the keyboard leaves free. Afterwards it goes back to where it was.
 */
function typingSheet(on) {
  const panel = $('#panel');
  if (panel.classList.contains('typing') === on) return;
  panel.classList.toggle('typing', on);
  setSheet(sheet.snap);
  if (on) typingBoxToTop();
  else {
    $('#panel-body .panel-content')?.style.removeProperty('padding-bottom'); // (the room made for typing goes)
    $('#panel-body').scrollTop = 0;
  }
}
/** While typing: the address box at the top of the sheet (again after the screen changes size, as when a keyboard opens). */
function typingBoxToTop() {
  const body = $('#panel-body');
  const box = document.activeElement?.closest?.('.add-box, .p-edit') || $('.add-box', body);
  if (!box || !$('#panel').classList.contains('typing')) return;
  // Just below the pull tab (what scrolls goes on up under it).
  const under = $('#panel-handle')?.offsetHeight || 0;
  const target = body.scrollTop + box.getBoundingClientRect().top - body.getBoundingClientRect().top - under - 8;
  // Room below what's there for the box to come up so far, and no more (nothing to scroll down into):
  // for the sheet's height now or the one it is easing to (opening, or a keyboard coming up), whichever
  // is taller, so the box stays put meanwhile; once it is there, again for that height alone.
  const content = $('.panel-content', body);
  const panel = $('#panel');
  const coming = (sheet.target || panel.offsetHeight) - (parseFloat(getComputedStyle(panel).paddingBottom) || 0);
  if (content) {
    content.style.paddingBottom = '0px';
    const cs = getComputedStyle(body);
    const tall = parseFloat(cs.paddingTop) + content.offsetHeight + parseFloat(cs.paddingBottom); // (what's there, however short)
    content.style.paddingBottom = `${Math.max(0, Math.ceil(target + Math.max(body.clientHeight, coming) - tall))}px`;
  }
  body.scrollTop = target;
  clearTimeout(roomTimer);
  if (Math.abs(body.clientHeight - coming) > 1) roomTimer = setTimeout(typingBoxToTop, 380);
  fitSuggestions?.();
}
let roomTimer = 0;

/**
 * A finger holding the sheet (by its tab, or its content at the top). It
 * slides with the finger rather than stretching: for the time being it is as
 * tall as it can be, its foot just off the bottom of the screen, so on the
 * way nothing in it is laid out or painted again (its glass, sheen and shadow
 * included), only moved. Let go, it settles at a size (see settleSheet).
 */
const held = { on: false, max: 0, h: 0, frame: 0 };
/**
 * The sheet moved by `y` (a translateY in px; 0 where it is). What scrolls
 * fades out softly at the foot of the part in sight, and while the sheet is
 * taller than it shows (held, or sliding down to a size) that foot stays put
 * at the bottom of the screen. So the fade is in a layer of its own
 * (#panel-fade) that stays put while the sheet moves (moved back by as much),
 * and what's in it (#panel-ride) moves with the sheet: three layers moved,
 * nothing in them laid out, styled or painted again, however long the list.
 */
function sheetAt(y) {
  const t = y ? `translateY(${y}px)` : '';
  $('#panel').style.transform = t;
  $('#panel-fade').style.transform = y ? `translateY(${-y}px)` : '';
  $('#panel-ride').style.transform = t;
}
/** The same, sliding from `from` to `to` (see settleSheet). */
function slideSheet(from, to) {
  const k = (y) => ({ transform: y ? `translateY(${y}px)` : 'none' });
  return [
    $('#panel').animate([k(from), k(to)], SETTLE),
    $('#panel-fade').animate([k(-from), k(-to)], SETTLE),
    $('#panel-ride').animate([k(from), k(to)], SETTLE),
  ];
}
function holdSheet() {
  const panel = $('#panel');
  const top = panel.getBoundingClientRect().top; // (where it is now, part way through settling too)
  stopSettling();
  const max = sheetSizes().max;
  panel.classList.add('dragging');
  sheetAt(0);
  panel.style.height = `${max}px`;
  const foot = panel.getBoundingClientRect().bottom;
  Object.assign(held, {
    on: true, max, foot, h: Math.round(foot - top),
    screenTop: $('#screen-main').getBoundingClientRect().top, peek: sheetSizes().peek,
  });
  sheetAt(max - held.h);
  placeGo({ top: held.foot - held.h - held.screenTop, h: held.h, peek: held.peek });
  return held.h; // how much of it shows
}
/** The finger moved: this much of the sheet shows (at most once a frame: a finger reports more often than the screen is drawn). */
function moveSheet(h) {
  held.h = Math.max(56, Math.min(held.max, h));
  if (!held.frame) {
    held.frame = requestAnimationFrame(() => {
      held.frame = 0;
      sheetAt(held.max - held.h);
      placeGo({ top: held.foot - held.h - held.screenTop, h: held.h, peek: held.peek });
    });
  }
}

/**
 * The sheet to a size by sliding there: it is given its new height at once
 * and glides from where it was (from the finger, when let go). Going down,
 * it keeps the height it needs to reach the bottom of the screen on the way,
 * and takes its own at the end.
 */
const SETTLE = { duration: 420, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1)' };
let settling = null;
function settleSheet(snap) {
  const panel = $('#panel');
  sheet.chosen = snap;
  cancelAnimationFrame(held.frame);
  held.frame = 0;
  held.on = false;
  const from = panel.getBoundingClientRect().top;
  stopSettling();
  sheetAt(0);
  panel.classList.remove('dragging');
  if (reducedMotion() || !isMobile()) { setSheet(snap); return; }
  panel.classList.add('settling'); // (its height changes at once; its sides and corners still ease, to and from the screen's edges)
  setSheet(snap);
  const target = sheet.target;
  const d = from - panel.getBoundingClientRect().top;
  if (Math.abs(d) < 1) { panel.classList.remove('settling'); return; }
  if (d < 0) panel.style.height = `${target - d}px`; // (taller for now: its foot stays off the screen until it's there)
  const anims = d > 0 ? slideSheet(d, 0) : slideSheet(0, -d);
  const a = anims[0];
  settling = { anims, target, d };
  const done = () => {
    if (settling?.anims[0] !== a) return;
    settling = null;
    takeOwnHeight(panel, target);
  };
  a.finished.then(done, () => {});
}
/** Stop a settling sheet where it is supposed to end (a finger has caught it, or it is going away). */
function stopSettling() {
  if (!settling) return;
  const { anims, target, d } = settling;
  settling = null;
  for (const a of anims) a.cancel();
  if (d < 0) takeOwnHeight($('#panel'), target);
  else $('#panel').classList.remove('settling');
}
/** Back to its own height (it was taller to slide down), taken at once before its height eases again. */
function takeOwnHeight(panel, target) {
  if (sheet.target === target) {
    panel.style.height = `${target}px`;
    void getComputedStyle(panel).opacity; // (the new height is taken here, while it doesn't ease)
  }
  panel.classList.remove('settling');
}

function initSheet() {
  const panel = $('#panel');
  const handle = $('#panel-handle');
  let drag = null;
  handle.addEventListener('pointerdown', (e) => {
    if (!isMobile()) return;
    drag = { y: e.clientY, h: 0, moved: false, lastY: e.clientY, lastT: performance.now(), v: 0 };
    handle.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  handle.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dy = e.clientY - drag.y;
    if (!drag.moved) {
      if (Math.abs(dy) <= 4) return;
      drag.moved = true;
      drag.h = holdSheet();
    }
    const now = performance.now();
    drag.v = (e.clientY - drag.lastY) / Math.max(1, now - drag.lastT); // px/ms, + is downward
    drag.lastY = e.clientY; drag.lastT = now;
    moveSheet(drag.h - dy);
  });
  const end = () => {
    if (!drag) return;
    let snap = drag.moved ? snapFor(drag.v, held.h) : sheet.snap === 'peek' ? 'mid' : 'peek'; // (a tap toggles)
    const giveUp = drag.moved && snap !== 'full' && panel.classList.contains('typing');
    drag = null;
    if (giveUp) {
      // Pulled down while typing: never mind. Back to the size it was (smallest after a flick right down).
      panel.classList.remove('typing');
      snap = snap === 'peek' ? 'peek' : sheet.snap === 'full' ? 'mid' : sheet.snap || 'mid';
    }
    settleSheet(snap);
    if (giveUp) neverMind();
  };
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', end);
  handle.addEventListener('keydown', (e) => {
    let snap = null;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); snap = sheet.snap === 'peek' ? 'mid' : 'peek'; }
    if (e.key === 'ArrowUp') snap = sheet.snap === 'peek' ? 'mid' : 'full';
    if (e.key === 'ArrowDown') snap = sheet.snap === 'full' ? 'mid' : 'peek';
    if (snap) settleSheet(snap);
  });
  pullFromContent(panel);
  window.addEventListener('resize', () => {
    placeThumbs(document, null, { animate: false });
    if (held.on) return; // (a finger is on it)
    setSheet(sheet.snap);
    // Typing with the sheet fully open: keep the address box at its top, now and once the sheet has settled.
    typingBoxToTop();
    setTimeout(typingBoxToTop, 350);
  });
}

/**
 * Pulled down while typing: what was being added (an address and name not yet
 * added) or changed (in someone's row) is let go, and the keyboard goes down.
 */
function neverMind() {
  state.addDraft = null;
  state.edit = null;
  document.activeElement?.blur();
  $('#panel-body').scrollTop = 0;
  render();
}

/** Letting go of the sheet with `cur` of it showing: the next size in the direction of a flick (v: px/ms, + is down), else the nearest. */
function snapFor(v, cur) {
  const s = sheetSizes();
  const order = ['peek', 'mid', 'full'];
  if (Math.abs(v) > 0.45) {
    return v > 0 ? [...order].reverse().find((k) => s[k] < cur - 4) || 'peek' : order.find((k) => s[k] > cur + 4) || 'full';
  }
  return order.reduce((a, b) => (Math.abs(s[b] - cur) < Math.abs(s[a] - cur) ? b : a));
}

/**
 * The sheet moved by its content, as on an iPhone: a finger moving up while
 * the content is scrolled to its top grows the sheet (following the finger,
 * then settling at the nearest size); once the sheet is all the way up, the
 * rest of the movement scrolls the content. Moving down at the top shrinks
 * the sheet again. Anything that scrolls by itself (a list of suggestions,
 * a row of tabs sideways), a box being typed in and the slider are left alone.
 */
function pullFromContent(panel) {
  const body = $('#panel-body');
  let pull = null;
  const ownMoves = (el) => {
    for (let n = el; n && n !== body; n = n.parentElement) {
      if (n.matches?.('input, textarea, select, label.switch')) return true;
      const oy = getComputedStyle(n).overflowY;
      if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight + 1) return true;
    }
    return false;
  };
  body.addEventListener('touchstart', (e) => {
    pull = null;
    if (!isMobile() || e.touches.length !== 1 || panel.classList.contains('typing') || panel.classList.contains('away') || ownMoves(e.target)) return;
    const t = e.touches[0];
    pull = { x: t.clientX, y: t.clientY, h: panel.offsetHeight, on: false, lastY: t.clientY, lastT: performance.now(), v: 0 };
  }, { passive: true });
  body.addEventListener('touchmove', (e) => {
    if (!pull) return;
    const t = e.touches[0];
    const dx = t.clientX - pull.x, dy = t.clientY - pull.y;
    if (!pull.on) {
      // Decided at the first few pixels (before the page would start scrolling): up or down at the top.
      if (Math.abs(dx) < 3 && Math.abs(dy) < 3) return;
      const s = sheetSizes();
      const take = Math.abs(dy) > Math.abs(dx) && body.scrollTop <= 0 && (dy < 0 ? pull.h < s.full - 2 : pull.h > s.peek + 2);
      if (!take) { pull = null; return; }
      Object.assign(pull, { on: true, full: s.full, h: holdSheet() });
    }
    e.preventDefault();
    const now = performance.now();
    pull.v = (t.clientY - pull.lastY) / Math.max(1, now - pull.lastT);
    pull.lastY = t.clientY;
    pull.lastT = now;
    const want = pull.h - dy;
    moveSheet(Math.min(pull.full, want));
    const over = Math.max(0, want - pull.full); // (all the way up: the content scrolls on)
    if (over || body.scrollTop) body.scrollTop = over;
    if (Math.abs(dy) > 10) pull.moved = true;
  }, { passive: false });
  const letGo = () => {
    if (!pull?.on) { pull = null; return; }
    const snap = snapFor(pull.v, held.h);
    // A drag isn't a tap: whatever it started on isn't pressed.
    if (pull.moved) {
      const stop = (e) => { e.stopPropagation(); e.preventDefault(); };
      body.addEventListener('click', stop, { capture: true, once: true });
      setTimeout(() => body.removeEventListener('click', stop, { capture: true }), 400);
    }
    pull = null;
    settleSheet(snap);
  };
  body.addEventListener('touchend', letGo);
  body.addEventListener('touchcancel', letGo);
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

function setView(view) {
  state.view = view;
  state.modeMenu = null;
  if (view === 'searching') stopSettling(); // (the sheet goes away from wherever it is)
  if (view !== 'people') map?.closePopup(); // an "Add this address" bubble belongs to the people list
  // While the search runs the panel slides away (down off a phone's screen), and back up with the results.
  $('#panel').classList.toggle('away', view === 'searching');
  showSearchRoutes();
  render();
  // On a phone each page opens at the size the sheet was last pulled to (until it has been, the page's own size).
  if (SHEET_DEFAULT[view]) setSheet(sheet.chosen || SHEET_DEFAULT[view]);
}

/**
 * The search area as a circle around the meeting point, once the slider has
 * been moved. Shown with the categories and with a category's places;
 * hidden on a place's page. Its size eases to the distance chosen a frame
 * at a time, so it follows the slider smoothly.
 */
let radiusCircle = null, radiusGlide = 0;
function drawRadius() {
  const s = state.search;
  const r = s?.showRadius;
  if (!r || !s.meet || !['results', 'group'].includes(state.view)) {
    cancelAnimationFrame(radiusGlide);
    if (radiusCircle) resultLayer.removeLayer(radiusCircle);
    radiusCircle = null;
    return;
  }
  const at = L.latLng(s.meet.lat, s.meet.lon);
  if (!radiusCircle || !resultLayer.hasLayer(radiusCircle)) {
    radiusCircle = L.circle(at, {
      radius: r, color: '#007aff', weight: 1.5, opacity: 0.75, dashArray: '6 6',
      fillColor: '#007aff', fillOpacity: 0.07, interactive: false, className: 'radius-ring',
    }).addTo(resultLayer);
    return;
  }
  if (!radiusCircle.getLatLng().equals(at)) radiusCircle.setLatLng(at);
  cancelAnimationFrame(radiusGlide);
  const step = () => {
    if (!radiusCircle) return;
    const now = radiusCircle.getRadius();
    const next = Math.abs(r - now) < 1.5 ? r : now + (r - now) * 0.35;
    radiusCircle.setRadius(next);
    if (next !== r) radiusGlide = requestAnimationFrame(step);
  };
  step();
}

/**
 * Touching the slider: the map comes in close enough to see the circle
 * change, with room for the furthest the slider goes (once each time the
 * results are shown, so it doesn't jump about while sliding).
 */
function zoomToRadii() {
  const s = state.search;
  if (!s?.meet || !map || s.radiiShown) return;
  s.radiiShown = true;
  const r = RADIUS.max;
  const dLat = r / 111320, dLon = r / (111320 * Math.cos((s.meet.lat * Math.PI) / 180));
  fitTo([[s.meet.lat - dLat, s.meet.lon - dLon], [s.meet.lat + dLat, s.meet.lon + dLon]], { maxZoom: 17 });
}

/** The whole circle in sight beside (or above) the panel: the map moves out to it only if part of it is hidden. */
function showWholeRadius(r) {
  const s = state.search;
  if (!s?.meet || !map) return;
  const dLat = r / 111320, dLon = r / (111320 * Math.cos((s.meet.lat * Math.PI) / 180));
  const corners = [[s.meet.lat - dLat, s.meet.lon - dLon], [s.meet.lat + dLat, s.meet.lon + dLon]];
  if (!inSight(corners)) fitTo(corners, { maxZoom: 17 });
}

const afterRender = {};
// The panel's pages in order: going on to a later one slides it in from the right, going back slides the page away again.
const PAGE_ORDER = ['people', 'results', 'group', 'place', 'share'];
let shownView = null; // the page the panel shows (null while it is away)
let redrawAfterTurn = false;
function render({ keepScroll = false } = {}) {
  // The page sliding in is drawn again (with what has just arrived for it) once it is in, not under the slide.
  if (pageTurn && keepScroll && state.view === shownView) {
    if (!redrawAfterTurn) {
      redrawAfterTurn = true;
      const again = () => { redrawAfterTurn = false; render({ keepScroll: true }); };
      pageTurn.anims[1].finished.then(again, again);
    }
    return;
  }
  const body = $('#panel-body');
  const scroll = body.scrollTop;
  const views = { people: renderPeople, results: renderResults, group: renderGroup, place: renderPlace, share: renderShare };
  if (views[state.view]) {
    const from = shownView;
    // The same page drawn again: its highlights slide on from where they were, its tabs stay scrolled as they were.
    const was = from === state.view ? thumbsIn(body) : null;
    const tabsScroll = from === state.view ? $('.pills', body)?.scrollLeft || 0 : 0;
    const leaving = from && from !== state.view ? liftPage(body, scroll) : null;
    body.innerHTML = `<div class="panel-content">${views[state.view]()}</div>`;
    shownView = state.view;
    afterRender[state.view]?.();
    body.scrollTop = keepScroll ? scroll : 0;
    if (tabsScroll && $('.pills', body)) $('.pills', body).scrollLeft = tabsScroll;
    placeThumbs(body, was);
    if (isMobile() && sheet.snap) setSheet(sheet.snap);
    if (leaving) turnPage(leaving, PAGE_ORDER.indexOf(state.view) < PAGE_ORDER.indexOf(from));
  } else {
    shownView = null; // (the results come back up with the panel, not as a page turn)
  }
  placeGo();
  drawPeople();
  drawRadius();
}

const reducedMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * In a row of choices (a segmented control, the tabs, Leaving: Now or a
 * time) the highlight is a thumb of its own behind the choices, which slides
 * from the old choice to the new one and takes its width, as on an iPhone. It
 * is placed whenever the row is drawn or its choice changes; a row drawn
 * afresh is given where its thumb was (`was`, from thumbsIn) by its data-seg.
 */
const THUMBED = [
  { group: '.segmented', item: '.seg', thumb: 'seg-thumb' },
  { group: '.pills', item: '.pill', thumb: 'pill-thumb' },
  { group: '.leave-row', item: '.leave-opt', thumb: 'leave-thumb' },
];
const THUMB_SLIDE = { duration: 440, easing: 'cubic-bezier(0.3, 1.22, 0.45, 1)' };
const thumbKey = (g) => g.dataset.seg || g.id || '';
function thumbsIn(root) {
  const at = new Map();
  for (const t of $$('.seg-thumb, .pill-thumb, .leave-thumb', root)) {
    const key = thumbKey(t.parentElement);
    if (key && t.dataset.x) at.set(key, { x: Number(t.dataset.x), w: Number(t.dataset.w) });
  }
  return at;
}
// A row (or a choice in it) that changes size after its highlight was placed (a phone laying
// out its date box a moment later, the sheet widening to the screen's edges, a font arriving):
// the highlight is placed again, at once.
const thumbWatch = 'ResizeObserver' in window ? new ResizeObserver((entries) => {
  const rows = new Set();
  for (const { target } of entries) {
    if (!target.isConnected) { thumbWatch.unobserve(target); continue; }
    const g = target.closest('.segmented, .pills, .leave-row');
    if (g) rows.add(g);
  }
  for (const g of rows) placeThumbs(g.parentElement, null, { animate: false, only: g });
}) : null;
function placeThumbs(root = document, was = null, { animate = true, only = null } = {}) {
  for (const { group, item, thumb: cls } of THUMBED) {
    for (const g of only ? [only].filter((x) => x.matches(group)) : $$(group, root)) {
      if (!g.offsetParent) continue; // (out of sight: placed once shown)
      const on = $(`:scope > ${item}.active`, g);
      let t = $(`:scope > .${cls}`, g);
      if (!on) { if (t) t.hidden = true; g.classList.remove('thumbed'); continue; }
      if (!t) {
        t = document.createElement('span');
        t.className = cls;
        t.setAttribute('aria-hidden', 'true');
        g.prepend(t);
        if (thumbWatch) for (const el of [g, ...g.children]) if (el !== t) thumbWatch.observe(el);
      }
      const from = !t.hidden && t.dataset.x ? { x: Number(t.dataset.x), w: Number(t.dataset.w) } : was?.get(thumbKey(g));
      t.hidden = false;
      const x = on.offsetLeft, w = on.offsetWidth;
      if (!animate && t.dataset.y === String(on.offsetTop) && t.dataset.h === String(on.offsetHeight) && t.dataset.x === String(x) && t.dataset.w === String(w)) continue; // (where it is already)
      Object.assign(t.style, { top: `${on.offsetTop}px`, height: `${on.offsetHeight}px`, width: `${w}px`, transform: `translateX(${x}px)` });
      t.dataset.x = x;
      t.dataset.w = w;
      t.dataset.y = on.offsetTop;
      t.dataset.h = on.offsetHeight;
      g.classList.add('thumbed');
      if (animate && from && (Math.abs(from.x - x) > 0.5 || Math.abs(from.w - w) > 0.5) && !reducedMotion()) {
        t.getAnimations().forEach((a) => a.cancel());
        t.animate([{ transform: `translateX(${from.x}px)`, width: `${from.w}px` }, { transform: `translateX(${x}px)`, width: `${w}px` }], THUMB_SLIDE);
      }
    }
  }
}

/**
 * Something going away plays its way out (as it came in, backwards) rather
 * than vanishing. With `hide` it counts as hidden at once (for the rest of the
 * app) but stays in sight until it has gone; with `remove` it is taken out
 * afterwards. Wanted again meanwhile, `stay` brings it straight back.
 */
function leave(el, keyframes, { duration = 220, easing = 'cubic-bezier(0.4, 0, 1, 1)', hide = false, remove = false, then } = {}) {
  if (!el?.isConnected || el.hidden) { if (remove) el?.remove(); then?.(); return; }
  stay(el);
  if (reducedMotion()) { if (hide) el.hidden = true; if (remove) el.remove(); then?.(); return; }
  if (hide) {
    el.style.setProperty('display', getComputedStyle(el).display, 'important');
    el.hidden = true;
  }
  el.inert = true;
  el.style.pointerEvents = 'none';
  const a = el.__leaving = el.animate(keyframes, { duration, easing, fill: 'forwards' });
  a.finished.then(() => {
    if (el.__leaving !== a) return;
    el.__leaving = null;
    el.inert = false;
    el.style.removeProperty('display');
    el.style.removeProperty('pointer-events');
    if (remove) el.remove();
    then?.();
    a.cancel();
  }, () => {});
}
function stay(el) {
  const a = el?.__leaving;
  if (!a) return;
  el.__leaving = null;
  a.cancel();
  el.inert = false;
  el.style.removeProperty('display');
  el.style.removeProperty('pointer-events');
}

/**
 * Heavier changes to the map (a list's pins, moving to fit them) wait for the
 * page now sliding in, so the slide has the phone to itself. Straight after
 * this task when no page is turning.
 */
function afterPageTurn(fn) {
  queueMicrotask(() => {
    const turn = pageTurn;
    if (!turn) return fn();
    turn.anims[1].finished.then(fn, fn);
  });
}
const PAGE_TURN = { duration: 420, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' };
let pageTurn = null; // { layer, anims } while one page slides over another

/**
 * The page on show, lifted out of the panel into a layer of its own just
 * where it was (scrolled as it was), to move away as the next page comes in.
 * Null when there would be nothing to see move.
 */
function liftPage(body, scroll) {
  const panel = $('#panel');
  const content = body.firstElementChild;
  if (pageTurn) { for (const a of pageTurn.anims) a.finish(); pageTurn.layer.remove(); } // one turn at a time
  if (!content || reducedMotion() || panel.classList.contains('away') || $('#screen-main').hidden || !body.offsetHeight) return null;
  const cs = getComputedStyle(body);
  const layer = document.createElement('div');
  layer.className = 'page-leaving';
  layer.setAttribute('aria-hidden', 'true');
  layer.inert = true;
  Object.assign(layer.style, {
    top: `${body.offsetTop}px`, height: `${body.offsetHeight}px`,
    paddingTop: cs.paddingTop, paddingRight: cs.paddingRight, paddingBottom: cs.paddingBottom, paddingLeft: cs.paddingLeft,
  });
  content.style.width = `${content.offsetWidth}px`;
  for (const el of content.querySelectorAll('[id]')) el.removeAttribute('id'); // (the next page may use the same ones)
  layer.append(content);
  panel.append(layer);
  layer.scrollTop = scroll;
  return layer;
}

/**
 * The next page slides in from the right over the one leaving, which moves
 * a little way left as it fades (like turning a page in an iPhone app). Going
 * back, the page leaving slides away to the right, uncovering the one before.
 */
function turnPage(layer, back) {
  const body = $('#panel-body'), panel = $('#panel');
  panel.classList.add('paging');
  layer.style.zIndex = back ? '2' : '-1'; // over the page coming back; under the page coming in
  const anims = back
    ? [body.animate([{ transform: 'translateX(-30%)', opacity: 0 }, { transform: 'none', opacity: 1 }], PAGE_TURN),
      layer.animate([{ transform: 'none' }, { transform: 'translateX(100%)' }], PAGE_TURN)]
    : [body.animate([{ transform: 'translateX(100%)' }, { transform: 'none' }], PAGE_TURN),
      // (gone before the next page is far in: the pages are see-through, and two at once would be a jumble)
      layer.animate([{ transform: 'none', opacity: 1 }, { opacity: 0, offset: 0.55 }, { transform: 'translateX(-30%)', opacity: 0 }], PAGE_TURN)];
  const turn = pageTurn = { layer, anims };
  const done = () => {
    layer.remove();
    if (pageTurn !== turn) return;
    pageTurn = null;
    panel.classList.remove('paging');
  };
  anims[1].finished.then(done, done);
}

// ------------------------------------------------ people view

function renderPeople() {
  const all = everyone();
  const active = all.filter((p) => p.active).length;
  const rows = all.map((p, i) => personRow(p, i, all.length)).join('');
  return `
    <div class="sheet-title"><h2>Who's meeting</h2><span class="badge">${active} of ${all.length}</span></div>
    <ul class="group icons people">${rows}</ul>
    ${addBox()}
    <p class="footnote" style="margin:0 8px">Or tap the map to drop a pin. Drag any pin to move it.</p>
    ${leaveRow()}
    <div class="cta">
      <button class="btn btn-primary btn-block btn-lg" data-action="find" ${active < 2 ? 'disabled' : ''}>Let’s meet</button>
    </div>`;
}

/**
 * Someone in the list, in two lines: their picture with a heart on it (not yours)
 * (hollow, filled once their address is kept on this device; double-tapping
 * the row does the same), their name with how they travel beside it, their
 * address; at the end removing them and the switch that leaves them out.
 * Tapping the row opens it: taller, a pencil beside the name, the address
 * below in full across the row with a pencil at its end. A pencil turns its
 * line into a box with a save button.
 */
const heartLabelFor = (p, kept) => (kept ? `Saved on this device. Tap to forget ${p.name}’s address` : `Keep ${p.name}’s address on this device`);
function personRow(p, i, count) {
  const kept = !!savedMatch(p);
  const open = state.open === p.id;
  const ed = state.edit?.id === p.id ? state.edit : null;
  const heartLabel = heartLabelFor(p, kept);
  const title = p.isHome ? (state.user.name ? `You (${state.user.name})` : 'You') : p.nickname || shortAddr(p.address);
  const named = p.isHome || !!p.nickname;
  const menuUp = count > 2 && i >= count - 2;
  const pencil = (field, what) => `<button class="pencil" type="button" data-action="edit" data-field="${field}" aria-label="Change ${esc(what)}" title="Change ${esc(what)}">${glyph('pencil', 14, 2.1)}</button>`;
  const save = `<button class="field-icon save" type="submit" aria-label="Save" title="Save">${glyph('check', 16, 2.6)}</button>`;
  const line1 = ed?.field === 'name'
    ? `<form class="p-edit p-edit-name" data-action="save-edit" autocomplete="off">
        <input id="edit-nick" name="nick" value="${esc(ed.nick ?? p.nickname ?? '')}" maxlength="60" placeholder="Their name" aria-label="Name" autocomplete="off" enterkeyhint="done">${save}
      </form>`
    : `<div class="p-line1">
        <button class="p-name" type="button" data-action="person-tap" aria-expanded="${open}" title="${esc(title)}">${esc(title)}</button>
        ${p.isHome ? '' : pencil('name', named ? `${p.name}’s name` : 'their name')}
        <div class="dd">${modePill(p)}${peopleModeMenu(p, menuUp)}</div>
      </div>`;
  const line2 = ed?.field === 'address'
    ? `<form class="p-edit p-edit-addr" data-action="save-edit" autocomplete="off">
        <div class="search searchfield" id="edit-search">
          <input id="edit-address" type="search" value="${esc(ed.text ?? p.address)}" placeholder="${p.isHome ? 'Where you’re starting from' : 'Their address'}" aria-label="Address" autocomplete="off" enterkeyhint="done">
          <ul class="suggestions inline" role="listbox" hidden></ul>
        </div>${save}
      </form>`
    : `<div class="cell-sub p-addr${named ? '' : ' only-open'}" title="${esc(p.address)}"><span>${esc(p.address)}</span>${pencil('address', p.isHome ? 'your starting point' : `${p.name}’s address`)}</div>`;
  return `<li class="person${p.active ? '' : ' inactive'}${p.isHome ? ' home' : ''}${named ? '' : ' one-line'}${open ? ' open' : ''}${ed?.field === 'name' ? ' naming' : ''}${state.modeMenu === p.id ? ' raised' : ''}" data-id="${esc(p.id)}">
      <div class="cell person-cell" data-action="person-tap">
        <div class="avatar-wrap">
          <span class="avatar" style="--c:${p.color}">${esc(initial(p.name))}</span>
          ${p.isHome ? '' : `<button class="badge-heart${kept ? ' on' : ''}" type="button" data-action="heart-person" aria-pressed="${kept}" aria-label="${esc(heartLabel)}" title="${esc(heartLabel)}">${heart(kept, 13)}</button>`}
          ${state.pop === p.id ? `<span class="heart-pop" aria-hidden="true">${heart(true, 46)}</span>` : ''}
        </div>
        ${line1}
        ${p.isHome ? '' : `<div class="p-end">
          <button class="icon-circle" type="button" data-action="delete" aria-label="Remove ${esc(p.name)}" title="Remove">${glyph('close', 13, 2.6)}</button>
          <label class="switch" title="${p.active ? 'Included' : 'Left out'}"><input type="checkbox" data-action="toggle" ${p.active ? 'checked' : ''} aria-label="Include ${esc(p.name)}"><span></span></label>
        </div>`}
        ${line2}
      </div>
    </li>`;
}

/** How someone travels: a menu from the pill beside their name (up from the last rows, which have no room below). */
const peopleModeMenu = (p, up) => (state.modeMenu === p.id ? `<div class="menu${up ? ' up' : ''}" role="menu" aria-label="How ${esc(p.name)} travels">
    ${MODES.map((m) => `<button class="menu-item" type="button" role="menuitemradio" aria-checked="${m.id === p.mode}" data-action="set-mode" data-id="${esc(p.id)}" data-mode="${m.id}">${glyph(m.id, 17)}<span>${m.label}</span>${m.id === p.mode ? `<span class="check">${glyph('check', 16, 2.4)}</span>` : ''}</button>`).join('')}
  </div>` : '');

/**
 * A tap on someone's row opens it (or closes it) at once. A second tap
 * straight after, where the first one was, puts the row back as it was and
 * keeps their address instead (the heart): a double-tap. (The rows move as
 * one opens, so the second tap is caught wherever it lands; see doubleTap.)
 */
let lastTap = null;
function personTap(id, e) {
  const p = everyone().find((x) => x.id === id);
  if (state.modeMenu) { lastTap = null; togglePersonOpen(id); return; } // (that tap closes the travel menu)
  lastTap = p && !p.isHome ? { id, was: state.open, t: performance.now(), x: e?.clientX ?? 0, y: e?.clientY ?? 0 } : null;
  togglePersonOpen(id);
}
/** The second tap of a double-tap goes to the row the first one was on, as the heart, and to nothing else. */
function doubleTap(e) {
  const t = lastTap;
  if (!t || performance.now() - t.t > 320 || Math.hypot(e.clientX - t.x, e.clientY - t.y) > 40) return;
  // A button in that same row (the pencil that has just appeared beside the name, say) is a tap of its own.
  const control = e.target.closest('button, a, input, label, select, textarea, .menu');
  if (control && !control.matches('.p-name') && e.target.closest('.person')?.dataset.id === t.id) { lastTap = null; return; }
  e.stopPropagation();
  e.preventDefault();
  lastTap = null;
  togglePersonOpen(t.was && t.was !== t.id ? t.was : t.id); // (the rows back as they were before the first tap)
  toggleSavedPerson(t.id);
}

/**
 * Open someone's row (closing any other), or close it. The rows change where
 * they are, not drawn again: each grows or shrinks to its new height and what
 * is in it glides to its new place (measured before and after the change).
 */
const ROW_MOVE = { duration: 340, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' };
function togglePersonOpen(id) {
  if (state.view !== 'people') return;
  if (state.modeMenu) { closeModeMenu(() => render({ keepScroll: true })); return; } // (a tap away from an open menu closes it)
  const open = state.open === id ? null : id;
  state.open = open;
  const rows = $$('#panel-body .person').filter((li) => li.classList.contains('open') !== (li.dataset.id === open));
  const moves = reducedMotion() ? [] : rows.map(measureRow);
  for (const li of rows) {
    const on = li.dataset.id === open;
    li.classList.toggle('open', on);
    $('.p-name', li)?.setAttribute('aria-expanded', String(on));
  }
  for (const m of moves) glideRow(m);
  // A change left half-made in a row now closing is dropped (once that row has closed).
  if (state.edit && state.edit.id !== open) {
    state.edit = null;
    setTimeout(() => { if (state.view === 'people' && !state.edit) render({ keepScroll: true }); }, ROW_MOVE.duration + 20);
  }
}
const ROW_PARTS = '.avatar-wrap, .p-name, .dd, .p-end, .p-addr';
/** Where a row and the things in it are now (each part measured from the row's own corner). */
function measureRow(li) {
  const box = li.getBoundingClientRect();
  return {
    li,
    h: box.height,
    parts: $$(ROW_PARTS, li).map((el) => { const r = el.getBoundingClientRect(); return { el, x: r.left - box.left, y: r.top - box.top }; }),
  };
}
/** From where it was to where it is: the row's height, and each part's place. */
function glideRow({ li, h, parts }) {
  const box = li.getBoundingClientRect();
  li.classList.add('gliding');
  const done = () => li.classList.remove('gliding');
  li.animate([{ height: `${h}px` }, { height: `${box.height}px` }], ROW_MOVE).finished.then(done, done);
  for (const { el, x, y } of parts) {
    if (!el.isConnected || !el.offsetParent) continue;
    const r = el.getBoundingClientRect();
    const dx = x - (r.left - box.left), dy = y - (r.top - box.top);
    if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], ROW_MOVE);
  }
}

/** Save what was changed in someone's row: their name, and their address if a new one was picked. */
async function saveEdit() {
  const ed = state.edit;
  const p = ed && everyone().find((x) => x.id === ed.id);
  if (!p) { state.edit = null; render({ keepScroll: true }); return; }
  const text = ($('#edit-address')?.value ?? ed.text ?? p.address).trim();
  const loc = ed.loc && text === ed.loc.address ? ed.loc : null;
  if (!loc && text !== p.address) {
    toast('Pick the new address from the list');
    $('#edit-address')?.focus();
    return;
  }
  const nickname = ($('#edit-nick')?.value ?? ed.nick ?? p.nickname ?? '').trim();
  state.edit = null;
  state.open = p.id; // (the row stays open, showing what was saved)
  document.activeElement?.blur(); // done: the keyboard goes down
  if (p.isHome) {
    if (loc) await moveHome(loc);
    else render({ keepScroll: true });
    return;
  }
  const patch = {};
  if (nickname !== (p.nickname || '')) patch.nickname = nickname;
  if (loc) Object.assign(patch, { address: loc.address, lat: loc.lat, lon: loc.lon });
  if (!Object.keys(patch).length) { render({ keepScroll: true }); return; }
  await patchPlace(p.id, patch);
  if (loc) fitTo(activePeople().map((x) => [x.lat, x.lon]), { maxZoom: 15 });
}

/** Your starting point moved (with the pencil beside it). */
async function moveHome(loc) {
  try {
    state.user = (await api.updateMe({ home: { ...state.user.home, address: loc.address, lat: loc.lat, lon: loc.lon } })).user;
    state.sharePlace = null;
    render({ keepScroll: true });
    fitTo(activePeople().map((x) => [x.lat, x.lon]), { maxZoom: 15 });
    toast('Moved your starting point');
  } catch (err) {
    toast(err.message, { error: true });
    render({ keepScroll: true });
  }
}

/**
 * Adding someone: their address (typed and picked from the suggestions, a
 * saved one, or a spot tapped on the map), then their name, then Add. The
 * heart keeps the address on this device, to pick again another time.
 */
function addBox() {
  const d = state.addDraft || {};
  return `<div class="add-box">
      <div class="search searchfield" id="add-search">
        <input id="add-input" type="search" placeholder="Add someone's address" autocomplete="off" aria-label="Someone's address" value="${esc(d.text ?? d.loc?.address ?? '')}">
        <button class="field-btn heart-btn" type="button" data-action="save-address"></button>
        <ul class="suggestions" role="listbox" hidden></ul>
      </div>
      <div class="add-row">
        <input id="add-nick" maxlength="60" placeholder="Their name (optional)" aria-label="Their name" autocomplete="off" enterkeyhint="done" value="${esc(d.nick || '')}">
        <button class="btn btn-primary" type="button" data-action="add-person">Add person</button>
      </div>
    </div>`;
}

/** The Add button and the heart, for the address picked so far (if any). */
function refreshAddBox() {
  const loc = state.addDraft?.loc;
  const add = $('[data-action=add-person]'), btn = $('[data-action=save-address]');
  if (add) add.disabled = !loc;
  if (!btn) return;
  const kept = !!savedMatch(loc);
  btn.disabled = !loc;
  btn.classList.toggle('on', kept);
  btn.setAttribute('aria-pressed', String(kept));
  const label = !loc ? 'Pick an address to save it' : kept ? 'Saved on this device. Tap to forget it' : 'Save this address on this device';
  btn.title = label;
  btn.setAttribute('aria-label', label);
  btn.innerHTML = heart(kept);
}

/** An address for the person being added (a suggestion, a saved address or a spot on the map): their name comes next. */
function chooseAddress(loc, { nickname = '' } = {}) {
  const d = state.addDraft ||= {};
  d.loc = { address: loc.address, lat: Number(loc.lat), lon: Number(loc.lon) };
  d.text = loc.address;
  const nick = $('#add-nick');
  if (nickname && nick && !nick.value.trim()) nick.value = nickname;
  if (nick) d.nick = nick.value;
  const box = $('#add-input');
  if (box) box.value = loc.address;
  refreshAddBox();
  nick?.focus(); // on a phone the keyboard stays up for it
}

/** Add the person in the form (their address picked, their name if given). */
async function addFromBox() {
  const d = state.addDraft;
  if (!d?.loc) return;
  const nickname = ($('#add-nick')?.value ?? d.nick ?? '').trim();
  state.addDraft = null;
  document.activeElement?.blur(); // someone added: the keyboard goes down
  await addPlace({ ...d.loc, nickname });
}

/** Keep an address on this device (with a name, if it has one), or forget it again if it is kept already. */
async function toggleSaved(loc, nickname = '') {
  const kept = savedMatch(loc);
  try {
    if (kept) {
      await forgetAddress(kept.id);
      toast(`Forgot ${savedTitle(kept)}`);
    } else {
      const { saved } = await api.saveAddress({ address: loc.address, lat: loc.lat, lon: loc.lon, nickname });
      state.saved = [saved, ...state.saved.filter((s) => s.id !== saved.id && !(s.address === saved.address && haversine(s.lat, s.lon, saved.lat, saved.lon) < 15))];
      toast(`Saved ${savedTitle(saved)} on this device`);
      warnIfUnsaved();
    }
  } catch (err) { toast(err.message, { error: true }); }
}

/** The heart in the add box: the picked address (with the name typed). */
async function toggleSavedAddress() {
  const loc = state.addDraft?.loc;
  if (!loc) return;
  await toggleSaved(loc, ($('#add-nick')?.value || '').trim());
  refreshAddBox();
}

/** The heart on someone's picture (or a double-tap on their row): their address (with their name). Keeping it, the heart pops. */
let heartPopTimer = 0;
async function toggleSavedPerson(id) {
  const p = everyone().find((x) => x.id === id);
  if (!p || p.isHome) return; // (no heart on your own row)
  await toggleSaved(p, p.nickname || '');
  const kept = !!savedMatch(p);
  clearTimeout(heartPopTimer);
  state.pop = kept ? id : null;
  if (state.pop) heartPopTimer = setTimeout(() => { state.pop = null; }, 800);
  if (state.view !== 'people') return;
  const li = $$('#panel-body .person').find((x) => x.dataset.id === id);
  const badge = li && $('.badge-heart', li);
  if (!badge) { render({ keepScroll: true }); return; }
  const label = heartLabelFor(p, kept);
  badge.classList.toggle('on', kept);
  badge.setAttribute('aria-pressed', String(kept));
  badge.setAttribute('aria-label', label);
  badge.title = label;
  badge.innerHTML = heart(kept, 13);
  $('.heart-pop', li)?.remove();
  if (kept) {
    const pop = document.createElement('span');
    pop.className = 'heart-pop';
    pop.setAttribute('aria-hidden', 'true');
    pop.innerHTML = heart(true, 46);
    $('.avatar-wrap', li).append(pop);
    setTimeout(() => pop.remove(), 800);
  }
}

/** Forget a saved address. */
async function forgetAddress(id) {
  state.saved = state.saved.filter((s) => s.id !== id);
  refreshAddBox();
  try { await api.unsaveAddress(id); } catch (err) { toast(err.message, { error: true }); }
}

/** "Leaving: Now | [date and time]" above the Find button. */
function leaveRow() {
  if (state.leaveAt && !leaveTime()) state.leaveAt = ''; // the chosen time has passed: back to "Now"
  // The box shows the time chosen, or (leaving now) the time it is now.
  const shown = state.leaveAt || toLocalInput(new Date());
  return `<div class="leave-row" data-seg="leave" role="group" aria-label="When everyone leaves">
    <span class="leave-label">Leaving</span>
    <button class="leave-opt${state.leaveAt ? '' : ' active'}" data-action="leave-now" aria-pressed="${!state.leaveAt}">Now</button>
    <input type="datetime-local" id="leave-at" class="leave-opt${state.leaveAt ? ' active' : ''}" value="${esc(shown)}" min="${esc(toLocalInput(new Date()))}" aria-label="Leave at a date and time">
  </div>`;
}

/**
 * A date and time box whose picker's Reset goes back to the time it is now,
 * calling `onReset`. Browsers reset it in two ways: some empty the box (it
 * then shows the time it is now), and Safari puts back the box's default
 * value (its value attribute), which is therefore kept at the time it is now
 * (again each time the picker opens) whatever the box shows.
 */
function resetsToNow(box, onReset) {
  const defaultNow = () => {
    const shown = box.value;
    box.defaultValue = toLocalInput(new Date());
    box.value = shown; // (what it shows stays as it is)
  };
  defaultNow();
  box.addEventListener('focus', defaultNow);
  box.addEventListener('pointerdown', defaultNow);
  const check = (e) => {
    if (!box.value) {
      box.value = toLocalInput(new Date());
      onReset();
      return true;
    }
    // Back to its default (only once the picker is done with it, not while its wheels turn past it).
    if (e?.type !== 'input' && box.value === box.defaultValue) {
      onReset();
      return true;
    }
    return false;
  };
  box.addEventListener('input', check);
  return check;
}
/** A Date as a datetime-local value in this device's time zone. */
const toLocalInput = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
/** The chosen departure as an ISO time, or null for now (also when the chosen time has passed). */
function leaveTime() {
  const t = state.leaveAt ? new Date(state.leaveAt) : null;
  return t && t.getTime() > Date.now() + 60000 ? t.toISOString() : null;
}
/** "9:00 am on Saturday 14 November" (or "9:00 am today"). */
function fmtLeave(iso) {
  const d = new Date(iso);
  const today = new Date(), tomorrow = new Date(today.getTime() + 864e5);
  const day = d.toDateString() === today.toDateString() ? 'today' : d.toDateString() === tomorrow.toDateString() ? 'tomorrow'
    : `on ${d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}`;
  return `${clock(iso)} ${day}`;
}

afterRender.people = () => {
  const at = $('#leave-at');
  if (at) {
    // A time later than now is when everyone leaves; now (or earlier), or Reset, is leaving now.
    const now = $('.leave-row [data-action=leave-now]');
    const show = () => {
      now.classList.toggle('active', !state.leaveAt);
      now.setAttribute('aria-pressed', String(!state.leaveAt));
      at.classList.toggle('active', !!state.leaveAt);
      placeThumbs(at.parentElement.parentElement);
    };
    const reset = resetsToNow(at, () => { state.leaveAt = ''; show(); });
    at.addEventListener('change', () => {
      if (reset()) return;
      const later = new Date(at.value).getTime() > Date.now() + 60000;
      state.leaveAt = later ? at.value : '';
      if (!later) at.value = toLocalInput(new Date());
      show();
    });
  }
  // Picking an address doesn't add anyone yet: there's time for their name, then Add (or the heart).
  const add = attachSearch($('#add-search'), {
    near: () => state.user.home,
    onPick: (r) => chooseAddress(r, { nickname: r.saved ? r.nickname : '' }),
    saved: () => state.saved,
    onUnsave: forgetAddress,
  });
  const nickBox = $('#add-nick');
  refreshAddBox();
  add.input.addEventListener('input', () => {
    const d = state.addDraft ||= {};
    d.text = add.input.value;
    // Typing again: the address picked before no longer stands.
    if (d.loc && add.input.value !== d.loc.address) { d.loc = null; refreshAddBox(); }
  });
  nickBox.addEventListener('input', () => { (state.addDraft ||= {}).nick = nickBox.value; });
  nickBox.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); if (state.addDraft?.loc) addFromBox(); else add.input.focus(); } });
  // The heart keeps the keyboard where it is (tapping it doesn't take the cursor from the box).
  $('[data-action=save-address]').addEventListener('mousedown', (e) => e.preventDefault());
  const fields = [add.input, nickBox];
  const editor = editPerson();
  if (editor) fields.push(...editor.fields);
  // On a phone the sheet opens all the way for typing (see typingSheet). A list drawn
  // again (someone added) starts out of that state.
  typingSheet(false);
  const stay = () => fields.includes(document.activeElement);
  for (const el of fields) {
    el.addEventListener('focus', () => {
      if (!isMobile()) return;
      typingSheet(true);
      setTimeout(() => { typingBoxToTop(); fitSuggestions?.(); }, 350); // once the sheet has grown
    });
    el.addEventListener('blur', () => setTimeout(() => { if (!stay()) typingSheet(false); }, 200));
  }
  editor?.focus();
};

/** The boxes in a row being changed: a new address picked from suggestions, the name kept as it is typed. */
function editPerson() {
  const form = $('.p-edit');
  const ed = state.edit;
  const p = ed && everyone().find((x) => x.id === ed.id);
  if (!form || !p) return null;
  const nick = $('#edit-nick');
  const search = $('#edit-search');
  const ctl = search ? attachSearch(search, {
    near: () => p,
    onPick: (r) => { ed.loc = { address: r.address, lat: Number(r.lat), lon: Number(r.lon) }; ed.text = r.address; },
    saved: () => state.saved,
    onUnsave: forgetAddress,
  }) : null;
  ctl?.input.addEventListener('input', () => { ed.text = ctl.input.value; });
  nick?.addEventListener('input', () => { ed.nick = nick.value; });
  // Enter saves (see the form's submit); Escape (with no suggestions open) leaves things as they were.
  form.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && (!search || $('.suggestions', form).hidden)) { e.preventDefault(); state.edit = null; render({ keepScroll: true }); }
  }, true);
  const first = nick || ctl.input;
  return {
    fields: [first],
    focus: () => { if (document.activeElement !== first) { first.focus(); first.select(); } },
  };
}

async function addPlace(loc) {
  try {
    const { place } = await api.addPlace({ address: loc.address, lat: loc.lat, lon: loc.lon, nickname: loc.nickname || '', mode: state.settings.travel });
    state.places.push(place);
    render();
    // (From Saved while a meeting point is on show: it was picked without them.)
    const shown = state.search && ['results', 'group', 'place'].includes(state.view);
    toast(`Added ${place.nickname || shortAddr(place.address)}`, shown ? { action: 'Find new spot', onAction: () => findPlaces(), ms: 6000 } : {});
    warnIfUnsaved();
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
        try {
          const { place: restored } = await api.addPlace(place);
          state.places.splice(Math.min(idx, state.places.length), 0, restored);
          render();
        } catch (err) { toast(err.message, { error: true }); }
      },
    });
  } catch (err) {
    state.places.splice(idx, 0, place);
    render();
    toast(err.message, { error: true });
  }
}

/**
 * Someone in or left out, from the switch beside them. The switch slides by
 * itself (it isn't drawn again, which would stop it where it is); the rest of
 * the page follows where it is: their row, the count, Let's meet, the map.
 */
async function setIncluded(id, on) {
  const p = state.places.find((x) => x.id === id);
  if (!p) return;
  p.active = on;
  showIncluded();
  try { await api.updatePlace(id, { active: on }); }
  catch (err) { p.active = !on; render({ keepScroll: true }); toast(err.message, { error: true }); }
}
function showIncluded() {
  if (state.view !== 'people') { render({ keepScroll: true }); return; }
  const all = everyone();
  for (const li of $$('#panel-body .person')) {
    const p = all.find((x) => x.id === li.dataset.id);
    if (!p) continue;
    li.classList.toggle('inactive', !p.active);
    const sw = $('label.switch', li);
    if (sw) sw.title = p.active ? 'Included' : 'Left out';
  }
  const badge = $('#panel-body .sheet-title .badge');
  if (badge) badge.textContent = `${all.filter((p) => p.active).length} of ${all.length}`;
  const find = $('[data-action=find]');
  if (find) find.disabled = activePeople().length < 2;
  placeGo();
  drawPeople();
}

async function patchPlace(id, patch) {
  const p = state.places.find((x) => x.id === id);
  if (!p) return;
  const before = { ...p };
  Object.assign(p, patch);
  render({ keepScroll: true }); // (the list stays where it was scrolled to)
  try { await api.updatePlace(id, patch); }
  catch (err) { Object.assign(p, before); render({ keepScroll: true }); toast(err.message, { error: true }); }
}

// ------------------------------------------------ search flow

function setStatus(text, { skip = false, spinner = true } = {}) {
  const chip = $('#search-status');
  if (!text) {
    leave(chip, [{ opacity: 1 }, { opacity: 0, transform: 'translateX(-50%) scale(0.94)' }], { duration: 200, hide: true });
    return;
  }
  stay(chip);
  chip.hidden = false;
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

let radiusAbort = null; // a change of radius still loading its places
function cancelSearchQuietly() {
  searchAbort?.abort();
  searchAbort = null;
  radiusAbort?.abort();
  radiusAbort = null;
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

/** A person's name if they have one (never their address, or part of it). */
const whoOf = (p) => p.nickname || (p.isHome ? 'You' : '');
/** A name tag in the search: their name, and how long their trip is once known (someone without a name: just that). */
const pillText = (p, extra) => [whoOf(p), extra].filter(Boolean).join(' · ');

/**
 * The meeting point found: the map glides a little (zooming in or out) to put
 * it in the middle of what's in sight above or beside the panel, as close as
 * it can with everyone's pins (and name tags) still in sight around it.
 */
function centreOnMeet(meet, people) {
  const dLat = Math.max(0.0012, ...people.map((p) => Math.abs(p.lat - meet.lat)));
  const dLon = Math.max(0.0012, ...people.map((p) => Math.abs(p.lon - meet.lon)));
  const around = L.latLngBounds([meet.lat - dLat, meet.lon - dLon], [meet.lat + dLat, meet.lon + dLon]);
  const { tl, br } = mapPadding();
  const opts = { paddingTopLeft: tl, paddingBottomRight: br, maxZoom: 16 };
  if (reducedMotion()) map.fitBounds(around, { ...opts, animate: false });
  else map.flyToBounds(around, { ...opts, duration: 1.2, easeLinearity: 0.3 });
}

/** What the meeting point is near: the place it moved to, a park or landmark right there, or the street. */
function meetName(search) {
  if (search.anchor) return search.anchor.name;
  const d = (p) => haversine(p.lat, p.lon, search.meet.lat, search.meet.lon);
  const near = (search.pois || []).filter((p) => ['outdoors', 'culture'].includes(p.tab) && d(p) < 250).sort((a, b) => d(a) - d(b))[0];
  if (near) return near.name;
  const first = (search.area || '').split(', ')[0].trim();
  if (!first || /^-?\d+(\.\d+)?$/.test(first)) return 'the middle';
  return first.replace(/^\d+[a-z]?(-\d+[a-z]?)?\s+/i, '');
}

let pills = [];
/** The search map on or off: the line of text at the top, name tags over everyone. */
function floodMode(on, people = []) {
  $('#screen-main').classList.toggle('flooding', on);
  fxLayer?.clearLayers();
  pills = on ? people.map((p) => L.marker([p.lat, p.lon], {
    icon: L.divIcon({ className: 'flood-pill-icon', html: `<span class="flood-pill" style="--c:${p.color}">${esc(pillText(p))}</span>`, iconSize: [0, 0], iconAnchor: [0, 0] }),
    interactive: false, keyboard: false, zIndexOffset: 2000,
  }).addTo(fxLayer)) : [];
  if (!on) setHud('');
}
function setPill(i, text) {
  const el = pills[i]?.getElement()?.querySelector('.flood-pill');
  if (el) el.textContent = text;
}

/** The line of text at the top of the search map (empty hides it). */
function setHud(text) {
  const h = $('#flood-hud');
  if (!text) { leave(h, [{ opacity: 1 }, { opacity: 0 }], { duration: 300, hide: true }); return; }
  stay(h);
  h.hidden = false;
  h.textContent = text;
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
  const straight = { ...base, duration: estimate, pieces: [{ pts: [door, end], t0: 0, t1: estimate, mode: person.mode === 'transit' ? 'walk' : person.mode }] };
  if (!route) return straight;
  if (route.options) {
    // Public transport: the journey shown in directions, each leg at its real times.
    const o = route.options[0];
    const t00 = Date.parse(o?.start);
    let t = 0;
    const pieces = (o?.legs || []).filter((l) => l.geometry?.length > 1).map((l) => {
      const a = Date.parse(l.from.time);
      const t0 = Number.isFinite(a) && Number.isFinite(t00) ? Math.max(t, (a - t00) / 1000) : t;
      t = t0 + l.duration;
      return { pts: l.geometry, t0, t1: t, mode: isWalkLeg(l) ? 'walk' : 'transit' };
    });
    if (!pieces.length) return straight;
    pieces.unshift({ pts: [door, pieces[0].pts[0]], t0: 0, t1: 0, mode: 'walk' });
    return { ...base, pieces, duration: Math.max(t, o.duration || 0) };
  }
  if (!Number.isFinite(route.duration)) return straight;
  return { ...base, duration: route.duration, pieces: [{ pts: [door, ...(route.geometry || []), end], t0: 0, t1: route.duration, mode: person.mode }] };
}

/**
 * Travel times for finding the meeting point: worked out over the streets
 * loaded here when they reach everyone asked about, else asked of the
 * routing service.
 */
const travelTimesWith = (local) => (mode, sources, destinations, opts) => (local?.ok && sources.every((p) => local.covers(p, mode))
  ? local.travelTimes(mode, sources, destinations)
  : getTravelTimes(mode, sources, destinations, opts));

async function findPlaces({ replay = false } = {}) {
  const prev = replay ? state.search : null;
  const people = prev ? prev.people : activePeople();
  if (people.length < 2) return;
  searchAbort?.abort();
  const ctrl = new AbortController();
  searchAbort = ctrl;
  clearSearchVisuals();
  setView('searching');
  setStatus(prev ? 'Replaying the search' : 'Finding the fairest spot…');
  // The map stays as it was (it moves, smoothly, only to bring someone into sight): the lines are drawn on it.
  await bringIntoSight(people.map((p) => [p.lat, p.lon]), ctrl.signal);
  if (ctrl.signal.aborted) return;
  const rule = 'similar'; // (always the fairest)
  // Everyone leaves now, or at the time chosen above the Find button (public transport timetables use it).
  const leaveAt = prev ? prev.leaveAt : leaveTime();
  const at = leaveAt ? { time: leaveAt } : {};
  const fx = anim = new FloodAnimation(map, { people, pace: PACE[state.settings.speed] || PACE.normal, theme: isDark() ? 'dark' : 'light' });
  if (reducedMotion()) fx.skip();
  const live = () => !ctrl.signal.aborted && anim === fx;
  floodMode(true, people);
  const status = (text) => setStatus(text, { skip: true });

  try {
    // First the streets around everyone (a handful of the map's own tiles):
    // the animation floods them, and walking, cycling and driving times for
    // finding the fairest spot are worked out over them, here (see
    // localroute.js), instead of hundreds of them being asked of the routing
    // service. If they are slow to come, the routing service is asked as before.
    const roadsP = withTimeout(loadRoads(streetsArea(), { signal: ctrl.signal }), 8000).catch(() => null);
    const netP = roadsP.then((roads) => (roads?.A?.length ? prepareNetwork(roads) : null)).catch(() => null);
    const localP = netP.then((net) => (net ? createLocalRouter(null, net) : null));
    const localSoon = Promise.race([localP, new Promise((r) => setTimeout(() => r(null), 4000))]);
    const meetingP = prev ? Promise.resolve(prev.meeting) : localSoon.then((local) => findMeetingPoint(people, {
      rule, travelTimes: travelTimesWith(local), signal: ctrl.signal, onStatus: status,
      directions: (mode, a, b, o) => getDirections(mode, a, b, { ...o, ...at }),
      // With Google: the best few spots checked against Google's travel times for everyone.
      checkTimes: usingGoogle() ? (ps, spots, o) => getCheckTimes(ps, spots, { ...o, ...at }) : undefined,
      // Public transport: real times from each rider to every stop around.
      transitReach: getTransitReach, time: leaveAt,
    }));
    meetingP.catch(() => {});
    status(prev ? 'Replaying the search' : 'Finding the fairest spot…');
    // The streets go onto the darkened map as soon as they are here, so they
    // fade in with it (and are drawn before the floods start, not as they do).
    const streetsP = netP.then((net) => { if (live()) fx.setRoads(null, net); });
    if (!(await fx.intro())) return;
    await streetsP;
    if (!live()) return;
    // A frame to show them before the floods are worked out.
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
    if (!live()) return;
    fx.prepare();

    const meeting = await meetingP;
    const local = await localP;
    if (!live()) return;
    const spot = meeting.meet;
    if (!Number.isFinite(spot?.lat) || !Number.isFinite(spot?.lon)) throw new Error('Couldn’t place a meeting point. Try again, or move someone’s pin.');
    let meet = prev ? prev.meet : spot;
    // Keep the meeting point in view (it can lie a little outside the group): the map glides to take it in.
    await bringIntoSight([...people.map((p) => [p.lat, p.lon]), [meet.lat, meet.lon]], ctrl.signal);
    if (!live()) return;
    const search = state.search = {
      people, meeting, meet, local, anchor: prev?.anchor || null, routes: prev?.routes || null, rule, leaveAt,
      pois: prev?.pois || null, grouped: prev?.grouped || null, radius: prev?.radius || null, loaded: prev?.loaded || null, tab: prev?.tab || null,
      group: null, place: null, area: prev?.area || null, poiError: prev?.poiError || null, sort: prev?.sort, showRadius: prev?.showRadius,
    };

    // While the floods meet: the places nearby, then the meeting point moves
    // to one a group can meet at (see anchor.js), then its name and
    // everyone's route there.
    const poisPromise = prev?.pois ? Promise.resolve() : loadPois(search, ctrl.signal);
    const anchorP = prev ? Promise.resolve(meet) : withTimeout(poisPromise, 6000).catch(() => {}).then(() => {
      const a = pickAnchor(spot, search.pois);
      if (a) {
        search.anchor = a;
        meet = search.meet = { lat: a.lat, lon: a.lon };
        for (const p of search.loaded?.pois || search.pois) p.fromCenter = haversine(meet.lat, meet.lon, p.lat, p.lon);
        if (search.loaded) showPoisWithin(search, search.radius); // measured from the new spot
      }
      return meet;
    });
    const areaP = search.area ? Promise.resolve() : anchorP.then((m) => reverseGeocode(m.lat, m.lon, { signal: ctrl.signal }))
      .then((r) => { if (r) search.area = r.address; if (state.view === 'results') render({ keepScroll: true }); })
      .catch(() => {});
    // Everyone's route there from the routing service (or Google). Walking,
    // cycling and driving routes that are slow to come are worked out along the
    // streets here instead (the same streets the floods ran along); the real
    // ones still come for the results. Someone whose times could not be checked
    // a moment ago is not waited on for long again: their route is a straight line.
    // (The free routing service is asked one route a second, so with it a bigger group waits a little longer.)
    const road = (p) => p.mode !== 'transit';
    const inTurn = usingGoogle() ? 0 : 1200 * people.filter(road).length;
    const routeWait = (i) => (road(people[i]) && local?.ok ? 3000 + inTurn
      : (meeting.approx || meeting.real?.[i] === false ? 4000 : 10000) + (road(people[i]) ? inTurn : 0));
    const localRoute = (p, m) => (road(p) && local?.ok ? local.directions(p.mode, p, m).catch(() => null) : null);
    const routesP = search.routes ? Promise.resolve(search.routes)
      : anchorP.then((m) => Promise.all(people.map(async (p, i) => (await withTimeout(getDirections(p.mode, p, m, { signal: ctrl.signal, ...at }), routeWait(i)).catch(() => null)) || localRoute(p, m))));
    status('Finding everyone’s routes…');
    const ok2 = await fx.allAtOnce(spot);
    if (!ok2 || !live()) return;
    await anchorP;
    search.routes = await routesP;
    // The meeting point's name, if it comes soon.
    await Promise.race([areaP, new Promise((r) => setTimeout(r, 1200))]);
    if (!live()) return;

    // The meeting point, then everyone travels there along their route.
    const name = meetName(search);
    const pin = L.marker([meet.lat, meet.lon], {
      icon: L.divIcon({ className: 'meet-pin', html: '<i class="meet-shadow"></i><div class="meet-jump"><i class="meet-halo"></i><div class="meet-dot"></div></div>', iconSize: [22, 22], iconAnchor: [11, 11] }),
      zIndexOffset: 1000,
    }).bindTooltip(esc(name === 'the middle' ? 'Meeting point' : name), { permanent: true, direction: 'bottom', className: 'label meet-label', offset: [0, 14] }).addTo(resultLayer);
    const times = people.map((p, i) => tripSeconds(search.routes[i], meeting.times[i]));
    setHud(`Longest trip: ${mins(Math.max(...times))}`);
    status('Searching…');
    const tracks = people.map((p, i) => trackFor(p, search.routes[i], meet, meeting.times[i]));
    const ok3 = await fx.reveal(meet, tracks, {
      onArrive: () => {
        pin.getElement()?.classList.add('hop'); // a little hop for joy
        setHud(`Meet near ${name}`);
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
    // The panel slides back up with the results, and the map glides to the meeting point.
    setView('results');
    centreOnMeet(meet, people);
  } catch (err) {
    if (ctrl.signal.aborted) return;
    console.error(err);
    clearSearchVisuals();
    setStatus('');
    state.search = null; // nothing half-made left behind
    setView('people');
    toast(err.message || 'Something went wrong. Try again.', { error: true });
  }
}

/**
 * The places around the meeting point: within `radius` metres, or (the
 * first time) RADIUS.start, or RADIUS.max where that finds too few. What
 * was found is kept (search.loaded), so a smaller distance on the slider
 * needs no new search when that list was complete.
 */
async function loadPois(search, signal, radius) {
  search.poiError = null;
  try {
    const found = await findPois(search.meet, radius ? { radius, signal } : { startRadius: RADIUS.start, widerRadius: RADIUS.max, signal });
    search.loaded = { pois: found.pois, radius: found.radius, complete: !!found.complete };
    showPoisWithin(search, Math.min(found.radius, RADIUS.max));
  } catch (err) {
    if (signal?.aborted) throw err;
    search.loaded = null;
    search.pois = [];
    search.grouped = groupPois([]);
    search.radius = radius || RADIUS.start;
    search.tab = TABS[0].id;
    search.poiError = 'Places could not be loaded. Check your connection and try another distance.';
  }
}

/** Show the places found within r metres of the meeting point, sorted into tabs and listings. */
function showPoisWithin(search, r) {
  search.pois = (search.loaded?.pois || []).filter((p) => p.fromCenter <= r);
  search.radius = r;
  search.grouped = groupPois(search.pois);
  search.tab = search.tab && search.grouped[search.tab].length ? search.tab
    : (TABS.find((t) => search.grouped[t.id].length) || TABS[0]).id;
}

/** Can the places within r be shown from what was found already (a complete list from at least that far)? */
const loadedCovers = (search, r) => !!search.loaded?.complete && r <= search.loaded.radius;

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
    toast('Ways of travelling changed', { action: 'Find new spot', onAction: () => findPlaces(), ms: 6000 });
  }
}

function setPersonMode(id, mode) {
  const changed = applyMode(id, mode);
  closeModeMenu(() => {
    render({ keepScroll: true });
    if (changed) afterModeChange();
  });
}

/** The travel menu closing: it shrinks back into its pill and fades, then `then` (drawing the rows without it). */
function closeModeMenu(then) {
  const menu = $('#panel-body .menu');
  state.modeMenu = null;
  if (!menu) return then();
  leave(menu, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(0.94)' }], { duration: 160, then });
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
const tripRow = (person, d, sec, approx = false) => `<li class="trip"><div class="cell"><span class="avatar sm" style="--c:${person.color}">${esc(initial(person.name))}</span>
  <span class="cell-main"><span class="title-row"><span class="cell-title">${esc(person.name)}</span>${modePill(person)}</span></span>
  <span class="cell-end"><b>${sec != null ? `${approx ? '≈ ' : ''}${mins(sec)}` : `≈ ${fmtTime(travelMinutes(d, person.mode))}`}</b>${fmtDist(d)}</span></div>${modePicker(person)}</li>`;

/** Everyone-at-once bar (or one person's); shows the shared mode, or nothing selected when people differ. */
function modeSwitch(action, people = state.search?.people || activePeople()) {
  const common = people.length && people.every((p) => p.mode === people[0].mode) ? people[0].mode : null;
  return `<div class="segmented modes" data-seg="${action}" role="group" aria-label="Set how everyone travels">
  ${MODES.map((m) => `<button class="seg${m.id === common ? ' active' : ''}" data-action="${action}" data-mode="${m.id}" aria-pressed="${m.id === common}">${glyph(m.id, 15)}<span>${m.label}</span></button>`).join('')}
</div>`;
}

/** Real travel times from everyone to the meeting point, each in their own mode. */
function loadMeetTimes() {
  const s = state.search;
  const meet = s.meet;
  const key = `${s.people.map((p) => p.mode).join(',')}|${meet.lat},${meet.lon}`;
  if (s.meetTimes?.key === key) return;
  const mt = s.meetTimes = { key, values: s.people.map(() => null), approx: s.people.map(() => false) };
  const refresh = () => { if (state.search === s && s.meetTimes === mt && state.view === 'results') render({ keepScroll: true }); };
  // The routes fetched for the animation give most of these. One worked out
  // along the streets here is shown (as an estimate) until the real one comes:
  // usually it is on its way already (the same request as the animation's).
  s.people.forEach((person, i) => {
    const r = s.routes?.[i];
    if (routeMode(r) === person.mode && r.provider !== 'local') { mt.values[i] = r.duration; return; }
    if (routeMode(r) === person.mode) { mt.values[i] = r.duration; mt.approx[i] = true; }
    getDirections(person.mode, person, meet, s.leaveAt ? { time: s.leaveAt } : {})
      .then((d) => { mt.values[i] = d.duration; mt.approx[i] = false; refresh(); }).catch(() => {});
  });
}

// ------------------------------------------------ results view

/**
 * The meeting point as a place of its own, to send or to see the way to.
 * With onlyYou it is "Your route": just your way there.
 */
const meetPlace = (s, { onlyYou = false } = {}) => ({
  id: 'meet', name: s.anchor ? s.anchor.name : s.area ? shortAddr(s.area) : 'Meeting point', lat: s.meet.lat, lon: s.meet.lon,
  tab: 'meet', group: 'Meeting point', address: s.area || '', fromCenter: 0, onlyYou,
});

/** The address under the meeting place's name: the street and area, without the name said again. */
function areaLine(s) {
  const parts = String(s.area || '').split(', ').map((x) => x.trim()).filter(Boolean);
  if (s.anchor && parts.length && parts[0].toLowerCase() === String(s.anchor.name).trim().toLowerCase()) parts.shift();
  return parts.slice(0, 2).join(', ');
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
        ${groups.map((g) => `<li><button class="cell cell-btn" data-action="group" data-group="${esc(g.group)}">${groupTile(s.tab, g.group)}<span class="cell-main cell-title">${esc(g.group)}</span><span class="cell-end count">${g.items.length}</span>${CHEV}</button></li>`).join('')}
        ${groups.length > 1 ? `<li><button class="cell cell-btn" data-action="group" data-group="*">${tile('all')}<span class="cell-main cell-title">All ${esc(tabMeta.label.toLowerCase())}</span><span class="cell-end count">${tabCount}</span>${CHEV}</button></li>` : ''}
      </ul>`
    : `<div class="empty">${s.poiError ? esc(s.poiError) : s.poiLoading ? 'Looking for places…' : `Nothing found within ${fmtRadius(s.radius || RADIUS.start)}. Slide the distance further.`}</div>`;

  return `
    <div class="result-head" data-rule="${s.rule}">
      <span class="meet-badge"><i></i></span>
      <div style="min-width:0">
        <h2>${esc(s.anchor ? s.anchor.name : s.area ? shortAddr(s.area) : 'Your meeting point')}</h2>
        ${s.anchor && areaLine(s) ? `<div class="footnote">${esc(areaLine(s))}</div>` : ''}
      </div>
    </div>
    <ul class="group icons">${s.people.map((p, i) => tripRow(p, s.routes?.[i]?.distance ?? s.meeting.dists[i], s.meetTimes?.values[i], s.meetTimes?.approx?.[i])).join('')}
      <li><button class="cell cell-btn" data-action="edit-people">${tile('pencil')}<span class="cell-main cell-title">Edit people</span>${CHEV}</button></li></ul>
    ${s.leaveAt ? `<p class="footnote times-note">Times for leaving at ${esc(fmtLeave(s.leaveAt))}.</p>` : ''}
    ${s.meeting.approx ? '<p class="notice">Travel times didn’t load, so this spot is based on distance. Replay the search to check it.</p>' : ''}
    <div class="meet-actions">
      ${s.people.some((p) => p.isHome) ? `<button class="btn btn-tinted" data-action="your-route">${glyph('route', 17)}<span>Show route</span></button>` : ''}
      <button class="btn btn-primary" data-action="send-meet">${glyph('send', 16)}<span>Send invite</span></button>
    </div>
    <div class="pills" data-seg="tabs" role="tablist">${tabs}</div>
    ${list}
    ${radiusRow(s, total)}
    <div class="actions">
      <button class="btn btn-tinted" data-action="replay">Replay search</button>
    </div>`;
}

// ------------------------------------------------ how far to look: the slider

const radiusShare = (r) => ((r - RADIUS.min) / (RADIUS.max - RADIUS.min)) * 100;
/** "800 m", "1 km". */
const fmtRadius = (r) => (r >= 1000 ? `${+(r / 1000).toFixed(1)} km` : `${Math.round(r / 10) * 10} m`);

/** "23 places within 800 m" (a spinner in place of the number while they load), and the slider. */
function radiusRow(s, total) {
  const r = Math.min(RADIUS.max, Math.max(RADIUS.min, s.radius || RADIUS.start));
  return `<div class="radius-row">
      <div class="radius-label">${radiusCount(s.poiLoading ? null : total)}<span>places within</span> <b class="radius-dist">${fmtRadius(r)}</b></div>
      <input type="range" class="radius-slider" min="${RADIUS.min}" max="${RADIUS.max}" step="${RADIUS.step}" value="${r}"
        aria-label="How far from the meeting point to look for places" aria-valuetext="${fmtRadius(r)}" style="--p:${radiusShare(r)}%">
      <div class="radius-ends"><span>${fmtRadius(RADIUS.min)}</span><span>${fmtRadius(RADIUS.max)}</span></div>
    </div>`;
}
/** The number of places, a spinner while they load (null), or nothing while it isn't known (''). */
const radiusCount = (n) => (n === null ? '<span class="spinner radius-spin" role="status" aria-label="Loading places"></span>'
  : n === '' ? '' : `<b class="radius-count">${n}</b> `);

afterRender.results = () => {
  const slider = $('.radius-slider');
  const s = state.search;
  if (!slider || !s) return;
  // A finger on the slider: places that finish loading meanwhile wait for it to let go (drawing the
  // list again would take the slider from under it). Letting go without moving it changes nothing else.
  const letGo = () => setTimeout(() => {
    if (!s.sliding) return; // the change of distance dealt with it
    s.sliding = false;
    if (s.renderLater && state.search === s && state.view === 'results') { s.renderLater = false; render({ keepScroll: true }); }
  }, 0);
  slider.addEventListener('pointerdown', () => { s.sliding = true; zoomToRadii(); });
  slider.addEventListener('keydown', zoomToRadii);
  slider.addEventListener('pointerup', letGo);
  slider.addEventListener('pointercancel', letGo);
  slider.addEventListener('input', () => radiusMoved(Number(slider.value)));
  slider.addEventListener('change', () => { s.sliding = false; s.renderLater = false; radiusChosen(Number(slider.value)); });
};

/** The slider moving: the circle follows it, and the count when the places that far out are known already. */
function radiusMoved(r) {
  const s = state.search;
  if (!s) return;
  s.showRadius = r;
  drawRadius();
  const slider = $('.radius-slider'), dist = $('.radius-dist'), label = $('.radius-label');
  slider?.style.setProperty('--p', `${radiusShare(r)}%`);
  slider?.setAttribute('aria-valuetext', fmtRadius(r));
  if (dist) dist.textContent = fmtRadius(r);
  if (label && !s.poiLoading) {
    const known = loadedCovers(s, r) ? s.loaded.pois.filter((p) => p.fromCenter <= r).length : '';
    $('.radius-count, .radius-spin', label)?.remove();
    label.insertAdjacentHTML('afterbegin', radiusCount(known));
  }
}

/** A distance chosen (the slider let go): the places within it, from what was found already or from a new search. */
async function radiusChosen(r) {
  const s = state.search;
  if (!s) return;
  s.showRadius = r;
  drawRadius();
  showWholeRadius(r);
  radiusAbort?.abort();
  if (loadedCovers(s, r)) {
    s.poiLoading = false;
    showPoisWithin(s, r);
    if (state.view === 'results') render({ keepScroll: true });
    return;
  }
  // Only the latest distance counts: a search still under way for another is dropped.
  const ctrl = radiusAbort = new AbortController();
  s.poiLoading = true;
  s.radius = r;
  const label = $('.radius-label');
  if (label) { $('.radius-count, .radius-spin', label)?.remove(); label.insertAdjacentHTML('afterbegin', radiusCount(null)); }
  await loadPois(s, ctrl.signal, r).catch(() => {});
  if (ctrl.signal.aborted || state.search !== s) return;
  s.poiLoading = false;
  if (state.view !== 'results') return;
  if (s.sliding) s.renderLater = true; // not while a finger is on the slider
  else render({ keepScroll: true });
}

// ------------------------------------------------ ratings & photos

let ratingsOn = false; // the server has ratings (checked at start)
let ratingsName = ''; // who they come from, for the credit line
let placesKitKey = null; // a browser key for Google's place card, when the server offers one

const thumbArt = (p) => `<span class="thumb-art" style="--c:${TAB_COLOR[p.tab] || '#8e8e93'}">${glyph(placeGlyph(p), 22, 1.9)}</span>`;
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
/** A link from a place's listing or a review, for an href: always a web address, never a script. */
const linkOf = (url) => esc(hrefOf(String(url || '').trim()));
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
  rowThumb(p).then((url) => {
    // Google's kinds of place may say more about it than OpenStreetMap did.
    const sum = el.closest('.poi')?.querySelector('.p-sum');
    if (sum) sum.textContent = summaryOf(p);
    if (!url || !el.isConnected || el.querySelector('img')) return;
    const img = new Image();
    img.alt = '';
    img.decoding = 'async';
    if (p.thumbBy) img.title = `Photo: ${p.thumbBy}`;
    img.onload = () => img.classList.add('in');
    img.onerror = () => { img.remove(); p.thumb = null; };
    img.src = url;
    el.prepend(img);
  }).catch(() => {}).finally(() => { delete el.dataset.loading; });
}

/**
 * Photos in lists from Google: with its map on the page (its terms keep its
 * places to it) and the browser key its place card uses. Only rows on screen
 * ask, once a visit each.
 */
let rowPhotoFailures = 0; // times in a row Google could not be asked at all (then it's left alone for the visit)
const rowPhotosOn = () => !!placesKitKey && usingGoogle() && rowPhotoFailures < 3;

/** A photo for a place's row: Google's, else Tripadvisor's or a free one from Wikimedia Commons (null if none). */
async function rowThumb(p) {
  if (p.thumb !== undefined) return p.thumb;
  if (rowPhotosOn() && p.google === undefined) {
    try {
      await loadPlacesKit(placesKitKey);
      const g = await rowPhoto(p);
      rowPhotoFailures = 0;
      p.google = g;
      if (g?.types?.length) p.gtypes = g.types;
      if (g?.url) {
        p.thumbBy = g.by;
        p.thumbFrom = 'google';
        return (p.thumb = g.url);
      }
    } catch {
      rowPhotoFailures++;
    }
  }
  return thumbFor(p);
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
      // No real time to this place (public transport, or still loading): a guess from the
      // distance, but never longer than their known trip to the meeting point plus the walk on from there.
      const guess = travelMinutes(ds[pi], person.mode);
      const toMeet = s.meetTimes?.values[pi] ?? s.meeting.times[pi];
      return toMeet != null ? Math.min(guess, (toMeet + (p.fromCenter * 1.3) / SPEEDS.walk) / 60) : guess;
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
    // Worked out over the streets loaded for the search when they reach everyone: no requests at all.
    travelTimesWith(s.local)(mode, idx.map((i) => s.people[i]), list)
      .then((t) => { t.durations.forEach((row, k) => { gt.durations[idx[k]] = row; }); refresh(); }).catch(() => {});
  }
  return gt.durations;
}

/**
 * A place in a list: its photo, its name, a very short summary of it
 * ("Korean · BBQ"), its rating and whether it's open; on the right, how far
 * it is from the meeting point and about how long the longest trip there is.
 */
function poiRow({ p, worstMin }, i) {
  const r = p.rating;
  const ratingPart = r?.rating != null ? ratingHtml(r) : ratingsOn && r === undefined ? '<span class="skel" style="width:92px"></span>' : '';
  const line2 = [ratingPart, esc(PRICE[r?.priceLevel] || '')].filter(Boolean).join('<span class="dot">·</span>');
  const st = statusHtml(openStatus(p.hours));
  return `<li><button class="cell cell-btn poi" data-action="place" data-id="${esc(p.id)}">
      <span class="thumb" data-thumb="${esc(p.id)}">${p.thumb ? `<img class="in" src="${esc(p.thumb)}" alt=""${p.thumbBy ? ` title="${esc(`Photo: ${p.thumbBy}`)}"` : ''}>` : ''}${thumbArt(p)}<span class="num" style="--c:${TAB_COLOR[p.tab]}">${i + 1}</span></span>
      <span class="cell-main"><span class="cell-title">${esc(p.name)}</span>
        <span class="cell-sub p-sum">${esc(summaryOf(p))}</span>
        ${line2 ? `<span class="cell-meta">${line2}</span>` : ''}
        ${st ? `<span class="cell-sub">${st}</span>` : ''}</span>
      <span class="cell-end"><b>${fmtDist(p.fromCenter)}</b>~${fmtTime(worstMin)}</span>
    </button></li>`;
}

function renderGroup() {
  const s = state.search;
  const items = groupItems();
  s.groupList = items.map((x) => x.p);
  const title = s.group === '*' ? `All ${TABS.find((t) => t.id === s.tab).label.toLowerCase()}` : s.group;
  const markersKey = `${s.tab}|${s.group}|${s.sort}|${items.map((x) => x.p.id).join(',')}`;
  if (s.markersKey !== markersKey) {
    s.markersKey = markersKey;
    const list = items.map((x) => x.p);
    afterPageTurn(() => { if (state.view === 'group' && s.markersKey === markersKey) drawPoiMarkers(list); });
  }
  const anyTa = items.some((x) => x.p.rating?.rating != null);
  const anyFree = items.some((x) => x.p.thumbFrom === 'commons');
  const credits = [
    rowPhotosOn() && 'Photos from Google Maps',
    anyTa && (ratingsName === 'Tripadvisor' ? 'Ratings and photos from Tripadvisor' : ratingsName),
    anyFree && 'Some photos from Wikimedia Commons',
  ].filter(Boolean).join(' · ');
  return `
    ${backBtn('back-results', 'Categories')}
    <div class="sheet-title">${s.group === '*' ? tile(s.tab, 'lg') : groupTile(s.tab, s.group, 'lg')}<div style="flex:1;min-width:0"><h2>${esc(title)}</h2><div class="footnote">${items.length} place${items.length === 1 ? '' : 's'} nearby</div></div></div>
    <div class="segmented" data-seg="sort" style="margin-top:0">
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
  fitTo([...items.map((p) => [p.lat, p.lon]), [s.meet.lat, s.meet.lon]], { maxZoom: 17 });
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
  loadDetails(p);
  setView('place');
}

/**
 * Photos, reviews and more for a place, loaded once: Google's place card when
 * the server offers a browser key for it, otherwise Google's Places API
 * (on Google's map), Tripadvisor and free Wikimedia photos.
 */
let kitFailures = 0; // times in a row Google's place card could not load
function loadDetails(p) {
  if (p.id === 'meet' || p.details || p.kit) return;
  if (placesKitKey) {
    const again = () => { if (state.view === 'place' && state.search?.place === p) render({ keepScroll: true }); };
    const fallback = () => { p.kit?.el?.remove(); p.kit = { status: 'none' }; loadOtherDetails(p); again(); };
    // The card not loading at all (the Places UI Kit not switched on for the key, or the key
    // not allowed on this site) is not about this place: after two in a row it is left alone
    // for the rest of the visit, so every place doesn't wait on it.
    const failed = () => { if (++kitFailures >= 2) placesKitKey = null; fallback(); };
    p.kit = { status: 'loading' };
    loadPlacesKit(placesKitKey)
      .then(() => placeIdFor(p))
      .then((id) => {
        if (!id) return fallback();
        p.kit = {
          status: 'ok', id,
          // Checked once loaded: another place with a similar name nearby is not this one.
          el: placeCard(id, { dark: isDark(), onLoad: (place) => { kitFailures = 0; if (!samePlace(p, place)) fallback(); }, onError: failed }),
        };
        again();
      })
      .catch(failed);
    return;
  }
  loadOtherDetails(p);
}

function loadOtherDetails(p) {
  if (p.details) return;
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

const TRIP = { BUSINESS: 'Business', COUPLES: 'Couples', FAMILY: 'Family', FRIENDS: 'Friends', SOLO: 'Solo' };

function renderPlace() {
  const s = state.search;
  const p = s.place;
  const ds = distancesTo(p);
  if (s.placeDrawn !== placeKey(p)) {
    s.placeDrawn = placeKey(p);
    s.markersKey = null;
    poiLayer.clearLayers();
    // (The meeting point has its own pin already.)
    if (p.id !== 'meet') {
      L.marker([p.lat, p.lon], {
        icon: L.divIcon({ className: '', html: `<div class="poi-pin hl" style="--c:${TAB_COLOR[p.tab] || '#007aff'}">${glyph(placeGlyph(p), 15)}</div>`, iconSize: [26, 26], iconAnchor: [13, 13] }),
        zIndexOffset: 1200,
      }).bindTooltip(esc(p.name), { permanent: true, direction: 'right', className: 'label', offset: [18, 0] }).addTo(poiLayer);
    }
    afterPageTurn(() => { if (state.view === 'place' && s.place === p) fitTo([...routePeople(s).map((i) => [s.people[i].lat, s.people[i].lon]), [p.lat, p.lon]], { maxZoom: 16 }); });
  }
  loadPlaceDirections();
  drawDirections();
  if (p.onlyYou) return renderYourRoute(p, ds);

  const d = p.details || { photos: [], reviews: [] };
  const r = d.rating != null ? d : p.rating;
  const loading = d.status === 'loading';
  const photos = d.photos || [];
  const st = openStatus(p.hours);
  const phone = d.phone || p.phone;
  const site = hrefOf(d.website || p.website);
  const menu = hrefOf(d.menu || p.menu);
  const hasReviews = !!(d.reviews?.length || r?.count);

  // Google's place card (photos, rating, reviews, hours…) takes the gallery's place; it's put in after rendering.
  const kit = p.kit?.status === 'ok' ? p.kit : null;
  const gallery = kit ? '<div class="gcard-slot" id="gcard-slot"></div>'
    : p.kit?.status === 'loading' ? '<div class="gallery"><span class="g-item skel"></span><span class="g-item skel"></span></div>'
    : photos.length
    ? `<div class="gallery${photos.length === 1 ? ' single' : ''}">${photos.slice(0, 8).map((ph, k) => `<button class="g-item" data-action="photo" data-i="${k}" aria-label="Photo ${k + 1} of ${photos.length}"><img src="${esc(ph.url)}" alt="${esc(ph.caption || '')}" ${k > 1 ? 'loading="lazy"' : ''} decoding="async"></button>`).join('')}</div>`
    : loading ? '<div class="gallery"><span class="g-item skel"></span><span class="g-item skel"></span></div>'
      : `<div class="hero-art" style="--c:${TAB_COLOR[p.tab] || '#007aff'}">${glyph(placeGlyph(p), 40, 1.6)}</div>`;
  const meta = [p.id === 'meet' ? 'Meeting point' : p.group, PRICE[r?.priceLevel], p.id === 'meet' ? '' : `${fmtDist(p.fromCenter)} from the meeting point`].filter(Boolean);
  const quick = [
    `<button class="q primary" data-action="choose">${glyph('send', 19)}<span>Send invite</span></button>`,
    `<button class="q" data-action="jump" data-to="getting-there">${glyph('route', 19)}<span>Get directions</span></button>`,
    phone ? `<a class="q" href="tel:${esc(phone.replace(/[^\d+]/g, ''))}">${glyph('phone', 19)}<span>Call</span></a>` : '',
    site ? `<a class="q" href="${esc(site)}" target="_blank" rel="noopener">${glyph('globe', 19)}<span>Website</span></a>` : '',
    menu ? `<a class="q" href="${esc(menu)}" target="_blank" rel="noopener">${glyph('menu', 19)}<span>Menu</span></a>` : '',
  ].join('');
  // One page, no tabs: getting there and the details, then reviews (when there are any beside
  // Google's card), then what else is known about the place, then where to open it.
  return `
    ${p.id === 'meet' ? backBtn('back-results', 'Places') : backBtn('back-group', s.group === '*' ? 'Back' : s.group)}
    ${gallery}
    <div class="place-title">
      <h2>${esc(p.name)}</h2>
      ${!kit && r?.rating != null ? `<div class="place-rating">${ratingHtml(r, { big: true })}${r.count ? `<button class="btn btn-plain" data-action="jump" data-to="reviews">${Number(r.count).toLocaleString()} reviews</button>` : ''}</div>` : loading && ratingsOn ? '<span class="skel" style="width:150px;height:16px"></span>' : ''}
      <div class="footnote">${esc(meta.join(' · '))}</div>
      ${st ? `<div class="place-status">${statusHtml(st)}</div>` : ''}
    </div>
    <div class="quick">${quick}</div>
    ${placeOverview(p, d, r, ds)}
    ${hasReviews && !kit ? `<div class="section-title" id="reviews">Reviews</div>${placeReviews(p, d, r)}` : ''}
    ${p.id !== 'meet' ? placeAbout(p, d) : ''}
    <div class="actions">
      <button class="btn btn-tinted" data-action="open-maps">Open in Maps</button>
    </div>
    ${p.id !== 'meet' ? `<p class="footnote attrib">Place details from <a href="https://www.openstreetmap.org/${esc(p.id)}" target="_blank" rel="noopener">OpenStreetMap</a>${d.source === 'tripadvisor' ? ' and Tripadvisor' : d.source === 'google' ? ' and Google Maps' : ''}</p>` : ''}`;
}

/** Which page a place's routes and pin were drawn for: a place, or the meeting point (everyone's way there, or just yours). */
const placeKey = (p) => `${p.id}${p.onlyYou ? ':you' : ''}`;
/** Whose routes the open place shows (their places in the search's list): everyone's, or with "Your route" just yours. */
function routePeople(s) {
  const you = s.people.findIndex((x) => x.isHome);
  return s.place?.onlyYou && you >= 0 ? [you] : s.people.map((_, i) => i);
}

/** "Your route": your way to the meeting point, step by step, and sending the spot. */
function renderYourRoute(p, ds) {
  const s = state.search;
  const me = s.people[routePeople(s)[0]];
  return `
    ${backBtn('back-results', 'Back')}
    <div class="sheet-title">
      <span class="avatar" style="--c:${me.color}">${esc(initial(me.name))}</span>
      <div style="flex:1;min-width:0"><h2>Your route</h2><div class="footnote">To ${esc(p.name)}${s.anchor && areaLine(s) ? `, ${esc(areaLine(s))}` : ''}</div></div>
    </div>
    ${placeOverview(p, {}, null, ds)}
    <div class="actions">
      <button class="btn btn-tinted" data-action="open-maps">Open in Maps</button>
      <button class="btn btn-primary" data-action="choose">${glyph('send', 15)}<span>Send</span></button>
    </div>`;
}

function placeOverview(p, d, r, ds) {
  const s = state.search;
  const when = state.when || { type: 'now' };
  const shown = routePeople(s);
  const people = shown.map((i) => s.people[i]);
  const anyTransit = people.some((x) => x.mode === 'transit');
  const anyRoad = people.some((x) => x.mode !== 'transit');
  const fromGoogle = (state.dir?.results || []).some((r) => r.status === 'ok' && r.data?.provider === 'google');
  const credits = [fromGoogle && ATTRIBUTION.google, !fromGoogle && anyTransit && ATTRIBUTION.transit, !fromGoogle && anyRoad && ATTRIBUTION.routing].filter(Boolean)
    .map((a) => `<a href="${a.url}" target="_blank" rel="noopener">${esc(a.text)}</a>`).join(' · ');
  const site = hrefOf(d.website || p.website);
  const phone = d.phone || p.phone;
  const week = weekTable(p.hours);
  const st = openStatus(p.hours);
  const hours = week
    ? `<details class="hours"><summary>${st ? statusHtml(st) : 'Opening hours'}</summary><table>${week.map((w) => `<tr${w.today ? ' class="today"' : ''}><th>${w.day}</th><td>${esc(w.text)}</td></tr>`).join('')}</table></details>`
    : d.hours?.length ? d.hours.map(esc).join('<br>') : p.hours ? esc(p.hours) : '';
  const summary = d.ranking || d.description || p.description;
  return `
    ${summary ? `<p class="place-summary">${esc(d.ranking ? d.ranking : '')}${d.ranking && (d.description || p.description) ? '<br>' : ''}${esc(truncate(d.description || p.description || '', 600))}</p>` : ''}
    ${p.onlyYou ? '' : '<div class="section-title" id="getting-there">Getting there</div>'}
    ${p.onlyYou ? modeSwitch('you-mode', people) : modeSwitch('dir-mode')}
    ${anyTransit ? `<div class="when-row">
      <select id="dir-when-type" aria-label="When">
        <option value="now"${when.type === 'now' ? ' selected' : ''}>${s.leaveAt ? `Leave at ${esc(clock(s.leaveAt))}` : 'Leave now'}</option>
        <option value="arrive"${when.type === 'arrive' ? ' selected' : ''}>Arrive by…</option>
      </select>
      ${when.type === 'arrive' ? `<input type="datetime-local" id="dir-when-time" value="${esc(when.time || '')}" aria-label="Arrive by">` : ''}
    </div>` : ''}
    <ul class="group icons dirs">${shown.map((i) => dirRow(s.people[i], i, ds[i])).join('')}</ul>
    <p class="footnote attrib">${credits}</p>
    <div class="section-title">Details</div>
    <ul class="group kv">
      <li><div class="cell"><span class="k">Address</span><span class="v">${esc(p.address || d.address || 'Not listed')}</span></div></li>
      ${hours ? `<li><div class="cell"><span class="k">Hours</span><span class="v">${hours}</span></div></li>` : ''}
      ${phone ? `<li><div class="cell"><span class="k">Phone</span><a class="v" href="tel:${esc(phone.replace(/[^\d+]/g, ''))}">${esc(phone)}</a></div></li>` : ''}
      ${site ? `<li><div class="cell"><span class="k">Website</span><a class="v" href="${esc(site)}" target="_blank" rel="noopener">${esc(site.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''))}</a></div></li>` : ''}
    </ul>`;
}

/**
 * "Open in Maps": a choice of maps apps, like a phone's own menu for it,
 * with the one used last time at the top. Choosing one opens the place in
 * it (the app itself, on a phone that has it).
 */
function chooseMapsApp(p) {
  if (!p) return;
  $('.choice-backdrop')?.click(); // one at a time
  const links = mapLinks({ ...p, name: p.id === 'meet' ? 'Meeting point' : p.name, googleId: p.kit?.id });
  const ua = navigator.userAgent;
  const appleDevice = /iPhone|iPad|iPod|Macintosh/i.test(ua);
  const apps = [
    { id: 'apple', name: 'Apple Maps', url: links.apple },
    { id: 'google', name: 'Google Maps', url: links.google },
    { id: 'waze', name: 'Waze', url: links.waze },
    /Android/i.test(ua) && { id: 'geo', name: 'Another maps app', url: links.geo },
    { id: 'osm', name: 'OpenStreetMap', url: links.osm },
  ].filter(Boolean);
  // Apple's own first on Apple's devices, Google's first elsewhere; the one used last above both.
  if (!appleDevice) apps.push(apps.shift());
  const last = state.settings.mapsApp;
  apps.sort((a, b) => (b.id === last) - (a.id === last));
  const back = document.createElement('div');
  back.className = 'choice-backdrop';
  const box = document.createElement('div');
  box.className = 'choice';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-label', 'Open in a maps app');
  box.innerHTML = `<div class="choice-group">
      <div class="choice-title">Open “${esc(p.id === 'meet' ? 'the meeting point' : p.name)}” in</div>
      ${apps.map((a) => `<a class="choice-btn" data-app="${a.id}" href="${esc(a.url)}"${a.id === 'geo' ? '' : ' target="_blank" rel="noopener"'}>${esc(a.name)}${a.id === last ? '<span class="choice-note">Last used</span>' : ''}</a>`).join('')}
    </div>
    <button class="choice-btn choice-cancel" type="button">Cancel</button>`;
  const close = () => {
    document.removeEventListener('keydown', onKey);
    leave(back, [{ opacity: 1 }, { opacity: 0 }], { duration: 220, remove: true });
    leave(box, [{ opacity: 1, translate: '0 0' }, { opacity: 0, translate: '0 28px' }], { duration: 240, remove: true });
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  back.addEventListener('click', close);
  $('.choice-cancel', box).addEventListener('click', close);
  box.addEventListener('click', (e) => {
    const app = e.target.closest('[data-app]')?.dataset.app;
    if (!app) return;
    if (state.settings.mapsApp !== app) {
      state.settings.mapsApp = app;
      api.updateMe({ settings: { mapsApp: app } }).catch(() => {});
    }
    setTimeout(close, 0); // once the link has gone
  });
  document.addEventListener('keydown', onKey);
  document.body.append(back, box);
  $('.choice-btn', box).focus({ preventScroll: true });
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
        <div class="rv-who">${rv.userUrl ? `<a href="${linkOf(rv.userUrl)}" target="_blank" rel="noopener"><b>${esc(rv.user)}</b></a>` : `<b>${esc(rv.user)}</b>`}<span class="footnote">${esc([rv.when || fmtDate(rv.date), TRIP[rv.tripType]].filter(Boolean).join(' · '))}</span></div></div>
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
      ${r?.url ? `<a class="btn btn-tinted" href="${linkOf(r.url)}" target="_blank" rel="noopener">All reviews on ${d.source === 'google' ? 'Google Maps' : 'Tripadvisor'}</a>` : ''}
      ${d.writeReview ? `<a class="btn btn-tinted" href="${linkOf(d.writeReview)}" target="_blank" rel="noopener">Write a review</a>` : ''}
    </div>
    ${from ? `<p class="footnote attrib">${esc(from)}</p>` : ''}`;
}

function placeAbout(p, d) {
  const yes = (v) => v === 'yes' || v === 'only';
  const feats = [
    p.outdoor && 'Outdoor seating', yes(p.takeaway) && 'Takeaway', yes(p.delivery) && 'Delivery', yes(p.reservation) && 'Takes bookings',
    p.wifi && 'Wi-Fi', p.wheelchair === 'yes' && 'Step-free access', p.vegan ? 'Vegan options' : p.vegetarian && 'Vegetarian options',
    yes(p.dogs) && 'Dogs welcome', ...(d.features || []),
  ].filter(Boolean);
  const unique = [...new Set(feats)];
  const cuisines = cuisineLabels(p.cuisine);
  // (Its description is at the top of the page, with the details.)
  return `
    ${cuisines.length || d.categories?.length ? `<div class="section-title">Food</div><div class="subratings">${[...new Set([...cuisines, ...(d.categories || [])])].map((c) => `<span class="chip">${esc(c)}</span>`).join('')}</div>` : ''}
    ${unique.length ? `<div class="section-title">Good to know</div><ul class="group features">${unique.map((f) => `<li><div class="cell"><span class="check">✓</span>${esc(f)}</div></li>`).join('')}</ul>` : ''}
    ${d.ranking || d.awards?.length ? `<div class="section-title">Recognition</div><ul class="group features">${[d.ranking, ...(d.awards || [])].filter(Boolean).map((a) => `<li><div class="cell">${esc(a)}</div></li>`).join('')}</ul>` : ''}`;
}

afterRender.place = () => {
  // The same card each time the page is drawn, so Google loads (and bills) it once.
  const card = state.search?.place?.kit?.el;
  const slot = $('#gcard-slot');
  if (card && slot) { card.style.colorScheme = isDark() ? 'dark' : 'light'; slot.append(card); }
  $('#dir-when-type')?.addEventListener('change', (e) => {
    if (e.target.value === 'arrive') {
      const d = nextHalfHour();
      d.setHours(d.getHours() + 1);
      const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      state.when = { type: 'arrive', time: state.shareWhen || local };
    } else state.when = { type: 'now' };
    render({ keepScroll: true });
  });
  const arrive = $('#dir-when-time');
  if (arrive) {
    // Reset: leaving now again.
    const reset = resetsToNow(arrive, () => { state.when = { type: 'now' }; render({ keepScroll: true }); });
    arrive.addEventListener('change', () => {
      if (!arrive.isConnected || reset()) return; // (a reset has drawn the page again already)
      state.when = { type: 'arrive', time: arrive.value };
      render({ keepScroll: true });
    });
  }
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
      <figure><img src="${esc(ph.url)}" alt="${esc(ph.caption || '')}"><figcaption>${[
        esc(ph.caption || ''),
        // Who took it, linked to their profile when there is one (Google asks for this).
        ph.by ? `by ${ph.byUrl ? `<a href="${linkOf(ph.byUrl)}" target="_blank" rel="noopener">${esc(ph.by)}</a>` : esc(ph.by)}` : '',
        esc(ph.credit || ''),
      ].filter(Boolean).join(' · ')}
      ${ph.link ? ` · <a href="${linkOf(ph.link)}" target="_blank" rel="noopener">Licence &amp; source</a>` : ''}<span class="lb-count">${i + 1} / ${photos.length}</span></figcaption></figure>`;
  };
  const close = () => { document.removeEventListener('keydown', onKey); leave(box, [{ opacity: 1 }, { opacity: 0 }], { duration: 220, remove: true }); };
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
  const shown = routePeople(s);
  const modes = shown.map((i) => s.people[i].mode);
  const when = modes.includes('transit') ? state.when || { type: 'now' } : { type: 'now' };
  const key = [placeKey(p), modes.join(','), when.type, when.time || '', s.leaveAt || ''].join('|');
  if (state.dir?.key === key) return;
  const prev = state.dir;
  // The lines drawn for the old ways of travelling (or the old time) go: the new ones replace them.
  if (prev?.layer) poiLayer.removeLayer(prev.layer);
  // Your route opens with its steps showing; a place keeps the person opened (if any) when the way of travelling changes.
  const expanded = prev?.key?.startsWith(`${placeKey(p)}|`) ? prev.expanded : p.onlyYou ? shown[0] : -1;
  const dir = state.dir = { key, results: s.people.map((_, i) => ({ status: shown.includes(i) ? 'loading' : 'none' })), expanded, fitted: false };
  const opts = when.type === 'arrive' && when.time ? { time: new Date(when.time), arriveBy: true } : s.leaveAt ? { time: s.leaveAt } : {};
  shown.forEach((i) => {
    const person = s.people[i];
    getDirections(person.mode, person, p, person.mode === 'transit' ? opts : {})
      .then((data) => { dir.results[i] = { status: 'ok', data, option: 0 }; })
      .catch((err) => { dir.results[i] = { status: 'error', message: friendlyError(err, person.mode) }; })
      .finally(() => afterPageTurn(() => {
        if (state.dir !== dir || state.view !== 'place') return;
        drawDirections();
        render({ keepScroll: true });
        if (!dir.fitted && dir.results.every((r) => r.status !== 'loading')) {
          dir.fitted = true;
          const pts = dir.results.flatMap((r) => (r.status === 'ok' ? routeGeometry(r) : []));
          if (pts.length) fitTo([...pts, ...shown.map((k) => [s.people[k].lat, s.people[k].lon]), [p.lat, p.lon]], { maxZoom: 16 });
        }
      }));
  });
}

function friendlyError(err, mode) {
  if (err.status === 429 || err.friendly) return err.message;
  if (err.status === 404) return mode === 'transit' ? 'No public transport at this time. Try another time, or another way to travel.' : 'No route found. Try another way to travel.';
  return mode === 'transit' ? 'Public transport times didn’t load. Try again in a minute, or another way to travel.' : 'Directions didn’t load. Check your connection, then try again.';
}

const currentOption = (r) => r.data.options?.[r.option || 0];
const routeGeometry = (r) => (r.data.options ? currentOption(r).legs.flatMap((l) => l.geometry) : r.data.geometry);

/** Draw everyone's real routes on the map; walking parts dotted. */
/**
 * The routes to the meeting point: shown on the results, faded behind a
 * category's places, and hidden once everyone's routes to a chosen place
 * have come in (they replace them on the map).
 */
function showSearchRoutes() {
  const view = state.view;
  const p = state.search?.place;
  const own = ['place', 'share'].includes(view) && !!p && !!state.dir?.key.startsWith(`${placeKey(p)}|`);
  const rerouted = own && (p.onlyYou || state.dir.results.some((r) => r.status === 'ok'));
  anim?.canvas.classList.toggle('away', !!rerouted);
  anim?.canvas.classList.toggle('dim', !rerouted && ['group', 'place', 'share'].includes(view));
}

function drawDirections() {
  const dir = state.dir;
  const s = state.search;
  if (!dir) return;
  showSearchRoutes();
  if (dir.layer) poiLayer.removeLayer(dir.layer);
  const layer = dir.layer = L.layerGroup().addTo(poiLayer);
  s.people.forEach((person, i) => {
    const r = dir.results[i];
    if (r.status === 'none') return; // (Your route: just yours)
    const dim = dir.expanded >= 0 && dir.expanded !== i;
    const opacity = dim ? 0.3 : 1;
    if (r.status !== 'ok') {
      // Still on its way (or none found): a dotted line straight there.
      L.polyline([[person.lat, person.lon], [s.place.lat, s.place.lon]], { color: person.color, weight: 3, opacity: (r.status === 'loading' ? 0.35 : 0.6) * opacity, dashArray: '1 8', lineCap: 'round', interactive: false }).addTo(layer);
      return;
    }
    const pieces = r.data.options
      ? currentOption(r).legs.map((l) => ({ pts: l.geometry, mode: isWalkLeg(l) ? 'walk' : 'transit' }))
      : [{ pts: r.data.geometry, mode: r.data.mode || person.mode }];
    // The same line for each way of travelling as in the search animation:
    // dots walking, short dashes cycling, long dashes on public transport, solid driving.
    for (const piece of pieces) {
      if (piece.pts.length < 2) continue;
      const st = LINE_STYLE[piece.mode] || LINE_STYLE.drive;
      L.polyline(piece.pts, {
        color: person.color, weight: 4.2, opacity, lineCap: st.cap, lineJoin: 'round', interactive: false,
        dashArray: st.dash.length ? st.dash.map((d) => Math.max(0.1, d * 4.2)).join(' ') : null,
      }).addTo(layer);
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
    const leave = state.search?.leaveAt;
    const arrive = new Date((leave ? Date.parse(leave) : Date.now()) + r.data.duration * 1000).toISOString();
    sub = `${fmtDist(r.data.distance)}<span class="times">Arrive about ${clock(arrive)} if you leave ${leave ? `at ${clock(leave)}` : 'now'}</span>`;
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
  const handoff = `<div class="handoff"><a class="btn btn-tinted btn-sm" href="${esc(links.google)}" target="_blank" rel="noopener">Google Maps</a><a class="btn btn-tinted btn-sm" href="${esc(links.apple)}" target="_blank" rel="noopener">Apple Maps</a></div>`;
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
    ${backBtn('back-share', 'Back')}
    <div class="eyebrow" style="margin-left:4px">Send invite</div>
    <div class="sheet-title" style="margin-top:0"><h2>${esc(p.name)}</h2></div>
    <p class="footnote" style="margin:-8px 4px 14px">${esc(p.address || `${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}`)}</p>
    <ul class="group share-form">
      <li><div class="cell"><label for="share-when">When</label><input type="datetime-local" id="share-when" value="${esc(state.shareWhen || '')}"></div></li>
      <li><textarea id="share-text" aria-label="Message">${esc(text)}</textarea></li>
    </ul>
    <button class="btn btn-primary btn-block btn-lg" data-action="native-share">Share invite…</button>
    <div class="share-grid">
      <button class="btn btn-tinted" data-action="copy">Copy text</button>
      <a class="btn btn-tinted" href="${esc(msg.whatsapp)}" target="_blank" rel="noopener" data-share="whatsapp">WhatsApp</a>
      <a class="btn btn-tinted" href="${esc(msg.sms)}" data-share="sms">Messages</a>
      <a class="btn btn-tinted" href="${esc(msg.email)}" data-share="email">Email</a>
      <a class="btn btn-tinted" href="${esc(msg.telegram)}" target="_blank" rel="noopener" data-share="telegram">Telegram</a>
      <button class="btn btn-tinted" data-action="calendar">Add to calendar</button>
      <a class="btn btn-tinted" href="${esc(links.google)}" target="_blank" rel="noopener">Google Maps</a>
      <a class="btn btn-tinted" href="${esc(links.apple)}" target="_blank" rel="noopener">Apple Maps</a>
    </div>`;
}

afterRender.share = () => {
  const ta = $('#share-text');
  ta.addEventListener('input', () => { state.shareText = ta.value; updateShareLinks(); });
  const when = $('#share-when');
  const setWhen = () => {
    state.shareWhen = when.value;
    state.shareText = shareText(shareContext(), { when: when.value ? new Date(when.value) : null });
    ta.value = state.shareText;
    updateShareLinks();
  };
  const reset = resetsToNow(when, setWhen); // Reset: the time it is now
  when.addEventListener('change', () => { if (!reset()) setWhen(); });
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
  const onPanelClick = async (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const action = el.dataset.action;
    const id = el.closest('[data-id]')?.dataset.id;
    const s = state.search;
    switch (action) {
      case 'find': findPlaces(); break;
      case 'add-person': addFromBox(); break;
      case 'save-address': toggleSavedAddress(); break;
      case 'leave-now': state.leaveAt = ''; render({ keepScroll: true }); break;
      case 'focus': {
        const p = everyone().find((x) => x.id === id);
        if (p) map.flyTo([p.lat, p.lon], Math.max(map.getZoom(), 15), { duration: 0.6 });
        break;
      }
      case 'person-tap': // (not a tap on the switch beside them, or in the travel menu)
        if (!e.target.closest('label.switch, .menu')) personTap(id, e);
        break;
      case 'edit': state.edit = { id, field: el.dataset.field === 'address' ? 'address' : 'name' }; state.open = id; state.modeMenu = null; render({ keepScroll: true }); break;
      case 'edit-cancel': state.edit = null; render({ keepScroll: true }); break;
      case 'heart-person': toggleSavedPerson(id); break;
      case 'delete': deletePlace(id); break;
      case 'toggle': setIncluded(id, el.checked); break;
      case 'tab': s.tab = el.dataset.tab; render(); break;
      case 'group': s.markersKey = null; s.group = el.dataset.group; s.sort = s.sort || 'near'; setView('group'); break;
      case 'replay': findPlaces({ replay: true }); break;
      case 'your-route': s.place = meetPlace(s, { onlyYou: true }); s.placeDrawn = null; setView('place'); break;
      case 'send-meet': s.place = meetPlace(s); state.shareFrom = 'results'; enterShare(); break;
      case 'you-mode': setPersonMode(s.people[routePeople(s)[0]].id, el.dataset.mode); break;
      case 'edit-people': cancelSearch(); break;
      case 'back-results':
        poiLayer.clearLayers();
        s.markersKey = null;
        s.radiiShown = false; // the map shows everyone again: touching the slider comes in close again
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
        if (state.modeMenu === el.dataset.id) closeModeMenu(() => render({ keepScroll: true }));
        else { state.modeMenu = el.dataset.id; render({ keepScroll: true }); }
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
      case 'choose': state.shareFrom = 'place'; enterShare(); break;
      case 'jump': { // to a part of a place's page (Directions, its reviews)
        if (isMobile() && sheet.snap === 'peek') { sheet.chosen = 'mid'; setSheet('mid'); }
        document.getElementById(el.dataset.to)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        break;
      }
      case 'open-maps': chooseMapsApp(s.place); break;
      case 'photo': openLightbox(s.place.details?.photos || [], Number(el.dataset.i)); break;
      case 'rv-more': el.classList.toggle('open'); break;
      case 'back-share': // to the page Send was pressed on
        if (s) { setView(state.shareFrom || 'place'); break; }
        state.sharePlace = null;
        poiLayer.clearLayers();
        setView('people');
        break;
      case 'native-share': {
        // (busy until the share sheet is done: pressed again meanwhile, it would fail)
        el.setAttribute('aria-busy', 'true');
        try {
          const ok = await nativeShare(shareContext(), state.shareText);
          if (!ok && await copyText(state.shareText)) toast('Copied. Paste it into your group chat.');
        } finally { el.removeAttribute('aria-busy'); }
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
  };
  body.addEventListener('click', doubleTap, true); // (before anything the second tap of a double-tap lands on)
  body.addEventListener('click', onPanelClick);
  // Pictures fade in once loaded; broken ones disappear.
  body.addEventListener('load', (e) => { if (e.target.tagName === 'IMG') e.target.classList.add('in'); }, true);
  body.addEventListener('error', (e) => { if (e.target.tagName === 'IMG') e.target.classList.add('broken'); }, true);
  body.addEventListener('keydown', (e) => {
    const t = e.target;
    if ((e.key === 'Enter' || e.key === ' ') && t.getAttribute?.('role') === 'button' && t.tagName !== 'BUTTON') { e.preventDefault(); t.click(); }
  });
  body.addEventListener('submit', (e) => {
    if (!e.target.closest('[data-action="save-edit"]')) return;
    e.preventDefault();
    saveEdit();
  });

  const go = $('#btn-go');
  go.onclick = () => findPlaces();
  go.addEventListener('pointerdown', (e) => {
    const r = go.getBoundingClientRect();
    go.style.setProperty('--px', `${Math.round(e.clientX - r.left)}px`);
    go.style.setProperty('--py', `${Math.round(e.clientY - r.top)}px`);
  });
  $('#btn-skip').onclick = () => anim?.skip();
  $('#btn-cancel-search').onclick = cancelSearch;
  // The wordmark: back to the start page (its Cancel comes back to the map as it was).
  $('#btn-home').onclick = () => {
    document.activeElement?.blur();
    showHomeScreen(true, { focus: false });
  };
  $('#btn-recenter').onclick = () => {
    const pts = viewPoints();
    if (pts.length < 2) map.flyTo(pts[0] || [state.user.home.lat, state.user.home.lon], 15, { duration: 0.6 });
    else fitTo(pts, { maxZoom: state.view === 'group' ? 17 : 16 });
  };
}

/** What the page in view is about, as points to keep in sight: the people, and the meeting point, the listed places or the chosen place. */
function viewPoints() {
  const s = state.search;
  if (!s) {
    const h = state.sharePlace;
    return state.view === 'share' && h ? [[h.lat, h.lon]] : activePeople().map((p) => [p.lat, p.lon]);
  }
  const people = s.people.map((p) => [p.lat, p.lon]);
  const meet = s.meet ? [[s.meet.lat, s.meet.lon]] : [];
  if (state.view === 'group' && s.groupList?.length) return [...s.groupList.map((p) => [p.lat, p.lon]), ...meet];
  if (['place', 'share'].includes(state.view) && s.place) return [...people, [s.place.lat, s.place.lon]];
  return [...people, ...meet];
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
  // The phone's status bar (and the browser's own bars) in the app's colours.
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', isDark() ? '#000000' : '#f2f2f7');
  if (map) addBasemap();
  anim?.setTheme(isDark() ? 'dark' : 'light');
}

function syncSettingsUI() {
  for (const [id, key] of [['#set-travel', 'travel'], ['#set-speed', 'speed'], ['#set-theme', 'theme']]) {
    for (const b of $$('.seg', $(id))) b.classList.toggle('active', b.dataset.value === state.settings[key]);
  }
  placeThumbs($('#drawer-settings'));
}

function renderHistory() {
  const h = state.user?.history || [];
  $('#history-list').innerHTML = h.length
    ? h.map((x) => `<li data-hid="${esc(x.id)}"><div><div class="h-name">${esc(x.name)}</div>
        <div class="h-sub">${esc([x.category, new Date(x.at).toLocaleDateString()].filter(Boolean).join(' · '))}</div></div>
        <button class="icon-btn" data-del="${esc(x.id)}" aria-label="Remove">✕</button></li>`).join('')
    : '<li class="empty-note">Places you send show up here.</li>';
}

/**
 * The menu drawer, on one of its pages: Settings (the starting point, the
 * meeting rule, how people travel, the animation, the look and past meetups)
 * or Saved (the addresses kept with the heart).
 */
function openDrawer(open, page = 'settings') {
  const drawer = $('#drawer'), back = $('#drawer-backdrop');
  if (!open) {
    leave(drawer, [{ transform: 'none' }, { transform: 'translateX(calc(100% + 20px))' }], { duration: 300, easing: 'cubic-bezier(0.4, 0, 0.7, 1)', hide: true });
    leave(back, [{ opacity: 1 }, { opacity: 0 }], { duration: 260, hide: true });
    return;
  }
  stay(drawer);
  stay(back);
  drawer.hidden = false;
  back.hidden = false;
  drawer.dataset.page = page;
  $('#drawer-title').textContent = page === 'saved' ? 'Saved' : 'Settings';
  drawer.setAttribute('aria-label', page === 'saved' ? 'Saved' : 'Settings');
  $('#drawer-settings').hidden = page === 'saved';
  $('#drawer-saved').hidden = page !== 'saved';
  drawer.scrollTop = 0;
  if (page === 'saved') { renderSaved(); return; }
  $('#drawer-home').textContent = state.user.home?.address || 'Not set';
  syncSettingsUI();
  renderHistory();
}

async function saveSettings(patch) {
  state.settings = { ...state.settings, ...patch };
  applyTheme();
  syncSettingsUI();
  if (state.search && ['results', 'group', 'place', 'searching'].includes(state.view)) render({ keepScroll: true });
  try { await api.updateMe({ settings: state.settings }); } catch { /* keep local */ }
}

/** The menu button's menu: Settings and Saved, growing out of the button (and back into it). */
function openTopMenu(open) {
  const menu = $('#top-menu'), btn = $('#btn-menu');
  btn.setAttribute('aria-expanded', String(open));
  if (!open) {
    leave(menu, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(0.4)' }], { duration: 180, hide: true });
    return;
  }
  stay(menu);
  const n = state.saved.length;
  $('#saved-count').textContent = n ? String(n) : '';
  menu.hidden = false;
}

/** Saved: each address kept with the heart, to add to the meetup (or seen to be in it already), or to forget. */
function renderSaved() {
  const list = $('#saved-list');
  const colors = ['#ff9500', '#34c759', '#af52de', '#ff2d55', '#5ac8fa', '#ffcc00', '#5856d6'];
  const inMeetup = (sv) => everyone().some((p) => p.address === sv.address || haversine(p.lat, p.lon, sv.lat, sv.lon) < 15);
  list.innerHTML = state.saved.length
    ? state.saved.map((sv, i) => {
      const title = savedTitle(sv);
      const here = inMeetup(sv);
      return `<li class="saved-row" data-sid="${esc(sv.id)}">
        <span class="avatar" style="--c:${colors[i % colors.length]}">${esc(initial(title))}</span>
        <span class="saved-text"><span class="saved-name">${esc(title)}</span><span class="saved-sub">${esc(sv.address)}</span></span>
        ${here ? '<span class="saved-in">In the meetup</span>'
          : `<button class="saved-add" type="button" data-add="${esc(sv.id)}" aria-label="Add ${esc(title)} to the meetup">Add</button>`}
        <button class="saved-heart" type="button" data-forget="${esc(sv.id)}" aria-label="Forget ${esc(title)}" title="Forget">${heart(true, 18)}</button>
      </li>`;
    }).join('')
    : `<li class="saved-empty">${heart(false, 30)}<b>Nothing saved yet</b></li>`;
}

async function addSaved(id) {
  const sv = state.saved.find((x) => x.id === id);
  if (!sv) return;
  await addPlace({ address: sv.address, lat: sv.lat, lon: sv.lon, nickname: sv.nickname || '' });
  renderSaved();
}

async function forgetSaved(id) {
  const sv = state.saved.find((x) => x.id === id);
  if (!sv) return;
  await forgetAddress(id);
  renderSaved();
  if (state.view === 'people') render({ keepScroll: true }); // (their heart empties)
  toast(`Forgot ${savedTitle(sv)}`, {
    action: 'Undo',
    onAction: async () => {
      await toggleSaved(sv, sv.nickname || '');
      if (!$('#drawer').hidden && $('#drawer').dataset.page === 'saved') renderSaved();
      if (state.view === 'people') render({ keepScroll: true });
    },
  });
}

function initDrawer() {
  $('#btn-menu').onclick = () => openTopMenu($('#top-menu').hidden);
  $('#top-menu').addEventListener('click', (e) => {
    const item = e.target.closest('[data-open]');
    if (!item) return;
    openTopMenu(false);
    openDrawer(true, item.dataset.open);
  });
  // A tap anywhere else closes the menu.
  document.addEventListener('pointerdown', (e) => {
    if (!$('#top-menu').hidden && !e.target.closest('#top-menu, #btn-menu')) openTopMenu(false);
  }, true);
  $('#saved-list').addEventListener('click', (e) => {
    const add = e.target.closest('[data-add]'), forget = e.target.closest('[data-forget]');
    if (add) addSaved(add.dataset.add);
    else if (forget) forgetSaved(forget.dataset.forget);
  });
  $('#drawer-close').onclick = () => openDrawer(false);
  $('#drawer-backdrop').onclick = () => openDrawer(false);
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!$('#top-menu').hidden) openTopMenu(false);
    else if (!$('#drawer').hidden) openDrawer(false);
  });
  for (const [id, key] of [['#set-travel', 'travel'], ['#set-speed', 'speed'], ['#set-theme', 'theme']]) {
    $(id).addEventListener('click', (e) => {
      const b = e.target.closest('.seg');
      if (b) saveSettings({ [key]: b.dataset.value });
    });
  }
  $('#btn-edit-home').onclick = () => { openDrawer(false); showHomeScreen(true); };
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
  document.addEventListener('touchstart', () => {}, { passive: true }); // (iOS shows a button as pressed only where touches are listened for)
  noZoomForTyping();
  followKeyboard();
  initHome();
  initPanel();
  initSheet();
  initDrawer();
  // A turned phone or a resized window: the map takes its new size, and when the
  // width changed (not just the height, as when a keyboard opens) what the page
  // is about is brought back into sight beside or above the panel.
  let lastWidth = window.innerWidth, refit = 0;
  window.addEventListener('resize', () => {
    map?.invalidateSize();
    if (!map || Math.abs(window.innerWidth - lastWidth) < 60) return;
    lastWidth = window.innerWidth;
    clearTimeout(refit);
    refit = setTimeout(() => {
      if ($('#screen-main').hidden) return;
      const pts = viewPoints();
      if (pts.length > 1) fitTo(pts, { maxZoom: 16, animate: false });
    }, 250);
  });
  ratingsSource().then((src) => { ratingsOn = !!src; ratingsName = src === 'tripadvisor' ? 'Tripadvisor' : src || ''; });
  getConfig().then((c) => {
    if (c.version) { $('#app-version').hidden = false; $('#app-version').textContent = `Version ${c.version}`; }
    placesKitKey = c.placesKit || null;
  });
  onUser(await api.start());
}

window.__meet = { onUser, api, render, get map() { return map; } };
boot();
