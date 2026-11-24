// Shot 10: Send invite → the group chat (card paper-plane-messenger, demo PaperPlaneMessenger.tsx).
// One world, two phones: Meet's share page (A) and the group chat (B). "Share invite…" is tapped; the
// camera pulls back as a paper plane (Meet's own send icon) leaves the button and flies an arc to B,
// its nose following the curve, past rings in Meet's colours at three depths; the camera takes over
// B as the plane lands and becomes the invite in the chat; the friends answer.
import React from 'react';
import { AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { Finger, Footage, Phone, Stage } from '../kit';
import { C, FONT, H, K, PHONE_X, PHONE_Y, BEZEL, W, clamp } from '../theme';
import { CH, ChatScreen, type Msg } from '../screens/Chat';
import { CAP } from '../captures';

export const INVITE_DUR = 214;
const CLICK = 14;
const ZOOM_OUT: [number, number] = [18, 46];
const FLY: [number, number] = [36, 106];
const TAKEOVER: [number, number] = [112, 148];
const LAND = 116; // the invite appears in the chat
export const INVITE_BEATS = { click: CLICK, fly: FLY, land: LAND, replies: [LAND + 34, LAND + 50, LAND + 66] };

// the world
const AX = PHONE_X, AY = PHONE_Y; // phone A's top-left
const BX = PHONE_X + 2400, BY = PHONE_Y + 160; // phone B's top-left
const btnA = { x: AX + BEZEL + CAP.shareBtn.x * K, y: AY + BEZEL + CAP.shareBtn.y * K };
const landB = { x: BX + BEZEL + 270 * K, y: BY + BEZEL + 430 * K };
const P0 = btnA, P3 = landB;
const P1 = { x: P0.x + 700, y: P0.y - 1100 };
const P2 = { x: P3.x - 700, y: P3.y - 900 };
const bez = (t: number) => {
  const u = 1 - t;
  return { x: u * u * u * P0.x + 3 * u * u * t * P1.x + 3 * u * t * t * P2.x + t * t * t * P3.x, y: u * u * u * P0.y + 3 * u * u * t * P1.y + 3 * u * t * t * P2.y + t * t * t * P3.y };
};

const mulberry32 = (a: number) => () => { let t = (a += 0x6d2b79f5); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const COLORS = ['#007aff', '#af52de', '#30b0c7', '#ff9500'];
const PROPS = (() => {
  const r = mulberry32(42), out = [] as { x: number; y: number; size: number; ring: boolean; depth: number; drift: number; color: string }[];
  const depths = [0.45, 0.75, 1.3];
  for (let i = 0; i < 18; i++) {
    const depth = depths[i % 3];
    out.push({ x: AX + 200 + r() * 2900, y: AY - 900 + r() * 2900, size: depth < 0.6 ? 90 + r() * 90 : depth < 1 ? 150 + r() * 120 : 300 + r() * 200, ring: r() > 0.4, depth, drift: r() * Math.PI * 2, color: COLORS[i % 4] });
  }
  return out;
})();

/** The invite as it lands in the chat: a small map of the spot and the plan. */
const InviteCard: React.FC = () => (
  <div style={{ width: 250, borderRadius: 20, borderTopRightRadius: 6, overflow: 'hidden', background: CH.out, color: '#fff', boxShadow: '0 2px 8px rgba(77,58,230,.25)' }}>
    <div style={{ height: 118, position: 'relative', overflow: 'hidden', background: '#eef2f5' }}>
      <Img src={staticFile('captures/spot-card.png')} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
    </div>
    <div style={{ padding: '9px 12px 11px', fontFamily: FONT }}>
      <div style={{ fontWeight: 700, fontSize: 15, letterSpacing: '-0.01em', lineHeight: 1.2 }}>Let’s meet at {CAP.placeName}</div>
      <div style={{ fontSize: 12.5, opacity: 0.85, marginTop: 2 }}>{CAP.placeAddress} · {CAP.when}</div>
    </div>
  </div>
);

const MSGS: Msg[] = [
  { who: 'leo', text: "let's catch up!", at: -100, typing: -110 },
  { who: 'priya', text: 'But where?', at: -90, typing: -95 },
  { who: 'you', text: "I've got just the thing", at: -80 },
  { who: 'you', text: '', at: LAND, card: <InviteCard /> },
  { who: 'sam', text: 'omw 🔥', at: LAND + 34, typing: LAND + 20 },
  { who: 'priya', text: 'perfect 🙌', at: LAND + 50, typing: LAND + 38 },
  { who: 'leo', text: 'see you there!', at: LAND + 66, typing: LAND + 54 },
];

const Plane: React.FC<{ x: number; y: number; angle: number; scale: number; opacity: number }> = ({ x, y, angle, scale, opacity }) => (
  <svg width={240} height={150} viewBox="0 0 180 110" style={{ position: 'absolute', left: x - 120, top: y - 75, transform: `rotate(${angle}deg) scale(${scale})`, overflow: 'visible', opacity, filter: 'drop-shadow(0 6px 6px rgba(20,20,60,.35)) drop-shadow(0 22px 26px rgba(0,0,0,.45))' }}>
    <polygon points="176,30 6,4 62,66" fill="#ffffff" stroke="#c9d8ec" strokeWidth={2.5} />
    <polygon points="176,30 62,66 78,102" fill="#cfe2ff" stroke="#b6cbe6" strokeWidth={2.5} />
    <polygon points="176,30 6,4 50,44" fill="#eef5ff" stroke="#c9d8ec" strokeWidth={2} />
  </svg>
);

export const Invite: React.FC = () => {
  const frame = useCurrentFrame();
  const tFly = interpolate(frame, FLY, [0, 1], { ...clamp, easing: Easing.bezier(0.45, 0.05, 0.25, 1) });
  const pos = bez(tFly), nxt = bez(Math.min(tFly + 0.012, 1));
  const angle = Math.atan2(nxt.y - pos.y, nxt.x - pos.x) * (180 / Math.PI);
  const zoomOutP = interpolate(frame, ZOOM_OUT, [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const takeP = interpolate(frame, TAKEOVER, [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const follow = interpolate(frame, ZOOM_OUT, [0, 1], clamp);
  // camera: A's button → the plane → B's chat (centre and zoom continuous at the hand-over)
  const startC = { x: btnA.x, y: btnA.y - 200 };
  const bC = { x: BX + BEZEL + 195 * K, y: BY + BEZEL + 430 * K };
  let cx = startC.x + (pos.x - startC.x) * follow;
  let cy = startC.y + (pos.y - startC.y) * follow;
  cx = cx * (1 - takeP) + bC.x * takeP;
  cy = cy * (1 - takeP) + bC.y * takeP;
  const zBase = 1.3 + (0.42 - 1.3) * zoomOutP;
  const zTake = 0.42 + (1.22 - 0.42) * takeP;
  const z = frame < TAKEOVER[0] ? zBase : zTake;
  const camX = (wx: number, d: number) => W / 2 + (wx - cx) * z * d;
  const camY = (wy: number, d: number) => H / 2 + (wy - cy) * z * d;
  const boost = interpolate(tFly, [0, 0.25, 0.75, 1], [1, 1.7, 1.7, 1.1], clamp);
  const planeScale = interpolate(frame, [FLY[0] - 2, FLY[0] + 8], [0.3, 1], { ...clamp, easing: Easing.out(Easing.back(1.6)) }) * boost;
  const planeOpacity = interpolate(frame, [LAND - 4, LAND + 4], [1, 0], clamp);
  const btnPulse = interpolate(frame, [CLICK, CLICK + 3, CLICK + 12], [0, 1, 0], { ...clamp, easing: Easing.out(Easing.quad) });
  const prop = (p: typeof PROPS[number], i: number, near: boolean) => {
    const wob = Math.sin(frame * 0.035 + p.drift) * (near ? 20 : 14);
    const x = camX(p.x, p.depth) + wob, y = camY(p.y, p.depth) + Math.cos(frame * 0.03 + p.drift) * (near ? 16 : 10);
    const s = p.size * z * p.depth;
    const fade = interpolate(takeP, near ? [0.2, 0.7] : [0.3, 0.9], [1, 0], clamp) * interpolate(frame, [ZOOM_OUT[0], ZOOM_OUT[0] + 16], [0, 1], clamp);
    // out-of-focus lights in Meet's colours (lens bokeh: soft discs, nearer = bigger and softer)
    const o = (near ? 0.3 : p.depth < 0.6 ? 0.22 : 0.3) * fade;
    return <div key={`${near}${i}`} style={{ position: 'absolute', left: x - s / 2, top: y - s / 2, width: s, height: s, borderRadius: '50%', opacity: o, background: `radial-gradient(circle, ${p.color}cc 0%, ${p.color}88 55%, ${p.color}33 72%, transparent 74%)`, filter: `blur(${near ? 10 : p.depth < 0.6 ? 2 : 4}px)` }} />;
  };
  return (
    <Stage>
      {PROPS.filter((p) => p.depth < 1).map((p, i) => prop(p, i, false))}
      <AbsoluteFill>
        <div style={{ position: 'absolute', left: 0, top: 0, transformOrigin: '0 0', transform: `translate(${W / 2 - cx * z}px, ${H / 2 - cy * z}px) scale(${z})` }}>
          <Phone x={AX} y={AY}>
            <Footage clip="places" n={CAP.placesLast} />
            {/* the button answers the press */}
            <div style={{ position: 'absolute', left: CAP.shareBtn.x * K - 170 * K, top: CAP.shareBtn.y * K - 28 * K, width: 340 * K, height: 56 * K, borderRadius: 28 * K, boxShadow: `0 0 0 ${btnPulse * 22}px rgba(0,122,255,${0.25 * btnPulse})` }} />
            <Finger x={CAP.shareBtn.x} y={CAP.shareBtn.y} at={CLICK - 8} down={CLICK} up={CLICK + 5} leave={CLICK + 12} from={{ x: 300, y: 760 }} />
          </Phone>
          <Phone x={BX} y={BY}>
            <div style={{ position: 'absolute', inset: 0, zoom: K, width: 390, height: 844 }}>
              <ChatScreen frame={frame} msgs={MSGS} time="6:34" />
            </div>
          </Phone>
          {frame >= FLY[0] - 2 && planeOpacity > 0.01 && <Plane x={pos.x} y={pos.y} angle={angle} scale={planeScale} opacity={planeOpacity} />}
        </div>
      </AbsoluteFill>
      {PROPS.filter((p) => p.depth >= 1).map((p, i) => prop(p, i, true))}
    </Stage>
  );
};
