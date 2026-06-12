# Iteration 001

## Goal

Milestone 5 (generated workspace abstraction): materialize each project's
generated Expo files to `generated-workspaces/<projectId>/current/` with
per-run before/after snapshots, wired into builder create/revise.

## Starting state

Generated files existed only in-memory (regenerated per request) + zip export.
No disk workspaces, no per-run snapshots, no Diff data source.

## Files inspected

- packages/api/src/routes/builder.ts
- packages/clone-engine/src/index.ts (fromBlueprintExpo)

## Files changed

- packages/api/src/lib/workspace.ts (new) — workspaceRoot (walks to pnpm-workspace.yaml, WORKSPACES_DIR override), syncWorkspace (path sanitization, before/after run snapshots, stale-file deletion that protects node_modules/.expo/dist), readWorkspaceTree, pruneRuns(keep=5)
- packages/api/src/lib/workspace.test.ts (new) — 8 vitest cases, all pass
- packages/api/src/routes/builder.ts — sync on create (awaited, try/catch so workspace failure never 500s), sync on revise with assistant message id as runId + pruneRuns, new GET /projects/:id/workspace

## Commands run

```bash
pnpm --filter @kittie/api typecheck       # clean
pnpm --filter @kittie/api test            # 8 passed
curl POST /projects … ; ls generated-workspaces/<id>/current/
curl POST /projects/:id/messages {"content":"make the accent color teal"}
```

## Result

- success

## Errors

- MAJOR ENVIRONMENT INCIDENT (not caused by this iteration, surfaced by it):
  the main worktree's `data/` had been replaced by a self-referential symlink
  at 19:27, unlinking the real 560MB kittie.db. Last copy survived only in the
  kittie-ui API server's open fd.

## Fixes applied

- Rescued the DB via lldb attach to PID 64898: in-process pread/write copy of
  fd 29 (db) + fd 31 (wal) to /tmp, all threads paused → consistent snapshot.
- Verified: integrity_check ok; 101,348 apps / 119,523 reviews / 4 builder projects.
- Restored `open-source-app-kittie/data/` with checkpointed kittie.db + dated
  backup `kittie.backup-2026-06-12.db`. All worktree symlinks resolve again.
- Killed stale servers (orphaned-inode ui server :3008; throwaway-DB verify
  server :3007) and relaunched both against the restored DB (user-authorized).

## Checks

- [x] install
- [ ] lint (no script)
- [x] typecheck
- [ ] build (deferred)
- [x] preview (:3007 API 200 on real DB; workspace sync verified live: Pulse
      current/ tree + runs/<msgId>/ snapshot + theme.ts accent #008080)

## Screenshot / artifact

- logs at /tmp/kittie-rork-api.log, /tmp/kittie-ui-api.log
- recovery artifacts kept: /tmp/kittie-recovered.db(.‑wal), /tmp/rescue_kittie.py

## Commit

(committed by orchestrator after this file)

## Next action

Iteration 002 — milestone 6 slice 1: preview process manager
(packages/api/src/lib/preview.ts — spawn `expo start --web` per project from
the workspace, port registry, healthcheck, start/stop/status routes).
