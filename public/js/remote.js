// Thin wrapper over the Meet server API (signed-in profiles).
async function request(method, url, body) {
  const res = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = {};
  try { data = await res.json(); } catch { /* empty */ }
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const remote = {
  me: () => request('GET', '/api/me'), // { user: null } when signed out
  login: (email, password) => request('POST', '/api/login', { email, password }),
  signup: (email, password, name) => request('POST', '/api/signup', { email, password, name }),
  logout: () => request('POST', '/api/logout'),
  updateMe: (patch) => request('PATCH', '/api/me', patch),
  addPlace: (p) => request('POST', '/api/places', p),
  updatePlace: (id, patch) => request('PATCH', `/api/places/${encodeURIComponent(id)}`, patch),
  deletePlace: (id) => request('DELETE', `/api/places/${encodeURIComponent(id)}`),
  addHistory: (h) => request('POST', '/api/history', h),
  deleteHistory: (id) => request('DELETE', `/api/history/${encodeURIComponent(id)}`),
};
