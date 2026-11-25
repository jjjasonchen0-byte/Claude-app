#!/bin/bash
# A partial re-render after changes confined to the opening (frames 0–442) and the invite/live/brand
# chunk (1260–1679): those frames are rendered again; the untouched part of chunk 1 (443–839) is cut
# from the existing render (re-encoded once, near-lossless); then the soundtracks and the mux as in
# render.sh.
set -e
cd "$(dirname "$0")"
R() { npx remotion render src/index.ts MeetAd "$1" --frames="$2" --concurrency=2 --muted --log=error --timeout=120000; }
echo "chunk 0"; R out/chunks/part0.mp4 0-419
echo "chunk 1a"; R out/chunks/part1a.mp4 420-442
echo "chunk 1b"
ffmpeg -v error -y -i out/chunks/part1.mp4 -vf "trim=start_frame=23,setpts=PTS-STARTPTS" -c:v libx264 -preset slow -crf 10 -pix_fmt yuv420p out/chunks/part1b.mp4
echo "chunk 3"; R out/chunks/part3.mp4 1260-1679
printf "file ./part0.mp4\nfile ./part1a.mp4\nfile ./part1b.mp4\nfile ./part2.mp4\nfile ./part3.mp4\nfile ./part4.mp4\n" > out/chunks/list.txt
ffmpeg -v error -y -f concat -safe 0 -i out/chunks/list.txt -c:v libx264 -preset slow -crf 14 -pix_fmt yuv420p -movflags +faststart out/picture.mp4
echo "frames: $(ffprobe -v error -count_frames -select_streams v -show_entries stream=nb_read_frames -of csv=p=0 out/picture.mp4)"
echo "soundtracks"
npx remotion render src/index.ts MeetAdSound out/sound-bgm.wav --codec=wav --log=error --timeout=120000
npx remotion render src/index.ts MeetAdSound out/sound-nobgm.wav --codec=wav --props=props-nobgm.json --log=error --timeout=120000
I=$(ffmpeg -hide_banner -i out/sound-bgm.wav -af ebur128=peak=true -f null - 2>&1 | awk '/^ +I:/ {v=$2} END {print v}')
GAIN=$(python3 -c "print(round(-14 - ($I), 2))")
echo "loudness $I LUFS, gain $GAIN dB"
for v in bgm nobgm; do
  name=meet-ad; [ $v = nobgm ] && name=meet-ad-nobgm
  ffmpeg -v error -y -i out/picture.mp4 -i out/sound-$v.wav -map 0:v -map 1:a -c:v copy \
    -af "volume=${GAIN}dB,alimiter=limit=0.85:attack=4:release=60:level=false" -c:a aac -b:a 256k -ar 48000 -shortest -movflags +faststart out/$name.mp4
done
ls -la out/meet-ad.mp4 out/meet-ad-nobgm.mp4
