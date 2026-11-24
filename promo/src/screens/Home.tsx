// An original home screen: two pages of generic app icons (our own simple glyphs on gradient tiles),
// a dock and page dots, over a wallpaper in Meet's colours. Meet's real icon is on page two.
import React from 'react';
import { FONT, WALLPAPER } from '../theme';
import { StatusBar } from './Chat';

const ICON = 62; // app px
const COLS = [66.75, 152.25, 237.75, 323.25];
const ROW0 = 118;
const ROW = 104;

/** Where an icon sits (its top-left, in app px on its page). */
export const iconBox = (col: number, row: number) => ({ x: COLS[col] - ICON / 2, y: ROW0 + row * ROW, w: ICON, h: ICON });

const g = (a: string, b: string) => `linear-gradient(160deg, ${a}, ${b})`;
const S = { fill: 'none', stroke: '#fff', strokeWidth: 2.4, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

type App = { name: string; bg: string; glyph: React.ReactNode };
const APPS: Record<string, App> = {
  chats: { name: 'Chats', bg: g('#5ac8fa', '#0a6cff'), glyph: <svg width="34" height="34" viewBox="0 0 24 24"><path d="M12 4c-4.8 0-8.5 3.1-8.5 7 0 2.1 1.1 4 2.9 5.3L5.8 20l3.9-2c.7.2 1.5.3 2.3.3 4.8 0 8.5-3.1 8.5-7s-3.7-7.3-8.5-7.3z" fill="#fff" /></svg> },
  camera: { name: 'Camera', bg: g('#8e8e93', '#48484a'), glyph: <svg width="32" height="32" viewBox="0 0 24 24" {...S}><rect x="3" y="7" width="18" height="12" rx="3" /><circle cx="12" cy="13" r="3.4" /><path d="M8.5 7l1.4-2.2h4.2L15.5 7" /></svg> },
  photos: { name: 'Photos', bg: g('#ffcc00', '#ff6b00'), glyph: <svg width="32" height="32" viewBox="0 0 24 24" {...S}><rect x="3.5" y="5" width="17" height="14" rx="2.5" /><path d="M5 17l4.5-5 3.5 3.5 2.5-2.5L20 17" /><circle cx="15.5" cy="9" r="1.4" fill="#fff" stroke="none" /></svg> },
  clock: { name: 'Clock', bg: g('#2c2c2e', '#000'), glyph: <svg width="34" height="34" viewBox="0 0 24 24" {...S}><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3.2 2" /></svg> },
  weather: { name: 'Weather', bg: g('#64d2ff', '#0a84ff'), glyph: <svg width="34" height="34" viewBox="0 0 24 24"><circle cx="9" cy="9" r="3.6" fill="#ffd60a" /><path d="M8 18h9.5a3.5 3.5 0 0 0 0-7 5 5 0 0 0-9.4 1.6A2.8 2.8 0 0 0 8 18z" fill="#fff" /></svg> },
  notes: { name: 'Notes', bg: g('#ffe066', '#ffb800'), glyph: <svg width="32" height="32" viewBox="0 0 24 24" {...S}><path d="M6 7h12M6 11h12M6 15h8" /></svg> },
  music: { name: 'Music', bg: g('#ff6482', '#ff2d55'), glyph: <svg width="32" height="32" viewBox="0 0 24 24" {...S}><path d="M9 17V6l10-2v11" /><circle cx="7" cy="17" r="2.2" fill="#fff" /><circle cx="17" cy="15" r="2.2" fill="#fff" /></svg> },
  mail: { name: 'Mail', bg: g('#4fc3ff', '#0071e3'), glyph: <svg width="34" height="34" viewBox="0 0 24 24" {...S}><rect x="3.5" y="6" width="17" height="12" rx="2.5" /><path d="M4 7l8 6 8-6" /></svg> },
  calendar: { name: 'Calendar', bg: g('#ff6b5e', '#e5332a'), glyph: <svg width="32" height="32" viewBox="0 0 24 24" {...S}><rect x="4" y="5.5" width="16" height="14" rx="2.5" /><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" /></svg> },
  files: { name: 'Files', bg: g('#5ac8fa', '#007aff'), glyph: <svg width="34" height="34" viewBox="0 0 24 24"><path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" fill="#fff" /></svg> },
  fitness: { name: 'Fitness', bg: g('#4cd964', '#1f9d3a'), glyph: <svg width="34" height="34" viewBox="0 0 24 24" {...S}><path d="M3 12h4l2-4 3 8 2.5-6 1.5 2h5" /></svg> },
  settings: { name: 'Settings', bg: g('#a1a1a6', '#5d5d62'), glyph: <svg width="34" height="34" viewBox="0 0 24 24" {...S}><circle cx="12" cy="12" r="3" /><path d="M12 3.5v2.5M12 18v2.5M3.5 12H6M18 12h2.5M6 6l1.8 1.8M16.2 16.2L18 18M6 18l1.8-1.8M16.2 7.8L18 6" /></svg> },
  phone: { name: 'Phone', bg: g('#5cdc74', '#28b446'), glyph: <svg width="32" height="32" viewBox="0 0 24 24"><path d="M7 3.5l3 .5 1 4.2-2 1.3a12 12 0 0 0 5.5 5.5l1.3-2 4.2 1 .5 3a2 2 0 0 1-2 2A16.5 16.5 0 0 1 5 5.5a2 2 0 0 1 2-2z" fill="#fff" /></svg> },
  browser: { name: 'Browser', bg: g('#40c8ff', '#0062e0'), glyph: <svg width="34" height="34" viewBox="0 0 24 24" {...S}><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.6 2.4 2.6 14.6 0 17M12 3.5c-2.6 2.4-2.6 14.6 0 17" /></svg> },
  travel: { name: 'Travel', bg: g('#4be1d0', '#0aa3a3'), glyph: <svg width="34" height="34" viewBox="0 0 24 24"><path d="M21 4l-9 9M21 4l-6 17-3-8-8-3z" fill="#fff" /></svg> },
  food: { name: 'Recipes', bg: g('#ffb340', '#ff7a00'), glyph: <svg width="32" height="32" viewBox="0 0 24 24" {...S}><path d="M7 3v8M5 3v4a2 2 0 0 0 4 0V3M7 11v10M16 3c-2 1.5-2.5 4-2.5 7H16v11" /></svg> },
  books: { name: 'Books', bg: g('#ff9f45', '#e85d04'), glyph: <svg width="32" height="32" viewBox="0 0 24 24" {...S}><path d="M4 5.5C6.5 4.5 9.5 4.5 12 6c2.5-1.5 5.5-1.5 8-.5V19c-2.5-1-5.5-1-8 .5-2.5-1.5-5.5-1.5-8-.5z" /><path d="M12 6v13.5" /></svg> },
  games: { name: 'Games', bg: g('#bf5af2', '#7d2ae8'), glyph: <svg width="34" height="34" viewBox="0 0 24 24" {...S}><rect x="3" y="8" width="18" height="9" rx="4.5" /><path d="M7.5 11v3M6 12.5h3" /><circle cx="15.5" cy="11.5" r="0.9" fill="#fff" /><circle cx="17.5" cy="13.5" r="0.9" fill="#fff" /></svg> },
  wallet: { name: 'Wallet', bg: g('#3a3a3c', '#111'), glyph: <svg width="32" height="32" viewBox="0 0 24 24" {...S}><rect x="3.5" y="6" width="17" height="13" rx="3" /><path d="M14 12.5h6.5" /></svg> },
};

/** Meet's own icon (public/icon.svg). */
export const MeetIcon: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" style={{ display: 'block' }}>
    <defs><linearGradient id="mi-sheen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2a2a2e" /><stop offset="1" stopColor="#101012" /></linearGradient></defs>
    <rect width="64" height="64" rx="14" fill="url(#mi-sheen)" />
    <path d="M20 40L32 22L44 40" stroke="#fff" strokeWidth="2.5" fill="none" strokeLinejoin="round" opacity=".55" />
    <circle cx="20" cy="40" r="5" fill="#fff" /><circle cx="44" cy="40" r="5" fill="#fff" /><circle cx="32" cy="22" r="6" fill="#fff" />
  </svg>
);

export const AppIcon: React.FC<{ id: string; size?: number }> = ({ id, size = ICON }) => {
  if (id === 'meet') return <div style={{ width: size, height: size, borderRadius: size * 0.225, overflow: 'hidden', boxShadow: '0 2px 6px rgba(0,0,0,.25)' }}><MeetIcon size={size} /></div>;
  const a = APPS[id];
  return (
    <div style={{ width: size, height: size, borderRadius: size * 0.225, background: a.bg, display: 'grid', placeItems: 'center', boxShadow: 'inset 0 1px 0 rgba(255,255,255,.35), 0 2px 6px rgba(0,0,0,.25)' }}>
      <div style={{ transform: `scale(${size / ICON})` }}>{a.glyph}</div>
    </div>
  );
};

const PAGE1 = [['chats', 'camera', 'photos', 'clock'], ['weather', 'notes', 'calendar', 'files'], ['fitness', 'settings', 'wallet', 'games']];
const PAGE2 = [['meet', 'travel', 'food', 'books']];
const DOCK = ['phone', 'browser', 'mail', 'music'];
export const NAMES: Record<string, string> = { meet: 'Meet', ...Object.fromEntries(Object.entries(APPS).map(([k, v]) => [k, v.name])) };

const Grid: React.FC<{ rows: string[][]; hide?: string; press?: { id: string; s: number } }> = ({ rows, hide, press }) => (
  <>
    {rows.map((r, ri) => r.map((id, ci) => {
      const b = iconBox(ci, ri);
      return (
        <div key={id} style={{ position: 'absolute', left: b.x - 12, top: b.y, width: ICON + 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, opacity: hide === id ? 0 : 1 }}>
          <div style={{ transform: `scale(${press?.id === id ? press.s : 1})` }}><AppIcon id={id} /></div>
          <div style={{ color: '#fff', fontSize: 12, fontWeight: 500, textShadow: '0 1px 3px rgba(0,0,0,.4)', letterSpacing: '-0.01em' }}>{NAMES[id]}</div>
        </div>
      );
    }))}
  </>
);

/**
 * The home screen. `page` is the scroll position (0 = page 1, 1 = page 2, in between while swiping);
 * `hide` leaves an icon's slot empty (while its app grows out of it or shrinks back into it).
 */
export const HomeScreen: React.FC<{ page: number; hide?: string; press?: { id: string; s: number }; dim?: number }> = ({ page, hide, press, dim = 0 }) => (
  <div style={{ position: 'absolute', inset: 0, background: WALLPAPER, fontFamily: FONT, overflow: 'hidden' }}>
    <StatusBar color="#fff" time="6:31" />
    <div style={{ position: 'absolute', left: -page * 390, top: 0, width: 780, height: 844 }}>
      <div style={{ position: 'absolute', left: 0, top: 0, width: 390, height: 844 }}><Grid rows={PAGE1} hide={hide} press={press} /></div>
      <div style={{ position: 'absolute', left: 390, top: 0, width: 390, height: 844 }}><Grid rows={PAGE2} hide={hide} press={press} /></div>
    </div>
    {/* page dots */}
    <div style={{ position: 'absolute', left: 0, right: 0, top: 692, display: 'flex', justifyContent: 'center', gap: 8 }}>
      {[0, 1].map((i) => <div key={i} style={{ width: 7, height: 7, borderRadius: 4, background: '#fff', opacity: 0.35 + 0.65 * Math.max(0, 1 - Math.abs(page - i)) }} />)}
    </div>
    {/* the dock */}
    <div style={{ position: 'absolute', left: 12, right: 12, bottom: 12, height: 88, borderRadius: 34, background: 'rgba(255,255,255,0.22)', backdropFilter: 'blur(20px)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,.4)', display: 'flex', justifyContent: 'space-around', alignItems: 'center', padding: '0 10px' }}>
      {DOCK.map((id) => <AppIcon key={id} id={id} />)}
    </div>
    {dim > 0 && <div style={{ position: 'absolute', inset: 0, background: '#000', opacity: dim }} />}
  </div>
);
