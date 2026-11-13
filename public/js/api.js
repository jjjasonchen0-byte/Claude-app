// Everything Meet keeps (your starting point, the people you meet, past
// meetups and settings) is saved on this device, in the browser's storage.
// There are no accounts and nothing to sign in to.
const KEY = 'meet-guest-v1'; // its name from when profiles were optional, kept so nothing saved is lost
let memory = null; // used when browser storage is blocked

const blank = () => ({ name: '', home: null, places: [], history: [], settings: {} });

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...blank(), ...JSON.parse(raw) };
  } catch { /* fall back to memory */ }
  return memory || blank();
}

function save(data) {
  memory = data;
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* memory only */ }
}

const newId = () => Math.random().toString(36).slice(2, 11);
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
    if (!place) throw Object.assign(new Error('Address not found'), { status: 404 });
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
