// The home screen of an iPhone: the phone's own apps by name (each icon our own drawing of the app's
// usual symbol) and a weather widget, page dots over a frosted dock, on a wallpaper in Meet's colours.
// Meet, just installed, sits at the end of page two.
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

type App = { name: string; bg: string; glyph: React.ReactNode; full?: boolean };
const W24 = (size: number, children: React.ReactNode, extra: React.SVGProps<SVGSVGElement> = {}) => <svg width={size} height={size} viewBox="0 0 24 24" {...S} {...extra}>{children}</svg>;
/** The phone's own apps, by their names, each drawn as its usual symbol (our own drawings). */
const APPS: Record<string, App> = {
  phone: { name: 'Phone', bg: g('#6be27a', '#1fb54a'), glyph: <svg width="30" height="30" viewBox="0 0 24 24"><path d="M7 3.5l3 .5 1 4.2-2 1.3a12 12 0 0 0 5.5 5.5l1.3-2 4.2 1 .5 3a2 2 0 0 1-2 2A16.5 16.5 0 0 1 5 5.5a2 2 0 0 1 2-2z" fill="#fff" /></svg> },
  safari: { name: 'Safari', bg: g('#5ab8ff', '#1e6fe2'), glyph: <svg width="38" height="38" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="#fff" strokeWidth="1.6" /><path d="M15.8 8.2L13.2 13.2 8.2 15.8 10.8 10.8z" fill="#fff" /><path d="M15.8 8.2L10.8 10.8 13.2 13.2z" fill="#ff4d4d" /></svg> },
  messages: { name: 'Messages', bg: g('#6be27a', '#16b844'), glyph: <svg width="36" height="36" viewBox="0 0 24 24"><path d="M12 4.5c-4.7 0-8.3 3-8.3 6.8 0 2.1 1.1 3.9 2.9 5.2-.2 1.2-.8 2.3-1.7 3.1 1.7 0 3.2-.6 4.3-1.5.9.2 1.8.3 2.8.3 4.7 0 8.3-3 8.3-6.8S16.7 4.5 12 4.5z" fill="#fff" /></svg> },
  music: { name: 'Music', bg: g('#ff6b7d', '#f2304b'), glyph: W24(30, <><path d="M9 18V6.5l10-2V16" /><circle cx="7" cy="18" r="2.2" fill="#fff" /><circle cx="17" cy="16" r="2.2" fill="#fff" /></>) },
  facetime: { name: 'FaceTime', bg: g('#6be27a', '#1fb54a'), glyph: <svg width="34" height="34" viewBox="0 0 24 24"><rect x="3" y="7" width="12" height="10" rx="2.5" fill="#fff" /><path d="M15.5 11l5-3v8l-5-3z" fill="#fff" /></svg> },
  calendar: { name: 'Calendar', bg: '#ffffff', full: true, glyph: <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', fontFamily: FONT }}><div style={{ marginTop: 6, fontSize: 10, fontWeight: 600, color: '#f2304b', letterSpacing: 0 }}>Friday</div><div style={{ marginTop: -3, fontSize: 34, fontWeight: 300, color: '#111', letterSpacing: '-0.03em', lineHeight: 1.05 }}>4</div></div> },
  photos: { name: 'Photos', bg: g('#ffd36b', '#ff7a59'), glyph: W24(32, <><rect x="3.5" y="5.5" width="17" height="13" rx="2.5" /><path d="M5 16.5l4.5-5 3.5 3.5 2.2-2.2L19 16.5" /><circle cx="15.5" cy="9.5" r="1.4" fill="#fff" /></>) },
  camera: { name: 'Camera', bg: g('#d9dbe0', '#8e929b'), glyph: <svg width="36" height="36" viewBox="0 0 24 24"><rect x="3" y="7" width="18" height="12" rx="2.5" fill="#2a2c31" /><path d="M8.5 7l1.3-2h4.4l1.3 2z" fill="#2a2c31" /><circle cx="12" cy="13" r="3.6" fill="#5d6170" stroke="#d9dbe0" strokeWidth="1" /><circle cx="12" cy="13" r="1.4" fill="#1b1c20" /></svg> },
  mail: { name: 'Mail', bg: g('#4fb3ff', '#1a6ef0'), glyph: <svg width="34" height="34" viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="12.5" rx="2" fill="#fff" /><path d="M3.8 7l8.2 6.3L20.2 7" fill="none" stroke="#2a7df4" strokeWidth="1.4" strokeLinejoin="round" /></svg> },
  clock: { name: 'Clock', bg: '#0b0b0c', full: true, glyph: <svg width="100%" height="100%" viewBox="0 0 60 60"><circle cx="30" cy="30" r="24" fill="#fff" />{Array.from({ length: 12 }, (_, i) => { const a = (i * Math.PI) / 6; return <line key={i} x1={30 + Math.sin(a) * 20.5} y1={30 - Math.cos(a) * 20.5} x2={30 + Math.sin(a) * 22.5} y2={30 - Math.cos(a) * 22.5} stroke="#111" strokeWidth="1.4" strokeLinecap="round" />; })}<line x1="30" y1="30" x2={30 + Math.sin((6.52 / 12) * 2 * Math.PI) * 12} y2={30 - Math.cos((6.52 / 12) * 2 * Math.PI) * 12} stroke="#111" strokeWidth="2.4" strokeLinecap="round" /><line x1="30" y1="30" x2={30 + Math.sin((31 / 60) * 2 * Math.PI) * 18} y2={30 - Math.cos((31 / 60) * 2 * Math.PI) * 18} stroke="#111" strokeWidth="1.8" strokeLinecap="round" /><circle cx="30" cy="30" r="1.8" fill="#ff8a00" /></svg> },
  maps: { name: 'Maps', bg: 'linear-gradient(160deg, #e8f3dc, #cfe7f7)', full: true, glyph: <svg width="100%" height="100%" viewBox="0 0 60 60"><path d="M-2 40 C 18 34, 30 46, 62 28" stroke="#ffffff" strokeWidth="7" fill="none" /><path d="M18 -2 C 22 20, 34 30, 40 62" stroke="#f7d47a" strokeWidth="6" fill="none" /><path d="M-2 40 C 18 34, 30 46, 62 28" stroke="#3b8cff" strokeWidth="2.2" fill="none" strokeDasharray="0" /><path d="M41 14c-4 0-7 3-7 7 0 5 7 12 7 12s7-7 7-12c0-4-3-7-7-7z" fill="#f2304b" /><circle cx="41" cy="21" r="2.6" fill="#fff" /></svg> },
  reminders: { name: 'Reminders', bg: '#ffffff', full: true, glyph: <svg width="100%" height="100%" viewBox="0 0 60 60">{[['#1e7cf2', 18], ['#f2304b', 30], ['#ff9f0a', 42]].map(([c, y]) => <g key={String(y)}><circle cx="16" cy={Number(y)} r="4.2" fill={String(c)} /><rect x="25" y={Number(y) - 1.3} width="22" height="2.6" rx="1.3" fill="#d7d8dc" /></g>)}</svg> },
  notes: { name: 'Notes', bg: g('#ffe27a', '#ffc92e'), glyph: W24(30, <><rect x="5" y="4" width="14" height="16" rx="2" fill="#fff" stroke="none" /><path d="M8 9h8M8 12.5h8M8 16h5" stroke="#d9a400" /></>) },
  stocks: { name: 'Stocks', bg: '#0b0b0c', glyph: W24(32, <path d="M4 17l4.5-4.5 3.5 3 7.5-8" stroke="#34c759" strokeWidth="2.2" />) },
  books: { name: 'Books', bg: g('#ffb44a', '#ff7f1a'), glyph: W24(32, <path d="M4 6.5C6.5 5.5 9.5 5.5 12 7c2.5-1.5 5.5-1.5 8-.5V18c-2.5-1-5.5-1-8 .5-2.5-1.5-5.5-1.5-8-.5zM12 7v11.5" />) },
  health: { name: 'Health', bg: '#ffffff', glyph: <svg width="34" height="34" viewBox="0 0 24 24"><path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.3 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z" fill="#ff375f" /></svg> },
  home: { name: 'Home', bg: g('#ffc94a', '#ff9500'), glyph: <svg width="32" height="32" viewBox="0 0 24 24"><path d="M4 11.2L12 4.5l8 6.7V19a1 1 0 0 1-1 1h-4.5v-5h-5v5H5a1 1 0 0 1-1-1z" fill="#fff" /></svg> },
  wallet: { name: 'Wallet', bg: '#121214', glyph: <svg width="36" height="36" viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="5" rx="1.4" fill="#3b8cff" /><rect x="4" y="8" width="16" height="5" rx="1.4" fill="#ffb02e" /><rect x="4" y="11" width="16" height="5" rx="1.4" fill="#34c759" /><rect x="4" y="13.5" width="16" height="6" rx="1.6" fill="#e8e8ea" /></svg> },
  files: { name: 'Files', bg: '#ffffff', glyph: <svg width="36" height="36" viewBox="0 0 24 24"><path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" fill="#3b9bff" /><path d="M3.5 10h17v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" fill="#5fb3ff" /></svg> },
  settings: { name: 'Settings', bg: g('#c7c9cf', '#8a8d96'), glyph: <svg width="38" height="38" viewBox="0 0 24 24"><g fill="#4a4d55">{Array.from({ length: 8 }, (_, i) => <rect key={i} x="11" y="3.2" width="2" height="4" rx=".8" transform={`rotate(${i * 45} 12 12)`} />)}</g><circle cx="12" cy="12" r="6.2" fill="#4a4d55" /><circle cx="12" cy="12" r="3.4" fill="#d0d2d8" /><circle cx="12" cy="12" r="1.6" fill="#4a4d55" /></svg> },
  calculator: { name: 'Calculator', bg: '#1c1c1e', glyph: <svg width="34" height="34" viewBox="0 0 24 24" strokeLinecap="round" strokeWidth="2"><path d="M6 7.5h4M8 5.5v4" stroke="#fff" /><path d="M14 7.5h4" stroke="#fff" /><path d="M6.6 14.6l2.8 2.8M9.4 14.6l-2.8 2.8" stroke="#fff" /><path d="M14 15h4M14 18h4" stroke="#ff9f0a" /></svg> },
  contacts: { name: 'Contacts', bg: g('#e9e9ee', '#c9cad1'), glyph: <svg width="34" height="34" viewBox="0 0 24 24"><circle cx="12" cy="9" r="3.6" fill="#8d9099" /><path d="M5 19.5c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5z" fill="#8d9099" /></svg> },
  voicememos: { name: 'Voice Memos', bg: '#121214', glyph: <svg width="34" height="34" viewBox="0 0 24 24">{[3, 6, 10, 14, 9, 5, 8, 12, 7, 4].map((h, i) => <rect key={i} x={2.6 + i * 1.95} y={12 - h / 2} width="1.2" height={h} rx=".6" fill="#ff453a" />)}</svg> },
  translate: { name: 'Translate', bg: g('#4fb3ff', '#1a6ef0'), glyph: <svg width="34" height="34" viewBox="0 0 24 24" fontFamily={FONT}><rect x="2.5" y="4" width="11" height="10" rx="2" fill="#fff" /><text x="8" y="12" textAnchor="middle" fontSize="7.5" fontWeight="700" fill="#1a6ef0">A</text><rect x="10.5" y="10" width="11" height="10" rx="2" fill="#0d3f9e" /><text x="16" y="18" textAnchor="middle" fontSize="7" fontWeight="700" fill="#fff">文</text></svg> },
  shortcuts: { name: 'Shortcuts', bg: 'linear-gradient(160deg, #6b8bff, #e1559d)', glyph: <svg width="34" height="34" viewBox="0 0 24 24"><rect x="4" y="4" width="11" height="11" rx="3" fill="#fff" opacity=".55" /><rect x="9" y="9" width="11" height="11" rx="3" fill="#fff" /></svg> },
  compass: { name: 'Compass', bg: '#121214', glyph: <svg width="36" height="36" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5" fill="none" stroke="#fff" strokeWidth="1.2" /><path d="M12 5l2 7h-4z" fill="#ff453a" /><path d="M12 19l2-7h-4z" fill="#fff" /></svg> },
  measure: { name: 'Measure', bg: '#121214', glyph: <svg width="36" height="36" viewBox="0 0 24 24"><rect x="3" y="9" width="18" height="6" rx="1.2" fill="#ffd60a" />{[5, 8, 11, 14, 17].map((x, i) => <rect key={x} x={x} y="9" width=".9" height={i % 2 ? 2 : 3.2} fill="#121214" />)}</svg> },
  tips: { name: 'Tips', bg: g('#ffe27a', '#ffc92e'), glyph: <svg width="32" height="32" viewBox="0 0 24 24"><path d="M12 3.5a6 6 0 0 0-3.4 10.9c.6.4.9 1 .9 1.7V17h5v-.9c0-.7.3-1.3.9-1.7A6 6 0 0 0 12 3.5z" fill="#fff" /><rect x="9.5" y="18" width="5" height="1.6" rx=".8" fill="#fff" /><rect x="10.3" y="20.2" width="3.4" height="1.4" rx=".7" fill="#fff" /></svg> },
  podcasts: { name: 'Podcasts', bg: g('#c56cf0', '#8e2de2'), glyph: <svg width="32" height="32" viewBox="0 0 24 24"><rect x="9.5" y="4" width="5" height="9" rx="2.5" fill="#fff" /><path d="M7 11a5 5 0 0 0 10 0M12 16v4" stroke="#fff" strokeWidth="1.8" fill="none" strokeLinecap="round" /></svg> },
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
      {a.full ? <div style={{ width: ICON, height: ICON, transform: `scale(${size / ICON})` }}>{a.glyph}</div> : <div style={{ transform: `scale(${size / ICON})` }}>{a.glyph}</div>}
    </div>
  );
};

/** The weather widget (two by two, top right of page one): New York tonight. */
const Weather: React.FC = () => (
  <div style={{
    position: 'absolute', left: COLS[0] - ICON / 2, top: ROW0, width: COLS[1] - COLS[0] + ICON, height: ROW + ICON + 18, borderRadius: 22,
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

// page one: the weather widget top left; page two ends with Meet; Messages in the dock
const PAGE1: (string | null)[][] = [[null, null, 'facetime', 'calendar'], [null, null, 'photos', 'camera'], ['mail', 'clock', 'maps', 'reminders'], ['notes', 'stocks', 'books', 'health'], ['home', 'wallet', 'files', 'settings']];
const PAGE2: (string | null)[][] = [['calculator', 'contacts', 'voicememos', 'translate'], ['shortcuts', 'compass', 'measure', 'tips'], ['podcasts', 'meet']];
const DOCK = ['phone', 'safari', 'messages', 'music'];
/** Where a dock icon sits (its top-left, app px). */
export const dockBox = (i: number) => ({ x: COLS[i] - ICON / 2, y: 736 + (90 - ICON) / 2, w: ICON, h: ICON });
export const MESSAGES_DOCK = 2;
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
    {DOCK.map((id, i) => <div key={id} style={{ position: 'absolute', left: COLS[i] - ICON / 2, top: 736 + (90 - ICON) / 2, opacity: hide === id ? 0 : 1 }}><AppIcon id={id} /></div>)}
    {dim > 0 && <div style={{ position: 'absolute', inset: 0, background: '#000', opacity: dim }} />}
  </div>
);
