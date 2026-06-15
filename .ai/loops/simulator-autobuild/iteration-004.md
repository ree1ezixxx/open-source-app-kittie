# Iteration 004

## Goal

Milestone 7: real observability — SSE run events replacing the fake phase
ticker, Logs tab streaming preview output, plus iteration-3 API fixes.

## Files changed

- packages/api/src/lib/run-events.ts (new) — in-memory event bus with per-run
  replay buffer (TTL run-end + 5 min), PRD §12.5 event shape
- packages/api/src/routes/builder.ts — runId generated up-front; pipeline
  stages emit phase_started/completed + file_changed; run_success/run_failed;
  GET /runs/:runId/events SSE (hono/streaming streamSSE, replay + live,
  15s heartbeat, closes on terminal event)
- packages/api/src/lib/preview.ts — logTail → {ts, level, source, line};
  stderr/error classification; bundling-progress hints; idempotent
  revalidating start (healthcheck stale 'ready' sessions, restart if dead)
- packages/api/src/index.ts — run-event sweeper at boot
- apps/web BuilderPage.tsx — PENDING_STATUSES fake ticker removed; useRunEvents
  SSE hook; RunCard reveals real phases; Files | Logs tab strip with LogsPanel
  (2s poll, source labels, level colors, auto-scroll)
- apps/web PhonePreview.tsx + builder.css — LogEntry-typed boot overlay logs,
  log panel styles

## Result

- success

## Checks

- [x] typecheck (api + web clean, pre-existing AppEnginePage errors only)
- [x] preview (SSE verified direct :3007 AND via :5173 proxy — full replayed
      sequence after POST returned; studio run card shows real phases with
      real timing; Logs tab streams real Metro output; boot overlay cycles
      stopped→starting→ready; idempotent start reuses healthy session)
- [x] console clean (only the Expo app's own pointerEvents deprecation)

## Screenshot / artifact

- .probe/33-real-run-events.png, .probe/34-logs-tab.png, .probe/35-boot-overlay.png

## Commit

(committed by orchestrator)

## Next action

Iteration 005 — milestone 8 (repair loop). Hook point identified: the
'Validating' phase in builder.ts is a no-op placeholder — run a real build
check (expo export / tsc against the workspace) there, emit error_detected,
classify (packages/clone-engine repair.ts, pure + unit-tested), patch
smallest file, ≤5 attempts, repair_attempt events. PREREQUISITE per agent
finding: make POST /messages return runId immediately and move processing
fully async first, otherwise a real build blocks the request for its whole
duration. Also: emit preview_ready from preview start.
