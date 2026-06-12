# Autonomous Loop — simulator-autobuild

Source of truth: `docs/simulator-first-builder-prd.md` (§18 defines this loop).
Repo recalibration: see `ROADMAP.md` — this repo is NOT greenfield; the builder
workspace, chat, run timeline, blueprint engine, and Expo/Xcode codegen already
exist. The loop's job is closing the gap between the **mockup preview** and a
**real generated Expo app running in the phone frame**.

## The loop

```text
inspect current state
  → choose smallest next milestone from ROADMAP.md
  → implement
  → run checks (pnpm typecheck, dev servers boot, preview loads)
  → fix failures
  → document iteration (iteration-XXX.md from iteration-template.md)
  → update STATUS.md
  → commit safe checkpoint (this branch only)
  → continue
```

## Limits

| Limit | Value |
|---|---|
| Max iterations per run | 10 |
| Max repair attempts per failure | 5 |
| Stop if same error repeats | 3 times |

## Checks per iteration

- `pnpm --filter @kittie/clone-engine typecheck` / `pnpm --filter @kittie/api typecheck` / web `tsc --noEmit` (scope to touched packages)
- API boots (`PORT=3007 pnpm dev:api` already running in dev — reuse, don't respawn)
- Web on :5173 — reload the EXISTING tab, never open new tabs
- Preview loads where the milestone claims it does
- Zero new console errors on touched routes

## Repo invariants (recalibrations of the PRD)

- **Vite + React, not Next.js.** Editor route is `/studio/:id` in `apps/web`.
- **pnpm**, never npm/npx for the platform (generated workspaces may use npx expo internally).
- Generated workspaces live in `generated-workspaces/` at repo root (gitignored), never inside `apps/` or `packages/`.
- The existing blueprint engine (`packages/clone-engine`) is the Prompt→Spec seam — extend it, don't replace it. `AppBlueprint` is our AppSpec.
- The existing run transcript (`AgentRun` in `packages/api/src/routes/builder.ts`) is the run-contract seam — extend it with phases/logs, don't invent a parallel system.
- DB is SQLite/Drizzle — new tables go through `packages/db` with a drizzle migration, not raw SQL files.
