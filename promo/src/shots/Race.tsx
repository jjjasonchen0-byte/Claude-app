// Shots 6–8 (one continuous piece of footage): the sheet pulled down, the glass play button appears,
// a press (card input-trigger-moves · cursor-performance: the camera punches in on the press and eases
// back); everyone's area floods out over the streets, re-timed (card speed-ramp-freeze · speed-ramp:
// fast → a slower stare as the longest trip is found → fast); the routes are drawn with everyone's
// time and the camera crash-zooms onto the spot as everyone gathers there (card crash-zoom-punch,
// impact); then back out as the app zooms out to its result: the place, and the line.
import React from 'react';
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from 'remotion';
import { Camera, Caption, Finger, Footage, Lens, Phone, Stage, camAt, type Key } from '../kit';
import { clamp, onScreen } from '../theme';
import { CAP } from '../captures';

const G = CAP.go;
const drag = G.drag.frame ?? 10;
const tap = G.tapPlay.frame ?? 48;
const last = CAP.frames?.go ?? tap + 320;

/** The race's phases in the clip (frames after the press; the race runs on the page's own clock). */
export const RACE = {
  spread: tap + 12, // everyone's area starts to flood out
  stareFrom: tap + 102, // "Longest trip" appears and the spot is marked…
  stareTo: tap + 132, // …while the areas pull back towards it
  routes: tap + 192, // the routes, everyone's time beside them
  gathered: tap + 222, // everyone's dot has travelled to the spot (the app zooms out from tap + 226)
  result: Math.min(last, tap + 298), // the result: the place, everyone's routes, the sheet
};
/** The spot (app px, in this clip's view), where everyone gathers. */
const SPOT = (CAP as { raceSpot?: { x: number; y: number } }).raceSpot ?? { x: 147, y: 483 }; // (measured on the clip: by Charles Thai, Newtown)

// ---- the edit, as [output frame, clip frame] knots (linear between knots) ----
const A0 = drag - 4;
const A_LEN = tap + 4 - A0; // real time from just before the drag to just after the press
const FLOODS = A_LEN + 8 + 54; // (output frame the stare starts)
const STARE = FLOODS + 34;
const CRASH = STARE + 26; // the routes are up: crash in
const HOLD = CRASH + 46; // held on the spot while everyone gathers
const KNOTS: [number, number][] = [
  [0, A0],
  [A_LEN, tap + 4],
  [A_LEN + 8, RACE.spread], // quick, the search starting
  [FLOODS, RACE.stareFrom], // the floods racing out (~1.7×)
  [STARE, RACE.stareTo], // the stare (~0.9×)
  [CRASH, RACE.routes], // fast to the routes (~2.3×)
  [HOLD, RACE.gathered], // everyone travelling to the spot (~0.65×)
  [HOLD + (RACE.result - RACE.gathered), RACE.result], // real time: the app zooms out to its result
];
export const GO_DUR = KNOTS[KNOTS.length - 1][0] + 1;
const clipFrame = (f: number) => {
  for (let i = 1; i < KNOTS.length; i++) if (f <= KNOTS[i][0]) return interpolate(f, [KNOTS[i - 1][0], KNOTS[i][0]], [KNOTS[i - 1][1], KNOTS[i][1]]);
  return RACE.result;
};

const PRESS = tap - A0; // output frame of the press
/** Motion blur on the crash zoom (the fast camera move). */
export const GO_BLUR: [number, number][] = [[CRASH - 2, CRASH + 7]];
export const RACE_BEATS = { drag: drag - A0, press: PRESS, crash: CRASH, dur: GO_DUR };

export const Race: React.FC = () => {
  const f = useCurrentFrame();
  const n = clipFrame(f);
  const btn = onScreen(G.tapPlay.x, G.tapPlay.y);
  const spot = onScreen(SPOT.x, SPOT.y);
  // the whole phone, low in the frame: room for a line above it
  const whole = { x: 540, y: 900, zoom: 0.72 };
  const keys: Key[] = [
    { f: 0, cam: { x: 545, y: 1080, zoom: 0.9, ry: -9, rx: 0 } },
    { f: PRESS - 12, cam: { x: 600, y: 1150, zoom: 1.04, ry: 0 }, ease: Easing.inOut(Easing.sin) },
    { f: PRESS, cam: { x: 600, y: 1150, zoom: 1.04 } },
    // punch in on the press (out-cubic), a beat, then back out (cursor-performance)
    { f: PRESS + 12, cam: { x: btn.x - 40, y: btn.y - 80, zoom: 1.46 }, ease: Easing.out(Easing.cubic) },
    { f: PRESS + 22, cam: { x: btn.x - 40, y: btn.y - 80, zoom: 1.46 } },
    { f: PRESS + 38, cam: { ...whole, rx: 5, ry: 6 }, ease: Easing.inOut(Easing.cubic) },
    // the floods: the whole phone turning slowly, its line above it (held until the line has gone)
    { f: FLOODS + 22, cam: { ...whole, zoom: 0.74, rx: 3, ry: -4 }, ease: Easing.inOut(Easing.sin) },
    // in towards the spot through the stare
    { f: CRASH - 4, cam: { x: spot.x + 40, y: spot.y + 30, zoom: 1.22, rx: 0, ry: 0 }, ease: Easing.inOut(Easing.sin) },
    // the crash (6f, ease-in), stopping dead (impact), held while everyone gathers
    { f: CRASH + 6, cam: { x: spot.x + 30, y: spot.y - 30, zoom: 2.1 }, ease: Easing.bezier(0.55, 0, 0.7, 1) },
    { f: HOLD, cam: { x: spot.x + 30, y: spot.y - 36, zoom: 2.18 } },
    // back out to the whole phone as the app zooms out to its result: the place, and the line above
    { f: HOLD + 22, cam: { ...whole, zoom: 0.74 }, ease: Easing.inOut(Easing.cubic) },
    { f: GO_DUR, cam: { ...whole, zoom: 0.77 }, ease: Easing.inOut(Easing.sin) },
  ];
  const cam = camAt(f, keys);
  const since = f - (CRASH + 6);
  const env = since >= 0 ? 10 * Math.exp(-since / 1.8) : 0;
  const shake = { x: env * Math.sin(since * 3.3), y: env * 0.7 * Math.sin(since * 4.1 + 0.9) };
  const onSpot = f >= CRASH && f <= HOLD + 6; // (everyone's time sharp while we're close: no depth of field)
  return (
    <Stage>
      <AbsoluteFill style={{ transform: `translate(${shake.x}px, ${shake.y}px)` }}>
        <Camera cam={cam}>
          <Phone>
            <Footage clip="go" n={n} />
            <Finger x={G.drag.x} y={G.drag.y} at={drag - A0 - 10} down={drag - A0} up={drag - A0 + 14} leave={drag - A0 + 26}
              path={(g) => ({ x: G.drag.x, y: interpolate(g, [drag - A0, drag - A0 + 14], [G.drag.y, (G.drag as { to: number }).to], { ...clamp, easing: Easing.out(Easing.quad) }) })} />
            <Finger x={G.tapPlay.x} y={G.tapPlay.y} at={PRESS - 10} down={PRESS} up={PRESS + 4} leave={PRESS + 14} />
          </Phone>
        </Camera>
      </AbsoluteFill>
      {!onSpot && <Lens zoom={cam.zoom} focusY={0.45} />}
      <Caption text={"Everyone's route,\n*racing.*"} at={PRESS + 38} out={FLOODS + 22} top={120} />
      <Caption text="Fair for *everyone.*" at={HOLD + 14} out={GO_DUR - 12} top={150} />
    </Stage>
  );
};
