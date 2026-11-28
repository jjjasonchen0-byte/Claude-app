// The app shots: real footage of Meet (captured frame by frame), each carried by one camera move.
import React from 'react';
import { AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { Camera, Caption, Finger, Footage, Lens, Phone, Stage, camAt, type Key } from '../kit';
import { BEZEL, EASE, K, PHONE_X, PHONE_Y, clamp, onScreen } from '../theme';
import { CAP } from '../captures';

const F = CAP.frames || {};
const at = (p: { x: number; y: number }) => onScreen(p.x, p.y);

/** A phone on the stage, filmed by a moving camera, showing one clip frame (or anything else). */
const PhoneShot: React.FC<{ keys: Key[]; children: React.ReactNode; over?: React.ReactNode; glow?: number }> = ({ keys, children, over, glow }) => {
  const f = useCurrentFrame();
  const cam = camAt(f, keys);
  return (
    <Stage glow={glow}>
      <Camera cam={cam}>
        <Phone>{children}</Phone>
      </Camera>
      <Lens zoom={cam.zoom} />
      {over}
    </Stage>
  );
};

// ---------------------------------------------------------------- 4. crew: Leo, added from the map

const crewA = (CAP.crew.tapUse.frame ?? 37) + 12; // close on the map: the tap, the address, "Use this address"
const crewBFrom = (CAP.crew.tapAdd.frame ?? 90) + 2; // (the name typed off camera) the sheet comes back down with Leo in
const crewB = (F.crew ?? 165) - crewBFrom + 1;
export const CREW_DUR = crewA + crewB + 10;

export const Crew: React.FC = () => {
  const f = useCurrentFrame();
  const inA = f < crewA;
  const n = inA ? f + 1 : crewBFrom + (f - crewA);
  const tap = at(CAP.crew.tapMap);
  const keys: Key[] = inA
    ? [{ f: 0, cam: { x: tap.x + 40, y: tap.y + 80, zoom: 1.5, ry: -6 } }, { f: crewA, cam: { x: tap.x + 20, y: tap.y + 60, zoom: 1.68, ry: 2 }, ease: Easing.inOut(Easing.sin) }]
    : [{ f: crewA, cam: { x: 540, y: 930, zoom: 0.72, ry: -14, rx: 4 } }, { f: CREW_DUR + 10, cam: { x: 540, y: 910, zoom: 0.76, ry: 8, rx: 2 }, ease: Easing.inOut(Easing.sin) }]; // (still turning at the cut, which the beat puts a few frames after CREW_DUR)
  return (
    <PhoneShot keys={keys} over={<Caption text="Add your *crew.*" at={crewA + 4} out={CREW_DUR - 12} top={170} />}>
      <Footage clip="crew" n={n} />
      {inA && <Finger x={CAP.crew.tapMap.x} y={CAP.crew.tapMap.y} at={(CAP.crew.tapMap.frame ?? 15) - 8} down={CAP.crew.tapMap.frame ?? 15} />}
      {inA && <Finger x={CAP.crew.tapUse.x} y={CAP.crew.tapUse.y} at={(CAP.crew.tapUse.frame ?? 37) - 8} down={CAP.crew.tapUse.frame ?? 37} from={{ x: CAP.crew.tapUse.x + 40, y: CAP.crew.tapUse.y + 90 }} />}
    </PhoneShot>
  );
};

// ---------------------------------------------------------------- 5. modes: Sam walks → bikes

export const MODES_DUR = (F.modes ?? 78) + 6;
export const Modes: React.FC = () => {
  const f = useCurrentFrame();
  // a hard cut straight into the macro, framed so each row reads whole (name · mode), drifting in
  const c = onScreen(186, CAP.modes.tapPill.y + 70);
  const keys: Key[] = [
    { f: 0, cam: { x: c.x, y: c.y, zoom: 2.0, rz: -1.5 } },
    { f: MODES_DUR - 14, cam: { x: c.x + 10, y: c.y + 10, zoom: 2.14, rz: 0 }, ease: Easing.inOut(Easing.sin) },
    { f: MODES_DUR, cam: { x: c.x, y: c.y, zoom: 2.1 }, ease: Easing.inOut(Easing.sin) },
  ];
  return (
    <PhoneShot keys={keys}>
      <Footage clip="modes" n={f + 1} />
      <Finger x={CAP.modes.tapPill.x} y={CAP.modes.tapPill.y} at={(CAP.modes.tapPill.frame ?? 12) - 8} down={CAP.modes.tapPill.frame ?? 12} from={{ x: CAP.modes.tapPill.x + 50, y: CAP.modes.tapPill.y + 120 }} />
      <Finger x={CAP.modes.tapBike.x} y={CAP.modes.tapBike.y} at={(CAP.modes.tapBike.frame ?? 38) - 8} down={CAP.modes.tapBike.frame ?? 38} from={{ x: CAP.modes.tapBike.x + 60, y: CAP.modes.tapBike.y + 80 }} />
    </PhoneShot>
  );
};

export { BEZEL, EASE, K, PHONE_X, PHONE_Y, clamp, interpolate, Img, staticFile, AbsoluteFill };
