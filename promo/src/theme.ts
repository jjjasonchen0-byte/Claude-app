// Meet's own tokens (public/css/styles.css) and the advert's motion tokens (SPEC.md §1).
import { Easing, getInputProps } from 'remotion';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/inter/800.css';

export const FONT = 'Inter, system-ui, sans-serif';

/** The dark version (rendered with --props='{"dark":true}'): the phone in dark mode, with its own footage. */
export const DARK = !!(getInputProps() as { dark?: boolean }).dark;
/** Where that version's captured footage is (public/…). */
export const CAPDIR = DARK ? 'captures-dark' : 'captures';

export const C = {
  black: '#000000',
  white: '#ffffff',
  accent: '#007aff', // the app (light)
  accentOnBlack: '#0a84ff', // type on the black stage
  text2: 'rgba(235,235,245,0.68)',
  ink: '#000000',
  inkSoft: 'rgba(60,60,67,0.6)',
  fill: 'rgba(118,118,128,0.12)',
  sep: 'rgba(60,60,67,0.16)',
  green: '#34c759',
  orange: '#ff9500',
  purple: '#af52de',
  pink: '#ff2d55',
  bubbleIn: '#e9e9ee',
};

/** The people (the same as in the app's sample group). */
export const PEOPLE = {
  you: { name: 'You', initial: 'Y', color: '#007aff' },
  sam: { name: 'Jake', initial: 'J', color: '#ff9500' },
  priya: { name: 'Emily', initial: 'E', color: '#34c759' },
  leo: { name: 'Ryan', initial: 'R', color: '#af52de' },
};

/** Motion tokens. */
export const EASE = {
  camera: Easing.bezier(0.16, 1, 0.3, 1), // fast in, long settle
  cameraInOut: Easing.bezier(0.65, 0, 0.35, 1),
  spring: Easing.bezier(0.3, 1.22, 0.45, 1), // the app's own highlight slide
  out: Easing.out(Easing.cubic),
  in: Easing.in(Easing.cubic),
  crash: Easing.bezier(0.55, 0, 0.7, 1),
};

export const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

/** The stage glows, from the app's wallpaper. */
export const GLOWS =
  'radial-gradient(45% 30% at 20% 22%, rgba(0,122,255,.30), transparent 70%),' +
  'radial-gradient(40% 28% at 85% 30%, rgba(175,82,222,.22), transparent 70%),' +
  'radial-gradient(50% 30% at 70% 85%, rgba(48,176,199,.20), transparent 70%),' +
  'radial-gradient(40% 25% at 15% 88%, rgba(255,149,0,.14), transparent 70%)';

/** The app's wallpaper (start screen), for the home screen behind the icons. */
export const WALLPAPER =
  'radial-gradient(55% 45% at 12% 18%, rgba(0,122,255,0.55), transparent 70%),' +
  'radial-gradient(50% 42% at 88% 22%, rgba(175,82,222,0.5), transparent 70%),' +
  'radial-gradient(60% 50% at 75% 88%, rgba(48,176,199,0.5), transparent 70%),' +
  'radial-gradient(45% 40% at 18% 86%, rgba(255,149,0,0.4), transparent 70%), #1c1c2e';

export const W = 1080;
export const H = 1920;
export const FPS = 30;

/** The phone: a 390×844pt screen shown at 760px wide (world px at camera zoom 1). */
export const SCREEN_W = 760;
export const K = SCREEN_W / 390; // app px → world px
export const SCREEN_H = Math.round(844 * K);
export const BEZEL = 15;
export const PHONE_W = SCREEN_W + BEZEL * 2;
export const PHONE_H = SCREEN_H + BEZEL * 2;
/** Where the phone sits in the world at rest (its top-left), centred on the frame. */
export const PHONE_X = (W - PHONE_W) / 2;
export const PHONE_Y = (H - PHONE_H) / 2;
/** A point on the screen (app px) → world px. */
export const onScreen = (x: number, y: number) => ({ x: PHONE_X + BEZEL + x * K, y: PHONE_Y + BEZEL + y * K });
