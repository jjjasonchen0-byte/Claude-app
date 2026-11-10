// "Send location": share sheet, messaging deep links, map links, calendar invite.

export function mapLinks(place) {
  const ll = `${place.lat},${place.lon}`;
  const q = encodeURIComponent(place.name ? `${place.name} ${place.address || ''}`.trim() : ll);
  return {
    google: `https://www.google.com/maps/search/?api=1&query=${ll}`,
    googleDirections: `https://www.google.com/maps/dir/?api=1&destination=${ll}`,
    apple: `https://maps.apple.com/?ll=${ll}&q=${q}`,
    osm: `https://www.openstreetmap.org/?mlat=${place.lat}&mlon=${place.lon}#map=18/${place.lat}/${place.lon}`,
    geo: `geo:${ll}?q=${ll}(${encodeURIComponent(place.name || 'Meeting spot')})`,
  };
}

export function shareText(place, { when, note } = {}) {
  const lines = [`Let's meet at ${place.name || 'this spot'}`];
  if (place.address) lines.push(place.address);
  if (when) lines.push(`${when.toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}`);
  if (note) lines.push(note);
  lines.push(mapLinks(place).google);
  lines.push('Sent with Meet');
  return lines.join('\n');
}

export function messagingLinks(text, subject = 'Meet up?') {
  const t = encodeURIComponent(text);
  return {
    whatsapp: `https://wa.me/?text=${t}`,
    telegram: `https://t.me/share/url?url=${encodeURIComponent(' ')}&text=${t}`,
    sms: `sms:?&body=${t}`,
    email: `mailto:?subject=${encodeURIComponent(subject)}&body=${t}`,
  };
}

export async function nativeShare(place, text) {
  if (!navigator.share) return false;
  try {
    await navigator.share({ title: place.name || 'Meeting spot', text });
    return true;
  } catch (err) {
    return err?.name === 'AbortError'; // user closed the sheet: treat as handled
  }
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* fall through */ }
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  const ok = document.execCommand('copy');
  ta.remove();
  return ok;
}

const icsDate = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const icsEscape = (s) => String(s).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (m) => `\\${m}`);

/** Build an .ics calendar invite for the chosen place. */
export function calendarInvite(place, start, minutes = 120) {
  const end = new Date(start.getTime() + minutes * 60000);
  const body = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Meet//Meetup//EN', 'BEGIN:VEVENT',
    `UID:${Date.now()}-${Math.random().toString(36).slice(2)}@meet`,
    `DTSTAMP:${icsDate(new Date())}`, `DTSTART:${icsDate(start)}`, `DTEND:${icsDate(end)}`,
    `SUMMARY:${icsEscape(`Meet up at ${place.name || 'the meeting spot'}`)}`,
    `LOCATION:${icsEscape(place.address || `${place.lat},${place.lon}`)}`,
    `GEO:${place.lat};${place.lon}`,
    `DESCRIPTION:${icsEscape(mapLinks(place).google)}`,
    'END:VEVENT', 'END:VCALENDAR',
  ];
  return body.join('\r\n');
}

export function download(filename, content, type = 'text/calendar') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
