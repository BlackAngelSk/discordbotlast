#!/usr/bin/env bash
set -euo pipefail

# start.sh - simple helper to start the Discord bot
# Usage:
#   ./start.sh            # start in foreground
#   ./start.sh --bg       # start in background (nohup)
#   ./start.sh --pm2      # start with pm2 (pm2 must be installed)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [ ! -f .env ]; then
  if [ -f .env.example ]; then
    echo ".env not found — copying .env.example to .env (please edit it with your token)"
    cp .env.example .env || true
  else
    echo ".env not found. Create .env with DISCORD_TOKEN and other vars." >&2
    exit 1
  fi
fi

if ! command -v node >/dev/null 2>&1; then
  echo "node not found. Please install Node.js (use pacman on Arch/Cachyos)." >&2
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Installing npm dependencies..."
  npm install
fi

case "${1:-}" in
  --bg)
    echo "Starting bot in background (nohup), output -> bot.log"
    nohup node --no-deprecation index.js > bot.log 2>&1 &
    echo $! > bot.pid
    echo "PID $(cat bot.pid) written to bot.pid"
    ;;
  --pm2)
    if ! command -v pm2 >/dev/null 2>&1; then
      echo "pm2 not found. Install it with: sudo npm install -g pm2" >&2
      exit 1
    fi
    echo "Starting bot with pm2 (name: discord-bot)"
    pm2 start index.js --name discord-bot -- --no-deprecation
    ;;
  *)
    echo "Starting bot in foreground (Ctrl-C to stop)"
    exec node --no-deprecation index.js
    ;;
esac
