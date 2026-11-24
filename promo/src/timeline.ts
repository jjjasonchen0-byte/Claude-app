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

export type Shot = { id: string; from: number; dur: number; component: React.FC; blur?: [number, number][]; live?: boolean };

/** The music (Cat Walk, 130 BPM): beat n's frame. Its first loud section starts at bar 7 (beat 28). */
export const BPM = 129.99;
export const T0 = 0.7076;
export const beatF = (n: number) => (T0 + n * (60 / BPM)) * 30;

const seq: Omit<Shot, 'from'>[] = [
  { id: 'opening', dur: OPENING_DUR, component: Opening, blur: OPENING_BLUR },
  { id: 'headline', dur: HEADLINE_DUR, component: Headline },
  { id: 'crew', dur: CREW_DUR, component: Crew },
  { id: 'modes', dur: MODES_DUR, component: Modes },
  { id: 'race', dur: GO_DUR, component: Race, blur: GO_BLUR },
  { id: 'tabs', dur: TABS_DUR, component: Tabs },
  { id: 'glide', dur: GLIDE_DUR, component: Glide, blur: [[0, 30]] },
  { id: 'invite', dur: INVITE_DUR, component: Invite },
  { id: 'live', dur: LIVE_DUR, component: Live, live: true },
  { id: 'brand', dur: BRAND_DUR, component: Brand },
];

let at = 0;
export const SHOTS: Shot[] = seq.map((s) => { const shot = { ...s, from: at }; at += s.dur; return shot; });
export const TOTAL = at;
export const shot = (id: string) => SHOTS.find((s) => s.id === id)!;
