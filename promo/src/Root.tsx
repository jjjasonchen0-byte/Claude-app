import React from 'react';
import { AbsoluteFill, Composition, Sequence, staticFile, useCurrentFrame } from 'remotion';
import { CameraMotionBlur } from '@remotion/motion-blur';
import { FPS, H, W } from './theme';
import { FastCtx } from './kit';
import { SHOTS, TOTAL, type Shot } from './timeline';
import { Sound, lateSfx } from './sound';
import { RACE_BEATS } from './shots/Race';
import { TABS_BEATS } from './shots/Places';
import { INVITE_BEATS } from './shots/Invite';
import { LIVE_CLINK } from './shots/Live';
import { BRAND_BEATS } from './shots/Brand';

const LATE = lateSfx({ race: RACE_BEATS, tabs: TABS_BEATS, glide: { peak: 48 }, invite: INVITE_BEATS, live: { clink: LIVE_CLINK }, brand: BRAND_BEATS });

/** A shot, with camera motion blur only on its listed fast frames (local). */
const ShotView: React.FC<{ shot: Shot }> = ({ shot }) => {
  const f = useCurrentFrame();
  const C = shot.component;
  const fast = shot.blur?.some(([a, b]) => f >= a && f <= b);
  return (
    <AbsoluteFill>
      {fast ? <FastCtx.Provider value><CameraMotionBlur shutterAngle={200} samples={10}><C /></CameraMotionBlur></FastCtx.Provider> : <C />}
      {!shot.live && <Film />}
    </AbsoluteFill>
  );
};

/** What a lens and a sensor add: a gentle vignette and a fine grain that changes every frame. */
const Film: React.FC = () => {
  const f = useCurrentFrame();
  const h = (n: number) => ((Math.sin(n * 127.1 + 311.7) * 43758.5453) % 1 + 1) % 1; // a fixed hash: the same grain every render
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse 85% 70% at 50% 46%, rgba(0,0,0,0) 62%, rgba(0,0,0,.15) 100%)' }} />
      <AbsoluteFill style={{
        backgroundImage: `url(${staticFile('phone/grain.png')})`, backgroundSize: '512px 512px',
        backgroundPosition: `${Math.floor(h(f) * 512)}px ${Math.floor(h(f + 0.5) * 512)}px`, mixBlendMode: 'overlay', opacity: 0.075,
      }} />
    </AbsoluteFill>
  );
};

export const MeetAd: React.FC<{ bgm?: boolean }> = ({ bgm = true }) => (
  <AbsoluteFill style={{ background: '#000' }}>
    <Sound bgm={bgm} extra={LATE} />
    {SHOTS.map((s) => (
      <Sequence key={s.id} from={s.from} durationInFrames={s.dur} name={s.id}>
        <ShotView shot={s} />
      </Sequence>
    ))}
  </AbsoluteFill>
);

/** The soundtrack alone (rendering audio needs no pictures): render.sh mixes it to WAV and muxes it. */
export const MeetAdSound: React.FC<{ bgm?: boolean }> = ({ bgm = true }) => <Sound bgm={bgm} extra={LATE} />;

export const Root: React.FC = () => (
  <>
    <Composition id="MeetAd" component={MeetAd} durationInFrames={TOTAL} fps={FPS} width={W} height={H} defaultProps={{ bgm: true }} />
    <Composition id="MeetAdSound" component={MeetAdSound} durationInFrames={TOTAL} fps={FPS} width={W} height={H} defaultProps={{ bgm: true }} />
    {SHOTS.map((s) => (
      <Composition key={s.id} id={`Shot-${s.id}`} component={() => <ShotView shot={s} />} durationInFrames={s.dur} fps={FPS} width={W} height={H} />
    ))}
  </>
);
