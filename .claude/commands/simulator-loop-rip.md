# /simulator-loop-rip

You are Claude running the simulator-first autonomous build loop.

Read:

- docs/simulator-first-builder-prd.md
- .ai/loops/simulator-autobuild/LOOP.md
- .ai/loops/simulator-autobuild/ROADMAP.md
- .ai/loops/simulator-autobuild/STATUS.md
- .ai/loops/simulator-autobuild/STOP_CONDITIONS.md

Then execute the loop.

## Mission

Build the simulator-first AI mobile app builder.

Do not work on marketing site polish.

Core outcome:

```text
prompt
  → generated Expo / React Native app
  → browser phone simulator
  → files/code/logs inspector
  → build/error repair loop
  → chat iteration
  → preview reload
```

## Repo context (recalibration — read before acting)

This is NOT greenfield. The repo is a pnpm monorepo: `apps/web` (React + Vite,
studio at `/studio/:id`), `packages/api` (Hono :3007), `packages/clone-engine`
(blueprint → Expo + native Xcode codegen), `packages/db` (Drizzle/SQLite).
Builder workspace, chat, run timeline, mockup phone frame, code inspector, and
zip export already exist. ROADMAP.md marks what's done — start from the first
unfinished milestone (currently 4/5). The big prize is milestones 5–9: real
generated workspaces on disk and a REAL Expo web preview inside the phone frame.

## Model routing

Orchestrate in this session (read state, pick slice, review, update STATUS.md,
commit). Execute implementation slices via Agent tool subagents with
`model: "opus"`. Subagents return summaries + changed-file lists only. Haiku
only for text-heavy research.

## Rules

- Work on branch `feat/simulator-first-builder`. Create it if needed.
- Do not push to main.
- Do not edit `.env`. Do not touch secrets.
- Do not delete large directories.
- Do not deploy production.
- Do not ask for permission unless a hard stop condition is hit.
- Prefer visible simulator progress over invisible abstractions.
- Keep each iteration small.
- Run available checks (pnpm typecheck per touched package; servers boot; preview loads).
- Fix failures.
- Log every iteration (`.ai/loops/simulator-autobuild/iteration-XXX.md`).
- Update STATUS.md after every iteration.
- Stop after 10 iterations or when the simulator works end-to-end.
- pnpm only at platform level. Generated workspaces (`generated-workspaces/`) may use npx expo internally.
- Reuse the existing Chrome tab on :5173 (reload, never open new tabs). Rork reference tab: attach via chrome-devtools MCP `list_pages` → `select_page`.

## Iteration flow

1. Inspect current state.
2. Pick smallest next milestone slice from ROADMAP.md.
3. Create `iteration-XXX.md` from iteration-template.md.
4. Implement (Opus subagent for the code slice).
5. Run checks.
6. Fix failures (≤5 repair attempts; stop on same error ×3).
7. Update STATUS.md.
8. Commit safe checkpoint if checks pass.
9. Continue.

## Definition of done

The loop is successful when:

- builder workspace exists ✅ (pre-existing)
- phone simulator frame exists ✅ (pre-existing)
- chat panel exists ✅ (pre-existing)
- run timeline exists ✅ (pre-existing)
- files/code/logs inspector exists (logs/diff tabs pending)
- generated preview exists — REAL Expo web app in the frame, not the mockup
- at least one prompt/follow-up modifies visible state in the live preview
- STATUS.md explains remaining work

On any hard stop, write `.ai/loops/simulator-autobuild/FINAL_STATUS.md`.
