# Eight single fingertip taps (public/audio/tap1–8.mp3), cut from the Epidemic Sound track of a
# touch screen being tapped (public/audio/screen-taps.mp3): each starts 30 ms before its hit, lasts
# 260 ms with a short fade, peaks at -4 dB and loses its rumble below 120 Hz.
import subprocess, numpy as np
D = 'public/audio'
HITS = [0.47, 7.61, 25.16, 26.16, 12.85, 18.41, 19.05, 20.35]  # (seconds into the track: the clean ones)
for n, t in enumerate(HITS):
    wav = f'/tmp/tap-{n}.wav'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', f'{t - 0.03:.2f}', '-t', '0.26', '-i', f'{D}/screen-taps.mp3', '-af', 'afade=t=out:st=0.18:d=0.08', '-ar', '48000', wav], check=True)
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', wav, '-ac', '1', '-f', 's16le', '-'], capture_output=True, check=True).stdout
    x = np.frombuffer(raw, np.int16).astype(np.float32) / 32768
    g = 20 * np.log10(10 ** (-4 / 20) / np.abs(x).max())
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', wav, '-af', f'volume={g:.1f}dB,highpass=f=120', '-ar', '48000', '-b:a', '192k', f'{D}/tap{n + 1}.mp3'], check=True)
print('taps done')
