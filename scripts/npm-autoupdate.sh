#!/usr/bin/env bash
# Auto-update and audit fix for discordbotlast
# Portable: Linux (systemd/cron), macOS (launchd), any system with cron
# Usage:
#   ./npm-autoupdate.sh          — run the update now
#   ./npm-autoupdate.sh install  — install the scheduler for this OS
#   ./npm-autoupdate.sh uninstall — remove the scheduler
#   ./npm-autoupdate.sh status   — check scheduler status

set -uo pipefail

# --- Detect bot directory (where package.json lives) ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

find_bot_dir() {
  # 1. Env override
  if [[ -n "${BOT_DIR:-}" ]] && [[ -f "$BOT_DIR/package.json" ]]; then
    echo "$BOT_DIR"
    return
  fi
  # 2. Walk up from script dir looking for package.json
  local dir="$SCRIPT_DIR"
  while [[ "$dir" != "/" ]]; do
    if [[ -f "$dir/package.json" ]] && grep -q '"discord-bot"' "$dir/package.json" 2>/dev/null; then
      echo "$dir"
      return
    fi
    dir="$(dirname "$dir")"
  done
  # 3. Fallback: assume script is in <repo>/scripts/
  local fallback="$(dirname "$SCRIPT_DIR")"
  if [[ -f "$fallback/package.json" ]]; then
    echo "$fallback"
    return
  fi
  echo ""
}

BOT_DIR="$(find_bot_dir)"
if [[ -z "$BOT_DIR" ]]; then
  echo "ERROR: Cannot find bot directory. Set BOT_DIR env var or run from the repo." >&2
  exit 1
fi

LOG_DIR="$BOT_DIR/logs"
LOG_FILE="$LOG_DIR/npm-autoupdate.log"
MAX_LOG_SIZE=1048576  # 1MB
SCHEDULE_HOUR="${AUTOSCHEDULE_HOUR:-04}"
SCHEDULE_MIN="${AUTOSCHEDULE_MIN:-30}"

mkdir -p "$LOG_DIR"

# --- OS detection ---
OS="$(uname -s)"
is_linux() { [[ "$OS" == "Linux" ]]; }
is_macos() { [[ "$OS" == "Darwin" ]]; }

# --- Cross-platform file size ---
file_size() {
  if is_macos; then
    stat -f%z "$1" 2>/dev/null || echo 0
  else
    stat -c%s "$1" 2>/dev/null || echo 0
  fi
}

# --- Log rotation ---
if [[ -f "$LOG_FILE" ]] && (( $(file_size "$LOG_FILE") > MAX_LOG_SIZE )); then
  mv "$LOG_FILE" "$LOG_FILE.1"
fi

# --- Helper: get vulnerability count from npm audit (exits 0 on pipefail-safe) ---
get_vuln_count() {
  ( set +o pipefail; npm audit 2>/dev/null | grep -oE "[0-9]+ vulnerabilities" | head -1 ) || echo "0 vulnerabilities"
}

# --- Scheduler names ---
SERVICE_NAME="npm-autoupdate"
PLIST_LABEL="com.discordbotlast.npm-autoupdate"
SCRIPT_PATH="$(readlink -f "${BASH_SOURCE[0]}")"

# ============================================================
# install: set up the scheduler for this OS
# ============================================================
do_install() {
  if is_linux; then
    local unit_dir="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
    mkdir -p "$unit_dir"

    cat > "$unit_dir/${SERVICE_NAME}.service" <<EOF
[Unit]
Description=Auto-update npm packages for discordbotlast
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=${SCRIPT_PATH}
WorkingDirectory=${BOT_DIR}
User=$(whoami)
EOF

    cat > "$unit_dir/${SERVICE_NAME}.timer" <<EOF
[Unit]
Description=Run npm autoupdate daily for discordbotlast

[Timer]
OnCalendar=*-*-* ${SCHEDULE_HOUR}:${SCHEDULE_MIN}:00
Persistent=true

[Install]
WantedBy=timers.target
EOF

    systemctl --user daemon-reload 2>/dev/null || true
    systemctl --user enable --now "${SERVICE_NAME}.timer" 2>/dev/null || true
    echo "Installed systemd user timer (daily ${SCHEDULE_HOUR}:${SCHEDULE_MIN})."
    echo "Logs: $LOG_FILE"

  elif is_macos; then
    local plist_dir="$HOME/Library/LaunchAgents"
    mkdir -p "$plist_dir"
    local plist_file="$plist_dir/${PLIST_LABEL}.plist"

    cat > "$plist_file" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${PLIST_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${SCRIPT_PATH}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${BOT_DIR}</string>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>${SCHEDULE_HOUR}</integer>
    <key>Minute</key>
    <integer>${SCHEDULE_MIN}</integer>
  </dict>
  <key>StandardOutPath</key>
  <string>${LOG_FILE}</string>
  <key>StandardErrorPath</key>
  <string>${LOG_FILE}</string>
</dict>
</plist>
EOF

    launchctl bootout "gui/$(id -u)" "$plist_file" 2>/dev/null || true
    launchctl bootstrap "gui/$(id -u)" "$plist_file" 2>/dev/null || true
    echo "Installed launchd agent (daily ${SCHEDULE_HOUR}:${SCHEDULE_MIN})."
    echo "Logs: $LOG_FILE"

  else
    # Fallback: crontab
    local cron_line="${SCHEDULE_MIN} ${SCHEDULE_HOUR} * * * ${SCRIPT_PATH}"
    (crontab -l 2>/dev/null | grep -v "$SCRIPT_PATH"; echo "$cron_line") | crontab -
    echo "Installed crontab entry (daily ${SCHEDULE_HOUR}:${SCHEDULE_MIN})."
    echo "Logs: $LOG_FILE"
  fi
}

# ============================================================
# uninstall: remove the scheduler
# ============================================================
do_uninstall() {
  if is_linux; then
    systemctl --user disable --now "${SERVICE_NAME}.timer" 2>/dev/null || true
    rm -f "${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user/${SERVICE_NAME}.service"
    rm -f "${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user/${SERVICE_NAME}.timer"
    systemctl --user daemon-reload 2>/dev/null || true
    echo "Removed systemd timer."

  elif is_macos; then
    local plist_file="$HOME/Library/LaunchAgents/${PLIST_LABEL}.plist"
    launchctl bootout "gui/$(id -u)" "$plist_file" 2>/dev/null || true
    rm -f "$plist_file"
    echo "Removed launchd agent."

  else
    crontab -l 2>/dev/null | grep -v "$SCRIPT_PATH" | crontab -
    echo "Removed crontab entry."
  fi
}

# ============================================================
# status: show scheduler info
# ============================================================
do_status() {
  echo "OS: $OS"
  echo "Bot: $BOT_DIR"
  echo "Script: $SCRIPT_PATH"
  echo "Log: $LOG_FILE"
  echo ""

  if is_linux; then
    systemctl --user status "${SERVICE_NAME}.timer" 2>/dev/null || echo "Timer not installed."
  elif is_macos; then
    local plist_file="$HOME/Library/LaunchAgents/${PLIST_LABEL}.plist"
    if [[ -f "$plist_file" ]]; then
      echo "launchd agent installed: $plist_file"
      launchctl print "gui/$(id -u)/${PLIST_LABEL}" 2>/dev/null || echo "(agent loaded but status unavailable)"
    else
      echo "launchd agent not installed."
    fi
  else
    crontab -l 2>/dev/null | grep "$SCRIPT_PATH" || echo "No crontab entry found."
  fi

  echo ""
  if [[ -f "$LOG_FILE" ]]; then
    echo "Last 5 lines of log:"
    tail -5 "$LOG_FILE"
  else
    echo "No log file yet."
  fi
}

# ============================================================
# run: execute the update
# ============================================================
do_update() {
  {
    echo "=== npm autoupdate $(date '+%Y-%m-%d %H:%M:%S') ==="

    cd "$BOT_DIR"

    BEFORE_VULNS=$(get_vuln_count)
    BEFORE_OUTDATED=$( (set +o pipefail; npm outdated 2>/dev/null | grep -c "^[a-z]") || echo "0" )
    echo "Before: $BEFORE_VULNS | $BEFORE_OUTDATED outdated"

    echo "--- npm update ---"
    npm update 2>/dev/null | tail -3 || true

    echo "--- npm audit fix ---"
    npm audit fix 2>/dev/null | tail -3 || true

    AFTER_VULNS=$(get_vuln_count)
    AFTER_OUTDATED=$( (set +o pipefail; npm outdated 2>/dev/null | grep -c "^[a-z]") || echo "0" )
    echo "After:  $AFTER_VULNS | $AFTER_OUTDATED outdated"

    if [[ "$BEFORE_VULNS" == "$AFTER_VULNS" && "$BEFORE_OUTDATED" == "$AFTER_OUTDATED" ]]; then
      echo "No changes."
    else
      echo "Changes applied."
    fi
    echo ""
  } >> "$LOG_FILE" 2>&1
}

# ============================================================
# main
# ============================================================
case "${1:-run}" in
  install)   do_install ;;
  uninstall) do_uninstall ;;
  status)    do_status ;;
  run|"")    do_update ;;
  *)
    echo "Usage: $0 [run|install|uninstall|status]"
    echo "  run       — execute update now (default)"
    echo "  install   — set up daily scheduler for this OS"
    echo "  uninstall — remove the scheduler"
    echo "  status    — show scheduler info"
    exit 1
    ;;
esac
