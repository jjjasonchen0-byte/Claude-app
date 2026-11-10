// One data API for the app. People start as guests (saved in this browser);
// signing in switches to their profile on the server and brings along
// whatever they set up as a guest.
import { remote } from './remote.js';
import { guest } from './guest.js';

let backend = guest;

const spot = (p) => `${Number(p.lat).toFixed(4)},${Number(p.lon).toFixed(4)}`;

/** Copy guest data into the signed-in profile, then forget it locally. */
async function bringGuestData() {
  const g = guest.data();
  if (!g.home && !g.places.length && !g.history.length) return;
  const { user } = await remote.me();
  const patch = {};
  if (!user.home && g.home) patch.home = g.home;
  if (Object.keys(g.settings || {}).length) patch.settings = { ...g.settings, ...(user.settings || {}) };
  if (Object.keys(patch).length) await remote.updateMe(patch);
  const have = new Set((user.places || []).map(spot));
  for (const p of g.places) if (!have.has(spot(p))) await remote.addPlace(p);
  for (const h of [...g.history].reverse()) await remote.addHistory(h);
  guest.clear();
}

async function signedIn(call) {
  await call();
  try { await bringGuestData(); } catch { /* keep guest data for next time */ }
  backend = remote;
  return remote.me();
}

export const api = {
  /** Resolve the current user: the signed-in profile, or the guest. */
  async start() {
    try {
      const { user } = await remote.me();
      if (user) { backend = remote; return user; }
    } catch { /* no server: guest mode */ }
    backend = guest;
    return (await guest.me()).user;
  },
  isGuest: () => backend === guest,
  login: (email, password) => signedIn(() => remote.login(email, password)),
  signup: (email, password, name) => signedIn(() => remote.signup(email, password, name)),
  async logout() {
    try { await remote.logout(); } finally { backend = guest; }
    return guest.me();
  },
  me: () => backend.me(),
  updateMe: (patch) => backend.updateMe(patch),
  addPlace: (p) => backend.addPlace(p),
  updatePlace: (id, patch) => backend.updatePlace(id, patch),
  deletePlace: (id) => backend.deletePlace(id),
  addHistory: (h) => backend.addHistory(h),
  deleteHistory: (id) => backend.deleteHistory(id),
};
