#!/usr/bin/env bash
# Makes scripts/media/mandelbrot.webm, the sample deck's video: four seconds zooming into the
# Mandelbrot set's "seahorse valley", drawn by ffmpeg's own mandelbrot source (end_pts counts
# frames). VP9 in WebM, no sound, about 75 KB; the output is the same on every run.
# The clip is committed, so `npm run fixtures` needs only Python; rerun this only to change it.
set -euo pipefail
cd "$(dirname "$0")"
ffmpeg -hide_banner -loglevel error -y \
  -f lavfi -i "mandelbrot=size=320x240:rate=12:start_scale=2.5:end_scale=0.02:end_pts=48:maxiter=1024" \
  -t 4 -c:v libvpx-vp9 -crf 54 -b:v 0 -pix_fmt yuv420p -threads 1 -row-mt 0 \
  -fflags +bitexact -flags:v +bitexact -map_metadata -1 \
  media/mandelbrot.webm
