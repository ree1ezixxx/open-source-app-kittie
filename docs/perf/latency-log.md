# Latency optimization log — `perf/response-time`

Goal: cut Kittie's response time, measured not vibed. Outer `/goal` + inner `/loop`
(propose one change → measure → keep/revert → commit). Honest data only — never trim
rows to win latency.

## Setup (fixed substrate)
- DB: APFS clone of the 4.6 GB catalog DB — **1,107,178 apps · 4,189,283 snapshots**,
  `data/kittie.db`, `quick_check ok`. Latest snapshot date `2026-06-22`.
- API: own instance on `:3013`, `DATABASE_URL=file:./data/kittie.db`, `RUN_SWEEPS=0`.
- Bench: `scripts/bench-cold.mjs` — **distinct queries per shape** so the in-process
  read cache can't hide cold DB cost (warm = ~2ms = false green). Restart API between
  experiments to reset the cache → true cold reading.
- Reference warm bench: `scripts/bench-latency.mjs`.

## TARGET
Cold p95 ≤ **200 ms** for every apps query shape; charts ≤ **30 ms**. Plus: no
functional regression (`pnpm typecheck` + tests green), 10-pass quality streak, PR open.

## Baseline — 2026-06-23 (cold, distinct queries)
| suite | n | p50 | p95 | p99 | max |
|---|---|---|---|---|---|
| apps:search | 40 | 113 | 444 | 573 | 573 |
| **apps:filter+sort** | 64 | **1092** | **1612** | 1720 | 1720 |
| charts (uncached) | 30 | 1 | 57 | 65 | 65 |

Warm reference (cached): apps list ~2 ms, categories ~2 ms, charts ~61 ms.

## Root cause (profiled, EXPLAIN QUERY PLAN)
`selectCandidateIds` date-pins + orders the apps⨝app_snapshots join. `review_count`
sort is served by `snapshots_date_reviews_idx (snapshot_date, review_count)`. But
`revenue_estimate` and `rating` sorts have **no composite index** → planner uses
`snapshots_date_idx` then `USE TEMP B-TREE FOR ORDER BY` = full sort of the latest
day's ~1.1M rows. ASC variants share the cost. This dominates the filter+sort p95.

## Experiments
| # | hypothesis | change | filter+sort p95 | verdict |
|---|---|---|---|---|
| — | baseline | — | 1612 | — |
| 1 | `rating` sort does a temp-b-tree sort | `(snapshot_date, rating, app_id)` index serves the rating sort + filter from the index | 1312 | **keep** (−300ms) |
| 1b | a `(snapshot_date, revenue_estimate)` index would help revenue sort | tried it | — | **revert** — `sortBy=revenue` orders by the `review_count` proxy (revenue is null on ~99.7% of rows, modelled live), so the index is never used. Dropped. |
| 2 | the `count(distinct apps.id)` "X of Y" join is the dominant per-request cost (~1.2–1.5s) | count `distinct app_snapshots.app_id` directly when no apps-column filter — the same covering index serves it index-only (~0.15s), no apps join | **605** | **keep** (−700ms, 2.7× vs baseline) |

Committed: one covering index `(snapshot_date, rating, app_id)` + the count-fix. filter+sort
p95 **1612→605ms**, search ~420ms, charts ~60ms. typecheck + db/api tests (10+80) green.

## Architectural floor (the remaining gap to 200ms)
Per-sort cold timings are now uniform ~0.4–0.6s — the cost is `buildScoredAppRows`
loading + scoring the **~5000-row candidate pool**, not any one sort. `reviews`/`rating`
sorts are SQL-native (pool already in final order → only the page needs scoring), but
`revenue`/`downloads`/`growth` (incl. the **default Explore sort**) are modelled live at
read time, so the whole pool must be scored to rank them. Getting the default view under
200ms needs one of: (a) persist revenue/downloads estimates at snapshot-write time →
SQL-native + indexable (the real fix, but cross-lane: ingest + schema); (b) shrink the
scoring pool (small accuracy / pagination-depth tradeoff); (c) score-only-the-page for
the SQL-native sorts (pure win, but doesn't help the default revenue view). → surfaced
to Rhodri for the call.
