#!/usr/bin/env bash
# Supervised snapshot worker (ADR 0008). Restarts the worker on crash/OOM. The
# due-set in the DB is the checkpoint, so a restart resumes with zero bookkeeping;
# an OOM kills THIS process, never the API. A clean exit (e.g. WORKER_ONCE=1)
# stops the loop. Production should use a real supervisor (systemd/pm2); this is
# the local-dev equivalent.
set -u
cd "$(dirname "$0")/.."

until pnpm --filter @kittie/ingest worker; do
  code=$?
  echo "[run-worker] worker exited ($code) — restarting in 3s" >&2
  sleep 3
done
