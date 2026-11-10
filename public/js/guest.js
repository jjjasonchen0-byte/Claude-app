// Guest mode: everything works without a profile. Home, people, history and
// settings are kept in this browser until the person chooses to sign in.
const KEY = 'meet-guest-v1';
let memory = null; // used when browser storage is blocked

const blank = () => ({ id: 'guest', guest: true, email: '', name: '', home: null, places: [], history: [], settings: {} });

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...blank(), ...JSON.parse(raw), guest: true };
  } catch { /* fall back to memory */ }
  return memory || blank();
}

function save(data) {
  memory = data;
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* memory only */ }
}

const newId = () => Math.random().toString(36).slice(2, 11);
const clean = (p) => ({
  address: String(p.address || '').slice(0, 300),
  nickname: String(p.nickname || '').trim().slice(0, 60),
  lat: Number(p.lat),
  lon: Number(p.lon),
});
const view = (d) => ({ ...d, history: d.history.slice(0, 50) });

export const guest = {
  /** Raw stored data (used to move it into a profile on sign-in). */
  data: () => load(),
  clear() {
    memory = null;
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  },
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
