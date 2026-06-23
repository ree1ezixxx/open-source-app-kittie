#!/usr/bin/env bash
# Autoresearch harness — cold /apps latency (cache-bust via nonce).
set -euo pipefail
API="${API:-http://localhost:3008}"
NOW=$(date +%s)
NONCE=$RANDOM

bench() {
  local name=$1
  local path=$2
  curl -s -o /dev/null -w "${name}:%{time_total}\n" "${API}${path}&_n=${NONCE}"
}

bench explore_default "/api/v1/apps?limit=50&sortBy=revenue&sortOrder=desc"
bench highlights_7d "/api/v1/apps?limit=50&sortBy=reviews&sortOrder=desc&releasedAfter=$((NOW - 604800))"
bench rising "/api/v1/apps?limit=100&sortBy=revenue&growthType=positive&sortOrder=desc&growthPeriod=30d&releasedAfter=$((NOW - 15552000))"
bench rank_delta "/api/v1/apps?limit=50&sortBy=rankDelta&sortOrder=desc"
