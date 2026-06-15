#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "Daily ingest: snapshot → score"
pnpm ingest:snapshot
pnpm ingest:score
echo "Done. Restart API if running — db-app-service caches scored rows in memory."
