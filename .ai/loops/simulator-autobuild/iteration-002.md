# Iteration 002

## Goal

Milestone 6 slice 1: preview process manager — run each project's generated
Expo app as a live web preview (`expo start --web`) with ports, healthchecks,
and lifecycle routes.

## Starting state

Workspaces on disk (iteration 001) but nothing could run them.

## Files inspected

- packages/api/src/lib/workspace.ts, routes/builder.ts, src/index.ts
- packages/clone-engine/src/expo-codegen.ts (template package.json/app.json)

## Files changed

- packages/api/src/lib/preview.ts (new) — session registry, port allocator
  19100–19199, async start (npm install if needed → expo start --web in
  detached process group → 120s healthcheck), stop (kills process tree),
  60s reaper (re-healthcheck + 30-min idle stop), shutdown hooks
- packages/api/src/routes/builder.ts — POST preview/start (202), POST
  preview/stop, GET preview/status (+ last 50 log lines)
- packages/api/src/index.ts — reaper + shutdown hooks at boot
- packages/clone-engine/src/expo-codegen.ts — template fixes: added
  @expo/metro-runtime, react-dom, react-native-web (SDK 52-compatible pins);
  added metro.config.js with `useWatchman = false`

## Commands run

```bash
npm install (in workspace current/) ; npx expo start --web --port 19100
curl POST …/preview/start ; poll …/preview/status ; curl :19100/
pnpm --filter @kittie/api typecheck ; pnpm --filter @kittie/clone-engine typecheck
```

## Result

- success

## Errors

- Metro hung forever at "Waiting for Watchman watch-project" — workspaces sit
  under the giant home-dir tree so watchman resolves an enormous watch root.
- Subagent found :3007 down (tsx watcher had died) and started the API on
  :3009, breaking the vite proxy (:3007).

## Fixes applied

- Template metro.config.js disables Watchman → Node file watcher, bundle
  compiles reliably.
- Orchestrator killed the :3009 instance and restarted the API on :3007
  (project convention; vite proxy untouched).

## Checks

- [x] install (workspace npm install ~16s, 931 pkgs)
- [ ] lint (no script)
- [x] typecheck (api + clone-engine clean)
- [x] build (Pulse web bundle 200, 4,593,112 bytes via expo-router entry)
- [x] preview (start→installing→ready on :19100 via :3007; stop kills tree,
      port freed; warm restart <5s)

## Screenshot / artifact

- /tmp/kittie-rork-api.log

## Commit

(committed by orchestrator after this file)

## Next action

Iteration 003 — milestone 6 slice 2: Run button + live iframe inside
PhonePreview (poll status, overlay states installing/starting/failed, mockup
stays as instant fallback). Status endpoint shape:
`GET /projects/:id/preview/status → { data: PreviewView | null }`,
PreviewView = { projectId, port, pid, status: installing|starting|ready|failed|stopped,
url, startedAt, lastHealthAt, error?, logTail }. Iframe url directly (no
frame-blocking headers from Expo dev server).
