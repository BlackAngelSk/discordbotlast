#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DATA_DIR="$BOT_DIR/data"
BACKUP_DIR="$BOT_DIR/backups"
START_SCRIPT="$BOT_DIR/start.sh"
MAIN_PROCESS_PATTERN="node .*index\.js"

CHECK_INTERVAL_SECONDS=${CHECK_INTERVAL_SECONDS:-30}
BACKUP_INTERVAL_SECONDS=${BACKUP_INTERVAL_SECONDS:-3600}

mkdir -p "$BACKUP_DIR"

last_backup_ts=0

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

is_bot_running() {
  pgrep -f "$MAIN_PROCESS_PATTERN" >/dev/null 2>&1
}

start_bot() {
  if [ -x "$START_SCRIPT" ]; then
    log "Starting bot using start.sh"
    (cd "$BOT_DIR" && nohup "$START_SCRIPT" >/dev/null 2>&1 &)
  else
    log "Starting bot using node index.js"
    (cd "$BOT_DIR" && nohup node index.js >/dev/null 2>&1 &)
  fi
}

run_backup() {
  local ts
  ts="$(date '+%Y%m%d_%H%M%S')"
  local backup_path="$BACKUP_DIR/data_backup_$ts.tar.gz"

  if [ ! -d "$DATA_DIR" ]; then
    log "Data directory not found: $DATA_DIR"
    return
  fi

  log "Creating backup: $backup_path"
  tar -czf "$backup_path" -C "$DATA_DIR" .
}

log "Bot watcher started (check interval: ${CHECK_INTERVAL_SECONDS}s, backup interval: ${BACKUP_INTERVAL_SECONDS}s)"

while true; do
  if ! is_bot_running; then
    log "Bot process not found. Restarting..."
    start_bot
  fi

  now_ts=$(date +%s)
  if [ $((now_ts - last_backup_ts)) -ge "$BACKUP_INTERVAL_SECONDS" ]; then
    run_backup
    last_backup_ts=$now_ts
  fi

  sleep "$CHECK_INTERVAL_SECONDS"
done
