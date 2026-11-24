// What the capture session recorded (public/captures/meta.json): tap positions (app px), frame
// numbers within each clip, and what the share page said.
import meta from '../public/captures/meta.json';

type P = { x: number; y: number; frame?: number };
const m = meta as unknown as {
  crew: { tapMap: P; tapUse: P; typeFrom: number; tapAdd: P };
  modes: { tapPill: P; tapBike: P };
  go: { drag: P & { to: number }; tapPlay: P; resultsAt: number };
  spot: { x: number; y: number } | null;
  places: { tabs: { text: string; x: number; y: number }[]; tapDrinks: P; tapFood: P; tapGroup: P; tapPlace: P; tapSend: P; shareBtn?: P };
  shareText?: string;
  frames?: Record<string, number>;
};

// (until a capture has written them, safe stand-ins)
const pt = (x: number, y: number, frame = 0) => ({ x, y, frame });
m.crew ||= { tapMap: pt(212, 260, 15), tapUse: pt(212, 220, 37), typeFrom: 61, tapAdd: pt(300, 202, 90) };
m.modes ||= { tapPill: pt(150, 455, 12), tapBike: pt(170, 520, 38) };
m.go ||= { drag: { ...pt(195, 443, 10), to: 963 }, tapPlay: pt(344, 658, 60), resultsAt: 360 };
m.places ||= { tabs: [], tapDrinks: pt(150, 470, 60), tapFood: pt(60, 470, 96), tapGroup: pt(195, 560, 132), tapPlace: pt(195, 520, 172), tapSend: pt(120, 400, 222) };

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
