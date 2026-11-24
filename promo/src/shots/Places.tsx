// Places: the tabs (card segmented-thumb-hero, on Meet's real sliding highlight) and the place
// screens gliding past at a steep angle (card steep-tilt-glide, demo SteepTiltGlide.tsx).
import React from 'react';
import { AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { CamCtx, Camera, Caption, Finger, Footage, Lens, Phone, Stage, camAt, type Key } from '../kit';
import { BEZEL, C, SCREEN_H, SCREEN_W, clamp, onScreen } from '../theme';
import { CAP } from '../captures';

const P = CAP.places as typeof CAP.places & { pull: { x: number; y: number; frame: number; to: number } };
const fr = (p?: { frame?: number }, d = 0) => p?.frame ?? d;

// ---------------------------------------------------------------- the tabs

// The edit, as [output frame, clip frame] knots: the pull up in real time, a quick skip while the sheet
// sits still, then the two taps in real time.
const PULL = fr(P.pull, 16), DRINKS = fr(P.tapDrinks, 106), FOOD = fr(P.tapFood, 142);
const TK: [number, number][] = [
  [0, PULL - 4],
  [PULL + 34 - (PULL - 4), PULL + 34], // pulled up, settled: everyone's time
  [PULL + 34 - (PULL - 4) + 22, DRINKS - 10], // (skipping ahead 2×)
  [PULL + 34 - (PULL - 4) + 22 + (FOOD + 32 - (DRINKS - 10)), FOOD + 32],
];
export const TABS_DUR = TK[TK.length - 1][0] + 1;
const tabClip = (f: number) => {
  for (let i = 1; i < TK.length; i++) if (f <= TK[i][0]) return interpolate(f, [TK[i - 1][0], TK[i][0]], [TK[i - 1][1], TK[i][1]]);
  return TK[TK.length - 1][1];
};
/** Output frame where clip frame c shows. */
const outOf = (c: number) => {
  for (let i = 1; i < TK.length; i++) if (c <= TK[i][1]) return interpolate(c, [TK[i - 1][1], TK[i][1]], [TK[i - 1][0], TK[i][0]]);
  return TABS_DUR;
};

export const TABS_BEATS = { pull: outOf(PULL), drinks: outOf(DRINKS), food: outOf(FOOD) };

export const Tabs: React.FC = () => {
  const f = useCurrentFrame();
  const n = tabClip(f);
  const tabs = P.tabs || [];
  const tabY = tabs[0]?.y ?? 470;
  const row = onScreen(150, tabY);
  const pull = onScreen(P.pull?.x ?? 195, P.pull?.y ?? 700);
  const oPull = outOf(PULL), oDrinks = outOf(DRINKS), oFood = outOf(FOOD);
  const keys: Key[] = [
    { f: 0, cam: { x: 540, y: pull.y - 260, zoom: 1.0, rz: -2, ry: 6 } },
    // following the sheet up: everyone's time
    { f: oPull + 26, cam: { x: 540, y: 820, zoom: 1.02, rz: 0, ry: 0 }, ease: Easing.inOut(Easing.sin) },
    { f: oDrinks - 14, cam: { x: 560, y: 900, zoom: 1.1 }, ease: Easing.inOut(Easing.sin) },
    // into a macro on the tabs: the sliding highlight is the hero
    { f: oDrinks - 2, cam: { x: row.x + 40, y: row.y + 10, zoom: 2.4 }, ease: Easing.inOut(Easing.cubic) },
    { f: TABS_DUR - 1, cam: { x: row.x + 10, y: row.y + 10, zoom: 2.55 }, ease: Easing.inOut(Easing.sin) },
  ];
  const lift = P.pull?.to ?? 110;
  const cam = camAt(f, keys);
  return (
    <Stage>
      <Camera cam={cam}>
        <Phone>
          <Footage clip="places" n={n} />
          <Finger x={P.pull?.x ?? 195} y={P.pull?.y ?? 700} at={oPull - 10} down={oPull} up={oPull + 18} leave={oPull + 30}
            path={(g) => ({ x: P.pull?.x ?? 195, y: interpolate(g, [oPull, oPull + 18], [P.pull?.y ?? 700, lift], { ...clamp, easing: Easing.bezier(0.3, 0.6, 0.4, 1) }) })} />
          <Finger x={P.tapDrinks.x} y={P.tapDrinks.y} at={oDrinks - 10} down={oDrinks} up={oDrinks + 3} leave={oDrinks + 11} />
          <Finger x={P.tapFood.x} y={P.tapFood.y} at={oFood - 10} down={oFood} up={oFood + 3} leave={oFood + 11} />
        </Phone>
      </Camera>
      <Lens zoom={cam.zoom} />
    </Stage>
  );
};

// ---------------------------------------------------------------- the glide

/** The place screens, in order (frames of the places clip, each once its page has settled). */
const SCREENS = [fr(P.tapFood) + 30, fr(P.tapGroup) + 30, fr(P.tapSend) - 4, CAP.placesLast]; // (Food: the tab chosen last)
export const GLIDE_DUR = 118;
const GAP = 110;
const STRIP_W = SCREENS.length * SCREEN_W + (SCREENS.length - 1) * GAP;
// the fixed camera (demo constants; the angle is the card's identity, −60°)
const CAM = { persp: 1100, origin: '30% 58%', rotY: -60, rotZ: -2, left: '30%', top: '13%', scale: 0.78 };

const Strip: React.FC<{ shade: number }> = ({ shade }) => (
  <CamCtx.Provider value={{ x: 0, y: 0, zoom: 1, rx: 0, ry: CAM.rotY, rz: CAM.rotZ }}>
    <div style={{ position: 'relative', width: STRIP_W, height: SCREEN_H }}>
      {SCREENS.map((n, i) => (
        <Phone key={i} x={i * (SCREEN_W + GAP) - BEZEL} y={-BEZEL} glow={0}>
          <Footage clip="places" n={n} />
          <div style={{ position: 'absolute', inset: 0, background: '#000', opacity: shade }} />
        </Phone>
      ))}
    </div>
  </CamCtx.Provider>
);

const Layer: React.FC<{ lx: number; shade: number; opacity: number }> = ({ lx, shade, opacity }) => (
  <AbsoluteFill style={{ opacity }}>
    <AbsoluteFill style={{ perspective: CAM.persp, perspectiveOrigin: CAM.origin }}>
      <div style={{ position: 'absolute', left: CAM.left, top: CAM.top, transform: `rotateY(${CAM.rotY}deg) rotateZ(${CAM.rotZ}deg)`, transformOrigin: 'left top' }}>
        <div style={{ transform: `scale(${CAM.scale}) translateX(${lx}px)`, transformOrigin: 'left top' }}><Strip shade={shade} /></div>
      </div>
    </AbsoluteFill>
  </AbsoluteFill>
);

export const Glide: React.FC = () => {
  const f = useCurrentFrame();
  // the page moves, the camera doesn't: a soft start, then nearly steady, never stopping dead
  const glide = Easing.bezier(0.3, 0.12, 0.72, 0.9);
  const lxAt = (g: number) => interpolate(interpolate(g, [0, GLIDE_DUR], [0, 1], { easing: glide, ...clamp }), [0, 1], [500, -(STRIP_W - SCREEN_W * 1.2)]);
  const lx = lxAt(f);
  const shade = interpolate(f, [0, 16, 40], [0.7, 0.4, 0], clamp);
  const speed = Math.abs(lxAt(f - 1) - lxAt(f + 1)) / 2;
  const g1 = Math.min(0.42, speed * 0.03), g2 = Math.min(0.22, speed * 0.016);
  return (
    <Stage>
      {g2 > 0.02 && <Layer lx={lxAt(f - 5)} shade={shade} opacity={g2} />}
      {g1 > 0.02 && <Layer lx={lxAt(f - 2.5)} shade={shade} opacity={g1} />}
      <Layer lx={lx} shade={shade} opacity={1} />
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse 105% 95% at 55% 42%, transparent 60%, rgba(0,0,0,0.25) 85%, rgba(0,0,0,0.55) 100%)' }} />
      {/* the light falls off towards the floor: room for the line */}
      <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0) 58%, rgba(0,0,0,.62) 76%, rgba(0,0,0,.82) 100%)' }} />
      <Caption text="Then pick a *place.*" at={10} out={GLIDE_DUR - 14} top={1600} />
    </Stage>
  );
};

export { C, Img, staticFile };
