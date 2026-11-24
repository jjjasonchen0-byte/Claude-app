// Shots 6–8 (one continuous piece of footage): the sheet pulled down, the glass play button appears,
// a press (card input-trigger-moves · cursor-performance: the camera punches in 1.4× on the press and
// eases back); everyone's area floods out over the streets, re-timed (card speed-ramp-freeze ·
// speed-ramp: fast → a 0.75× stare as the longest trip is found → fast); the routes are drawn with
// everyone's time and the camera crash-zooms onto the spot as everyone gathers there (card
// crash-zoom-punch, impact), then pulls back for the line.
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
  stareFrom: tap + 102, // "Longest trip: 17 min" and the spot's label appear…
  stareTo: tap + 132, // …while the areas pull back towards it
  routes: tap + 192, // the routes, everyone's time beside them
  gathered: tap + 214, // everyone's dot has travelled to the spot
  end: Math.min(last, tap + 222), // (after this the app zooms out to the results)
};
/** The spot (app px, in this clip's view), where everyone gathers. */
const SPOT = (CAP as { raceSpot?: { x: number; y: number } }).raceSpot ?? { x: 80, y: 555 }; // (measured on the clip: where the routes meet, by Al Aseel in Newtown)

// ---- the edit, as [output frame, clip frame] knots (linear between knots) ----
const A0 = drag - 4;
const A_LEN = tap + 4 - A0; // real time from just before the drag to just after the press
const KNOTS: [number, number][] = [
  [0, A0],
  [A_LEN, tap + 4],
  [A_LEN + 8, RACE.spread], // quick, the search starting
  [A_LEN + 58, RACE.stareFrom], // the floods racing out (~1.7×)
  [A_LEN + 98, RACE.stareTo], // the stare (0.75×)
  [A_LEN + 130, RACE.routes], // fast to the routes (~2×)
  [A_LEN + 158, RACE.gathered], // everyone travelling to the spot (0.8×)
  [A_LEN + 190, RACE.end], // held, almost still
];
export const GO_DUR = KNOTS[KNOTS.length - 1][0] + 1;
const clipFrame = (f: number) => {
  for (let i = 1; i < KNOTS.length; i++) if (f <= KNOTS[i][0]) return interpolate(f, [KNOTS[i - 1][0], KNOTS[i][0]], [KNOTS[i - 1][1], KNOTS[i][1]]);
  return RACE.end;
};

const PRESS = tap - A0; // output frame of the press
const CRASH = A_LEN + 130; // the routes are up: crash in
/** Motion blur on the crash zoom and the pull back (the fast camera moves). */
export const GO_BLUR: [number, number][] = [[CRASH - 2, CRASH + 7]];
export const RACE_BEATS = { drag: drag - A0, press: PRESS, crash: CRASH, dur: GO_DUR };

export const Race: React.FC = () => {
  const f = useCurrentFrame();
  const n = clipFrame(f);
  const btn = onScreen(G.tapPlay.x, G.tapPlay.y);
  const spot = onScreen(SPOT.x, SPOT.y);
  const whole = { x: 540, y: 900, zoom: 0.72 }; // the whole phone, low in the frame: room for a line above
  const keys: Key[] = [
    { f: 0, cam: { x: 545, y: 1080, zoom: 0.9, ry: -9, rx: 0 } },
    { f: PRESS - 12, cam: { x: 600, y: 1150, zoom: 1.04, ry: 0 }, ease: Easing.inOut(Easing.sin) },
    { f: PRESS, cam: { x: 600, y: 1150, zoom: 1.04 } },
    // punch in on the press (out-cubic, 12f), hold, ease back (cursor-performance)
    { f: PRESS + 12, cam: { x: btn.x - 40, y: btn.y - 80, zoom: 1.46 }, ease: Easing.out(Easing.cubic) },
    { f: PRESS + 26, cam: { x: btn.x - 40, y: btn.y - 80, zoom: 1.46 } },
    // the floods: the whole phone, a slow turn, the line above it
    { f: PRESS + 46, cam: { ...whole, rx: 5, ry: 6 }, ease: Easing.inOut(Easing.cubic) },
    { f: A_LEN + 58, cam: { ...whole, zoom: 0.76, rx: 3, ry: -4 }, ease: Easing.inOut(Easing.sin) },
    // in towards the spot through the stare
    { f: A_LEN + 98, cam: { x: spot.x + 220, y: spot.y + 40, zoom: 1.3, rx: 0, ry: 0 }, ease: Easing.inOut(Easing.sin) },
    // a breath out, then the crash (6f, ease-in), stopping dead (impact)
    { f: CRASH - 2, cam: { x: spot.x + 240, y: spot.y + 60, zoom: 1.16 }, ease: Easing.inOut(Easing.sin) },
    { f: CRASH + 6, cam: { x: spot.x + 150, y: spot.y - 20, zoom: 2.15 }, ease: Easing.bezier(0.55, 0, 0.7, 1) },
    { f: CRASH + 30, cam: { x: spot.x + 150, y: spot.y - 26, zoom: 2.22 } },
    // back out: the whole phone, the line above
    { f: CRASH + 52, cam: { ...whole, zoom: 0.74 }, ease: Easing.inOut(Easing.cubic) },
    { f: GO_DUR, cam: { ...whole, zoom: 0.76 } },
  ];
  const cam = camAt(f, keys);
  const since = f - (CRASH + 6);
  const env = since >= 0 ? 10 * Math.exp(-since / 1.8) : 0;
  const shake = { x: env * Math.sin(since * 3.3), y: env * 0.7 * Math.sin(since * 4.1 + 0.9) };
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
      <Lens zoom={cam.zoom} focusY={0.45} />
      <Caption text={"Everyone's route,\n*racing.*"} at={PRESS + 40} out={A_LEN + 82} top={120} />
      <Caption text="Fair for *everyone.*" at={CRASH + 44} out={GO_DUR - 10} top={150} />
    </Stage>
  );
};
