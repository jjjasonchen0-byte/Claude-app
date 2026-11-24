// The one timeline (the single source of truth for shots, captions and sound).
import type React from 'react';
import { Opening, OPENING_DUR, OPENING_BLUR } from './shots/Opening';
import { Headline, HEADLINE_DUR } from './shots/Headline';
import { Crew, CREW_DUR, Modes, MODES_DUR } from './shots/Footage';
import { Race, GO_DUR, GO_BLUR } from './shots/Race';
import { Tabs, TABS_DUR, Glide, GLIDE_DUR } from './shots/Places';
import { Invite, INVITE_DUR } from './shots/Invite';
import { Brand, BRAND_DUR } from './shots/Brand';
import { Live, LIVE_DUR } from './shots/Live';

export type Shot = { id: string; from: number; dur: number; component: React.FC; blur?: [number, number][]; live?: boolean; snap?: boolean };

/**
 * The music (Cat Walk, 130 BPM): beat n's frame. The kick and bass drop in at frame 443.6 (beat 31,
 * measured on the track: its low band jumps ~47 dB there), where the opening hands over to "Meet".
 */
export const BPM = 129.99;
export const T0 = 0.4768;
export const beatF = (n: number) => (T0 + n * (60 / BPM)) * 30;
/** The beat nearest a frame (rounded to a frame). */
const nearestBeat = (fr: number) => Math.round(beatF(Math.round((fr / 30 - T0) / (60 / BPM))));

const seq: Omit<Shot, 'from'>[] = [
  { id: 'opening', dur: OPENING_DUR, component: Opening, blur: OPENING_BLUR, snap: false }, // (ends on the drop by design)
  { id: 'headline', dur: HEADLINE_DUR, component: Headline },
  { id: 'crew', dur: CREW_DUR, component: Crew },
  { id: 'modes', dur: MODES_DUR, component: Modes },
  { id: 'race', dur: GO_DUR, component: Race, blur: GO_BLUR },
  { id: 'tabs', dur: TABS_DUR, component: Tabs },
  { id: 'glide', dur: GLIDE_DUR, component: Glide }, // (its own speed ghosts carry the motion)
  { id: 'invite', dur: INVITE_DUR, component: Invite },
  { id: 'live', dur: LIVE_DUR, component: Live, live: true, snap: false }, // (cuts on the clink)
  { id: 'brand', dur: BRAND_DUR, component: Brand },
];

// Each cut on the beat: a shot's end moves to the nearest beat (a hold a few frames longer or shorter;
// every shot holds its last framing past its own length).
let at = 0;
export const SHOTS: Shot[] = seq.map((s, i) => {
  let dur = s.dur;
  if (s.snap !== false && i < seq.length - 1) {
    const b = nearestBeat(at + dur);
    if (Math.abs(b - (at + dur)) <= 7) dur = b - at;
  }
  const shot = { ...s, dur, from: at };
  at += dur;
  return shot;
});
export const TOTAL = at;
export const shot = (id: string) => SHOTS.find((s) => s.id === id)!;
