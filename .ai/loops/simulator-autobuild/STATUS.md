# Simulator Autobuild Status

## Branch

feat/simulator-first-builder

## Current phase

Milestone 8 — repair loop (milestone 7 ✅ COMPLETE: real SSE run events +
live Logs tab)

## Last completed iteration

4

## Current objective

Async run pipeline (POST returns runId immediately), real build check in the
Validating phase, error classifier + smallest-patch repair loop (≤5 attempts,
repair_attempt events).

## What works

- REAL RUN EVENTS: SSE /runs/:runId/events with replay buffer; studio run
  cards animate the actual pipeline phases; Logs tab streams live preview
  output with levels/sources (iteration 004)
- LIVE PREVIEW: Mockup|Live toggle in the studio — Run boots the generated
  Expo app (npm install → expo start --web :191xx → healthcheck) and the
  REAL app renders interactively inside the phone frame, with boot/failure
  overlays, Reload/Stop/Open toolbar (iterations 002–003)
- Generated workspaces on disk: `generated-workspaces/<projectId>/current/` +
  per-run `runs/<msgId>/{before,after}` snapshots, synced on create/revise,
  `GET /projects/:id/workspace` (iteration 001)
- PRD installed (`docs/simulator-first-builder-prd.md`)
- Loop structure installed (`.ai/loops/simulator-autobuild/`)
- Reusable command installed (`.claude/commands/simulator-loop-rip.md`)
- Pre-existing (from prior sessions, commit 4ac1c04):
  - Builder workspace at `/studio/:id` — chat, run timeline, composer
  - Phone frame (React mockup of blueprint, iOS chrome)
  - Files/Code inspector with Swift ↔ Expo toggle
  - Blueprint engine (Ollama → Gemini → heuristic), chat revision
  - Expo codegen + native Xcode/SwiftUI codegen (xcodebuild-validated)
  - Zip export both targets

## What does not work yet

- Build/error repair loop
- Visual QA loop
- Project clone

## Passing checks

- [x] install (pnpm workspace installed)
- [ ] lint (no lint script defined in repo)
- [x] typecheck (clone-engine ✅, api ✅, web ✅ — see logs/initial-checks.md)
- [ ] build (not run at setup; web build unverified)
- [x] preview (:5173 studio loads — mockup preview, not generated-app preview)

## Current blockers

None

## Next action

Invoke `/simulator-loop-rip`.
