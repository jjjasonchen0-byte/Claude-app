// Shared pieces: the stage, the phone, the camera, captured footage, a finger, captions.
import React from 'react';
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, Easing } from 'remotion';
import { BEZEL, C, CAPDIR, DARK, EASE, FONT, GLOWS, H, K, PHONE_H, PHONE_W, PHONE_X, PHONE_Y, SCREEN_H, SCREEN_W, W, clamp } from './theme';
import { CAP } from './captures';
import frameGeo from '../public/phone/frame.json';
import { StatusBar } from './screens/Chat';
import handGeo from '../public/phone/hand.json';
import thumbGeo from '../public/phone/thumb.json';

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
/**
 * How much of the lens's depth of field to draw (1 normally): 0 while a frame is drawn several times
 * over for motion blur, easing back over a few frames either side so focus never pops.
 */
export const FastCtx = React.createContext(1);

export const CamCtx = React.createContext<Cam>({ x: W / 2, y: H / 2, zoom: 1, rx: 0, ry: 0, rz: 0 });

/** The photographed phone (public/phone/frame.png): a modern titanium iPhone's body and bezel, the display cut out. */
const FRAME = frameGeo as { w: number; h: number; screenX: number; screenY: number; screenW: number; screenH: number; radius: number };
const OUTER_R = FRAME.radius + FRAME.screenX * 0.98; // the body's own corners
const DEPTH = 92; // ~8.3 mm at this scale (the phone is ~71 mm across)
/** The Dynamic Island (app px): 122 × 36, 11 from the top of the display. */
export const ISLAND = { w: 122, h: 36, y: 11 };

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
 * A real-looking phone: the photographed body (a titanium iPhone) around the screen, the Dynamic Island
 * at the top of the display, its thickness showing as the camera turns it, light sliding over the
 * glass, and the fingers and thumbs that touch it drawn on top (their shadows fall on the screen).
 */
export const Phone: React.FC<{ x?: number; y?: number; screenBg?: string; glow?: number; children?: React.ReactNode; style?: React.CSSProperties }> = ({
  x = PHONE_X, y = PHONE_Y, screenBg = DARK ? '#000' : '#fff', glow = 1, children, style,
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
      <Img src={staticFile('phone/shadow.png')} style={{ position: 'absolute', left: fx - 180, top: fy - 180 + 20, width: FRAME.w + 360, height: FRAME.h + 360, opacity: 0.9 }} />
      {glow > 0 && <div style={{ position: 'absolute', left: fx - 40, top: fy - 40, width: FRAME.w + 80, height: FRAME.h + 80, borderRadius: OUTER_R + 40, boxShadow: `0 0 160px rgba(0,122,255,${0.12 * glow})` }} />}
      {/* the edge (brushed natural titanium: warm grey, a bright streak along its middle) */}
      {layers.map((i) => {
        const d = (i / N) * DEPTH;
        const mid = Math.exp(-((((i / N) - 0.45) / 0.22) ** 2));
        const l = Math.round(62 + 118 * mid);
        return (
          <div key={i} style={{
            position: 'absolute', left: fx + ex * d, top: fy + ey * d, width: FRAME.w, height: FRAME.h, borderRadius: OUTER_R,
            background: `rgb(${l + 4},${l + 1},${l - 5})`, boxShadow: i === N ? '0 0 0 1px rgba(0,0,0,.6)' : undefined,
          }} />
        );
      })}
      {/* the body under the glass (no light gets past the bezel) */}
      <div style={{ position: 'absolute', left: fx + 6, top: fy + 6, width: FRAME.w - 12, height: FRAME.h - 12, borderRadius: OUTER_R - 6, background: '#030303' }} />
      {/* the screen */}
      <div style={{ position: 'absolute', left: BEZEL, top: BEZEL, width: SCREEN_W, height: SCREEN_H, borderRadius: FRAME.radius, overflow: 'hidden', background: screenBg, isolation: 'isolate' }}>
        {screen}
        {fingers.map((el, i) => React.cloneElement(el as React.ReactElement<FingerProps>, { key: `s${i}`, part: 'shadow' }))}
        {/* the Dynamic Island (the front camera behind its right end) */}
        <div style={{ position: 'absolute', top: ISLAND.y * K, left: (195 - ISLAND.w / 2) * K, width: ISLAND.w * K, height: ISLAND.h * K, borderRadius: (ISLAND.h / 2) * K, background: '#000', zIndex: 50 }}>
          <div style={{
            position: 'absolute', right: 13 * K, top: (ISLAND.h / 2 - 6) * K, width: 12 * K, height: 12 * K, borderRadius: '50%',
            background: 'radial-gradient(circle at 46% 42%, #20243a 0 18%, #0a0a12 26% 58%, #050507 64%)', boxShadow: 'inset 1px -1px 4px rgba(90,100,170,.35)',
          }} />
        </div>
        {/* the glass: a softbox's reflection sliding over it, and a faint sheen */}
        <div style={{
          position: 'absolute', inset: 0, zIndex: 55, pointerEvents: 'none',
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
export const Footage: React.FC<{ clip: string; n: number; style?: React.CSSProperties; time?: string }> = ({ clip, n, style, time = '6:31' }) => {
  const i = Math.max(1, Math.min(CLIP_FRAMES[clip] ?? 1, Math.round(n)));
  return (
    <>
      <Img src={staticFile(`${CAPDIR}/raw/${clip}/${String(i).padStart(5, '0')}.jpg`)} style={{ position: 'absolute', left: 0, top: 0, width: SCREEN_W, height: SCREEN_H, ...style }} />
      {/* the phone's own status bar and home indicator over the app (it was filmed leaving room for them) */}
      <AppPx style={{ pointerEvents: 'none' }}>
        <StatusBar time={time} />
        <div style={{ position: 'absolute', bottom: 8, left: 195 - 67, width: 134, height: 5, borderRadius: 3, background: DARK ? '#fff' : '#000', zIndex: 20 }} />
      </AppPx>
    </>
  );
};

// ---------------------------------------------------------------- a finger, or a thumb

const HAND = handGeo as { w: number; h: number; contactX: number; contactY: number; axisX: number; axisY: number; fingerW: number };
/** The hand's size: its finger ~14 mm across (a touch slimmer than life, so it hides less of the screen). */
const HS = 155 / HAND.fingerW;
/** World px it travels in from (and back out to), along its own arm: far enough to leave the frame. */
const REACH = 1700;

/** The right thumb (public/phone/thumb.png; the left one is the same picture mirrored). */
const THUMB = thumbGeo as { w: number; h: number; contactX: number; contactY: number; axisX: number; axisY: number; thumbW: number; pad: number };
/** A thumb ~16 mm across (a touch slimmer than life). */
const TS = 170 / THUMB.thumbW;
/** Where each thumb turns from (app px): its root, at the phone's lower corners where the hands hold it. */
export const THUMB_ROOT = { thumbL: { x: -40, y: 905 }, thumbR: { x: 430, y: 905 } };
const T_REACH = 900;

type Tap = { x: number; y: number; t: number };
type Digit = 'index' | 'thumbL' | 'thumbR';
type FingerProps = {
  x: number; y: number; at: number; down?: number; up?: number; leave?: number; from?: { x: number; y: number }; path?: (f: number) => { x: number; y: number } | null;
  /** Typing: several touches in a row (app px, frame), the hand hovering between them. */
  taps?: Tap[];
  /** The index finger of a hand reaching in (the default), or the left or right thumb of hands holding the phone. */
  digit?: Digit;
  /** Typing: where this hand waits (raised) through a longer gap between its keys, out of the other's way. */
  rest?: { x: number; y: number };
  part?: 'hand' | 'shadow';
};
type HandState = { px: number; py: number; lift: number; s: number; rot: number };

/**
 * A real hand (public/phone/hand.png) reaching in along its arm from out of frame, touching the glass
 * at (x, y) app px from `down` to `up` (following `path` meanwhile, for drags and swipes), then drawing
 * back out of frame. With `taps` it stays and types: a short touch on each key, lifting a little and
 * moving to the next in between. Lifted off the glass it is a little larger (nearer the lens) and its
 * shadow falls further away and softer. A phone draws it twice: its shadow on the screen, the hand
 * above the glass.
 *
 * As a thumb (`digit`), it swings from its root at the phone's lower corner (the hands hold the phone
 * there, out of frame) so that its pad lands on each key: it turns as it goes across the keyboard,
 * the way a typing thumb does.
 */
export const Finger: React.FC<FingerProps> = (props) => {
  const { x, y, at, path, taps, rest, part = 'hand', digit = 'index' } = props;
  const thumb = digit !== 'index';
  const left = digit === 'thumbL';
  const down = taps ? taps[0].t : props.down ?? at + 7;
  const up = taps ? taps[taps.length - 1].t + 1.5 : props.up ?? down + 3;
  const leave = props.leave ?? up + 8;
  const f = useCurrentFrame();
  if (f < at - 1 || f > leave + 1) return null;
  const contact = (g: number): { x: number; y: number; lift: number } => {
    if (!taps) { const p = path?.(Math.min(Math.max(g, down), up)); return { x: p ? p.x : x, y: p ? p.y : y, lift: 0 }; }
    // typing: on each key for 1.5 frames, then across to the next, lifting with the distance in time
    let i = 0;
    while (i < taps.length - 1 && g >= taps[i + 1].t) i++;
    const a = taps[i], b = taps[Math.min(i + 1, taps.length - 1)];
    const hold = 1.5;
    if (g - a.t < hold || a === b) return { x: a.x, y: a.y, lift: 0 };
    const s = Math.min(1, (g - a.t - hold) / Math.max(0.5, b.t - a.t - hold));
    const e = Easing.inOut(Easing.sin)(s);
    const hover = Math.min(thumb ? 0.24 : 0.32, (b.t - a.t) / 40 + 0.05);
    // a longer wait: by way of its resting place (the further, the longer the wait), on a smooth curve
    // through it (a quadratic whose middle is that point)
    const k = rest ? Math.min(1, Math.max(0, (b.t - a.t - 9) / 9)) : 0;
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const r = { x: mx + ((rest?.x ?? mx) - mx) * k, y: my + ((rest?.y ?? my) - my) * k };
    const c = { x: 2 * r.x - mx, y: 2 * r.y - my };
    const q = (p0: number, p1: number, p2: number) => (1 - e) * (1 - e) * p0 + 2 * (1 - e) * e * p1 + e * e * p2;
    return { x: q(a.x, c.x, b.x), y: q(a.y, c.y, b.y), lift: Math.max(hover, 0.24 * k) * Math.sin(Math.PI * s) };
  };
  const state = (g: number): HandState => {
    // the reach: 0 on (or over) the glass … 1 out of frame along the arm
    const inT = interpolate(g, [at, down], [1, 0], { ...clamp, easing: Easing.out(Easing.cubic) });
    const outT = interpolate(g, [up, leave], [0, 1], { ...clamp, easing: Easing.in(Easing.cubic) });
    const away = g < down ? inT : g > up ? outT : 0;
    const c = contact(g);
    const lift = Math.min(1, Math.max(c.lift, away * 5)); // height above the glass (well off within the first part of the reach)
    const pressing = c.lift === 0 && away === 0;
    if (thumb) {
      // turned to point from its root at the key; in and out along that line
      const root = THUMB_ROOT[digit];
      const dx = root.x - c.x, dy = root.y - c.y, n = Math.hypot(dx, dy) || 1;
      const ax = left ? -THUMB.axisX : THUMB.axisX;
      const rot = ((Math.atan2(dy, dx) - Math.atan2(THUMB.axisY, ax)) * 180) / Math.PI;
      return {
        px: c.x * K + (dx / n) * T_REACH * away, py: c.y * K + (dy / n) * T_REACH * away, lift, rot,
        s: TS * (1 + 0.07 * lift) * (pressing ? 0.99 : 1),
      };
    }
    return {
      px: c.x * K + HAND.axisX * REACH * away, py: c.y * K + HAND.axisY * REACH * away, lift, rot: 0,
      s: HS * (1 + 0.1 * lift) * (pressing ? 0.988 : 1), // (the fingertip flattens a touch against the glass)
    };
  };
  const st = state(f);
  // the picture's geometry: the contact point (mirrored for the left thumb)
  const G = thumb ? THUMB : HAND;
  const cx = left ? G.w - G.contactX : G.contactX, cy = G.contactY;
  const src = thumb ? 'phone/thumb.png' : 'phone/hand.png';
  if (part === 'shadow') {
    // light from the upper left: the shadow falls down and right, further and softer the higher the
    // finger; on the glass, a tight dark pool right under the fingertip
    const off = { x: 6 + 70 * st.lift, y: 10 + 110 * st.lift };
    const pad = thumb ? THUMB.pad : 240;
    const scale = thumb ? 2 : 4; // (the shadows are stored smaller than the picture)
    const SW = (thumb ? (G.w + 2 * pad) : 556 * scale) * st.s, SH = (thumb ? (G.h + 2 * pad) : 704 * scale) * st.s;
    const ox = (cx + pad) * st.s, oy = (cy + pad) * st.s;
    const o = (thumb ? 0.6 : 0.72) - 0.42 * st.lift;
    const pool = Math.max(0, 1 - st.lift * 4);
    const img = (name: string, opacity: number) => (
      <div style={{ position: 'absolute', left: st.px - ox + off.x, top: st.py - oy + off.y, width: SW, height: SH, transformOrigin: `${ox}px ${oy}px`, transform: `rotate(${st.rot}deg)`, opacity }}>
        <Img src={staticFile(`phone/${thumb ? 'thumb' : 'hand'}-shadow-${name}.png`)} style={{ width: '100%', height: '100%', transform: left ? 'scaleX(-1)' : undefined }} />
      </div>
    );
    return (
      <div style={{ position: 'absolute', inset: 0, zIndex: 45, pointerEvents: 'none' }}>
        {img('near', o * (1 - st.lift))}
        {img('far', o * st.lift)}
        {pool > 0 && <div style={{ position: 'absolute', left: st.px - 30, top: st.py - 14, width: 110, height: 80, borderRadius: '50%', background: 'radial-gradient(closest-side, rgba(0,0,0,.42), rgba(0,0,0,.16) 55%, rgba(0,0,0,0))', opacity: pool }} />}
      </div>
    );
  }
  // the hand; moving fast it smears as on a 180° shutter: many faint exposures over the last half
  // frame, weighted evenly (drawn back to front at 1, 1/2, 1/3…)
  const prev = state(f - 0.5);
  const speed = Math.hypot(st.px - prev.px, st.py - prev.py) * 2;
  const n = speed > 24 ? Math.min(14, Math.ceil(speed / 7)) : 1; // (copies ≤7 px apart: a continuous smear, not ghosts)
  const draw = (s: HandState, o: number, key: string) => (
    <div key={key} style={{
      position: 'absolute', left: s.px - cx * s.s, top: s.py - cy * s.s, width: G.w * s.s, height: G.h * s.s, opacity: o,
      transformOrigin: `${cx * s.s}px ${cy * s.s}px`, transform: s.rot ? `rotate(${s.rot}deg)` : undefined,
    }}>
      <Img src={staticFile(src)} style={{ width: '100%', height: '100%', transform: left ? 'scaleX(-1)' : undefined }} />
    </div>
  );
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
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
  const lensK = React.useContext(FastCtx);
  const amount = interpolate(zoom, [1.35, 2.3], [0, 1], clamp) * lensK;
  if (amount <= 0.02) return null;
  const blur = 2 + 9 * amount;
  const band = 26 - 8 * amount; // half-height of the sharp band, % of the frame
  const top = Math.max(0, focusY * 100 - band), bottom = Math.min(100, focusY * 100 + band);
  // each band is only as tall as the part it blurs (a backdrop blur costs its whole area)
  const band2 = (edge: 'top' | 'bottom', h: number): React.CSSProperties => {
    const mask = `linear-gradient(${edge === 'top' ? 180 : 0}deg, #000 0%, rgba(0,0,0,.6) 60%, transparent 100%)`;
    return {
      position: 'absolute', left: 0, right: 0, [edge]: 0, height: `${h}%`, backdropFilter: `blur(${blur}px)`, WebkitBackdropFilter: `blur(${blur}px)`,
      maskImage: mask, WebkitMaskImage: mask, pointerEvents: 'none', zIndex: 55,
    };
  };
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {top > 0.5 && <div style={band2('top', top)} />}
      {bottom < 99.5 && <div style={band2('bottom', 100 - bottom)} />}
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
