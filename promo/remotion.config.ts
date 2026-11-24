import { Config } from '@remotion/cli/config';
// The headless browser already on this machine (Remotion would otherwise download its own).
Config.setBrowserExecutable('/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell');
Config.setVideoImageFormat('jpeg');
Config.setJpegQuality(92);
Config.setChromiumOpenGlRenderer('swangle');
