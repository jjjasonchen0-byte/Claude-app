// The home screen of an iPhone: two pages of our own invented apps (rounded-square icons, simple
// glyphs) and a weather widget, page dots over a frosted dock, on a wallpaper in Meet's colours. Meet,
// just installed, sits at the end of page two.
import React from 'react';
import { DARK, FONT, WALLPAPER } from '../theme';
import { StatusBar } from './Chat';

const ICON = 61; // app px
const COLS = [57, 144.33, 231.67, 319];
const ROW0 = 72;
const ROW = 100;
/** An app icon's corner radius (a rounded square). */
export const iconRadius = (size: number) => size * 0.225;

/** Where an icon sits (its top-left, in app px on its page). */
export const iconBox = (col: number, row: number) => ({ x: COLS[col] - ICON / 2, y: ROW0 + row * ROW, w: ICON, h: ICON });
/** Meet's slot: page two, row three, second along (the next free one when it was installed). */
export const MEET_SLOT = { col: 1, row: 2 };

const g = (a: string, b: string) => `linear-gradient(160deg, ${a}, ${b})`;
const S = { fill: 'none', stroke: '#fff', strokeWidth: 2.4, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

type App = { name: string; bg: string; glyph: React.ReactNode };
// Our own apps (names and colours of no phone maker's stock set).
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
  pulse: { name: 'Pulse', bg: g('#fb7185', '#e11d48'), glyph: <svg width="30" height="30" viewBox="0 0 24 24" {...S}><path d="M3 12h4l2-5 4 10 2-5h6" /></svg> },
  casts: { name: 'Casts', bg: g('#c084fc', '#7e22ce'), glyph: <svg width="30" height="30" viewBox="0 0 24 24" {...S}><circle cx="12" cy="10" r="2.6" /><path d="M7.5 15a6.5 6.5 0 1 1 9 0M12 13v8" /></svg> },
  docs: { name: 'Docs', bg: g('#60a5fa', '#2563eb'), glyph: <svg width="30" height="30" viewBox="0 0 24 24" {...S}><path d="M6 3.5h8l4 4V20.5H6zM14 3.5v4h4M9 12h6M9 16h6" /></svg> },
  cards: { name: 'Cards', bg: g('#1f2937', '#030712'), glyph: <svg width="30" height="30" viewBox="0 0 24 24" fill="none" strokeWidth="2.2" strokeLinejoin="round"><rect x="3.5" y="6" width="17" height="12" rx="2.5" stroke="#fff" /><path d="M3.5 10h17" stroke="#fbbf24" /></svg> },
  shop: { name: 'Shop', bg: g('#4ade80', '#16a34a'), glyph: <svg width="30" height="30" viewBox="0 0 24 24" {...S}><path d="M5 8h14l-1.2 12H6.2zM9 8V6.5a3 3 0 0 1 6 0V8" /></svg> },
  news: { name: 'Headlines', bg: g('#f43f5e', '#9f1239'), glyph: <svg width="30" height="30" viewBox="0 0 24 24" {...S}><rect x="4" y="5" width="16" height="14" rx="2" /><path d="M8 9h8M8 12.5h8M8 16h5" /></svg> },
  screen: { name: 'Screen', bg: g('#334155', '#0f172a'), glyph: <svg width="30" height="30" viewBox="0 0 24 24" {...S}><rect x="3.5" y="5" width="17" height="11.5" rx="2" /><path d="M9 20h6" /></svg> },
  tunes: { name: 'Tunes', bg: g('#fb7185', '#f43f5e'), glyph: <svg width="30" height="30" viewBox="0 0 24 24" {...S}><path d="M9 18V6l10-2v12" /><circle cx="7" cy="18" r="2.2" fill="#fff" /><circle cx="17" cy="16" r="2.2" fill="#fff" /></svg> },
  tasks: { name: 'Tasks', bg: g('#f8fafc', '#e2e8f0'), glyph: <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 7l1.5 1.5L9 6M5 13l1.5 1.5L9 12M12 7.5h7M12 13.5h7M12 19h7" /></svg> },

  lingo: { name: 'Lingo', bg: g('#60a5fa', '#1d4ed8'), glyph: <svg width="30" height="30" viewBox="0 0 24 24" {...S}><path d="M4 6h9M8.5 4v2M6 6c.5 3 2.5 5.5 5 7M11 6c-.7 3.5-3 6.5-6 8M13 20l3.5-8 3.5 8M14.2 17.5h4.6" /></svg> },
  sums: { name: 'Sums', bg: g('#3f3f46', '#18181b'), glyph: <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fb923c" strokeWidth="2.4" strokeLinecap="round"><path d="M6 8h5M8.5 5.5v5M14 8h5M6 16.5h5M14 15h5M14 18h5" /></svg> },
};

/** Meet's icon: its wordmark's own letter and blue dot, on white (on black, the phone in dark mode). */
export const MeetIcon: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" style={{ display: 'block' }}>
    <rect width="100" height="100" fill={DARK ? '#0b0b0e' : '#ffffff'} />
    <text x="44" y="67" textAnchor="middle" fontFamily="Inter" fontWeight={800} fontSize={62} letterSpacing={-3} fill={DARK ? '#ffffff' : '#0b0b10'}>m</text>
    <circle cx="80" cy="63" r="7.5" fill="#0a84ff" />
  </svg>
);

export const AppIcon: React.FC<{ id: string; size?: number }> = ({ id, size = ICON }) => {
  const box = { width: size, height: size, borderRadius: iconRadius(size), overflow: 'hidden' as const, boxShadow: '0 1px 4px rgba(0,0,0,.18)' };
  if (id === 'meet') return <div style={box}><MeetIcon size={size} /></div>;
  const a = APPS[id];
  return (
    <div style={{ ...box, background: a.bg, display: 'grid', placeItems: 'center', boxShadow: `inset 0 .5px 0 rgba(255,255,255,.3), ${box.boxShadow}` }}>
      <div style={{ transform: `scale(${size / ICON})` }}>{a.glyph}</div>
    </div>
  );
};

/** The weather widget (two by two, top right of page one): New York tonight. */
const Weather: React.FC = () => (
  <div style={{
    position: 'absolute', left: COLS[2] - ICON / 2, top: ROW0, width: COLS[3] - COLS[2] + ICON, height: ROW + ICON + 18, borderRadius: 22,
    background: 'linear-gradient(180deg, #1c2a4a, #2f4a7d)', color: '#fff', padding: '14px 15px', boxSizing: 'border-box', fontFamily: FONT,
    boxShadow: '0 2px 10px rgba(0,0,0,.18)',
  }}>
    <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.01em' }}>New York <span style={{ fontSize: 10 }}>➤</span></div>
    <div style={{ fontSize: 40, fontWeight: 300, letterSpacing: '-0.03em', lineHeight: 1.1 }}>41°</div>
    <div style={{ position: 'absolute', left: 15, bottom: 14 }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="#f4f1d0"><path d="M15 3a8.5 8.5 0 1 0 6 13.5A7 7 0 0 1 15 3z" /></svg>
      <div style={{ fontSize: 12.5, fontWeight: 600, marginTop: 2 }}>Clear</div>
      <div style={{ fontSize: 12.5, fontWeight: 600, opacity: 0.85 }}>H:46° L:35°</div>
    </div>
  </div>
);

// page one: the widget top right; page two ends with Meet
const PAGE1: (string | null)[][] = [['chats', 'lens', null, null], ['gallery', 'alarms', null, null], ['skies', 'jot', 'planner', 'stash'], ['stride', 'tweaks', 'arcade', 'radio'], ['recipes', 'reads', 'pulse', 'docs']];
const PAGE2: (string | null)[][] = [['roam', 'casts', 'cards', 'shop'], ['news', 'screen', 'tasks', 'lingo'], ['sums', 'meet']];
const DOCK = ['call', 'web', 'inbox', 'tunes'];
export const NAMES: Record<string, string> = { meet: 'Meet', ...Object.fromEntries(Object.entries(APPS).map(([k, v]) => [k, v.name])) };

const Grid: React.FC<{ rows: (string | null)[][]; hide?: string; press?: { id: string; s: number } }> = ({ rows, hide, press }) => (
  <>
    {rows.map((r, ri) => r.map((id, ci) => {
      if (!id) return null;
      const b = iconBox(ci, ri);
      return (
        <div key={id} style={{ position: 'absolute', left: b.x - 14, top: b.y, width: ICON + 28, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
          <div style={{ transform: `scale(${press?.id === id ? press.s : 1})`, opacity: hide === id ? 0 : 1 }}><AppIcon id={id} /></div>
          <div style={{ color: '#fff', fontSize: 12, fontWeight: 500, textShadow: '0 1px 2px rgba(0,0,0,.35)', letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>{NAMES[id]}</div>
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
      <div style={{ position: 'absolute', left: 0, top: 0, width: 390, height: 844 }}><Weather /><Grid rows={PAGE1} hide={hide} press={press} /></div>
      <div style={{ position: 'absolute', left: 390, top: 0, width: 390, height: 844 }}><Grid rows={PAGE2} hide={hide} press={press} /></div>
    </div>
    {/* page dots, in a small frosted capsule */}
    <div style={{ position: 'absolute', left: 195 - 22, top: 700, width: 44, height: 22, borderRadius: 11, background: 'rgba(255,255,255,.16)', backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
      {[0, 1].map((i) => <div key={i} style={{ width: 7, height: 7, borderRadius: 4, background: '#fff', opacity: 0.38 + 0.62 * Math.max(0, 1 - Math.abs(page - i)) }} />)}
    </div>
    {/* the dock */}
    <div style={{ position: 'absolute', left: 12, right: 12, top: 736, height: 90, borderRadius: 32, background: 'rgba(255,255,255,.2)', backdropFilter: 'blur(24px) saturate(1.4)', boxShadow: 'inset 0 .5px 0 rgba(255,255,255,.3)' }} />
    {DOCK.map((id, i) => <div key={id} style={{ position: 'absolute', left: COLS[i] - ICON / 2, top: 736 + (90 - ICON) / 2 }}><AppIcon id={id} /></div>)}
    {dim > 0 && <div style={{ position: 'absolute', inset: 0, background: '#000', opacity: dim }} />}
  </div>
);
