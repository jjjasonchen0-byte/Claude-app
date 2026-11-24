// An original home screen: two pages of our own invented apps (round icons, simple glyphs), page dots,
// a row of favourites and a search bar, over a wallpaper in Meet's colours. Meet's icon is on page two.
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
// Our own apps (names and colours of no phone maker's stock set), round like a launcher's adaptive icons.
const APPS: Record<string, App> = {
  chats: { name: 'Chats', bg: g('#7d6bff', '#4d3ae6'), glyph: <svg width="32" height="32" viewBox="0 0 24 24"><path d="M12 4c-4.8 0-8.5 3.1-8.5 7 0 2.1 1.1 4 2.9 5.3L5.8 20l3.9-2c.7.2 1.5.3 2.3.3 4.8 0 8.5-3.1 8.5-7s-3.7-7.3-8.5-7.3z" fill="#fff" /></svg> },
  lens: { name: 'Lens', bg: g('#2b2d36', '#111218'), glyph: <svg width="32" height="32" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="7.5" stroke="#ff9f43" strokeWidth="2.4" /><circle cx="12" cy="12" r="3" fill="#fff" /></svg> },
  gallery: { name: 'Gallery', bg: g('#ff8fb1', '#e8456f'), glyph: <svg width="30" height="30" viewBox="0 0 24 24" {...S}><path d="M4 17l5-6 4 4 2.5-3L20 17" /><circle cx="16" cy="7.5" r="1.8" fill="#fff" /></svg> },
  alarms: { name: 'Alarms', bg: g('#ffcf5c', '#f59e0b'), glyph: <svg width="32" height="32" viewBox="0 0 24 24" {...S}><circle cx="12" cy="13" r="7" /><path d="M12 9.5V13l2.5 1.5M4.5 5.5l2.5-2M19.5 5.5l-2.5-2" /></svg> },
  skies: { name: 'Skies', bg: g('#4fd1c5', '#0e9f8e'), glyph: <svg width="32" height="32" viewBox="0 0 24 24"><path d="M7 18h10a4 4 0 0 0 .4-8 6 6 0 0 0-11.5 1.5A3.3 3.3 0 0 0 7 18z" fill="#fff" /></svg> },
  jot: { name: 'Jot', bg: g('#34d399', '#059669'), glyph: <svg width="30" height="30" viewBox="0 0 24 24" {...S}><path d="M5 19l1-4L16 5l3 3L9 18zM14 7l3 3" /></svg> },
  planner: { name: 'Planner', bg: g('#818cf8', '#4f46e5'), glyph: <svg width="30" height="30" viewBox="0 0 24 24" {...S}><rect x="4" y="5.5" width="16" height="14" rx="3" /><path d="M8 10h8M8 14h5" /></svg> },
  stash: { name: 'Stash', bg: g('#fb923c', '#ea580c'), glyph: <svg width="32" height="32" viewBox="0 0 24 24" {...S}><path d="M4 8l8-4 8 4-8 4zM4 12l8 4 8-4M4 16l8 4 8-4" /></svg> },
  stride: { name: 'Stride', bg: g('#f472b6', '#be185d'), glyph: <svg width="32" height="32" viewBox="0 0 24 24" {...S}><circle cx="14" cy="5" r="1.6" fill="#fff" /><path d="M9 21l2.5-6 3 2.5V21M8 11l3-3.5 3.5 2 2.5 2.5M11.5 15L9 10.5" /></svg> },
  tweaks: { name: 'Tweaks', bg: g('#64748b', '#334155'), glyph: <svg width="30" height="30" viewBox="0 0 24 24" {...S}><path d="M5 7h9M18 7h1M5 17h3M12 17h7" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></svg> },
  arcade: { name: 'Arcade', bg: g('#a78bfa', '#7c3aed'), glyph: <svg width="32" height="32" viewBox="0 0 24 24" {...S}><rect x="3" y="8" width="18" height="9" rx="4.5" /><path d="M7.5 11v3M6 12.5h3" /><circle cx="15.5" cy="11.5" r=".9" fill="#fff" /><circle cx="17.5" cy="13.5" r=".9" fill="#fff" /></svg> },
  radio: { name: 'Radio', bg: g('#22d3ee', '#0891b2'), glyph: <svg width="30" height="30" viewBox="0 0 24 24" {...S}><circle cx="12" cy="12" r="2" fill="#fff" /><path d="M7.5 7.5a6.4 6.4 0 0 0 0 9M16.5 7.5a6.4 6.4 0 0 1 0 9M4.7 4.7a10.3 10.3 0 0 0 0 14.6M19.3 4.7a10.3 10.3 0 0 1 0 14.6" /></svg> },
  roam: { name: 'Roam', bg: g('#2dd4bf', '#0f766e'), glyph: <svg width="30" height="30" viewBox="0 0 24 24"><path d="M21 4l-9 9M21 4l-6 17-3-8-8-3z" fill="#fff" /></svg> },
  recipes: { name: 'Recipes', bg: g('#fbbf24', '#d97706'), glyph: <svg width="30" height="30" viewBox="0 0 24 24" {...S}><path d="M7 3v8M5 3v4a2 2 0 0 0 4 0V3M7 11v10M16 3c-2 1.5-2.5 4-2.5 7H16v11" /></svg> },
  reads: { name: 'Reads', bg: g('#f87171', '#b91c1c'), glyph: <svg width="30" height="30" viewBox="0 0 24 24" {...S}><path d="M4 5.5C6.5 4.5 9.5 4.5 12 6c2.5-1.5 5.5-1.5 8-.5V19c-2.5-1-5.5-1-8 .5-2.5-1.5-5.5-1.5-8-.5zM12 6v13.5" /></svg> },
  call: { name: 'Call', bg: g('#38bdf8', '#0284c7'), glyph: <svg width="28" height="28" viewBox="0 0 24 24"><path d="M7 3.5l3 .5 1 4.2-2 1.3a12 12 0 0 0 5.5 5.5l1.3-2 4.2 1 .5 3a2 2 0 0 1-2 2A16.5 16.5 0 0 1 5 5.5a2 2 0 0 1 2-2z" fill="#fff" /></svg> },
  web: { name: 'Web', bg: g('#fdba74', '#f97316'), glyph: <svg width="30" height="30" viewBox="0 0 24 24" {...S}><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.6 2.4 2.6 14.6 0 17M12 3.5c-2.6 2.4-2.6 14.6 0 17" /></svg> },
  inbox: { name: 'Inbox', bg: g('#c084fc', '#9333ea'), glyph: <svg width="30" height="30" viewBox="0 0 24 24" {...S}><path d="M4 13l2.5-7.5h11L20 13v5.5H4zM4 13h4.5l1 2h5l1-2H20" /></svg> },
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
  if (id === 'meet') return <div style={{ width: size, height: size, borderRadius: '50%', overflow: 'hidden', boxShadow: '0 2px 6px rgba(0,0,0,.25)' }}><div style={{ transform: 'scale(1.12)', transformOrigin: '50% 50%' }}><MeetIcon size={size} /></div></div>;
  const a = APPS[id];
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: a.bg, display: 'grid', placeItems: 'center', boxShadow: 'inset 0 1px 0 rgba(255,255,255,.3), 0 2px 6px rgba(0,0,0,.25)' }}>
      <div style={{ transform: `scale(${size / ICON})` }}>{a.glyph}</div>
    </div>
  );
};

const PAGE1 = [['chats', 'lens', 'gallery', 'alarms'], ['skies', 'jot', 'planner', 'stash'], ['stride', 'tweaks', 'arcade', 'radio']];
const PAGE2 = [['meet', 'roam', 'recipes', 'reads']];
const DOCK = ['call', 'web', 'inbox', 'lens'];
export const NAMES: Record<string, string> = { meet: 'Meet', ...Object.fromEntries(Object.entries(APPS).map(([k, v]) => [k, v.name])) };

const Grid: React.FC<{ rows: string[][]; hide?: string; press?: { id: string; s: number } }> = ({ rows, hide, press }) => (
  <>
    {rows.map((r, ri) => r.map((id, ci) => {
      const b = iconBox(ci, ri);
      return (
        <div key={id} style={{ position: 'absolute', left: b.x - 12, top: b.y, width: ICON + 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          <div style={{ transform: `scale(${press?.id === id ? press.s : 1})`, opacity: hide === id ? 0 : 1 }}><AppIcon id={id} /></div>
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
    <div style={{ position: 'absolute', left: 0, right: 0, top: 690, display: 'flex', justifyContent: 'center', gap: 8 }}>
      {[0, 1].map((i) => <div key={i} style={{ width: 7, height: 7, borderRadius: 4, background: '#fff', opacity: 0.35 + 0.65 * Math.max(0, 1 - Math.abs(page - i)) }} />)}
    </div>
    {/* favourites along the bottom, and the search bar under them */}
    <div style={{ position: 'absolute', left: 0, right: 0, top: 712, display: 'flex', justifyContent: 'space-around', padding: '0 28px' }}>
      {DOCK.map((id, i) => <AppIcon key={id + i} id={id} size={56} />)}
    </div>
    <div style={{ position: 'absolute', left: 18, right: 18, top: 784, height: 44, borderRadius: 22, background: 'rgba(255,255,255,.9)', display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', boxShadow: '0 2px 10px rgba(0,0,0,.18)' }}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3a3a48" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></svg>
      <span style={{ flex: 1, fontSize: 15, color: 'rgba(40,40,55,.55)' }}>Search</span>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3a3a48" strokeWidth="2" strokeLinecap="round"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" /></svg>
    </div>
    {dim > 0 && <div style={{ position: 'absolute', inset: 0, background: '#000', opacity: dim }} />}
  </div>
);
