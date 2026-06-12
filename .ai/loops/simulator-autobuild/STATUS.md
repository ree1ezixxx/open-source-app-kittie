# Simulator Autobuild Status

## Branch

feat/simulator-first-builder

## Current phase

Milestone 10 — visual QA loop (milestone 9 ✅ COMPLETE: chat revise
auto-updates the LIVE preview — the PRD core loop works end-to-end)

## Last completed iteration

6

## Current objective

Visual QA loop: screenshot the live preview, score against the PRD §9.3
rubric, apply UI-only patches, re-screenshot, store artifacts per run.

## What works

- CORE LOOP CLOSED: chat revise → workspace resync → Metro watch re-bundles
  → preview_ready event → iframe auto-reloads with the changed app
  (iteration 006)
- SELF-REPAIR: async runs validate with real tsc; classifier + deterministic
  patches (reescape/add-import/regenerate), ≤5 attempts, honest failures,
  all streamed to the run card (iteration 005)
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
