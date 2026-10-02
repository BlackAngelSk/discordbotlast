#!/usr/bin/env bash
set -euo pipefail

# start.sh — start/stop the Discord bot
#   ./start.sh          # foreground (Ctrl-C to stop)
#   ./start.sh --bg     # background via nohup (logs -> bot.log, pid -> bot.pid)
#   ./start.sh --stop   # stop the background process from --bg
#   ./start.sh --pm2    # background via pm2 (name: discord-bot)
#   ./start.sh --logs   # tail the background log

BOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$BOT_DIR"

if [ ! -f .env ]; then
  echo ".env not found — copy .env.example to .env and set DISCORD_TOKEN first." >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "node not found. Install Node.js (pacman -S nodejs)." >&2
  exit 1
fi

# Resolve a node binary that actually runs. A broken system node (e.g. a
# partial-upgrade libsimdjson ABI mismatch) can make `command -v node` succeed
# while launching it fails. Fall back to a known-good node on the machine.
NODE_BIN="$(command -v node)"
if ! "$NODE_BIN" -v >/dev/null 2>&1; then
  echo "Warning: $NODE_BIN won't run (broken ABI?). Trying alternates..." >&2
  for candidate in \
    "$HOME/.hermes/tools"/*/bin/node \
    "$HOME/.local/share/fnm"/*/installation/bin/node \
    "$HOME/.nvm/versions/node"/*/bin/node \
    /usr/local/bin/node; do
    if [ -x "$candidate" ] && "$candidate" -v >/dev/null 2>&1; then
      NODE_BIN="$candidate"
      echo "Using $NODE_BIN ($("$NODE_BIN" -v))." >&2
      break
    fi
  done
fi
if ! "$NODE_BIN" -v >/dev/null 2>&1; then
  echo "No working node found. Fix /usr/bin/node: sudo pacman -S nodejs" >&2
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Installing npm dependencies..."
  npm install
fi

case "${1:-}" in
  --bg)
    if [ -f bot.pid ] && kill -0 "$(cat bot.pid)" 2>/dev/null; then
      echo "Bot already running (PID $(cat bot.pid))."
      exit 0
    fi
    nohup "$NODE_BIN" --no-deprecation index.js > bot.log 2>&1 &
    echo $! > bot.pid
    echo "Bot started in background — PID $(cat bot.pid), logs -> bot.log"
    ;;
  --stop)
    if [ -f bot.pid ] && kill -0 "$(cat bot.pid)" 2>/dev/null; then
      kill "$(cat bot.pid)"
      rm -f bot.pid
      echo "Bot stopped."
    else
      echo "No running bot (bot.pid missing or process dead)."
    fi
    ;;
  --pm2)
    if ! command -v pm2 >/dev/null 2>&1; then
      echo "pm2 not found. Install with: sudo npm install -g pm2" >&2
      exit 1
    fi
    pm2 start ecosystem.config.js
    echo "Bot started via pm2 — pm2 logs discord-bot to follow, pm2 stop discord-bot to stop."
    ;;
  --logs)
    exec tail -f bot.log 2>/dev/null || { echo "no bot.log yet — start with --bg first." >&2; exit 1; }
    ;;
  *)
    echo "Starting bot in foreground (Ctrl-C to stop)..."
    exec "$NODE_BIN" --no-deprecation index.js
    ;;
esac
