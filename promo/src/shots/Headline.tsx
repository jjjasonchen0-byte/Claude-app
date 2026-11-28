// Shot 3: "Meet in the middle." (card lead-word-zoom-assemble, demo LeadWordZoomAssemble.tsx).
// The lead word fills the frame and keeps pushing in, then shrinks back into its place in the line
// as the other words are pushed into their slots; the subline rises with it; a beat; the scene
// crash-zooms out of focus into the next shot. Parameters as in the demo, re-skinned for Meet.
import React, { Fragment, useEffect, useRef, useState } from 'react';
import { AbsoluteFill, continueRender, delayRender, Easing, interpolate, useCurrentFrame } from 'remotion';
import { Stage } from '../kit';
import { C, FONT, clamp } from '../theme';

export const HEADLINE_DUR = 97; // (to the beat at frame 540: the crash-out runs right up to the cut)
const TEXT = 'Meet in the middle.';
const HIGHLIGHT = 'middle.';
const FONT_SIZE = 96;
const INITIAL_SCALE = 3.6; // (the demo's 2.3 is for a 1920-wide frame: here the lead word nearly fills a 1080-wide one)
const INTRO = 6;
const HOLD = 14; // (the demo's 12, +2: the dive hands over mid-push)
const PUSH = 1.06;
const RECEDE = 12;
const ASSEMBLE = 24;
const WORD_DELAY = 6;
const WORD_STAGGER = 4;
const WORD_DURATION = 12;
const WORD_PUSH = 0.5;
const WORD_FADE = 2;
const LIFT: [number, number] = [36, 52];
const LIFT_DISTANCE = -60;
const CRASH_FRAMES = 12;

const PUSH_EASE = Easing.bezier(0.25, 1, 0.5, 1);
const ZOOM_EASE = Easing.bezier(0.5, 0, 0.05, 1);
const WORD_EASE = Easing.bezier(0.22, 0.8, 0.36, 1);

const Line: React.FC = () => {
  const frame = useCurrentFrame();
  const lineRef = useRef<HTMLSpanElement>(null);
  const leadRef = useRef<HTMLSpanElement>(null);
  const baseRef = useRef<HTMLSpanElement>(null);
  const [handle] = useState(() => delayRender('headline: measure'));
  const [m, setM] = useState<{ lineWidth: number; leadRatio: number; baseline: number } | null>(null);
  useEffect(() => {
    const line = lineRef.current, lead = leadRef.current;
    if (!line || !lead) { continueRender(handle); return; }
    document.fonts.ready.then(() => setM({
      lineWidth: line.offsetWidth,
      leadRatio: (lead.offsetLeft + lead.offsetWidth / 2) / line.offsetWidth,
      baseline: baseRef.current?.offsetTop ?? line.offsetHeight * 0.8,
    }));
  }, [handle]);
  useEffect(() => { if (m) continueRender(handle); }, [m, handle]);
  const words = TEXT.split(' ');
  const leadRatio = m?.leadRatio ?? 0.12;
  const lineWidth = m?.lineWidth ?? 900;
  const baseline = m?.baseline ?? FONT_SIZE * 0.88;
  const slide = lineWidth * (0.5 - leadRatio);
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
      <span ref={lineRef} style={{
        position: 'relative', display: 'inline-block', fontSize: FONT_SIZE, fontWeight: 800, color: C.white, letterSpacing: '-0.035em', lineHeight: 1.1,
        whiteSpace: 'nowrap', fontFamily: FONT, transformOrigin: `${leadRatio * 100}% ${baseline}px`,
        scale: interpolate(frame, [0, HOLD], [INITIAL_SCALE, INITIAL_SCALE * PUSH], { ...clamp, easing: PUSH_EASE }) +
          interpolate(frame, [HOLD, HOLD + RECEDE], [0, 1 - INITIAL_SCALE * PUSH], { ...clamp, easing: ZOOM_EASE }),
        translate: `${interpolate(frame, [HOLD, HOLD + ASSEMBLE], [slide, 0], { ...clamp, easing: ZOOM_EASE })}px`,
        opacity: m ? 1 : 0,
      } as React.CSSProperties}>
        {words.map((w, i) => {
          const lead = i === 0;
          const start = HOLD + WORD_DELAY + (i - 1) * WORD_STAGGER;
          const op = lead ? interpolate(frame, [0, INTRO], [0, 1], clamp) : interpolate(frame, [start, start + WORD_FADE], [0, 1], clamp);
          return (
            <Fragment key={i}>
              <span ref={lead ? leadRef : undefined} style={{
                display: 'inline-block', opacity: op, color: w === HIGHLIGHT ? C.accentOnBlack : undefined,
                translate: lead ? undefined : `${interpolate(frame, [start, start + WORD_DURATION], [WORD_PUSH * FONT_SIZE, 0], { ...clamp, easing: WORD_EASE })}px`,
              } as React.CSSProperties}>{w}</span>
              {i < words.length - 1 ? ' ' : null}
            </Fragment>
          );
        })}
        <span ref={baseRef} style={{ display: 'inline-block', width: 0, height: 0 }} />
      </span>
    </AbsoluteFill>
  );
};

export const Headline: React.FC = () => {
  const frame = useCurrentFrame();
  const lift = interpolate(frame, LIFT, [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const crash = interpolate(frame, [HEADLINE_DUR - CRASH_FRAMES, HEADLINE_DUR - 1], [0, 1], { ...clamp, easing: Easing.in(Easing.quad) });
  return (
    <Stage glow={interpolate(frame, [0, 24], [0.2, 0.9], clamp)}>
      <AbsoluteFill style={{ transform: `scale(${1 + crash * 0.2})`, filter: crash > 0.01 ? `blur(${crash * 9}px)` : undefined, opacity: 1 - crash * 0.55 }}>
        <AbsoluteFill style={{ transform: `translateY(${lift * LIFT_DISTANCE}px)` }}><Line /></AbsoluteFill>
        <div style={{
          position: 'absolute', left: 0, right: 0, top: '50%', marginTop: 40, textAlign: 'center', fontFamily: FONT, fontSize: 44, fontWeight: 600,
          letterSpacing: '-0.02em', color: C.text2, opacity: lift, transform: `translateY(${(1 - lift) * 16}px)`,
        }}>The fairest place for everyone.</div>
      </AbsoluteFill>
    </Stage>
  );
};
