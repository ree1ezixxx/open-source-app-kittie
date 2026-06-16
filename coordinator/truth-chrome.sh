#!/usr/bin/env bash
# Launch the dedicated "truth" Chrome for appkittie.com parity audits.
# Persistent profile → login survives across sessions (log in ONCE).
# Remote debug port  → Chrome DevTools MCP attaches (list_pages → select_page).
# Usage:  bash coordinator/truth-chrome.sh [url]
set -uo pipefail
PORT=9222
PROFILE="$HOME/.kittie-truth-chrome"
URL="${1:-https://www.appkittie.com/dashboard/explore}"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
if curl -fsS "http://127.0.0.1:$PORT/json/version" >/dev/null 2>&1; then
  echo "✓ Truth Chrome already on :$PORT — attach via Chrome DevTools MCP (list_pages → select_page)."
  exit 0
fi
nohup "$CHROME" --remote-debugging-port="$PORT" --user-data-dir="$PROFILE" "$URL" >/tmp/kittie-truth-chrome.log 2>&1 &
sleep 2
if curl -fsS "http://127.0.0.1:$PORT/json/version" >/dev/null 2>&1; then
  echo "✓ Truth Chrome up on :$PORT (profile: $PROFILE)"
else
  echo "… starting; give it a couple seconds, then attach via Chrome DevTools MCP."
fi
