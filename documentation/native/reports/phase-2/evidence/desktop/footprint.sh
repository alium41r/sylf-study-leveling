#!/bin/zsh
# Physical footprint of an isolated Chrome app window running the spike (comparable to an Electron renderer+GPU+browser set).
P=$PWD/chrome-profile-fp
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --user-data-dir=$P --no-first-run --window-size=1366,900 "--app=http://localhost:8765/#screen=$1" >/dev/null 2>&1 &
sleep 6
PIDS=($(pgrep -f "user-data-dir=$P"))
echo "screen=$1 processes=${#PIDS[@]}"
footprint ${PIDS[@]/#/-p } 2>/dev/null | grep -E "^\s*(Google Chrome|Total|.*Footprint)" | tail -8
kill ${PIDS[@]} 2>/dev/null; sleep 1; rm -rf $P
