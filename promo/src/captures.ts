// What the capture session recorded (public/captures/meta.json, or captures-dark/ for the dark
// version): tap positions (app px), frame numbers within each clip, and what the share page said.
import lightMeta from '../public/captures/meta.json';
import darkMeta from '../public/captures-dark/meta.json';
import { DARK } from './theme';
const meta = DARK ? darkMeta : lightMeta;

type P = { x: number; y: number; frame?: number };
const m = meta as unknown as {
  crew: { tapMap: P; tapUse: P; typeFrom: number; tapAdd: P };
  modes: { tapPill: P; tapBike: P };
  go: { drag: P & { to: number }; tapPlay: P; resultsAt: number };
  spot: { x: number; y: number } | null;
  /** Where the spot is in the race clip as everyone gathers there (app px; measured on the clip). */
  raceSpot?: { x: number; y: number };
  places: { tabs: { text: string; x: number; y: number }[]; tapTab1: P; tapTab2: P; tapGroup: P; tapSort?: P; tapPlace: P; tapSend: P; shareBtn?: P };
  shareText?: string;
  frames?: Record<string, number>;
};

// (until a capture has written them, safe stand-ins)
const pt = (x: number, y: number, frame = 0) => ({ x, y, frame });
m.crew ||= { tapMap: pt(212, 260, 15), tapUse: pt(212, 220, 37), typeFrom: 61, tapAdd: pt(300, 202, 90) };
m.modes ||= { tapPill: pt(150, 455, 12), tapBike: pt(170, 520, 38) };
m.go ||= { drag: { ...pt(195, 443, 10), to: 963 }, tapPlay: pt(344, 658, 60), resultsAt: 360 };
m.places ||= { tabs: [], tapTab1: pt(317, 579, 106), tapTab2: pt(197, 579, 142), tapGroup: pt(195, 660, 178), tapPlace: pt(195, 320, 240), tapSend: pt(120, 400, 290) };

// "Let's meet at <place>\n<address>\n<when>\n<link>" (Meet's share text)
const lines = (m.shareText || '').split('\n').map((s) => s.trim()).filter(Boolean);
const head = lines.find((l) => /^Let.s meet at /i.test(l)) || '';

export const CAP = {
  ...m,
  shareBtn: m.places.shareBtn || { x: 195, y: 560 },
  placeName: head.replace(/^Let.s meet at /i, '') || 'the spot',
  placeAddress: lines[1] || '',
  // the time, if one was picked (a line that isn't the address, the link or the sign-off)
  when: lines.slice(2).find((l) => !/^https?:|^Sent with/i.test(l)) || 'Fri, 6:30 pm',
  placesLast: m.frames?.places ?? 1,
};
