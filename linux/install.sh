#!/usr/bin/env bash
# Install Miner Control as a systemd service (Debian, Ubuntu, Raspberry Pi OS, Fedora, ...).
#   sudo ./linux/install.sh                 service runs as its own system user "minerdash"
#   sudo MC_USER=you ./linux/install.sh   service runs as an existing user (e.g. to read a ckpool
#                                                  folder in that user's home)
# Run it again after unpacking a new version to update. Settings and data are kept.
set -euo pipefail

SRC="$(cd "$(dirname "$0")/.." && pwd)"   # project root
DEST="${DEST:-/opt/minerdash}"
ENV_FILE="${ENV_FILE:-/etc/minerdash.env}"
UNIT_DIR="${UNIT_DIR:-/etc/systemd/system}"
SVC_USER="${MC_USER:-minerdash}"
SKIP_SYSTEM="${SKIP_SYSTEM:-0}"       # 1 = only copy files (used for testing)

[ "$(id -u)" -eq 0 ] || { echo "Please run with sudo: sudo $0"; exit 1; }
command -v node >/dev/null 2>&1 || { echo "Node.js 18 or newer is required (https://nodejs.org or your package manager)."; exit 1; }
node -e 'process.exit(+process.versions.node.split(".")[0] >= 18 ? 0 : 1)' || { echo "Node.js $(node -v) is too old, 18 or newer is required."; exit 1; }
NODE_BIN="$(command -v node)"

if [ "$SKIP_SYSTEM" != "1" ]; then
  if ! id "$SVC_USER" >/dev/null 2>&1; then
    [ "$SVC_USER" = "minerdash" ] || { echo "User '$SVC_USER' does not exist."; exit 1; }
    useradd --system --no-create-home --shell /usr/sbin/nologin minerdash
  fi
fi

mkdir -p "$DEST" "$UNIT_DIR"
rm -rf "$DEST/app"
cp -r "$SRC/app" "$DEST/app"
cp "$SRC/package.json" "$DEST/package.json"

# settings file: created once, never overwritten
if [ ! -f "$ENV_FILE" ]; then
  case "${LANG:-}" in de*) L=de ;; *) L=en ;; esac
  TZV="$(timedatectl show -p Timezone --value 2>/dev/null || true)"
  cat > "$ENV_FILE" <<ENV
# Miner Control settings. After changing: sudo systemctl restart minerdash
PORT=18090
MC_LANG=$L
TZ=${TZV:-UTC}
# Only if you run ckpool on this machine: the folder with ckpool.conf and logs/
#CKPOOL_DIR=/home/you/ckpool
ENV
  echo "Created $ENV_FILE"
fi

sed -e "s|@NODE@|$NODE_BIN|" -e "s|@USER@|$SVC_USER|" "$SRC/linux/minerdash.service" > "$UNIT_DIR/minerdash.service"

if [ "$SKIP_SYSTEM" != "1" ]; then
  systemctl daemon-reload
  systemctl enable minerdash >/dev/null 2>&1
  systemctl restart minerdash
  sleep 1
  systemctl --no-pager --lines=3 status minerdash || true
  PORT_SHOWN="$(grep -E '^PORT=' "$ENV_FILE" | cut -d= -f2)"
  echo
  echo "Miner Control is running: http://$(hostname -I 2>/dev/null | awk '{print $1}'):${PORT_SHOWN:-18090}"
  echo "Settings: $ENV_FILE    Data: /var/lib/minerdash    Logs: journalctl -u minerdash -f"
fi
