// Opening hours from OpenStreetMap's opening_hours tag, for the common
// forms ("Mo-Fr 09:00-17:00; Sa 10:00-14:00", "24/7", "Tu-Su 12:00-23:00",
// "We-Su 17:00-01:00", "Mo off"). Anything fancier (months, holidays,
// sunrise) is shown as written instead of guessing.

const DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
export const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const TIME = /^(\d{1,2}):(\d{2})$/;

function parseDays(sel) {
  const days = new Set();
  for (const part of sel.split(',')) {
    const m = part.trim().match(/^(Mo|Tu|We|Th|Fr|Sa|Su)(?:-(Mo|Tu|We|Th|Fr|Sa|Su))?$/);
    if (!m) return null;
    const a = DAYS.indexOf(m[1]);
    const b = m[2] ? DAYS.indexOf(m[2]) : a;
    for (let d = a; ; d = (d + 1) % 7) { days.add(d); if (d === b) break; }
  }
  return days;
}

const toMin = (s) => {
  const m = TIME.exec(s.trim());
  if (!m || Number(m[1]) > 24 || Number(m[2]) > 59) return null;
  return Number(m[1]) * 60 + Number(m[2]);
};

function parseTimes(sel) {
  const out = [];
  for (const part of sel.split(',')) {
    const p = part.trim();
    if (!p) continue;
    const open = p.match(/^(\d{1,2}:\d{2})\+$/);
    if (open) { const a = toMin(open[1]); if (a == null) return null; out.push([a, 24 * 60]); continue; }
    const [x, y, extra] = p.split('-');
    if (extra !== undefined || y === undefined) return null;
    const a = toMin(x), b = toMin(y);
    if (a == null || b == null) return null;
    out.push([a, b <= a ? b + 24 * 60 : b]); // past midnight
  }
  return out;
}

/** opening_hours → week: 7 arrays (Mon…Sun) of [openMin, closeMin] (close may pass 24:00), or null. */
export function parseHours(spec) {
  const s = String(spec || '').trim();
  if (!s) return null;
  if (s === '24/7') return DAYS.map(() => [[0, 24 * 60]]);
  const week = DAYS.map(() => []);
  // "Mo-Fr 09:00-17:00, Sa 10:00-14:00" uses commas between rules too.
  const rules = s.replace(/\|\|/g, ';').split(';').flatMap((r) => r.split(/(?<=[\d+]|off|closed),\s*(?=(?:Mo|Tu|We|Th|Fr|Sa|Su)\b)/));
  for (const raw of rules) {
    const rule = raw.trim().replace(/\s*"[^"]*"\s*$/, ''); // drop comments
    if (!rule) continue;
    if (/^(PH|SH)\b/.test(rule)) continue; // holidays: not modelled
    const m = rule.match(/^((?:(?:Mo|Tu|We|Th|Fr|Sa|Su)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?)(?:,(?:Mo|Tu|We|Th|Fr|Sa|Su)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?)*)?(?:,PH)?\s*(.*)$/);
    if (!m) return null;
    const days = m[1] ? parseDays(m[1]) : new Set([0, 1, 2, 3, 4, 5, 6]);
    if (!days) return null;
    const rest = m[2].trim();
    if (/^(off|closed)$/i.test(rest)) { for (const d of days) week[d] = []; continue; }
    const times = rest ? parseTimes(rest) : [[0, 24 * 60]];
    if (!times) return null;
    for (const d of days) week[d] = times; // a later rule replaces the day
  }
  return week;
}

const defaultFmt = (min) => {
  const m = ((min % 1440) + 1440) % 1440;
  return new Date(2000, 0, 1, Math.floor(m / 60), m % 60).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};

/**
 * Is it open at `date`? → { open, soon, text } like "Open · Closes 22:00",
 * "Closes soon · 22:00", "Closed · Opens Tue 09:00", "Open 24 hours"; or null if unknown.
 */
export function openStatus(spec, date = new Date(), { fmt = defaultFmt } = {}) {
  const week = parseHours(spec);
  if (!week) return null;
  if (week.every((d) => d.length === 1 && d[0][0] === 0 && d[0][1] >= 1440)) return { open: true, soon: false, text: 'Open 24 hours' };
  const day = (date.getDay() + 6) % 7;
  const now = date.getHours() * 60 + date.getMinutes();
  const spans = [];
  // Yesterday's late hours, today's and the next six days', on one timeline.
  for (let k = -1; k < 7; k++) {
    for (const [a, b] of week[(day + k + 7) % 7]) spans.push([a + k * 1440, b + k * 1440]);
  }
  spans.sort((x, y) => x[0] - y[0]);
  // Merge touching spans (e.g. 00:00-24:00 every day).
  const merged = [];
  for (const sp of spans) {
    const last = merged.at(-1);
    if (last && sp[0] <= last[1]) last[1] = Math.max(last[1], sp[1]); else merged.push([...sp]);
  }
  const cur = merged.find(([a, b]) => a <= now && now < b);
  if (cur) {
    if (cur[1] - now > 6 * 1440) return { open: true, soon: false, text: 'Open 24 hours' };
    const soon = cur[1] - now <= 45;
    return { open: true, soon, text: `${soon ? 'Closes soon' : 'Open'} · ${soon ? '' : 'Closes '}${fmt(cur[1])}` };
  }
  const next = merged.find(([a]) => a > now);
  if (!next) return { open: false, soon: false, text: 'Closed' };
  const dayOffset = Math.floor(next[0] / 1440);
  const when = dayOffset === 0 ? fmt(next[0]) : dayOffset === 1 ? `tomorrow ${fmt(next[0])}` : `${DAY_NAMES[(day + dayOffset) % 7]} ${fmt(next[0])}`;
  return { open: false, soon: next[0] - now <= 45, text: `Closed · Opens ${when}` };
}

/** Rows for a weekly table: [{ day: 'Mon', text: '9:00 AM – 5:00 PM', today }] or null. */
export function weekTable(spec, date = new Date(), { fmt = defaultFmt } = {}) {
  const week = parseHours(spec);
  if (!week) return null;
  const today = (date.getDay() + 6) % 7;
  return week.map((spans, d) => ({
    day: DAY_NAMES[d],
    today: d === today,
    text: !spans.length ? 'Closed'
      : spans.length === 1 && spans[0][0] === 0 && spans[0][1] >= 1440 ? 'Open 24 hours'
        : spans.map(([a, b]) => `${fmt(a)} – ${fmt(b)}`).join(', '),
  }));
}
