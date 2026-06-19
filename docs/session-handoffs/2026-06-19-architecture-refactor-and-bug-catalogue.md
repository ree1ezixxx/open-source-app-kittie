# Session Handoff — Architecture refactor + bug catalogue B1–B7

## Where it started
User ran `/improve-codebase-architecture` on the monorepo, chose candidates **#1** (split `db-app-service`) and **#6** (consolidate `SnapshotContext` assembly). Same session then picked up `/Users/ellis/Documents/Codex/handoffs/kittie-bug-catalogue-2026-06-19.md` Section B and fixed open API/web bugs. Thermonuclear skill was referenced; work was direct implementation, not a separate review pass.

## Decisions locked + what shipped

**Architecture (#1 + #6)**
- `SnapshotContext` type + assembly live in `/Users/ellis/Documents/open-source-app-kittie/packages/db/src/queries/snapshot-assembly.ts` — `pickPrior`, `assembleSnapshotContext`, `buildSnapshotContextsForApps`, `reviewCountPriorForApps`.
- `getSnapshotContext` now pins `chartCountry` (default `US`, ADR 0007). `listSnapshotContexts` US-pins + OOM warning in docstring.
- API read path split:
  - `/Users/ellis/Documents/open-source-app-kittie/packages/api/src/services/app-query.ts` — SQL/FTS candidate pool, rank deltas, sparklines, categories.
  - `/Users/ellis/Documents/open-source-app-kittie/packages/api/src/services/app-list-scoring.ts` — list DTO + live Growth score.
  - `/Users/ellis/Documents/open-source-app-kittie/packages/api/src/services/db-app-service.ts` — orchestration + detail + chart estimates (~285 lines, was ~918).

**Bug catalogue (Section B)**
- **B1** — `hasLiveGrowthFilter()` in `filter-sort.ts`; `searchAppsFromDb` reports `totalCount` from post-`matchesSearch` pool when growth filters active.
- **B2** — `sqlSortColumn` handles `revenue`, `downloads`, `growth`/`trending` via snapshot columns.
- **B3** — revenue/downloads sort null-sinks (removed `?? 0` in `sortValue`).
- **B4** — Reviews growth chart period → local `chartDays`; feed window → separate `PeriodChips` on `?period` (`reviewTabs.tsx`). Chart body still empty-state on this branch (A3/A4 on `fix/audit-breaks`).
- **B5** — `parseAppSlug` no redundant `decodeURIComponent`.
- **B6** — **not changed** (intentional `Math.max(0, …)` on “New” series — user did not override).
- **B7** — `tryParseAppSearchParams` + `GET /apps` returns **400** on invalid enums (e.g. `growthPeriod=14`).

**Not committed (junk)**
- `.audit-tmp/`, `parity-freshness-audit.html` — leave untracked.

## Key files for next session
- `/Users/ellis/Documents/Codex/handoffs/kittie-bug-catalogue-2026-06-19.md` — original catalogue; Section A fixed elsewhere, B6 still open judgment.
- `/Users/ellis/Documents/open-source-app-kittie/packages/db/src/queries/snapshot-assembly.ts` — canonical Snapshot assembly seam.
- `/Users/ellis/Documents/open-source-app-kittie/packages/api/src/services/app-query.ts` — search SQL module (POOL_CAP, filters).
- `/Users/ellis/Documents/open-source-app-kittie/packages/api/src/services/db-app-service.ts` — thin orchestrator.
- Architecture review HTML (local only): `/var/folders/wl/l2tnhmts47j3c1trhlx2_vhc0000gn/T/architecture-review-20260619-kittie.html`

## Running state
- Background processes: none started this session.
- Dev servers / ports: none left running. Guardrail: API default `3008`, web proxy `VITE_API_ORIGIN=http://127.0.0.1:3008` (avoid IPv6 `localhost` ECONNREFUSED — Section C of bug catalogue).
- Branch: `fix/hot-ideas-mockup` (tracks `origin`). **Note:** this commit mixes hot-ideas branch history with architecture + bug fixes — consider cherry-pick onto `fix/audit-breaks` (#41 stack) or a dedicated `fix/bug-catalogue` branch before merge to `main`.

## Verification — how to confirm things still work
- `cd /Users/ellis/Documents/open-source-app-kittie && pnpm typecheck` — all packages green.
- `cd packages/api && pnpm exec vitest run src/lib/params.test.ts src/services/filter-sort.test.ts` — 7 tests pass.
- `curl -s "http://127.0.0.1:3008/api/v1/apps?growthPeriod=14" | head` — expect **400** JSON, not 500.
- `curl -s "http://127.0.0.1:3008/api/v1/apps?growthType=positive&limit=3"` — `pagination.totalCount` ≤ SQL superset count.
- Reviews tab: growth card period chips do not change feed facet counts; feed `PeriodChips` row below growth card drives `?period`.

## Deferred + open questions
- Deferred: architecture candidates **#2–#4** (db↔intelligence cycle, filter AST, scoring authority) — from architecture review; not started.
- Deferred: integration tests for `searchAppCandidates` + `buildScoredAppRows` — highest regression risk.
- Deferred: **B6** — show negative review deltas vs clamp at 0?
- Deferred: Reviews growth chart data wiring (A3/A4) if not merged from `fix/audit-breaks` — `chartDays` is ready but chart still empty here.
- Open: **PR target** — land on `fix/audit-breaks` vs new branch vs `main` after #41 merges.

## Pick up here
If promoting to the audit stack: checkout `fix/audit-breaks`, cherry-pick or merge this commit, run `pnpm typecheck`, then `/code-review` on the diff vs `main`. If staying on hot-ideas lane: open PR noting the mixed scope or split commits.
