#!/usr/bin/env bash
# Start Miner Control without Docker (Linux, macOS).
# Needs Node.js 18 or newer. Open http://localhost:18090 afterwards.
# Settings are environment variables - all optional, change them here or set them before the call.
cd "$(dirname "$0")/.." || exit 1   # project root (folder that contains app/)

command -v node >/dev/null 2>&1 || { echo "Node.js 18 or newer is required: https://nodejs.org"; exit 1; }

export PORT="${PORT:-18090}"
export DATA_DIR="${DATA_DIR:-$PWD/data}"        # settings, history, events
# Start language for a new installation (de / en); can be switched in the page header later
if [ -z "${MC_LANG:-}" ]; then
  case "${LANG:-}" in de*) MC_LANG=de ;; *) MC_LANG=en ;; esac
fi
export MC_LANG
# Only if you run ckpool on this machine: folder that contains ckpool.conf and logs/
# export CKPOOL_DIR="$HOME/ckpool"

echo "Miner Control: http://localhost:$PORT   (data in $DATA_DIR)"
exec node app/server.js
