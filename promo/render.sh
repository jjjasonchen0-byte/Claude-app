#!/bin/bash
# The final renders, in chunks (a failure costs one chunk, not the whole film): the picture once,
# then the two soundtracks (with and without the music), muxed into the two deliverables.
#   ./render.sh               the light version, all of it      → out/meet-ad.mp4, out/meet-ad-nobgm.mp4
#   ./render.sh dark          the dark version (captures-dark/) → out/meet-ad-dark.mp4, out/meet-ad-dark-nobgm.mp4
#   ./render.sh [dark] 0 3    redo only chunks 0 and 3 (then the soundtracks and the mux)
# The project is bundled once at the start, so editing the source while it renders changes nothing.
set -e
cd "$(dirname "$0")"
SUF=; PROPS='{}'; PROPS_NOBGM='{"bgm":false}'
if [ "$1" = dark ]; then SUF=-dark; PROPS='{"dark":true}'; PROPS_NOBGM='{"dark":true,"bgm":false}'; shift; fi
CHUNKS=out/chunks$SUF
BUNDLE=out/bundle$SUF
mkdir -p "$CHUNKS"
rm -rf "$BUNDLE"
npx remotion bundle src/index.ts --out-dir="$BUNDLE" --log=error
TOTAL=$(npx remotion compositions "$BUNDLE" --props="$PROPS" 2>/dev/null | awk '$1 == "MeetAd" {print $4; exit}')
SIZE=420
N=$(( (TOTAL + SIZE - 1) / SIZE ))
for ((i = 0; i < N; i++)); do
  if [ $# -gt 0 ] && [[ " $* " != *" $i "* ]]; then continue; fi
  a=$((i * SIZE)); b=$((a + SIZE - 1)); [ $b -ge $TOTAL ] && b=$((TOTAL - 1))
  echo "chunk $i: frames $a-$b"
  npx remotion render "$BUNDLE" MeetAd "$CHUNKS/part$i.mp4" --frames=$a-$b --props="$PROPS" --concurrency=2 --muted --log=error --timeout=120000
done
ls "$CHUNKS"/part*.mp4 | sort -V | sed "s/^/file /; s#$CHUNKS/#./#" > "$CHUNKS/list.txt"
ffmpeg -v error -y -f concat -safe 0 -i "$CHUNKS/list.txt" -c copy "out/picture$SUF.mp4"
echo "frames: $(ffprobe -v error -count_frames -select_streams v -show_entries stream=nb_read_frames -of csv=p=0 "out/picture$SUF.mp4") of $TOTAL"
echo "soundtracks"
npx remotion render "$BUNDLE" MeetAdSound "out/sound$SUF-bgm.wav" --codec=wav --props="$PROPS" --log=error --timeout=120000
npx remotion render "$BUNDLE" MeetAdSound "out/sound$SUF-nobgm.wav" --codec=wav --props="$PROPS_NOBGM" --log=error --timeout=120000
# Mastered for social feeds: the music version raised to about -14 LUFS (a limiter holding peaks under
# -1 dBTP); the version without music gets the same gain, so the effects sit at the same level in both.
I=$(ffmpeg -hide_banner -i "out/sound$SUF-bgm.wav" -af ebur128=peak=true -f null - 2>&1 | awk '/^ +I:/ {v=$2} END {print v}')
GAIN=$(python3 -c "print(round(-14 - ($I), 2))")
echo "loudness $I LUFS, gain $GAIN dB"
for v in bgm nobgm; do
  name=meet-ad$SUF; [ $v = nobgm ] && name=meet-ad$SUF-nobgm
  ffmpeg -v error -y -i "out/picture$SUF.mp4" -i "out/sound$SUF-$v.wav" -map 0:v -map 1:a -c:v copy \
    -af "volume=${GAIN}dB,alimiter=limit=0.85:attack=4:release=60:level=false" -c:a aac -b:a 256k -ar 48000 -shortest -movflags +faststart "out/$name.mp4"
done
ls -la "out/meet-ad$SUF.mp4" "out/meet-ad$SUF-nobgm.mp4"
