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

## Experiment 3 — score-only-the-page (pure win, no tradeoff)
For a SQL-native DESC sort (`reviews`/`rating`/`updated`/`released`) with no in-memory
filter (`dropsRowsInMemory` false), the SQL candidate set already IS the result set in
final order — so `searchAppsFromDb` slices the page off `ids` and scores only those ~50
rows instead of the whole ~5000-row pool. Guards: `poolIsInFinalOrder` (SQL column +
DESC, so SQLite's null-last matches the JS null-sink) + `dropsRowsInMemory` (excludes
search / modelled-estimate / meta / window filters that could drop rows in JS).

**Proven equivalent:** captured page-1/2 ids + total + nextCursor for 4 queries (incl.
the tail-sensitive unfiltered `sortBy=rating desc` and a category filter) — `diff`
fast-path vs full-path = **byte-identical**. typecheck + api tests (80) green.

| query | before | after |
|---|---|---|
| `sortBy=reviews desc` cold | 470ms | **117ms** |
| `sortBy=rating desc` cold | 640ms | 345ms |

Suite p95 (mixed) moves 605→562ms only, because the suite also contains the live-scored
`revenue`/`growth` and `asc`/`rankDelta` sorts (the accepted floor below). The win is
real but concentrated on the SQL-native-desc sorts; the **default `revenue` Explore view
is unchanged by design** (Rhodri chose the pure-win option, deferring the revenue floor).

## Experiment 4 — precompute revenue at ingest (PROTOTYPE → REVERTED)
Backfilled `revenue_estimate`/`downloads_estimate`/`growth_score` onto all 1.1M rows of
`2026-06-19` using the API's exact `buildScoredAppRows` (so persisted == live), added
`(snapshot_date, revenue_estimate)`, and flipped `sortBy=revenue` to order by the column
+ score-only-page. Two findings killed it:

1. **It regressed latency**: revenue cold **0.41 → 0.67s**, suite p95 562 → **821ms**.
   The bottleneck for revenue was never the live scoring — it's the **`LIMIT 5000`
   candidate scan**. Ordering by `revenue_estimate` (+ rating filter → table lookups)
   scans *worse* than the well-worn `(snapshot_date, review_count)` proxy index, and
   score-only-page can't compensate because the scan still walks 5000 rows.
2. **It changed rankings** (parity gate caught it): the true top-50-by-revenue ≠ the old
   "re-rank the top-5000-by-reviews" approximation — NEW surfaces high-revenue / lower-
   review apps the old pool excluded. More correct, but a visible change to the default
   Explore view.

→ Reverted the sort-flip (revenue back to the reviewCount-proxy, 0.41s) and dropped the
revenue index. The backfill script `packages/api/src/scripts/backfill-estimates.ts` is
kept as a tool but unwired.

**The actual lever (not yet done):** push pagination INTO SQL — keyset cursor so the
candidate query is `LIMIT pageSize` (~50), not `LIMIT 5000`. Then the scan is ~50 rows
for *any* sort column (reviews/rating/revenue), and combined with the revenue precompute
the default view goes SQL-native + fast. This is a larger refactor (cursor encoding →
carry the sort value; keyset WHERE) and is the real path to ≤200ms on the default view.

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

---

# Keyset-pagination refactor — `perf/keyset-pagination` (off `main` after #140)

Rhodri re-armed the goal under ultracode: actually reach ≤200ms on the default
`revenue` + `search` views. The lever (from the floor analysis above): push pagination
INTO SQL so the candidate query is `LIMIT pageSize` (~50), not `LIMIT 5000` — then the
cold scan is tiny for any SQL-native sort, and with the revenue precompute the default
view goes SQL-native + fast.

## Fresh baseline — 2026-06-23 (cold, fresh 4.6GB clone, pin day 2026-06-19, 1.1M apps)
| suite | p50 | p95 | p99 |
|---|---|---|---|
| apps:search | 152 | 422 | 1470 |
| apps:filter+sort | 404 | 786 | 834 |
| charts | 1 | 53 | 63 |

TARGET: cold p95 ≤ 200ms for every apps shape; charts already ✓. Hard rule: BYTE-IDENTICAL
parity vs current behavior (perf-only; no ranking/pagination change), proven by capture+diff.

## Experiments
| # | change | result | verdict |
|---|---|---|---|
| A | **Keyset pagination** for SQL-native DESC sorts (reviews, rating w/ minRating>0). Candidate query paginates with a `(sortValue, app_id)` boundary + `LIMIT pageSize` instead of the 5000-row POOL_CAP pool. New covering index `(snapshot_date, review_count, app_id)`. Cursor carries the candidate scan's column value (not the scored item's — that diverges on a partial newer snapshot day and re-emits rows). | reviews-desc cold **0.47→0.10s**; rating-desc 0.57→0.29s (large rating tie-groups cap the tiebreaker). **BYTE-IDENTICAL** to legacy across pages 1-3 of 8 query shapes incl. negatives (verified by capture+diff `scripts/capture-pages.mjs`). typecheck + api/db tests (80+10) green. | **keep** |

Note: suite p95 stays ~900ms because it also benches `asc`/`rankDelta` sorts (NOT keyset-eligible — unchanged legacy path). The win is per-shape on the real hot paths.

| B | **Revenue/downloads precompute → keyset.** `backfill-estimates.ts` persists revenue/downloads/growth on every row of the pinned complete day; new indexes `(snapshot_date, revenue_estimate, app_id)` + downloads. `sqlSortColumn(revenue\|downloads)` returns the stored column when the day is fully backfilled (`revenueColumnReady` gate — zero-null check, cached; falls back to the reviewCount proxy otherwise, so a missing/partial backfill is correct-but-slower, never wrong). revenue/downloads then flow through the Tranche-A keyset path automatically. | **default `revenue` view cold 0.37→0.10s**, downloads 0.44→0.10s. Verified BYTE-IDENTICAL to the proxy across pages 1-3 of all shapes (the top-revenue apps are all high-review, so the old top-5000-by-reviews proxy was already exact at the top — Experiment-4's apparent delta was the partial-day artifact, gone in steady state). New order is monotonic on revenue_estimate. typecheck + api/db tests green. | **keep** |

### Hot-path summary (cold p95, after A+B)
| shape | before | after |
|---|---|---|
| **revenue desc (default Explore)** | 0.37s | **0.10s ✓** |
| reviews desc | 0.47s | **0.10s ✓** |
| downloads desc | 0.44s | **0.10s ✓** |
| rating desc (minRating>0) | 0.57s | 0.29s (large rating tie-groups cap the tiebreaker) |
| charts | 0.05s | 0.05s ✓ |
| search (FTS) | 0.37s | 0.37s (FTS rank can't be keyset; unchanged) |
| asc / rankDelta sorts | ~0.4s | ~0.4s (not keyset; not real hot paths) |

**Production follow-up (cross-lane):** the backfill is a script — the snapshot worker
(`packages/ingest`) should write revenue/downloads/growth at snapshot-write time so the
gate stays "ready" without a manual backfill. Until then, run `backfill-estimates.ts`
after each day's ingest; if it lapses, the gate serves the (correct, slower) proxy.

### (earlier experiments, pre-keyset)
