---
status: accepted
---

# Per-country app snapshots via country in the snapshot key

## Context & decision

AppKittie exposes country as a first-class include/exclude query dimension
(`appStore.apps.getApps` takes `countries` + `excludedCountries`, alongside
`categories`), and the same App carries a different rank, review count, rating
and Revenue estimate per storefront market. To match that ("full per-country
metrics", not membership filtering), we make a **Snapshot's identity
`(app_id, snapshot_date, chart_country)`** — changing the `app_snapshots` unique
index from `(app_id, snapshot_date)` to `(app_id, snapshot_date, chart_country)`
in place. Existing 3.08M rows are already all `chart_country='US'`, so they
remain valid under the new key with **zero data rewrite**.

## Considered options

- **Country in the unique key (chosen).** One table, one row per
  app/day/market. Matches the keyword precedent (`keywords_unique_idx` on
  `(keyword, country, store)`). Every existing global query (Explore `/apps`,
  the latest-day pin, Trending) must add `chart_country = 'US'` to stay
  single-market — the main migration hazard.
- **Separate `country_snapshots` table** (US stays in `app_snapshots`). No
  re-index, but two code paths forever and every read that wants a non-US market
  must UNION or branch. Rejected: permanent query complexity for a one-time
  migration saving.
- **New `app_snapshots_v2` table, copy US rows in, cut over.** Cleanest key but a
  full 3M-row copy + cutover risk vs. an in-place re-index that existing data
  already satisfies. Rejected as unnecessary.

## Consequences

- **Global surfaces must pin a default market.** Explore/Highlights/Trending
  read `chart_country='US'` unless a country filter is set; without the pin they
  would multiply rows by the number of tracked markets.
- **Bounded ingest, not the whole catalog.** Per-country metrics are tracked
  only for the **market-visible** set (apps charting in that market, ~4–5k/market
  from the free RSS), refreshed daily; the 1.1M long-tail keeps a US-only
  Snapshot (it charts nowhere, so never appears in a per-country view). A
  one-time/periodic backfill can widen coverage at IP-safe rates. Full-catalog ×
  14 daily is infeasible (the Apple-IP lookup ceiling, not SQLite).
- **Hard dependency on the snapshot-bulk OOM fix.** `runSnapshotBulk` already
  OOMs materializing the 1.1M catalog; fanning out per-market makes it strictly
  worse. The streaming fix must land *before* per-country bulk runs.
- **Per-country growth needs per-country history depth.** Like the single-market
  case, "JP 30-day growth" only means anything after ≥30 days of JP Snapshots
  accrue; the metric is correct immediately, the *ranking* differentiates as
  history deepens.
- Ingest execution stays the single sweep-writer's responsibility (E-aso lane),
  not the clone-UI worktree.
