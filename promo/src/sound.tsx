// The sound: Cat Walk under everything (switchable: the `bgm` input prop), and one table of effects,
// each pinned to a moment in a shot (relative to the shot's start: sound-design §4.5) so that the
// loudest instant of the sound lands on that frame (§4.6: minus the file's own peak delay and the
// output's AAC priming).
import React from 'react';
import { Audio, interpolate, Sequence, staticFile } from 'remotion';
import { shot, TOTAL } from './timeline';
import { O, TYPE_RATE } from './shots/Opening';
import { CAP } from './captures';
import { clamp } from './theme';

/**
 * How late the delivered audio sits against the picture. The soundtrack is rendered to WAV and muxed
 * by ffmpeg (render.sh), whose AAC encoder writes an edit list over its priming: no lag to make up.
 * (Remotion's own mp4 mux lags ~1.28f; use that if rendering straight to mp4.)
 */
const OUTPUT_AUDIO_OFFSET_F = 0;
/** Where each file is loudest (frames from its start; measured: src/sfx-peaks, ffmpeg + numpy). */
const PEAK_F: Record<string, number> = {
  'air-woosh-quick': 7.2, 'air-zoom-vacuum': 13.5, cheer: 21.2, clink: 29.4, 'hit-weak': 4.4, 'impact-cine-big': 65.1,
  'impact-deep-whoosh': 18.3, 'impact-zoom-quick': 15.9, pop: 1, 'riser-cine': 35.1, 'shimmer-sparkle-sweep': 27.7,
  'sparkle-touch': 14.2, 'switch-tap': 0, 'swoosh-quick': 8.8, 'swoosh-slow': 63.7, 'transition-soft': 13.5,
  'whoosh-fast': 21.6, 'whoosh-swirl': 59.1, 'wind-woosh-throw': 4.7, 'zoom-air-fast': 15.8,
  tap1: 1.3, tap2: 0.9, tap3: 1.1, tap4: 0.9, tap5: 1, tap6: 1, tap7: 0.9, tap8: 1.2,
};
const sfxFrom = (peakAt: number, src: string) => Math.round(peakAt - (PEAK_F[src] ?? 0) - OUTPUT_AUDIO_OFFSET_F);

type Sfx = { at: number; src: string; volume: number; dur?: number; fadeIn?: number; fadeOut?: number };
const S = (id: string) => shot(id).from;
let tapN = 0;
/** A fingertip on glass (eight real taps, taken in turn so no two in a row are the same). */
const tap = (at: number, volume = 0.5): Sfx => ({ at, src: `tap${(tapN++ % 8) + 1}`, volume, dur: 8 });

const fr = (p?: { frame?: number }, d = 0) => p?.frame ?? d;

export const SFX: Sfx[] = [
  // ---- the chat
  ...[O.sam, O.priya, O.leo, O.where].map((at, i) => ({ at: S('opening') + at, src: 'pop', volume: 0.34 - i * 0.02, dur: 15 })),
  { at: S('opening') + O.crash + 6, src: 'impact-zoom-quick', volume: 0.42, dur: 36 }, // "But where?" crash zoom
  tap(S('opening') + O.fieldTap, 0.5),
  // every key (the keyboard: soft taps)
  ..."I've got just the thing".split('').flatMap((ch, i) => (ch === "'" ? [] : [tap(S('opening') + O.typeFrom + i * TYPE_RATE, 0.26 + ((i * 7) % 5) * 0.02)])), // (no key for the apostrophe)
  tap(S('opening') + O.sendTap, 0.55),
  { at: S('opening') + O.sent + 6, src: 'swoosh-quick', volume: 0.28, dur: 24 }, // your bubble flies up
  // ---- closing the app, the home screen, Meet
  { at: S('opening') + O.morphIn + 4, src: 'air-woosh-quick', volume: 0.4, dur: 40 },
  { at: S('opening') + O.swipeLeft + 10, src: 'swoosh-quick', volume: 0.26, dur: 24 },
  tap(S('opening') + O.tapMeet + 7, 0.6),
  { at: S('opening') + O.end - 4, src: 'air-zoom-vacuum', volume: 0.5, dur: 40 }, // the dive into the wordmark
  // ---- the headline lands on the music's first loud bar
  { at: S('headline') + 2, src: 'impact-cine-big', volume: 0.42, dur: 110, fadeOut: 30 },
  // ---- crew
  tap(S('crew') + fr(CAP.crew.tapMap, 15), 0.5),
  tap(S('crew') + fr(CAP.crew.tapUse, 37), 0.9),
  { at: S('crew') + fr(CAP.crew.tapUse, 37) + 13, src: 'transition-soft', volume: 0.3, dur: 40 }, // cut to Leo in the list
  // ---- modes
  tap(S('modes') + fr(CAP.modes.tapPill, 12), 0.9),
  tap(S('modes') + fr(CAP.modes.tapBike, 38), 0.9),
  { at: S('modes') + fr(CAP.modes.tapBike, 38) + 1, src: 'switch-tap', volume: 0.18, dur: 20 },
];

/** Race and later shots read their own beats; they register here once the module graph is ready. */
export const lateSfx = (beats: {
  race: { drag: number; press: number; crash: number; dur: number };
  tabs: { pull: number; drinks: number; food: number };
  glide: { peak: number };
  invite: { click: number; fly: [number, number]; land: number; replies: number[] };
  live: { clink: number };
  brand: { flip: number; word: number };
}): Sfx[] => [
  // ---- the race
  { at: S('race') + beats.race.drag + 6, src: 'swoosh-quick', volume: 0.22, dur: 24 },
  tap(S('race') + beats.race.press, 0.6),
  { at: S('race') + beats.race.press + 2, src: 'hit-weak', volume: 0.3, dur: 18 },
  { at: S('race') + beats.race.crash - 4, src: 'riser-cine', volume: 0.3, dur: 44, fadeIn: 12 }, // the build to the crash
  { at: S('race') + beats.race.crash + 6, src: 'impact-deep-whoosh', volume: 0.55, dur: 80, fadeOut: 24 },
  // ---- the tabs
  { at: S('tabs') + beats.tabs.pull + 10, src: 'swoosh-quick', volume: 0.2, dur: 24 },
  tap(S('tabs') + beats.tabs.drinks, 0.5),
  { at: S('tabs') + beats.tabs.drinks + 1, src: 'switch-tap', volume: 0.2, dur: 20 },
  tap(S('tabs') + beats.tabs.food, 0.5),
  { at: S('tabs') + beats.tabs.food + 1, src: 'switch-tap', volume: 0.2, dur: 20 },
  // ---- the glide
  { at: S('glide') + beats.glide.peak, src: 'whoosh-swirl', volume: 0.34, dur: 80, fadeOut: 16 },
  // ---- the invite: the tap, the plane's flight, it lands, the answers
  tap(S('invite') + beats.invite.click, 0.6),
  { at: S('invite') + beats.invite.fly[0] + 6, src: 'wind-woosh-throw', volume: 0.38, dur: 30 },
  { at: S('invite') + beats.invite.fly[1] - 10, src: 'whoosh-fast', volume: 0.3, dur: 50 },
  { at: S('invite') + beats.invite.land, src: 'pop', volume: 0.7, dur: 15 },
  ...beats.invite.replies.map((r, i) => ({ at: S('invite') + r, src: 'pop', volume: 0.78 - i * 0.03, dur: 15 })),
  // ---- real life: the bar, the cheer, the clink
  { at: S('live') - 2, src: 'bar-crowd', volume: 0.55, dur: shot('live').dur + 12, fadeIn: 5, fadeOut: 14 },
  { at: S('live') + 18, src: 'cheer', volume: 0.32, dur: 60, fadeOut: 12 },
  { at: S('live') + beats.live.clink, src: 'clink', volume: 0.8, dur: 52, fadeOut: 12 }, // (on the cut, as the glasses meet)
  // ---- the brand
  { at: S('brand') + beats.brand.flip, src: 'shimmer-sparkle-sweep', volume: 0.3, dur: 80, fadeOut: 20 },
  { at: S('brand') + beats.brand.word, src: 'impact-deep-whoosh', volume: 0.32, dur: 90, fadeOut: 30 },
];

/**
 * Softer than the first cut (the effects were jarring): everything at a little over half its level,
 * the hits, whooshes and the riser (the big transients) at about a third to two fifths, so the music
 * carries the film and the effects sit inside it.
 */
const SOFT: Record<string, number> = {
  'impact-cine-big': 0.32, 'impact-deep-whoosh': 0.36, 'impact-zoom-quick': 0.36, 'hit-weak': 0.4, 'riser-cine': 0.42,
  'air-zoom-vacuum': 0.4, 'whoosh-fast': 0.45, 'whoosh-swirl': 0.45, 'wind-woosh-throw': 0.45, 'air-woosh-quick': 0.5,
  pop: 0.5, clink: 0.62, cheer: 0.7, 'bar-crowd': 0.8,
};
const soften = (src: string) => SOFT[src] ?? 0.55;

/** Cat Walk: in over a second, a little lower under real life (the bar), out over the last 1.7 s. */
const bgmVolume = (f: number) => {
  const live = shot('live');
  const duck = interpolate(f, [live.from - 6, live.from + 4, live.from + live.dur - 4, live.from + live.dur + 8], [1, 0.62, 0.62, 1], clamp);
  return interpolate(f, [0, 30, TOTAL - 50, TOTAL], [0, 0.34, 0.34, 0], clamp) * duck;
};

export const Sound: React.FC<{ bgm: boolean; extra: Sfx[] }> = ({ bgm, extra }) => (
  <>
    {bgm && <Audio src={staticFile('audio/cat-walk.mp3')} volume={bgmVolume} />}
    {[...SFX, ...extra].map((s, i) => {
      const from = s.src === 'bar-crowd' ? s.at : sfxFrom(s.at, s.src);
      const dur = s.dur ?? 90;
      return (
        <Sequence key={i} from={from} durationInFrames={dur} layout="none" name={`sfx ${s.src}`}>
          <Audio src={staticFile(`audio/${s.src}.mp3`)} volume={(f) => s.volume * soften(s.src)
            * (s.fadeIn ? interpolate(f, [0, s.fadeIn], [0, 1], clamp) : 1)
            * (s.fadeOut ? interpolate(f, [dur - s.fadeOut, dur], [1, 0], clamp) : 1)} />
        </Sequence>
      );
    })}
  </>
);
