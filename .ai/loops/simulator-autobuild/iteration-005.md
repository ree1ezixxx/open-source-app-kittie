# Iteration 005

## Goal

Milestone 8: async run pipeline + real build check + deterministic repair loop.

## Files changed

- packages/api/src/routes/builder.ts — POST /messages → 202 {runId} in ~8ms,
  processMessageRun continues async; Validating runs the real repair loop;
  honest failure messages; "Self-repaired N build issues" notes
- packages/api/src/lib/build-check.ts (new) — tsc --noEmit in the workspace
  (workspace bin, repo fallback), parsed diagnostics, 120s timeout, ~1s warm
- packages/clone-engine/src/repair.ts (new, pure) — classify (8 PRD §8.2
  categories), proposeRepair (reescape_string / add_import /
  regenerate_file fallback), errorSignature
- packages/api/src/lib/repair-runner.ts (new) — validate→repair ≤5 attempts,
  same-signature×3 bail, emits error_detected/repair_attempt/file_changed
- packages/db queries — updateBuilderMessageContent
- apps/web BuilderPage.tsx — PendingLiveRun renders live SSE phases incl.
  ✗ errors and ⟳ repair attempts; refetch on run end; failed-run style
- Tests: repair.test.ts (14) + repair-runner.test.ts (2, real tsc e2e)

## Result

- success (16 api + 21 clone-engine tests pass; typechecks clean)

## Verified

- POST timing 0.0076s; happy path streams phases + real tsc pass
- Repair e2e: corrupted lib/data.ts → error_detected TS1005 →
  repair_attempt 1/5 → reescape_string patch → green; exhaustion path honest
- .probe/36-repair-run.png

## Known caveats (carried to iteration 6)

- Live ollama treats almost any message as a change → full workspace rewrite
  wipes injected corruption; e2e repair demo proven via unit/e2e tests + real
  event payload replay. Consider a guarded debug corruption hook.
- Metro runs with CI=1 (watch disabled) — running preview does NOT pick up
  workspace changes; chat iteration must reload/refresh the preview
  explicitly (iteration 6).

## Next action

Iteration 006 — milestone 9: close the core PRD loop — after run_success the
live preview must show the new app state (solve Metro CI/no-watch staleness:
either drop CI=1 in favour of non-interactive watch, or restart/refresh the
preview session on run_success), auto-reload the iframe, e2e demo:
"make the accent crimson" → live frame updates.
