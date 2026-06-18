#!/usr/bin/env bash
# Launch an ISOLATED "truth" Chrome for ONE parallel clone lane.
#
# Why: the Chrome DevTools MCP drives ONE browser instance. Multiple agents on
# the SAME Chrome collide over tabs/navigation. Each parallel lane therefore gets
# its OWN Chrome on its OWN debug port + its OWN profile dir.
#
# All lanes may open the SAME truth URL (appkittie.com) at once — reading a public
# page never conflicts. The collision is the browser INSTANCE, not the URL.
#
# Slot scheme (evergreen — independent of branch/section/worktree name):
#   slot 0 → port 9222, profile ~/.kittie-truth-chrome   (the primary/shared truth profile)
#   slot N → port 9222+N, profile ~/.kittie-chrome-laneN (seeded from slot 0 → inherits login)
#
# Usage:  bash coordinator/lane-chrome.sh <slot> [url]
#   e.g.  bash coordinator/lane-chrome.sh 1            # second lane → :9223
set -uo pipefail

SLOT="${1:-0}"
URL="${2:-https://www.appkittie.com/dashboard/explore}"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
TRUTH_PROFILE="$HOME/.kittie-truth-chrome"

if ! [[ "$SLOT" =~ ^[0-9]+$ ]]; then
  echo "✗ slot must be a non-negative integer (0=primary, 1,2,3 = extra lanes)"; exit 1
fi

PORT=$((9222 + SLOT))
if [ "$SLOT" -eq 0 ]; then
  PROFILE="$TRUTH_PROFILE"
else
  PROFILE="$HOME/.kittie-chrome-lane$SLOT"
fi

# Already up? no-op (idempotent — safe to call blindly).
if curl -fsS "http://127.0.0.1:$PORT/json/version" >/dev/null 2>&1; then
  echo "✓ Lane $SLOT Chrome already on :$PORT — attach via Chrome DevTools MCP (list_pages → select_page)."
  exit 0
fi

# Seed a fresh extra-lane profile from the logged-in truth profile so it inherits
# the appkittie.com session (avoids 4 manual logins). Only when the source is idle
# (its Chrome NOT running) — copying a live profile can corrupt the cookie store.
if [ "$SLOT" -ne 0 ] && [ ! -d "$PROFILE" ] && [ -d "$TRUTH_PROFILE" ]; then
  if curl -fsS "http://127.0.0.1:9222/json/version" >/dev/null 2>&1; then
    echo "… truth Chrome (:9222) is running; launching lane $SLOT with a FRESH profile."
    echo "  (close :9222 first and re-run to inherit its login, or just log in once in this window.)"
  else
    echo "… seeding lane $SLOT profile from truth profile (inherits appkittie login)…"
    cp -R "$TRUTH_PROFILE" "$PROFILE"
  fi
fi

nohup "$CHROME" --remote-debugging-port="$PORT" --user-data-dir="$PROFILE" "$URL" \
  >"/tmp/kittie-chrome-lane$SLOT.log" 2>&1 &
sleep 2
if curl -fsS "http://127.0.0.1:$PORT/json/version" >/dev/null 2>&1; then
  echo "✓ Lane $SLOT Chrome up on :$PORT (profile: $PROFILE)"
  echo "  Point this lane's .mcp.json chrome-devtools at --browserUrl=http://127.0.0.1:$PORT"
else
  echo "… starting; give it a couple seconds, then attach via Chrome DevTools MCP."
fi
