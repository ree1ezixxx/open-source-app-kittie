# Iteration 003

## Goal

Milestone 6 slice 2: the phone frame runs the REAL generated app — Run button,
boot overlays, live iframe, mockup fallback.

## Starting state

Preview process manager working (iteration 002) but no UI hookup; the frame
only rendered the blueprint mockup.

## Files inspected

- apps/web/src/pages/BuilderPage.tsx, components/PhonePreview.tsx,
  styles/phone.css, styles/builder.css

## Files changed

- apps/web/src/components/PhonePreview.tsx — `live` prop: keeps frame chrome,
  swaps screen body for LiveOverlay (installing/starting spinner + logTail,
  failed card with Retry + collapsible logs, stopped state) or a sandboxed
  iframe when ready (keyed on reloadKey for Reload)
- apps/web/src/pages/BuilderPage.tsx — useLivePreview hook (start/stop/reload,
  1.8s polling with terminal-state stop, refetch on mount, cleanup on
  unmount/project switch), Mockup|Live segmented toggle, Run button, live
  toolbar (Reload / Stop / Open / url)
- apps/web/src/styles/phone.css — .ip-live-* overlay/spinner/failure styles
- apps/web/src/styles/builder.css — preview-mode pills, run button, toolbar

## Commands run

```bash
cd apps/web && pnpm exec tsc --noEmit   # clean (pre-existing AppEnginePage errors only)
```

## Result

- success

## Errors

- None new. Benign console warning from the Expo app itself
  (props.pointerEvents deprecation) — not studio code.

## Fixes applied

- n/a

## Checks

- [x] install
- [ ] lint (no script)
- [x] typecheck
- [x] build (Pulse bundle serves in iframe)
- [x] preview — VERIFIED BY ORCHESTRATOR HAND: Live mode boots
      installing→ready; real Pulse app renders in frame (Journal screen);
      clicked an entry inside the iframe → real expo-router push to
      /detail?tab=tab0&i=0 with working back link; Reload + Stop work.

## Screenshot / artifact

- .probe/31-live-preview.png (boot), .probe/32-live-preview-final.png (live app in frame)

## Commit

(committed by orchestrator after this file)

## Next action

Iteration 004 — milestone 7: build/run log capture + SSE run events
(GET /runs/:runId/events), Logs tab in inspector, live phase timeline
replacing the synthetic PendingRun ticker. Also fold in iteration-3 API
friction: idempotent-but-revalidating preview start (recover stale-ready
sessions), tagged logTail lines (level/source), bundling sub-status.
