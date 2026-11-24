// Shots 1–2 (one continuous take on one phone): the group chat → "But where?" (crash zoom) → you type
// and send (the tilted frame rolls level) → swipe up: the chat shrinks into its icon → swipe to page 2
// → tap Meet → its icon grows into Meet's start screen while the camera dives into the wordmark.
import React from 'react';
import { AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { Camera, Finger, Lens, Phone, Stage, camAt, type Cam } from '../kit';
import { EASE, H, K, SCREEN_H, SCREEN_W, W, clamp, onScreen } from '../theme';
import { ChatScreen, FIELD_AT as CHAT_FIELD, SEND_UP, StatusBar, keyPoint, type Msg } from '../screens/Chat';
import { AppIcon, HomeScreen, iconBox } from '../screens/Home';

// ---- the beats (local frames) ----
export const O = {
  sam: 34, priya: 64, leo: 94, where: 124,
  crash: 127, // the crash zoom onto "But where?" (6f push, 5f rebound)
  pullBack: 160,
  fieldTap: 172, typeFrom: 186, sendTap: 280, sent: 282,
  roll: 282, // the frame rolls level as your answer goes
  swipeUp: 306, morphIn: 314, // the chat shrinks into its icon (25f + 10f settle)
  swipeLeft: 360, release: 374,
  tapMeet: 394, launch: 406, // Meet's icon grows into the app (25f + 10f)
  dive: 410, end: 443, // (the headline's "Meet" lands on the music's drop: frame 443)
};
export const OPENING_DUR = O.end;

export const MSGS: Msg[] = [
  { who: 'sam', text: 'Wassup yall', at: O.sam, typing: O.sam - 16 },
  { who: 'priya', text: 'Yoooooo', at: O.priya, typing: O.priya - 14 },
  { who: 'leo', text: "let's catch up!", at: O.leo, typing: O.leo - 14 },
  { who: 'priya', text: 'But where?', at: O.where, typing: O.where - 14 },
  { who: 'you', text: "I've got just the thing", at: O.sent },
];
const DRAFT = "I've got just the thing";
/** Frames a letter: a quick one-finger typist (~7.5 keys a second), done just before the send. */
export const TYPE_RATE = 4;

/** The one hand that answers: the field, then every key, then send (app px, frame). */
const TAPS = [
  { ...CHAT_FIELD, t: O.fieldTap },
  ...DRAFT.split('').map((ch, i) => ({ ...keyPoint(ch)!, t: O.typeFrom + i * TYPE_RATE })),
  { ...SEND_UP, t: O.sendTap },
];

// "But where?": the 4th incoming bubble's centre (app px), and the field.
const WHERE_AT = onScreen(98, 403);
const FIELD_AT = onScreen(190, 803);
const WORD_AT = onScreen(185, 302); // Meet's wordmark on its start screen
const MEET_AT = onScreen(66.75, 149); // Meet's icon on page 2

/** The shared-element curve (card transition-travel A): 25f to 1.03, then 10f back to 1. */
const morphP = (f: number, start: number) =>
  f <= start + 25
    ? interpolate(f, [start, start + 25], [0, 1.03], { ...clamp, easing: Easing.bezier(0.4, 0, 0.2, 1) })
    : interpolate(f, [start + 25, start + 35], [1.03, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const openingCam = (f: number): Cam => {
  // Base path: close on the chat, following the conversation down; back to the whole phone to close it; the dive.
  const base = camAt(f, [
    { f: 0, cam: { x: 505, y: 760, zoom: 1.26 } },
    { f: O.where, cam: { x: 490, y: 860, zoom: 1.4 }, ease: Easing.inOut(Easing.sin) },
    { f: O.crash, cam: { x: 490, y: 860, zoom: 1.4 } },
    { f: O.crash + 6, cam: { x: WHERE_AT.x, y: WHERE_AT.y, zoom: 3.0 }, ease: EASE.crash },
    { f: O.crash + 11, cam: { x: WHERE_AT.x, y: WHERE_AT.y, zoom: 2.85 }, ease: Easing.out(Easing.cubic) },
    { f: O.pullBack, cam: { x: WHERE_AT.x, y: WHERE_AT.y, zoom: 2.85 } },
    { f: O.pullBack + 26, cam: { x: 520, y: 1180, zoom: 1.36 } },
    { f: O.sendTap, cam: { x: 520, y: 1140, zoom: 1.4 }, ease: Easing.inOut(Easing.sin) },
    { f: O.swipeUp, cam: { x: 540, y: 1000, zoom: 1.3 } },
    { f: O.morphIn + 22, cam: { x: 540, y: 960, zoom: 0.96 } },
    { f: O.release + 12, cam: { x: 540, y: 960, zoom: 0.98 }, ease: Easing.inOut(Easing.sin) },
    // a punch in towards Meet's icon for the tap…
    { f: O.tapMeet + 8, cam: { x: MEET_AT.x + 60, y: MEET_AT.y + 120, zoom: 1.7 } },
    { f: O.launch, cam: { x: MEET_AT.x + 70, y: MEET_AT.y + 130, zoom: 1.78 }, ease: Easing.inOut(Easing.sin) },
    // …and on, without stopping, into the app as it opens: a dive into its wordmark
    { f: O.end, cam: { x: WORD_AT.x, y: WORD_AT.y, zoom: 4.4 }, ease: Easing.bezier(0.45, 0, 0.9, 0.6) },
  ]);
  // The dutch roll (card tension-camera-moves B): held at a tilt while there is no answer, then one
  // overshoot back to level as yours goes: −9° → +1.2° in 14f, → 0 in 10f; a slow drift while tilted.
  const drift = Math.sin(Math.min(f, O.roll) * 0.035) * 0.8 * interpolate(f, [O.crash, O.crash + 10, O.roll, O.roll + 6], [0, 1, 1, 0], clamp);
  // level through the greetings; the tilt comes with "But where?" (the crash), and holds till the answer
  const tilt = interpolate(f, [O.where - 2, O.crash + 6], [0, -9], { ...clamp, easing: Easing.out(Easing.cubic) });
  const rz = f < O.roll ? tilt : f < O.roll + 14
    ? interpolate(f, [O.roll, O.roll + 14], [-9, 1.2], { easing: Easing.out(Easing.cubic) })
    : interpolate(f, [O.roll + 14, O.roll + 24], [1.2, 0], { ...clamp, easing: Easing.inOut(Easing.quad) });
  // While Meet opens out of its icon its wordmark is still on the move: the dive follows where it is.
  if (f > O.launch) {
    const p = morphP(f, O.launch);
    const icon = iconBox(0, 0);
    const ow = lerp(icon.w, 390, p), ox = lerp(icon.x, 0, p), oy = lerp(icon.y, 0, p);
    const now = onScreen(ox + 185 * (ow / 390), oy + 302 * (ow / 390));
    const t = Easing.in(Easing.quad)(Math.min(1, (f - O.launch) / (O.end - O.launch)));
    base.x += (now.x - WORD_AT.x) * t;
    base.y += (now.y - WORD_AT.y) * t;
  }
  return { ...base, rz: rz + drift, ry: interpolate(f, [O.morphIn, O.swipeLeft, O.tapMeet], [0, -7, 0], clamp) };
};

/** Frames that get motion blur (only the fast pushes: aesthetic rule, card crash-zoom-punch). */
export const OPENING_BLUR: [number, number][] = [[O.crash - 2, O.crash + 8], [O.end - 12, O.end]];

export const Opening: React.FC = () => {
  const f = useCurrentFrame();
  const cam = openingCam(f);

  // ---- close the chat into its icon ----
  const chats = iconBox(0, 0);
  const pClose = f < O.morphIn ? 0 : morphP(f, O.morphIn);
  const lift = interpolate(f, [O.swipeUp, O.morphIn], [0, 1], { ...clamp, easing: Easing.out(Easing.quad) }); // the app follows the finger up a little first
  const cw = lerp(390, chats.w, pClose) * (1 - 0.06 * lift * (1 - pClose));
  const ch = lerp(844, chats.h, pClose) * (1 - 0.06 * lift * (1 - pClose));
  const cx = lerp(0, chats.x, pClose) + (390 - cw) / 2 * (1 - pClose);
  const cy = lerp(0, chats.y, pClose) + (844 - ch) / 2 * (1 - pClose) - 30 * lift * (1 - pClose);
  const cr = lerp(48, chats.w / 2, Math.min(1, pClose)); // (into a round icon)
  const appFade = interpolate(pClose, [0.55, 0.85], [1, 0], clamp);
  const homeIn = interpolate(f, [O.swipeUp, O.morphIn + 30], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });

  // ---- swipe to page 2 ----
  const drag = interpolate(f, [O.swipeLeft, O.release], [0, 0.62], { ...clamp, easing: Easing.inOut(Easing.sin) });
  const settle = interpolate(f, [O.release, O.release + 14], [0.62, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const page = f < O.release ? drag : settle;

  // ---- tap Meet; its icon grows into the app ----
  const meet = iconBox(0, 0);
  const press = interpolate(f, [O.tapMeet + 6, O.tapMeet + 8, O.launch - 2, O.launch + 2], [1, 0.86, 0.86, 1], clamp);
  const pOpen = f < O.launch ? 0 : morphP(f, O.launch);
  const ow = lerp(meet.w, 390, pOpen), oh = lerp(meet.h, 844, pOpen);
  const ox = lerp(meet.x, 0, pOpen), oy = lerp(meet.y, 0, pOpen);
  const or = lerp(meet.w / 2, 48, Math.min(1, pOpen));
  const iconFade = interpolate(pOpen, [0, 0.3], [1, 0], clamp);

  const chatOn = f < O.morphIn + 36;
  return (
    <Stage glow={interpolate(f, [0, 30], [0, 1], clamp)}>
      <AbsoluteFill style={{ opacity: interpolate(f, [0, 16], [0, 1], clamp) }}>
        <Camera cam={cam}>
          <Phone screenBg="#000">
            {/* the home screen, settling in behind the closing app */}
            {f >= O.swipeUp - 2 && (
              <div style={{ position: 'absolute', inset: 0, zoom: K, width: 390, height: 844 }}>
                <div style={{ position: 'absolute', inset: 0, transform: `scale(${lerp(0.9, 1, homeIn)})`, filter: homeIn < 1 ? `blur(${(1 - homeIn) * 8}px)` : undefined }}>
                  <HomeScreen page={page} hide={chatOn ? 'chats' : f >= O.launch ? 'meet' : undefined} press={{ id: 'meet', s: press }} dim={(1 - homeIn) * 0.5} />
                </div>
              </div>
            )}
            {/* the chat app (shrinking into its icon) */}
            {chatOn && (
              <div style={{ position: 'absolute', zoom: K, left: cx, top: cy, width: cw, height: ch, borderRadius: cr, overflow: 'hidden', boxShadow: pClose > 0 ? `0 ${lerp(30, 2, Math.min(1, pClose))}px ${lerp(80, 8, Math.min(1, pClose))}px rgba(0,0,0,${lerp(0.4, 0.15, Math.min(1, pClose))})` : undefined }}>
                <div style={{ position: 'absolute', left: 0, top: 0, width: 390, height: 844, transform: `scale(${cw / 390})`, transformOrigin: '0 0', opacity: appFade }}>
                  <ChatScreen frame={f} msgs={MSGS} draft={DRAFT} draftFrom={O.typeFrom} draftRate={TYPE_RATE} sentAt={O.sendTap + 2} fieldTapAt={O.fieldTap + 3} />
                </div>
                {pClose > 0.5 && <div style={{ position: 'absolute', inset: 0, opacity: 1 - appFade }}><AppIcon id="chats" size={cw} /></div>}
              </div>
            )}
            {/* Meet, opening out of its icon */}
            {f >= O.launch && (
              <div style={{ position: 'absolute', zoom: K, left: ox, top: oy, width: ow, height: oh, borderRadius: or, overflow: 'hidden', background: '#fff', boxShadow: `0 ${lerp(2, 30, Math.min(1, pOpen))}px ${lerp(8, 80, Math.min(1, pOpen))}px rgba(0,0,0,.3)` }}>
                <Img src={staticFile('captures/start.png')} style={{ position: 'absolute', left: 0, top: 0, width: ow, height: (ow / 390) * 844, opacity: 1 - iconFade }} />
                <div style={{ position: 'absolute', left: 0, top: 0, width: 390, height: 844, transform: `scale(${ow / 390})`, transformOrigin: '0 0', opacity: 1 - iconFade }}><StatusBar time="6:31" /></div>
                {iconFade > 0 && <div style={{ position: 'absolute', inset: 0, opacity: iconFade }}><AppIcon id="meet" size={ow} /></div>}
              </div>
            )}
            {/* fingers */}
            <Finger x={CHAT_FIELD.x} y={CHAT_FIELD.y} at={O.fieldTap - 8} taps={TAPS} leave={O.sendTap + 12} />
            <Finger x={195} y={830} at={O.swipeUp - 6} down={O.swipeUp} up={O.morphIn + 2} leave={O.morphIn + 11}
              path={(fr) => (fr < O.swipeUp ? null : { x: 195, y: interpolate(fr, [O.swipeUp, O.morphIn + 2], [830, 560], { ...clamp, easing: Easing.in(Easing.quad) }) })} />
            <Finger x={320} y={420} at={O.swipeLeft - 6} down={O.swipeLeft} up={O.release} leave={O.release + 10}
              path={(fr) => (fr < O.swipeLeft ? null : { x: interpolate(fr, [O.swipeLeft, O.release], [320, 78], { ...clamp, easing: Easing.inOut(Easing.sin) }), y: 420 - (fr - O.swipeLeft) * 0.6 })} />
            <Finger x={meet.x + 31} y={meet.y + 31} at={O.tapMeet} down={O.tapMeet + 7} up={O.launch - 1} leave={O.launch + 9} from={{ x: 190, y: 360 }} />
          </Phone>
        </Camera>
      </AbsoluteFill>
      {f < O.launch && <Lens zoom={cam.zoom} />}
      {/* the dive ends in black: the wordmark hands over to the headline */}
      <AbsoluteFill style={{ background: '#000', opacity: interpolate(f, [O.end - 7, O.end], [0, 1], clamp) }} />
    </Stage>
  );
};
export { W, H, SCREEN_W, SCREEN_H };
