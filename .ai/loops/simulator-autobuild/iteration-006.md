# Iteration 006

## Goal

Milestone 9: close the PRD core loop — follow-up prompt changes the app AND
the live preview updates automatically.

## Mechanism

Metro watch mode won: dropped CI=1 from the preview spawn env, closed stdin
instead (stdio ignore) for non-interactivity. Node file-watcher (watchman
already disabled in template metro.config.js) stays project-scoped and
re-bundles on next fetch — same PID, no restart, instant and Rork-like.

## Files changed

- packages/api/src/lib/preview.ts — CI dropped, stdin closed; healthcheck
  still guards wedged boots
- packages/api/src/routes/builder.ts — emit preview_ready after run_success
  when files changed and a session is live
- apps/web BuilderPage.tsx — useRunEvents handles preview_ready;
  useLivePreview.refreshAfterRevise (poll ready → bump reloadKey);
  fires only in live mode
- apps/web PhonePreview.tsx + phone.css — "Updating preview…" overlay

## Verified (e2e, by subagent + orchestrator screenshot review)

- Live baseline violet → "make the accent crimson" → phases streamed →
  iframe auto-updated, #DC143C visible, no manual click (~8s submit→persist)
- Second revise propagated too; bundle URL served new code from same PID
- Mockup parity intact; tsc clean; zero new console errors
- .probe/37–40 screenshots

## Result

- success — THE CORE PRD LOOP WORKS: prompt → app in frame → follow-up →
  frame reloads changed app

## Next action

Iteration 007 — milestone 10: visual QA loop (screenshot preview → rubric
score → UI-only patches → re-screenshot, artifacts under the run dir).
Note: iframe is cross-origin — QA must drive :191xx directly.
