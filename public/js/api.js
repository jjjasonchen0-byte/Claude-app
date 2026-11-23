// Everything Meet keeps (your starting point, the people you meet, past
// meetups and settings) is saved on this device, in the browser's storage.
// There are no accounts and nothing to sign in to.
const KEY = 'meet-guest-v1'; // its name from when profiles were optional, kept so nothing saved is lost
let memory = null; // the latest data, for when the browser's storage can't be used
let unsaved = false; // the browser refused the last save (private browsing, storage full or blocked): memory is ahead of it

const blank = () => ({ name: '', home: null, places: [], saved: [], history: [], settings: {} });
const newId = () => Math.random().toString(36).slice(2, 11);

const located = (p) => !!p && typeof p === 'object' && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lon));
/** Whatever was stored (by an older version, or damaged), in the shape the app expects. */
function tidy(d) {
  const o = d && typeof d === 'object' ? d : {};
  return {
    name: typeof o.name === 'string' ? o.name : '',
    home: located(o.home) ? o.home : null,
    // (A record saved without an id gets one from its position in the list, the same every time it is read.)
    places: (Array.isArray(o.places) ? o.places : []).filter(located).map((p, i) => (p.id ? p : { ...p, id: `p${i}` })),
    // Addresses kept with the heart, to pick again later.
    saved: (Array.isArray(o.saved) ? o.saved : []).filter(located).map((s, i) => (s.id ? s : { ...s, id: `s${i}` })),
    history: (Array.isArray(o.history) ? o.history : []).filter(located).map((h, i) => (h.id ? h : { ...h, id: `h${i}` })),
    settings: o.settings && typeof o.settings === 'object' && !Array.isArray(o.settings) ? o.settings : {},
  };
}

function load() {
  if (!unsaved) {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return tidy(JSON.parse(raw));
    } catch { /* fall back to memory */ }
  }
  return memory || blank();
}

function save(data) {
  memory = data;
  try { localStorage.setItem(KEY, JSON.stringify(data)); unsaved = false; } catch { unsaved = true; /* memory only, for this visit */ }
}

const MODES = ['transit', 'walk', 'bike', 'drive'];
const clean = (p) => ({
  address: String(p.address || '').slice(0, 300),
  nickname: String(p.nickname || '').trim().slice(0, 60),
  lat: Number(p.lat),
  lon: Number(p.lon),
  ...(MODES.includes(p.mode) ? { mode: p.mode } : {}),
});
const view = (d) => ({ ...d, history: d.history.slice(0, 50) });

export const api = {
  /** Everything saved so far (a blank start the first time). */
  async start() { return view(load()); },
  /** False when the browser refused the last save: what was added lasts only until the page is closed. */
  saved: () => !unsaved,
  async me() { return { user: view(load()) }; },
  async updateMe(patch) {
    const d = load();
    if ('name' in patch) d.name = String(patch.name || '').slice(0, 60);
    if ('home' in patch) d.home = patch.home ? clean(patch.home) : null;
    if (patch.settings) d.settings = { ...d.settings, ...patch.settings };
    save(d);
    return { user: view(d) };
  },
  async addPlace(p) {
    const d = load();
    const place = { id: newId(), ...clean(p), active: p.active !== false };
    d.places.push(place);
    save(d);
    return { place };
  },
  async updatePlace(id, patch) {
    const d = load();
    const place = d.places.find((x) => x.id === id);
    if (!place) throw Object.assign(new Error('Address not found. Add the suburb or postcode, then try again.'), { status: 404 });
    if ('address' in patch || 'lat' in patch || 'lon' in patch) Object.assign(place, clean({ ...place, ...patch }));
    if ('nickname' in patch) place.nickname = String(patch.nickname || '').trim().slice(0, 60);
    if ('active' in patch) place.active = !!patch.active;
    if ('mode' in patch) { if (MODES.includes(patch.mode)) place.mode = patch.mode; else delete place.mode; }
    save(d);
    return { place };
  },
  async deletePlace(id) {
    const d = load();
    d.places = d.places.filter((x) => x.id !== id);
    save(d);
    return { ok: true };
  },
  /**
   * Keep an address to pick again later (with the name it was given). The
   * same address saved again moves to the top of the list with its new name.
   */
  async saveAddress(p) {
    const d = load();
    const entry = { id: newId(), ...clean(p), at: Date.now() };
    delete entry.mode;
    d.saved = [entry, ...d.saved.filter((s) => !(s.address === entry.address && Math.abs(s.lat - entry.lat) < 1e-4 && Math.abs(s.lon - entry.lon) < 1e-4))].slice(0, 50);
    save(d);
    return { saved: entry };
  },
  async unsaveAddress(id) {
    const d = load();
    d.saved = d.saved.filter((s) => s.id !== id);
    save(d);
    return { ok: true };
  },
  async addHistory(h) {
    const d = load();
    const entry = { id: newId(), at: Date.now(), name: h.name, category: h.category || '', address: h.address || '', lat: h.lat, lon: h.lon, people: h.people || [] };
    d.history = [entry, ...d.history].slice(0, 50);
    save(d);
    return { entry };
  },
  async deleteHistory(id) {
    const d = load();
    d.history = d.history.filter((x) => x.id !== id);
    save(d);
    return { ok: true };
  },
};
