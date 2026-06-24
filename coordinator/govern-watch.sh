#!/usr/bin/env bash
# Background governor watcher — TOKENLESS. Runs the objective gate (govern.sh)
# every INTERVAL seconds. Exits (which re-invokes the agent to relay to the human)
# ONLY on a NEW flag/breach. Clean commits pass silently; a persistent unfixed
# issue is reported once (deduped by content), never spammed.
#
# Usage: bash coordinator/govern-watch.sh [interval_seconds]   (default 60)
set -uo pipefail
WS="/Users/ellis/Documents/open-source-app-kittie-workspace"
cd "$WS"
INTERVAL="${1:-60}"
LAST="coordinator/.govern/last-event"

while true; do
  out="$(bash coordinator/govern.sh 2>&1)"; code=$?
  if [ "$code" -ge 1 ]; then
    sig="$(printf '%s' "$out" | grep -E 'BREACH|FLAG' | md5 2>/dev/null || printf '%s' "$out" | grep -E 'BREACH|FLAG' | md5sum)"
    if [ "$sig" != "$(cat "$LAST" 2>/dev/null)" ]; then
      printf '%s' "$sig" >"$LAST"
      echo "=== GOVERNOR EVENT (exit $code) @ $(date '+%Y-%m-%d %H:%M:%S') ==="
      echo "$out"
      echo "=== full report: coordinator/.govern/report.md ==="
      exit "$code"
    fi
  fi
  sleep "$INTERVAL"
done
