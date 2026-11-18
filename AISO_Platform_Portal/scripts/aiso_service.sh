#!/bin/bash
# Run the AISO platform server in the background (macOS launchd), so it does not need a VS Code / terminal window.
# Any terminal (Terminal.app, iTerm, the Claude app terminal) can then control it:
#   aiso_service.sh install     first time: asks the test password (hidden), stores it in ~/.config/aiso/launcher.env (chmod 600, outside Git), starts the server
#   aiso_service.sh restart     restart (after code changes)
#   aiso_service.sh stop | start | status | logs | password | uninstall
# The password is NEVER written into the repository, the plist or the logs.
set -euo pipefail

LABEL="com.aiso.platform"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PLIST="${AISO_PLIST:-$HOME/Library/LaunchAgents/$LABEL.plist}"
ENVF="$HOME/.config/aiso/launcher.env"
LOG="$REPO/AISO_Platform_Portal/logs/launchd.log"
PORT=8765
DOMAIN="gui/$(id -u)"

die() { echo "ERROR: $*" >&2; exit 1; }

write_plist() {
  local py; py="$(command -v python3)" || die "python3 not found"
  mkdir -p "$(dirname "$PLIST")" "$(dirname "$LOG")"
  cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array>
    <string>/bin/bash</string><string>-c</string>
    <string>set -a; . "\$HOME/.config/aiso/launcher.env"; set +a; exec "$py" AISO_Platform_Portal/launcher.py --no-browser</string>
  </array>
  <key>WorkingDirectory</key><string>$REPO</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin</string></dict>
</dict></plist>
PL
  chmod 644 "$PLIST"
}

ask_password() {
  [ -n "${AISO_DRY_RUN:-}" ] && return 0
  local p; read -r -s -p "Test password (hidden; stored only in $ENVF): " p; echo
  [ -n "$p" ] || die "empty password"
  mkdir -p "$(dirname "$ENVF")"; umask 077
  printf 'AISO_TERMINAL_PASSWORD=%q\n' "$p" > "$ENVF"; chmod 600 "$ENVF"
}

port_busy() { lsof -nP -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1; }
loaded() { launchctl print "$DOMAIN/$LABEL" >/dev/null 2>&1; }

case "${1:-}" in
  install)
    [ -f "$ENVF" ] || ask_password
    write_plist
    [ -n "${AISO_DRY_RUN:-}" ] && { echo "dry run: plist written to $PLIST"; exit 0; }
    if port_busy && ! loaded; then die "port $PORT is in use (the server started from VS Code is still running). Stop it first (Ctrl+C in that terminal), then run install again."; fi
    loaded && launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
    launchctl bootstrap "$DOMAIN" "$PLIST"
    echo "Installed. Server: http://localhost:$PORT/   log: $LOG" ;;
  restart) loaded || die "not installed (run: $0 install)"; launchctl kickstart -k "$DOMAIN/$LABEL"; echo "Restarted." ;;
  start)   loaded || launchctl bootstrap "$DOMAIN" "$PLIST"; echo "Started." ;;
  stop)    launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null && echo "Stopped." || echo "Not running." ;;
  status)
    if loaded; then echo "launchd: loaded"; else echo "launchd: not loaded"; fi
    echo "HTTP: $(curl -m 4 -s -o /dev/null -w '%{http_code}' http://localhost:$PORT/ 2>/dev/null || true)  terminal: $(curl -m 4 -s http://localhost:$PORT/api/terminal/status 2>/dev/null | tr -d ' \n' | cut -c1-60)" ;;
  logs)    tail -n 60 -f "$LOG" ;;
  password) ask_password; loaded && launchctl kickstart -k "$DOMAIN/$LABEL"; echo "Password updated." ;;
  uninstall) launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true; rm -f "$PLIST"; echo "Removed (the password file $ENVF is kept; delete it yourself if you want)." ;;
  *) echo "usage: $0 install|restart|start|stop|status|logs|password|uninstall"; exit 1 ;;
esac
