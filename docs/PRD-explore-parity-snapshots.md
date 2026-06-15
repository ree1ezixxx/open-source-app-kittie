# PRD — Explore Parity & Daily Snapshots

> Synthesised from the 2026-06-15 grill session + live AppKittie truth inspection (`/dashboard/explore`, Chrome DevTools MCP). Glossary: [CONTEXT.md](../CONTEXT.md). Related: ADR 0004 (single freshness scheduler), existing [PRD-clone-to-parity.md](./PRD-clone-to-parity.md).

## Problem Statement

Kittie's Explore page (`/dashboard/explore`) is the AppKittie dashboard root and the primary apps database surface. Side-by-side comparison with appkittie.com shows the table shell and most filter groups exist, but Growth 7d reads flat or empty because snapshot history lacks distinct calendar days; several filter controls use a different interaction pattern (inline pill grids vs live dropdown popovers); and some filter behaviors (search field scope, growth-period URL sync) do not match truth. A researcher opening Explore expecting AppKittie-style momentum signals sees broken or static growth instead of review-velocity trends backed by daily Observed metrics.

## Solution

Deliver **Explore parity bar C**: match AppKittie Explore **UI and filter behavior** for app-data surfaces, with **honest gaps** where catalog scale (~100K vs ~2M) or un-ingested marketing signals return empty results — never fabricated data. **Priority order:** (1) establish reliable **daily Snapshot cadence** so Growth period filters, sparklines, and `%` cells behave like truth; (2) align Explore filter rail and table interactions with live AppKittie; (3) defer ads/creator ingest and Ads/Organic surface parity.

Truth model (verified live): Explore loads apps via `getApps` with `growthMetric: "reviews"` and `growthPeriod` (default `7d`). Each app carries precomputed `historical_counts.reviews_growth_{7d,14d,30d,60d,90d}` percentages derived from **daily snapshot rows** (review count per calendar day). The Growth column shows a mini sparkline + formatted `%`. Changing the Growth Sort window updates URL params (`growthPeriod`, often `sortBy=growth`) and refetches.

## User Stories

1. As a researcher, I open Explore and see apps sorted by Revenue estimate descending by default, matching AppKittie's default Explore view.
2. As a researcher, I see a Growth column with a sparkline and review-growth percentage (e.g. `+1.9%`) for apps that have at least two Snapshot days — not a uniform flat value.
3. As a researcher, I see an honest em dash (`—`) in the Growth column when an App lacks prior Snapshot history, never a fake `0%`.
4. As a researcher, I change the Growth Sort window (7d / 14d / 30d / 60d / 90d) and the table refetches with growth computed for that Growth period.
5. As a researcher, changing the Growth period updates the URL (e.g. `growthPeriod=30d`) so I can share filtered views.
6. As a researcher, when I select a non-default Growth period, Explore may re-sort by growth (matching truth behavior when the window changes).
7. As a researcher, I see an active filter chip such as "Growth window: 30d" when a non-default period is selected.
8. As a researcher, I filter Category via a **dropdown popover** ("Select categories") with Include/Exclude mode — not an always-visible emoji pill grid.
9. As a researcher, I filter App Language via a **dropdown popover** ("Select languages") — not an inline language pill grid.
10. As a researcher, I use Time filters (Released / Updated days ago) with All / 7 / 14 / 30 / 60 / 90 / Custom presets matching truth.
11. As a researcher, I toggle Source (Apple Store / Google Play) with the same dual-toggle semantics as truth.
12. As a researcher, I see Marketing Signals toggles (Meta Ads, Apple Ads, Creators, Contacts) visible in the filter rail even when our DB has no matching rows — applying them returns honestly empty or sparse results.
13. As a researcher, I do not expect Meta Ads / Creators filters to return rich results until separate ingest lands; empty results are acceptable.
14. As a researcher, I search with placeholder "Search apps, developers, descriptions..." and scope control "Search in: All / Title / Developer / Description" where non-All scopes actually constrain the API query.
15. As a researcher, I see subtitle copy "Search and filter" (not a longer variant) under the Explore Apps heading.
16. As a researcher, I see sidebar label **Apps** for `/dashboard/explore` (not "Database") within app-data scope; Ads/Organic link parity is deferred.
17. As a researcher, I paginate with "Showing N of X apps" and Prev / Page / Next controls matching truth density.
18. As a researcher, I sort by column headers (#, App, Category, Growth, Rating, Reviews, Downloads, MRR, Released, Last update) with caret direction feedback.
19. As a researcher, I export the current page as CSV or JSON.
20. As a researcher, I click View on a row and reach the App detail surface.
21. As a researcher, I see review counts displayed in compact + full form in the Reviews column (e.g. `166.2K reviews` + `166,164`).
22. As a researcher, I see Released and Last update as two-line cells (relative + absolute date) matching truth.
23. As an operator, daily Snapshots run automatically via the Boot catch-up sweep and in-process freshness scheduler while the API is up (ADR 0004).
24. As an operator, I can optionally run a standalone daily snapshot job when the API was not running overnight, so Growth does not stall.
25. As an operator, re-running snapshot ingest on the same calendar day overwrites that day's Snapshot row (idempotent) rather than duplicating history.
26. As an operator, I see freshness status ("data as of …") reflect when snapshots-daily last completed successfully.
27. As a developer, Growth percentages for Explore use **review-count delta** as the growth metric (`growthMetric: reviews` equivalent) — not MRR or download growth in the Explore table column.
28. As a developer, sparklines on Explore rows show the last ≤7 daily review-count Snapshot values (oldest→newest).
29. As a developer, snapshot-bulk refreshes Observed fields (review count, rating, chart rank) from public store sources without requiring a live store call at page-load time.
30. As a researcher, my Explore experience remains usable at ~100K Apps even though AppKittie shows ~2M — counts are honest, not padded.

## Implementation Decisions

**Parity bar (locked)**
- Bar **C**: UI + behavior parity with honest data gaps. Documented in CONTEXT.md under Resolved decisions.
- **Out of this PRD:** Ads Library surface parity, Organic surface parity, Meta/creator ingest, catalog scale to 2M, thermo-nuclear refactors unrelated to Explore.

**Priority sequencing (locked)**
1. Daily Snapshot cadence (snapshots-daily sweep + optional standalone backup).
2. Growth read path verification (period-aware `%`, sparklines, honest nulls).
3. Explore filter-rail UX (dropdown popovers for Category and App Language).
4. Search scope wiring and copy/sidebar label fixes.
5. Catalog scale increases (separate ingest track, not blocking Explore parity).

**Snapshot ingest module (deep)**
- Reuse existing bulk snapshot job in the ingest package: iterates all Apps, fetches Observed metrics from Apple/Google lookup paths, upserts one Snapshot row per App per **calendar date** (review count, rating, chart rank).
- Same-day reruns overwrite; they do not append duplicate dates.
- Chart rank lookup runs once per batch (US), consistent with existing bulk job behavior.
- Must remain callable from the API freshness registry (`snapshots-daily`, 24h cadence per ADR 0004) without shelling out.

**Freshness scheduler module (deep)**
- Extend or verify existing registry entry `snapshots-daily` invokes bulk snapshot + score refresh in-process.
- Persist last-run in sweep state so Boot catch-up sweep runs snapshots after >24h stale.
- Optional: document or add a thin CLI wrapper / launchd example for standalone daily run when API is offline — writes to the same DB path all lanes share.

**Growth computation module (deep)**
- At list read time, for each App and requested Growth period, select latest Snapshot and prior Snapshot (fallback to oldest available when full window unavailable — existing pickPrior behavior).
- Compute review growth **percentage** for display: period-scaled delta / prior review count × 100, capped and rounded (existing intelligence helper).
- Growth metric for Explore column is **reviews only** (matches truth `growthMetric: "reviews"`).
- Optionally expose all five period percentages on list items (truth `historical_counts` shape) for instant period switches without recomputing from scratch — nice-to-have after cadence is green.

**Sparkline module (deep)**
- Single grouped query over Snapshot table builds appId → last ≤7 reviewCount series; cache per API process lifetime with cache invalidation after snapshot sweep completes (avoid stale sparklines after new snapshot day).

**App search API module**
- Accept `growthPeriod` (7d–90d) on list endpoint; pass through to scoring/growth layer.
- Accept `textSearchFields` or equivalent when search scope is not All (title, developer, description) — mirror truth's `textSearchFields` array behavior.
- Return list items with: review growth %, sparkline array, Observed + Estimated metrics already on AppListItem.
- Default sort remains Revenue estimate descending.

**Explore UI module**
- Replace Category and App Language inline pill grids with dropdown popover components matching truth labels ("Select categories", "Select languages"); retain Include/Exclude for categories inside popover.
- Growth Sort pills write `growthPeriod` to URL; show chip when non-default; optionally set `sortBy=growth` on period change (truth behavior).
- Subtitle → "Search and filter"; sidebar Explore entry → "Apps".
- Marketing Signals: keep visible; no new ingest work in this PRD.
- Table Growth cell: sparkline SVG + signed `%` formatting (including large values like `+135K%` for 30d windows).

**Cache invalidation**
- After snapshots-daily completes, invalidate in-memory app list cache and sparkline cache so Explore reflects new growth without requiring manual API file touch (known gotcha in AGENTS.md).

## Testing Decisions

**What makes a good test:** assert observable behavior at module boundaries — API response shapes, filter query mapping, growth `%` given fixture Snapshots, scheduler due-selection — not internal cache field names.

**Modules to test**
- **Growth computation:** given two Snapshot dates with known review counts, assert period-scaled `%` matches expected values; assert null when no prior Snapshot.
- **Sparkline builder:** given ordered Snapshot rows, assert ≤7 ascending review counts per App.
- **Freshness scheduler:** extend existing due-selection tests to confirm `snapshots-daily` runs when last run >24h stale.
- **Explore filter URL mapping:** assert `growthPeriod`, category exclude mode, and search scope serialize/deserialize to API params correctly.

**Prior art**
- `packages/api/src/services/freshness-service.test.ts` — sweep due logic.
- `packages/intelligence` growth helpers — extend with table-driven cases for `%` formatting edge cases (tiny base, negative growth).
- Existing exploreFilters unit patterns in web package if present; add mapping tests for new search scope param.

**Manual verification**
- Live diff vs `https://www.appkittie.com/dashboard/explore` (signed-in Chrome on :9222): Growth column shows non-uniform percentages after ≥2 snapshot days in local DB.
- `pnpm dev:check-data` passes; Explore shows non-zero total with API on shared `kittie.db`.

## Out of Scope

- Ads Library (`/dashboard/ads`) and Organic (`/dashboard/organic`) surface clone work.
- Ingesting Meta Ads, Apple Ads, or Creators data for marketing-signal filters.
- Growing catalog from ~100K to ~2M Apps (tracked separately).
- Content rating filter rail control (API type exists; UI deferred unless needed for Explore sign-off).
- Growing / Declining (`growthType`) rail control unless required after snapshot cadence is green.
- App detail daily downloads chart parity (`historicals.getChartData` equivalent) — separate from Explore list Growth column.
- Favorite heart on Explore rows (truth shows View only; optional alignment deferred).
- Auth, billing, production deploy.

## Further Notes

**Live truth reference (2026-06-15)**
- Default `getApps` input: `sortBy: revenue`, `sortOrder: desc`, `growthMetric: reviews`, `growthPeriod: 7d`.
- Sample ChatGPT `historical_counts.reviews_growth_7d: 1.94` → UI `+1.9%`.
- Selecting 30d → URL `?sortBy=growth&growthPeriod=30d`, chip "Growth window: 30d", large `%` values (e.g. `+135K%`).
- Column header text may remain "GROWTH 7D" even when period ≠ 7d — match truth literally unless product decides otherwise.
- Contacts sub-filter on truth shows "Email exists" under expandable Contacts — align label/behavior when wiring Contacts, distinct from "Has website" / "Has email" pair if truth differs.

**Local blockers observed**
- Explore at localhost returned 500 when API not running — verification requires aligned API + shared DB per AGENTS.md port guardrail.
- DB had ~3 snapshot days at last handoff; Growth requires successive calendar days, not same-day bulk-seed reruns.

**Suggested implementation slices (vertical)**
1. Snapshot cadence green + cache invalidation → Growth column live.
2. Explore filter rail dropdowns + URL/copy/sidebar labels.
3. Search scope API + UI wiring.
