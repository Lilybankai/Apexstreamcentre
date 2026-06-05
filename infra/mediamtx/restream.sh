#!/bin/sh
# Fan-out script invoked by MediaMTX runOnReady.
#
# Reads destination RTMP URLs (one per line) from
# /scripts/destinations/<path>.txt and starts one ffmpeg per destination that
# copies the codecs (no re-encode) from the local MediaMTX RTMP path to each
# platform. In production the multistream control plane writes these files (or
# programs this directly via the MediaMTX API).
#
# Usage: restream.sh <path>
set -eu

MTX_PATH="${1:?path required}"
SRC="rtmp://localhost:1935/${MTX_PATH}"
DEST_FILE="/scripts/destinations/${MTX_PATH}.txt"

if [ ! -f "$DEST_FILE" ]; then
  echo "[restream] no destinations file for path '${MTX_PATH}' (${DEST_FILE}); nothing to fan out"
  # Stay alive so MediaMTX doesn't thrash runOnReadyRestart.
  exec sleep infinity
fi

echo "[restream] fanning out '${MTX_PATH}' to destinations in ${DEST_FILE}"
while IFS= read -r dest; do
  [ -z "$dest" ] && continue
  case "$dest" in \#*) continue ;; esac
  echo "[restream]  -> ${dest}"
  ffmpeg -hide_banner -loglevel warning -i "$SRC" -c copy -f flv "$dest" &
done < "$DEST_FILE"

wait
