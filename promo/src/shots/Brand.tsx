// Shot 11, the sign-off (card ui-to-brand-morph · icon-flip-bloom, demo IconFlipBloomLogo.tsx):
// Meet's glass play button sways twice to wind up, flips edge-on (with ghosts), and at its thinnest
// frame becomes a blue dot that blooms open, glides into place and becomes the dot of "meet•" as the
// letters land beside it (each big and blurred to its size and sharp, the card's correction of its
// demo's sideways sweep). Then the call to action and the address; a full second's hold.
import React, { useEffect, useRef, useState } from 'react';
import { continueRender, delayRender, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { Stage } from '../kit';
import { C, FONT, clamp } from '../theme';

export const BRAND_DUR = 156;
const FLIP_START = 34, FLIP_MID = 46, WORD_START = 66;
export const BRAND_BEATS = { flip: FLIP_START + 4, word: WORD_START + 8 };
const WORD = 'meet';
const SIZE = 210; // the wordmark's font size
const DOT = SIZE * 0.34;

/** Meet's floating play button, in its liquid glass (as in the app, larger). */
const PlayGlass: React.FC<{ size: number }> = ({ size }) => (
  <div style={{
    width: size, height: size, borderRadius: '50%', position: 'relative', display: 'grid', placeItems: 'center',
    background: 'radial-gradient(120% 75% at 50% -8%, rgba(255,255,255,.55), transparent 58%), radial-gradient(closest-side, transparent 70%, rgba(255,255,255,.45) 100%), radial-gradient(80% 40% at 50% 104%, rgba(255,255,255,.35), transparent 70%), rgba(255,255,255,0.16)',
    boxShadow: 'inset 0 3px 1px rgba(255,255,255,.9), inset 0 -2px 2px rgba(255,255,255,.4), inset 0 0 0 1.5px rgba(255,255,255,.5), 0 30px 80px rgba(0,0,0,.5), 0 0 120px rgba(10,132,255,.35)',
    backdropFilter: 'blur(10px)',
  }}>
    <svg width={size * 0.46} height={size * 0.46} viewBox="0 0 24 24" style={{ marginLeft: size * 0.03 }}>
      <path d="M7.2 5.8v12.4l10.8-6.2z" fill={C.accentOnBlack} stroke={C.accentOnBlack} strokeWidth="2.6" strokeLinejoin="round" />
    </svg>
  </div>
);

export const Brand: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const inT = spring({ frame, fps, config: { damping: 13, stiffness: 140, mass: 0.8 } });
  // the wind-up: two sways, each wider, then a press the other way (−12° / +14° / −18° → 0)
  const wobble = interpolate(frame, [12, 18, 24, 30, FLIP_START], [0, -12, 14, -18, 0], { ...clamp, easing: Easing.inOut(Easing.sin) });
  // the flip: edge-on in 12f, accelerating (the swap happens at its thinnest frame)
  const flipIn = interpolate(frame, [FLIP_START, FLIP_MID], [0, 1], { ...clamp, easing: Easing.in(Easing.cubic) });
  const iconScaleX = interpolate(flipIn, [0, 1], [1, 0.04]);
  // the bloom: a spring from the edge-on line to a full dot
  const bloom = frame < FLIP_MID ? 0 : spring({ frame: frame - FLIP_MID, fps, config: { damping: 11, stiffness: 130, mass: 0.9 } });
  // the dot then glides into its place as the wordmark's dot, shrinking to its size
  const glide = interpolate(frame, [WORD_START - 4, WORD_START + 18], [0, 1], { ...clamp, easing: Easing.bezier(0.16, 1, 0.3, 1) });
  const BTN = 300;
  // the lockup is laid out once and measured: where its dot sits (the button's dot glides there)
  const cx = 540, cy = 860;
  const rowRef = useRef<HTMLDivElement>(null);
  const dotRef = useRef<HTMLSpanElement>(null);
  const [handle] = useState(() => delayRender('brand: measure'));
  const [dotAt, setDotAt] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    document.fonts.ready.then(() => {
      const row = rowRef.current, dot = dotRef.current;
      if (row && dot) setDotAt({ x: row.offsetLeft + dot.offsetLeft + DOT / 2, y: row.offsetTop + dot.offsetTop + DOT / 2 });
      else continueRender(handle);
    });
  }, [handle]);
  useEffect(() => { if (dotAt) continueRender(handle); }, [dotAt, handle]);
  const dotX = dotAt?.x ?? cx, dotY = dotAt?.y ?? cy;
  const markX = interpolate(glide, [0, 1], [cx, dotX]);
  const markY = interpolate(glide, [0, 1], [cy, dotY]);
  const markSize = interpolate(glide, [0, 1], [BTN * 0.62, DOT]);
  const ghosts = frame >= FLIP_START && frame < FLIP_MID ? [0.12, 0.24] : [];
  const showIcon = frame < FLIP_MID;
  const tag = interpolate(frame, [WORD_START + 30, WORD_START + 48], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const url = interpolate(frame, [WORD_START + 38, WORD_START + 56], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  return (
    <Stage glow={0.85}>
      {/* the button / the dot */}
      <div style={{ position: 'absolute', left: showIcon ? cx : markX, top: showIcon ? cy : markY, transform: 'translate(-50%, -50%)' }}>
        {showIcon ? (
          <>
            {ghosts.map((g, i) => (
              <div key={i} style={{ position: 'absolute', left: '50%', top: '50%', transform: `translate(-50%, -50%) scaleX(${Math.min(1, iconScaleX + g)})`, opacity: 0.22 - i * 0.08, filter: 'blur(6px)' }}><PlayGlass size={BTN} /></div>
            ))}
            <div style={{ transform: `scale(${inT}) rotate(${wobble}deg) scaleX(${iconScaleX})`, transformOrigin: 'center 78%', filter: flipIn > 0.3 ? `blur(${flipIn * 5}px)` : undefined, opacity: inT }}>
              <PlayGlass size={BTN} />
            </div>
          </>
        ) : (
          <div style={{
            width: markSize, height: markSize, borderRadius: '50%', transform: `scaleX(${interpolate(bloom, [0, 1], [0.04, 1])})`,
            background: `radial-gradient(circle at 35% 30%, #5db2ff, ${C.accentOnBlack} 60%)`,
            boxShadow: `0 0 ${interpolate(glide, [0, 1], [90, 30])}px rgba(10,132,255,${interpolate(glide, [0, 1], [0.7, 0.45])})`,
          }} />
        )}
      </div>
      {/* "meet": each letter lands from big and blurred to its size and sharp; the dot's place is held for the dot */}
      <div ref={rowRef} style={{ position: 'absolute', left: 0, right: 0, top: cy - SIZE * 0.62, display: 'flex', justifyContent: 'center', alignItems: 'baseline', fontFamily: FONT, fontWeight: 800, fontSize: SIZE, letterSpacing: '-0.035em', color: C.white, lineHeight: 1, whiteSpace: 'nowrap' }}>
        {WORD.split('').map((ch, i) => {
          const t = interpolate(frame, [WORD_START + i * 4, WORD_START + i * 4 + 14], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
          return <span key={i} style={{ display: 'inline-block', opacity: t, transform: `scale(${1 + (1 - t) * 0.9})`, filter: t < 1 ? `blur(${(1 - t) * 18}px)` : undefined, transformOrigin: '50% 70%' }}>{ch}</span>;
        })}
        <span ref={dotRef} style={{ display: 'inline-block', width: DOT, height: DOT, marginLeft: SIZE * 0.07 }} />
      </div>
      {/* the call to action and where */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: cy + 190, textAlign: 'center', fontFamily: FONT, fontWeight: 700, fontSize: 60, letterSpacing: '-0.03em', color: C.white, opacity: tag, transform: `translateY(${(1 - tag) * 24}px)`, filter: tag < 1 ? `blur(${(1 - tag) * 8}px)` : undefined }}>
        Plan your next catch-up.
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: cy + 290, textAlign: 'center', fontFamily: FONT, fontWeight: 600, fontSize: 44, letterSpacing: '-0.01em', color: C.accentOnBlack, opacity: url, transform: `translateY(${(1 - url) * 18}px)` }}>
        meet-hhdt.onrender.com
      </div>
    </Stage>
  );
};
