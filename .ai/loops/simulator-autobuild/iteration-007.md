# Iteration 007

## Goal

Milestone 10: visual QA loop — screenshot the live preview after each run,
score deterministically, patch (regenerate) if poor, store artifacts per run.

## Mechanism

One-shot headless Chrome --screenshot (--headless=new, 390x844,
--virtual-time-budget=9000) — no daemon, no deps. Pure-Node PNG decode
(zlib IDAT + filter reversal). Rubric: blank detection (modal-color
fraction), content coverage top/bottom thirds, Metro red-box detection.
Score 0-100; <60 triggers regenerate-screens patch pass + re-shoot.

## Files changed

- packages/api/src/lib/visual-qa.ts (new) + visual-qa.test.ts (5 fixtures
  tests) + test/fixtures/*.png
- packages/api/src/routes/builder.ts — 'Visual QA' phase after Validating
  (gated: file changes + ready preview); durable AgentRun step
- packages/db queries — updateBuilderMessageRun
- apps/web BuilderPage.tsx — QA log lines (◎) in live run card

## Verified

- 44/44 api tests; tsc clean
- e2e: accent revise → SSE 'Visual QA: 100/100' → artifacts on disk
  (before.png 33KB real screenshot, visual_score.json, notes)
- Studio run card shows the durable QA step; .probe/41-visual-qa-run.png

## Result

- success

## Known limits (recorded honestly)

- Deterministic patch = regenerate-from-blueprint only; real visual repair
  (clipping, contrast) needs a vision model — header truncation visible in
  before.png is invisible to the rubric
- QA gated on ready preview → create-path never QA'd
- tsx watch restart kills preview sessions (in-memory map + SIGTERM hook) —
  hardening target

## Next action

Iteration 008 — milestone 11 + hardening: project Clone, Expo Go QR
endpoint/UI, preview session persistence across API restarts (reattach on
boot), GitHub export placeholder.
