# Simulator Autobuild Status

## Branch

feat/simulator-first-builder

## Current phase

Not started (setup complete)

## Last completed iteration

0

## Current objective

Install PRD + autonomous loop system. ✅ Done — next objective is milestone 4/5
(inspector Diff/Logs tabs + generated workspace on disk), per ROADMAP.md.

## What works

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

- Generated workspaces on disk (files are in-memory/zip only)
- REAL Expo preview in the phone frame (frame is a mockup today)
- Build log capture + live SSE run events
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
