// The payoff, in real life: the friends meet at the spot (live action, Higgsfield / Kling: the hug
// turning into glasses clinking). A slow push-in, as if handheld; it ends on the clink.
import React from 'react';
import { AbsoluteFill, interpolate, OffthreadVideo, staticFile, useCurrentFrame } from 'remotion';
import { clamp } from '../theme';

export const LIVE_FROM = 2.35; // seconds into the clip: the hug
/** The clip is 24 fps: played 1.25× each of its frames shows exactly once (no judder), a touch brisk. */
const RATE = 1.25;
/** Cut on the glasses' approach, before they meet (the generated clip blends them on contact). */
export const LIVE_DUR = 53;
/** The clink (frames into this shot): on the cut, as the glasses meet. */
export const LIVE_CLINK = 53;

export const Live: React.FC = () => {
  const f = useCurrentFrame();
  const push = interpolate(f, [0, LIVE_DUR], [1.04, 1.1], clamp);
  // a little handheld life (slow, small, fixed: the same every render)
  const hx = Math.sin(f * 0.11) * 4 + Math.sin(f * 0.037 + 1) * 6;
  const hy = Math.cos(f * 0.09) * 3 + Math.sin(f * 0.029) * 5;
  return (
    <AbsoluteFill style={{ background: '#000', overflow: 'hidden' }}>
      <AbsoluteFill style={{ transform: `translate(${hx}px, ${hy}px) scale(${push})` }}>
        <OffthreadVideo src={staticFile('live/pub.mp4')} startFrom={Math.round(LIVE_FROM * 30)} playbackRate={RATE} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </AbsoluteFill>
      {/* out to black on the last frames, for the brand */}
      <AbsoluteFill style={{ background: '#000', opacity: interpolate(f, [LIVE_DUR - 3, LIVE_DUR], [0, 1], clamp) }} />
    </AbsoluteFill>
  );
};
