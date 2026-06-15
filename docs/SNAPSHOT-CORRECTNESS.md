# Snapshot & Scoring Correctness

This document specifies the correctness guarantees for snapshot capture and score calculation.

## Snapshot Job (`pnpm ingest:snapshot`)

Fetches live app metrics from store APIs and creates/updates a snapshot row for today's date.

### Behavior

- **Idempotent within a day**: Running the job multiple times on the same calendar day upserts the same row (same `appId` and `snapshotDate`). Latest values win.
- **Fresh chart ranks**: Chart rank is fetched fresh each run from public feed (Apple/Google charts). Off-chart apps get `chartRank = null`.
- **Observed metrics only**: reviewCount, rating, chartRank are direct reads from stores. No estimation.
- **Score calculation**: After snapshot upsert, `enrichSnapshotScores` is called to populate estimates.

### Same-Day Rerun

```
Run 1: snapshot(2026-06-12, reviewCount=100)
  ↓ upsert → create row
  ↓ enrichSnapshotScores → calculate scores

Run 2 (same day): snapshot(2026-06-12, reviewCount=105)
  ↓ upsert → update row (reviewCount: 100→105)
  ↓ enrichSnapshotScores → recalculate scores based on updated values
  
Result: Snapshot row is updated; previous scores are overwritten.
```

## Score Job (`pnpm ingest:score`)

Re-calculates estimates for each app's latest snapshot without re-fetching store data.

### Behavior

- **Latest snapshot only**: Runs `enrichSnapshotScores` on the most recent snapshot per app.
- **Idempotent**: Running multiple times produces the same scores (deterministic based on snapshot data).
- **No data loss**: Existing store metrics (reviewCount, rating, chartRank) are preserved.

## Signal Mapping: Snapshot → Signals

When calculating scores, snapshot data is mapped to AppSignals:

```typescript
{
  reviewCount: latest.reviewCount,           // Always set (default 0)
  reviewCountPrior: prior?.reviewCount ?? null,  // Null if no prior snapshot
  chartRank: latest.chartRank,               // Null if off-chart
  chartRankPrior: prior?.chartRank ?? null,  // Null if no prior or prior was off-chart
  rating: latest.rating,                     // Null if unrated
  ...
}
```

## Growth Period & Prior Snapshot Logic

Growth metrics compare against a snapshot from N days ago (growth period).

### Periods

- `7d` (default): Compare to snapshot from 7 days ago
- `14d`, `30d`, `60d`, `90d`: Longer lookback windows

### Prior Snapshot Selection

For current date `D` and period `N`:
1. Calculate target date: `T = D - N days`
2. Find latest snapshot with `snapshotDate <= T`
3. If found: use for prior signals (growth deltas, prior counts)
4. If not found: treat as no prior (null values, 0 growth assumed)

**Example**: Current=2026-06-12, Period=7d
- Target date: 2026-06-05
- If snapshots exist on [2026-06-04, 2026-06-06, 2026-06-10]:
  - Prior = 2026-06-04 (latest one <= target)
- If only snapshot on 2026-06-10:
  - Prior = null (none <= target)

## Score Calculation: First Snapshot Scenario

When an app has only one snapshot (no prior):

### Growth Score

Review/rank deltas are 0 (no prior to compare):
- `reviewDelta = current - (prior ?? current) = 0`
- `rankDelta = 0` (both current and prior null)
- Score depends on: ad creative delta + update recency

Example: Newly released app with recent update but no prior snapshot:
```
reviewDelta = 0
rankDelta = 0
adCreativeDelta = metaAdCount - 0 = 0 (if no ads)
updateRecency = 1.0 (if updated today)

growthScore ≈ (0.35 * 0 + 0.30 * 0 + 0.20 * 0 + 0.15 * 1.0)
           ≈ 0.15 → normalized to ~57.5

Not high enough for isFirstMover (needs >= 65).
```

### Revenue Estimation

With no prior snapshot, velocity is estimated as 2% of current reviews:
```
reviewGrowth = 0.02 * reviewCount
```

This is conservative; real growth data (from prior snapshot) will be more accurate.

## Null vs Zero Handling

| Field | Type | Null Meaning | Zero Meaning |
|-------|------|--------------|--------------|
| `reviewCount` | int(0) | n/a | App has no reviews |
| `chartRank` | int? | Off-chart/unranked | n/a |
| `rating` | real? | No rating yet | n/a |
| `reviewCountPrior` | int? | No prior snapshot | Prior had zero reviews |
| `chartRankPrior` | int? | No prior snapshot OR prior was off-chart | n/a |

### Growth Calculation Impact

**Zero reviewCount:**
- `reviewGrowth = 0 - 0 = 0` (no delta)
- Revenue estimate uses 2% velocity fallback
- Correct: app with no reviews has no growth

**Null chartRank (off-chart):**
- `rankDelta = 0` (skipped in scoring)
- `rankDecay(null) = 0.08` (minimal for revenue)
- Correct: off-chart apps don't contribute rank-based signals

**Null reviewCountPrior (no prior snapshot):**
- Used as fallback to current value → delta = 0
- Correct: be conservative when no historical data

## Idempotency Guarantees

### Score Job

Running `enrichSnapshotScores` twice on the same snapshot:
```
Run 1: enrichSnapshotScores(appId, 2026-06-12)
  → Fetches signals, calculates scores, updates row

Run 2: enrichSnapshotScores(appId, 2026-06-12)
  → Fetches same signals (data unchanged), calculates same scores, updates row

Result: Identical scores in both runs (idempotent).
```

### Snapshot Job

Running `pnpm ingest:snapshot` twice on the same day:
```
Run 1: Creates snapshot(2026-06-12, reviewCount=X, rating=Y)
  → Scores calculated

Run 2: Updates snapshot(2026-06-12, reviewCount=X, rating=Y)
  → Scores recalculated (same values if data unchanged)

Result: Idempotent if store data is unchanged.
        If store data changed (review count jumped), scores differ (correct).
```

## First Mover Label

An app is marked `isFirstMover` if ALL of:
1. `growthScore >= 65` (high growth)
2. `categoryAppCount < 80` (category not saturated)
3. `releasedAt` is set (has release date)
4. `daysSinceRelease <= 90` (released within 90 days)

### Edge Case: Single Snapshot Day

A newly released app with only one snapshot (no prior) rarely qualifies as first mover because growth score depends on deltas, which are 0 without prior data. Add multiple snapshot days for this determination to stabilize.

## Potential Future Improvements

- [ ] Materialize prior snapshot queries for performance (currently loads all snapshots, filters in-memory)
- [ ] Score all historical snapshots, not just latest
- [ ] Add growth-score thresholds/labels to CONTEXT.md
- [ ] First mover thresholds as config, not constants
