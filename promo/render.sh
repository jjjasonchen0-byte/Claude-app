#!/bin/bash
# The final renders, in chunks (a failure costs one chunk, not the whole film): the picture once,
# then the two soundtracks (with and without the music), muxed into the two deliverables.
#   ./render.sh            all of it
#   ./render.sh 2          redo only chunk 2 (then the mux)
set -e
cd "$(dirname "$0")"
mkdir -p out/chunks
TOTAL=$(npx remotion compositions src/index.ts 2>/dev/null | awk '$1 == "MeetAd" {print $4; exit}')
SIZE=420
N=$(( (TOTAL + SIZE - 1) / SIZE ))
for ((i = 0; i < N; i++)); do
  if [ -n "$1" ] && [ "$1" != "$i" ]; then continue; fi
  a=$((i * SIZE)); b=$((a + SIZE - 1)); [ $b -ge $TOTAL ] && b=$((TOTAL - 1))
  echo "chunk $i: frames $a-$b"
  npx remotion render src/index.ts MeetAd out/chunks/part$i.mp4 --frames=$a-$b --concurrency=2 --muted --log=error --timeout=120000
done
ls out/chunks/part*.mp4 | sort -V | sed 's/^/file /; s#out/chunks/#./#' > out/chunks/list.txt
ffmpeg -v error -y -f concat -safe 0 -i out/chunks/list.txt -c copy out/picture.mp4
echo "soundtracks"
npx remotion render src/index.ts MeetAdSound out/sound-bgm.wav --codec=wav --log=error --timeout=120000
npx remotion render src/index.ts MeetAdSound out/sound-nobgm.wav --codec=wav --props=props-nobgm.json --log=error --timeout=120000
# Mastered for social feeds: the music version raised to about -14 LUFS (a limiter holding peaks under
# -1 dBTP); the version without music gets the same gain, so the effects sit at the same level in both.
I=$(ffmpeg -hide_banner -i out/sound-bgm.wav -af ebur128=peak=true -f null - 2>&1 | awk '/^ +I:/ {v=$2} END {print v}')
GAIN=$(python3 -c "print(round(-14 - ($I), 2))")
echo "loudness $I LUFS, gain $GAIN dB"
for v in bgm nobgm; do
  name=meet-ad; [ $v = nobgm ] && name=meet-ad-nobgm
  ffmpeg -v error -y -i out/picture.mp4 -i out/sound-$v.wav -map 0:v -map 1:a -c:v copy \
    -af "volume=${GAIN}dB,alimiter=limit=0.85:attack=4:release=60:level=false" -c:a aac -b:a 256k -ar 48000 -shortest -movflags +faststart out/$name.mp4
done
ls -la out/meet-ad.mp4 out/meet-ad-nobgm.mp4
