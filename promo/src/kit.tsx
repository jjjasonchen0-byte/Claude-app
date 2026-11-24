// Shared pieces: the stage, the phone, the camera, captured footage, a finger, captions.
import React from 'react';
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, Easing } from 'remotion';
import { BEZEL, C, EASE, FONT, GLOWS, H, K, PHONE_H, PHONE_W, PHONE_X, PHONE_Y, SCREEN_H, SCREEN_W, W, clamp } from './theme';
import { CAP } from './captures';
import frameGeo from '../public/phone/frame.json';
import handGeo from '../public/phone/hand.json';

// ---------------------------------------------------------------- the stage

/**
 * A dark studio: a charcoal sweep lit from above (a soft pool of light behind the phone, falling off to
 * black at the edges), with the app's colours only as a faint wash in the air, drifting very slowly.
 */
export const Stage: React.FC<{ glow?: number; children?: React.ReactNode }> = ({ glow = 1, children }) => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: 'radial-gradient(ellipse 78% 52% at 50% 40%, #232327 0%, #141417 38%, #08080a 70%, #030304 100%)', overflow: 'hidden' }}>
      <AbsoluteFill style={{ background: GLOWS, opacity: 0.45 * glow, filter: 'saturate(0.8)', transform: `translate(${Math.sin(f * 0.006) * 30}px, ${Math.cos(f * 0.005) * 40}px) scale(1.15)` }} />
      {children}
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- the camera

export type Cam = { x: number; y: number; zoom: number; rx?: number; ry?: number; rz?: number };
export type Key = { f: number; cam: Partial<Cam>; ease?: (t: number) => number };

/** Interpolate camera keys: each key's `ease` shapes the segment that arrives at it. */
export const camAt = (frame: number, keys: Key[]): Cam => {
  const full: Cam[] = [];
  let prev: Cam = { x: W / 2, y: H / 2, zoom: 1, rx: 0, ry: 0, rz: 0 };
  for (const k of keys) { prev = { ...prev, ...k.cam }; full.push(prev); }
  if (frame <= keys[0].f) return full[0];
  for (let i = 1; i < keys.length; i++) {
    if (frame <= keys[i].f) {
      const a = full[i - 1], b = full[i];
      const t = (keys[i].ease || EASE.camera)((frame - keys[i - 1].f) / (keys[i].f - keys[i - 1].f));
      const l = (p: keyof Cam) => (a[p] ?? 0) + ((b[p] ?? 0) - (a[p] ?? 0)) * t;
      return { x: l('x'), y: l('y'), zoom: l('zoom'), rx: l('rx'), ry: l('ry'), rz: l('rz') };
    }
  }
  return full[full.length - 1];
};

/**
 * Puts the world point (x, y) at the middle of the frame, magnified `zoom` times, tilted by rx/ry/rz.
 * The magnification is CSS zoom (laid out at full size, so text and footage stay sharp: aesthetic
 * rule Q2), not a transform scale; the tilt is a 3D transform about the frame's centre.
 */
export const Camera: React.FC<{ cam: Cam; persp?: number; children: React.ReactNode }> = ({ cam, persp = 2600, children }) => (
  <AbsoluteFill style={{ perspective: persp, perspectiveOrigin: '50% 50%' }}>
    <div style={{
      position: 'absolute', left: 0, top: 0, width: W, height: H, transformOrigin: `${W / 2}px ${H / 2}px`,
      transform: `rotateX(${cam.rx ?? 0}deg) rotateY(${cam.ry ?? 0}deg) rotateZ(${cam.rz ?? 0}deg)`,
    }}>
      <div style={{ position: 'absolute', left: W / 2 - cam.x * cam.zoom, top: H / 2 - cam.y * cam.zoom }}>
        <div style={{ position: 'relative', width: W, height: H, zoom: cam.zoom }}><CamCtx.Provider value={cam}>{children}</CamCtx.Provider></div>
      </div>
    </div>
  </AbsoluteFill>
);

// ---------------------------------------------------------------- the phone

/**
 * The camera's tilt, for whatever needs to know which way the light falls (the phone's edge, its glass,
 * the hand's shadow).
 */
export const CamCtx = React.createContext<Cam>({ x: W / 2, y: H / 2, zoom: 1, rx: 0, ry: 0, rz: 0 });

/** The photographed phone (public/phone/frame.png): body and bezel, the display cut out. */
const FRAME = frameGeo as { w: number; h: number; screenX: number; screenY: number; screenW: number; screenH: number; radius: number };
const OUTER_R = FRAME.radius + FRAME.screenX * 0.98; // the body's own corners
const DEPTH = 88; // ~7.8 mm at this scale (the phone is ~71 mm across)

/** Fingers among a phone's children (at any depth of arrays and fragments): drawn above the glass. */
const splitFingers = (children: React.ReactNode) => {
  const screen: React.ReactNode[] = [];
  const fingers: React.ReactElement[] = [];
  const walk = (c: React.ReactNode) => {
    React.Children.forEach(c, (el) => {
      if (React.isValidElement(el) && el.type === React.Fragment) walk((el.props as { children?: React.ReactNode }).children);
      else if (React.isValidElement(el) && el.type === Finger) fingers.push(el);
      else screen.push(el);
    });
  };
  walk(children);
  return { screen, fingers };
};

/**
 * A real-looking phone: the photographed body (glossy black, unbranded, round front camera) around the
 * screen, with its thickness showing as the camera turns it, light sliding over the glass, and the
 * fingers that touch it drawn on top (their shadows fall on the screen).
 */
export const Phone: React.FC<{ x?: number; y?: number; screenBg?: string; glow?: number; children?: React.ReactNode; style?: React.CSSProperties }> = ({
  x = PHONE_X, y = PHONE_Y, screenBg = '#fff', glow = 1, children, style,
}) => {
  const f = useCurrentFrame();
  const cam = React.useContext(CamCtx);
  const { screen, fingers } = splitFingers(children);
  const fx = BEZEL - FRAME.screenX, fy = BEZEL - FRAME.screenY; // the body's top-left
  // the edge: layers of the body stepping back, shifted the way the tilt shows them
  const ry = ((cam.ry ?? 0) * Math.PI) / 180, rx = ((cam.rx ?? 0) * Math.PI) / 180, rz = ((cam.rz ?? 0) * Math.PI) / 180;
  const sx = -Math.tan(ry), sy = Math.tan(rx);
  const ex = sx * Math.cos(-rz) - sy * Math.sin(-rz), ey = sx * Math.sin(-rz) + sy * Math.cos(-rz);
  const tilt = Math.hypot(ex, ey);
  const N = Math.max(6, Math.min(48, Math.ceil((tilt * DEPTH) / 2.5))); // steps of ≤2.5px
  const layers = tilt * DEPTH > 1 ? Array.from({ length: N }, (_, i) => N - i) : [];
  // where the light sits on the glass (moves against the tilt, drifts a little)
  const lx = 30 + (cam.ry ?? 0) * 2.4 + Math.sin(f * 0.01) * 4;
  const ly = 20 - (cam.rx ?? 0) * 2.4;
  return (
    <div style={{ position: 'absolute', left: x, top: y, width: PHONE_W, height: PHONE_H, ...style }}>
      {/* the soft shadow it throws */}
      <div style={{ position: 'absolute', left: fx + 30, top: fy + 50, width: FRAME.w - 60, height: FRAME.h - 60, borderRadius: OUTER_R, background: 'rgba(0,0,0,.85)', filter: 'blur(60px)', opacity: 0.9 }} />
      {glow > 0 && <div style={{ position: 'absolute', left: fx - 40, top: fy - 40, width: FRAME.w + 80, height: FRAME.h + 80, borderRadius: OUTER_R + 40, boxShadow: `0 0 160px rgba(0,122,255,${0.12 * glow})` }} />}
      {/* the edge (aluminium under a dark finish: a bright streak along its middle) */}
      {layers.map((i) => {
        const d = (i / N) * DEPTH;
        const mid = Math.exp(-((((i / N) - 0.45) / 0.22) ** 2));
        const l = Math.round(10 + 46 * mid);
        return (
          <div key={i} style={{
            position: 'absolute', left: fx + ex * d, top: fy + ey * d, width: FRAME.w, height: FRAME.h, borderRadius: OUTER_R,
            background: `rgb(${l},${l},${l + 3})`, boxShadow: i === N ? '0 0 0 1px rgba(0,0,0,.6)' : undefined,
          }} />
        );
      })}
      {/* the body under the glass (no light gets past the bezel) */}
      <div style={{ position: 'absolute', left: fx + 6, top: fy + 6, width: FRAME.w - 12, height: FRAME.h - 12, borderRadius: OUTER_R - 6, background: '#030303' }} />
      {/* the screen */}
      <div style={{ position: 'absolute', left: BEZEL, top: BEZEL, width: SCREEN_W, height: SCREEN_H, borderRadius: FRAME.radius, overflow: 'hidden', background: screenBg, isolation: 'isolate' }}>
        {screen}
        {fingers.map((el, i) => React.cloneElement(el as React.ReactElement<FingerProps>, { key: `s${i}`, part: 'shadow' }))}
        {/* the front camera */}
        <div style={{
          position: 'absolute', top: 24, left: SCREEN_W / 2 - 17, width: 34, height: 34, borderRadius: '50%', zIndex: 50,
          background: 'radial-gradient(circle at 50% 50%, #0b0c14 0 30%, #05050a 31% 56%, #121216 57% 100%)',
          boxShadow: 'inset 0 0 0 2px #0a0a0c, inset 3px -3px 6px rgba(90,100,170,.45), 0 0 0 1.5px rgba(255,255,255,.04)',
        }} />
        {/* the glass: a softbox's reflection sliding over it, and a faint sheen */}
        <div style={{
          position: 'absolute', inset: 0, zIndex: 55, pointerEvents: 'none', mixBlendMode: 'screen',
          background: `linear-gradient(118deg, rgba(255,255,255,0) ${lx - 14}%, rgba(255,255,255,.055) ${lx - 4}%, rgba(255,255,255,.085) ${lx}%, rgba(255,255,255,.03) ${lx + 7}%, rgba(255,255,255,0) ${lx + 20}%),
            radial-gradient(120% 60% at ${50 + (cam.ry ?? 0) * 3}% ${ly - 25}%, rgba(255,255,255,.05), rgba(255,255,255,0) 60%)`,
        }} />
      </div>
      {/* the body */}
      <Img src={staticFile('phone/frame.png')} style={{ position: 'absolute', left: fx, top: fy, width: FRAME.w, height: FRAME.h, zIndex: 2 }} />
      {/* fingers, over the glass */}
      <div style={{ position: 'absolute', left: BEZEL, top: BEZEL, width: SCREEN_W, height: SCREEN_H, zIndex: 3, pointerEvents: 'none' }}>
        {fingers.map((el, i) => React.cloneElement(el as React.ReactElement<FingerProps>, { key: `h${i}`, part: 'hand' }))}
      </div>
    </div>
  );
};

/** App-sized content (390×844 app px) shown on the screen, laid out at full size (CSS zoom). */
export const AppPx: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div style={{ position: 'absolute', left: 0, top: 0, width: 390, height: 844, zoom: K, fontFamily: FONT, ...style }}>{children}</div>
);

// ---------------------------------------------------------------- footage

/** The captured frame counts (public/captures/meta.json). */
export const CLIP_FRAMES: Record<string, number> = CAP.frames || {};

/** One captured frame of a clip, filling the screen (1-based; clamped to the clip). */
export const Footage: React.FC<{ clip: string; n: number; style?: React.CSSProperties }> = ({ clip, n, style }) => {
  const i = Math.max(1, Math.min(CLIP_FRAMES[clip] ?? 1, Math.round(n)));
  return <Img src={staticFile(`captures/raw/${clip}/${String(i).padStart(5, '0')}.jpg`)} style={{ position: 'absolute', left: 0, top: 0, width: SCREEN_W, height: SCREEN_H, ...style }} />;
};

// ---------------------------------------------------------------- a finger

const HAND = handGeo as { w: number; h: number; contactX: number; contactY: number; axisX: number; axisY: number; fingerW: number };
/** The hand's size: its finger ~14 mm across (a touch slimmer than life, so it hides less of the screen). */
const HS = 155 / HAND.fingerW;
const REACH = 760; // world px it travels in from (and back out to), along its own arm

type FingerProps = {
  x: number; y: number; at: number; down?: number; up?: number; leave?: number; from?: { x: number; y: number }; path?: (f: number) => { x: number; y: number } | null;
  part?: 'hand' | 'shadow';
};

/**
 * A real hand (public/phone/hand.png) reaching in along its arm, touching the glass at (x, y) app px
 * from `down` to `up` (following `path` meanwhile, for drags and swipes), then drawing back. Lifted off
 * the glass it is a little larger (nearer the lens) and its shadow falls further away and softer.
 * A phone draws it twice: its shadow on the screen, the hand above the glass.
 */
export const Finger: React.FC<FingerProps> = ({ x, y, at, down = at + 7, up = down + 3, leave = up + 8, path, part = 'hand' }) => {
  const f = useCurrentFrame();
  if (f < at - 1 || f > leave + 1) return null;
  const state = (g: number) => {
    // 0 on the glass … 1 far off along the arm
    const inT = interpolate(g, [at, down], [1, 0], { ...clamp, easing: Easing.out(Easing.cubic) });
    const outT = interpolate(g, [up, leave], [0, 1], { ...clamp, easing: Easing.in(Easing.cubic) });
    const away = g < down ? inT : g > up ? outT : 0;
    const p = path?.(Math.min(Math.max(g, down), up));
    const px = (p ? p.x : x) * K + HAND.axisX * REACH * away;
    const py = (p ? p.y : y) * K + HAND.axisY * REACH * away;
    const lift = Math.min(1, away * 2.2); // height above the glass (it's off within the first part of the reach)
    const press = g >= down && g <= up ? interpolate(g, [down, down + 2, up - 1, up], [1, 0.985, 0.985, 1], clamp) : 1;
    return { px, py, lift, s: HS * (1 + 0.1 * lift) * press, away };
  };
  const st = state(f);
  const op = interpolate(f, [at - 1, at + 2, leave - 2, leave + 1], [0, 1, 1, 0], clamp);
  if (part === 'shadow') {
    // light from the upper left: the shadow falls down and right, further and softer the higher the finger
    const off = { x: 10 + 70 * st.lift, y: 16 + 110 * st.lift };
    const W2 = 556 * 4 * st.s, H2 = 704 * 4 * st.s, pad = 240 * st.s;
    const base = { position: 'absolute' as const, left: st.px - HAND.contactX * st.s - pad + off.x, top: st.py - HAND.contactY * st.s - pad + off.y, width: W2, height: H2 };
    const o = op * (0.5 - 0.3 * st.lift);
    return (
      <div style={{ position: 'absolute', inset: 0, zIndex: 45, pointerEvents: 'none', mixBlendMode: 'multiply' }}>
        <Img src={staticFile('phone/hand-shadow-near.png')} style={{ ...base, opacity: o * (1 - st.lift) }} />
        <Img src={staticFile('phone/hand-shadow-far.png')} style={{ ...base, opacity: o * st.lift }} />
      </div>
    );
  }
  // the hand; moving fast it smears like it would on a 180° shutter (several faint exposures over the
  // last half frame, weighted evenly: drawn back to front at 1, 1/2, 1/3…)
  const prev = state(f - 0.5);
  const speed = Math.hypot(st.px - prev.px, st.py - prev.py) * 2;
  const n = speed > 22 ? Math.min(7, 2 + Math.round(speed / 18)) : 1;
  const draw = (s: ReturnType<typeof state>, o: number, key: string) => (
    <Img key={key} src={staticFile('phone/hand.png')} style={{
      position: 'absolute', left: s.px - HAND.contactX * s.s, top: s.py - HAND.contactY * s.s, width: HAND.w * s.s, height: HAND.h * s.s, opacity: o,
    }} />
  );
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'visible', opacity: op }}>
      {Array.from({ length: n }, (_, i) => draw(n === 1 ? st : state(f - 0.5 + (0.5 * i) / (n - 1)), 1 / (i + 1), `h${i}`))}
    </div>
  );
};


// ---------------------------------------------------------------- the lens

/**
 * Depth of field for close-ups: the further in the camera goes, the more the top and bottom of the
 * frame fall out of focus (a macro lens has a thin plane of focus). `focusY` is where the sharp band
 * sits (0–1 of the frame's height).
 */
export const Lens: React.FC<{ zoom: number; focusY?: number }> = ({ zoom, focusY = 0.5 }) => {
  const amount = interpolate(zoom, [1.35, 2.3], [0, 1], clamp);
  if (amount <= 0.02) return null;
  const blur = 2 + 9 * amount;
  const band = 26 - 8 * amount; // half-height of the sharp band, % of the frame
  const top = Math.max(0, focusY * 100 - band), bottom = Math.min(100, focusY * 100 + band);
  const layer = (mask: string): React.CSSProperties => ({
    position: 'absolute', inset: 0, backdropFilter: `blur(${blur}px)`, WebkitBackdropFilter: `blur(${blur}px)`,
    maskImage: mask, WebkitMaskImage: mask, pointerEvents: 'none', zIndex: 55,
  });
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div style={layer(`linear-gradient(180deg, #000 0%, rgba(0,0,0,.6) ${top * 0.6}%, transparent ${top}%)`)} />
      <div style={layer(`linear-gradient(0deg, #000 0%, rgba(0,0,0,.6) ${(100 - bottom) * 0.6}%, transparent ${100 - bottom}%)`)} />
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- type

/**
 * Words arriving by blur-slide (card `blur-slide`): y 40→0, blur 10→0, opacity 0→1 on one out-cubic curve,
 * ~3.5f apart; leaving, the whole line lifts and blurs out. `*word*` is the accent colour.
 */
export const Caption: React.FC<{
  text: string; at: number; out?: number; top?: number; size?: number; weight?: number; color?: string; align?: 'left' | 'center'; left?: number; width?: number; lineHeight?: number;
}> = ({ text, at, out, top = 200, size = 96, weight = 800, color = C.white, align = 'center', left = 60, width = W - 120, lineHeight = 1.04 }) => {
  const f = useCurrentFrame();
  if (f < at - 1 || (out !== undefined && f > out + 14)) return null;
  const lines = text.split('\n');
  let k = 0;
  const leave = out === undefined ? 0 : interpolate(f, [out, out + 12], [0, 1], { ...clamp, easing: EASE.in });
  return (
    <div style={{
      position: 'absolute', left, top, width, textAlign: align, fontFamily: FONT, fontWeight: weight, fontSize: size, color,
      letterSpacing: '-0.035em', lineHeight, opacity: 1 - leave, filter: leave > 0 ? `blur(${leave * 12}px)` : undefined, transform: `translateY(${-leave * 30}px)`, zIndex: 60,
    }}>
      {lines.map((line, li) => (
        <div key={li}>
          {line.split(' ').map((raw, wi, arr) => {
            const accent = /^\*.*\*[.,!?]?$/.test(raw);
            const word = raw.replace(/\*/g, '');
            const t = interpolate(f, [at + k * 3.5, at + k * 3.5 + 18], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
            k++;
            return (
              <React.Fragment key={wi}>
                <span style={{ display: 'inline-block', opacity: t, transform: `translateY(${(1 - t) * 40}px)`, filter: t < 1 ? `blur(${(1 - t) * 10}px)` : undefined, color: accent ? C.accentOnBlack : undefined }}>{word}</span>
                {wi < arr.length - 1 ? ' ' : null}
              </React.Fragment>
            );
          })}
        </div>
      ))}
    </div>
  );
};
