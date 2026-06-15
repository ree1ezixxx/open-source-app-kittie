# Session Handoff — Rork benchmark and local builder gap assessment

## Where it started
The user asked to benchmark Rork against the local Kittie/Rork-engine builder, using a deliberately hard app-generation prompt and waiting until Rork fully completed before drawing conclusions. The local app reference is `http://localhost:5173/studio/1c1548c4-7517-4a61-9eff-cce047311e28`; the Rork benchmark project is `https://rork.com/p/x85xs57a0u31t9emvrsue`.

## Decisions locked + what shipped
- No product code changes shipped in this session — the work was browser benchmarking, local validation, and handoff capture only.
- Rork benchmark prompt used — "Build a production-grade native iOS app called NeuroForge Studio..." with onboarding, paywall, dashboard, ideas, voice memo, roadmap, experiments, analytics, investor CRM, feedback inbox, team pulse, habits, settings, profile, app icon, dark glassmorphism, and build validation.
- Rork first pass was not acceptable — it completed with a placeholder app and preview stuck on "Rork is building your app..."; the user sent a follow-up asking it to fix the loading issue.
- Rork second pass produced a materially complete SwiftUI app — it generated models/sample data, design system, onboarding, paywall, main tabs, feature screens, `icon.png`, `ContentView.swift`, `Models.swift`, and more; it fixed several Swift compile issues and reported clean compilation.
- Local validation remained red before this benchmark — `pnpm --filter @kittie/api test` had 16 failures, and `pnpm typecheck` failed in `apps/web/src/pages/AppEnginePage.tsx` due to missing `@kittie/db` resolution and stale `CloneableAppResponse` property assumptions.

## Key files for next session
- `/tmp/kittie-rork-engine-handoff.md` — prior implementation handoff; read first for engine progress and known simulator-preview gap.
- `/Users/ellis/Documents/open-source-app-kittie-rork-engine/docs/session-handoffs/2026-06-12-rork-benchmark-handoff.md` — this handoff.
- `/Users/ellis/Documents/open-source-app-kittie-rork-engine/apps/web/src/pages/AppEnginePage.tsx` — current local typecheck failure surface.
- Plan file: none
- Memory files touched: none

## Running state
- Background processes: none started by this handoff step.
- Dev servers / ports / simulators: browser has Rork project open at `https://rork.com/p/x85xs57a0u31t9emvrsue`; local app reference is expected at `http://localhost:5173/studio/1c1548c4-7517-4a61-9eff-cce047311e28` if the dev server is still running.
- Open worktrees / branches: `/Users/ellis/Documents/open-source-app-kittie-rork-engine` on branch `codex/rork-engine`; `git status --short --branch` showed `## codex/rork-engine` and untracked `.probe/`.
- Stash state: earlier cleanup created `stash@{0}` with message `pre-goal cleanup rork-engine 2026-06-12-133957`; do not apply unless explicitly requested.

## Verification — how to confirm things still work
- `pnpm --filter @kittie/api test` — currently expected to fail until stale dist tests/export/API route issues are fixed.
- `pnpm typecheck` — currently expected to fail in `apps/web/src/pages/AppEnginePage.tsx` until response types/imports are reconciled.
- Open `https://rork.com/p/x85xs57a0u31t9emvrsue` — expected Rork preview state: NeuroForge Studio iPhone simulator renders a dark SwiftUI app with Command, Ideas, Roadmap, Metrics, and Profile tabs.
- Open `http://localhost:5173/studio/1c1548c4-7517-4a61-9eff-cce047311e28` — expected local baseline: studio chat with Preview/Code/Export tabs, SwiftUI/Xcode and Expo code/export controls, but no live iOS simulator preview.

## Deferred + open questions
- Deferred: full final PRD — user asked to pause and capture a handoff before running another Rork account/request.
- Deferred: local builder re-check after the latest Rork test pass — previous baseline exists, but a fresh side-by-side pass should happen after the new Rork run.
- Deferred: Rork code export/file inspection — visually confirmed generated file chips, but did not fully inspect generated Swift source.
- Open: whether the next Rork prompt should be benchmarked against the same local project URL or a new local studio session.
- Open: whether to fix local validation failures before or after writing the broader PRD.

## Pick up here
Continue monitoring the next Rork account/project until the full generated app is visible, then rigorously test interaction quality and compare against the local studio baseline. After that, write the detailed PRD around closing the gap: reliable generation completion, native preview/build loop, code visibility/export quality, interaction depth, stateful generated apps, and validation telemetry.
