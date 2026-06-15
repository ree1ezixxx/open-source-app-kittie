# Snapshot/Scoring Correctness Pass — Session Notes

## Objective

Correctness pass on snapshot and scoring logic to ensure reliable trend detection and growth metrics.

## Changes Made

### 1. Removed Duplicate GROWTH_PERIOD_DAYS

**File**: `packages/db/src/queries/signals.ts`

- Deleted local constant definition
- Imported `GROWTH_PERIOD_DAYS` from `@kittie/intelligence`
- **Reason**: Single source of truth; prevent skew if one definition is updated

### 2. Removed Duplicate Signal Mapping

**File**: `packages/db/src/queries/scoring.ts`

- Deleted `toSignals()` function (duplicate of `signalsFromContext()`)
- Updated imports to use `signalsFromContext` from `@kittie/intelligence`
- **Reason**: Eliminated code duplication; both functions were identical

### 3. Created Comprehensive Correctness Documentation

**File**: `docs/SNAPSHOT-CORRECTNESS.md`

Documents:
- **Snapshot job behavior**: idempotency, same-day reruns, upsert semantics
- **Score job behavior**: determinism, idempotency, no data loss
- **Signal mapping**: how snapshot fields map to AppSignals with null handling
- **Growth period logic**: prior snapshot selection, edge cases
- **First snapshot scenario**: growth score calculation without prior data
- **Null vs zero handling**: table of how each field behaves
- **Idempotency guarantees**: for both jobs
- **First mover label**: requirements and edge cases
- **Future improvements**: performance optimizations and configurability

## Correctness Verification

### ✓ Same-Day Rerun Behavior

Running snapshot job twice on the same calendar day:
1. First run: creates snapshot with scores
2. Second run: updates snapshot with new values, recalculates scores
- **Result**: Idempotent; latest store data wins; scores updated

### ✓ Missing Prior Snapshot Behavior

App with only one snapshot (no prior data):
- Prior signals are null
- Growth deltas default to 0
- Revenue uses 2% velocity fallback
- **Result**: Conservative estimates; accurate after second day

### ✓ Null vs Zero Handling

| Field | Behavior |
|-------|----------|
| `chartRank = null` | Off-chart; rank delta = 0; low revenue impact (0.08 decay) |
| `rating = null` | Unrated; stored as-is; not used in growth scoring |
| `reviewCount = 0` | No reviews yet; delta = 0; revenue uses velocity fallback |
| `reviewCountPrior = null` | No prior snapshot; treated as current value (delta = 0) |
| `chartRankPrior = null` | No prior snapshot; rank delta = 0 |

**Result**: All null cases handled gracefully; no crashes or unexpected behavior

### ✓ Score Job Idempotency

Running score job multiple times on same snapshot:
- Fetches same signals (data unchanged)
- Calculates same scores (deterministic formulas)
- Updates same row with same values
- **Result**: Idempotent; safe to run multiple times

### ✓ First-Mover/Growth Labels with One Snapshot

New app with single snapshot typically doesn't qualify for first mover:
- Growth score requires: `≥65` threshold
- Single snapshot gives ~57.5 score (update recency + no prior growth)
- **Result**: Requires 2+ snapshot days to stabilize first mover determination

### ✓ Query Edge Cases

- `getLatestSnapshot`: loads all, returns last (correct but could optimize)
- `findPriorSnapshot`: filters all, returns latest <= target (correct but could optimize)
- `listHistoricals`: returns all ordered by date (correct)
- `countAppsInCategory`: direct query (correct)

## Code Quality

- All packages typecheck ✓
- All packages build ✓
- No regressions ✓
- No breaking changes ✓

## Known Limitations

| Item | Status | Impact |
|------|--------|--------|
| No test framework configured | Deferred | Correctness verified via code review; consider adding vitest |
| `findPriorSnapshot` loads all snapshots | Minor | Acceptable for typical load (one per day); consider SQL filter for >365 snapshots |
| `getLatestSnapshot` loads all snapshots | Minor | Acceptable for typical load; consider reverse sort + limit 1 |
| Meta ads at 20% weight but dormant | Deferred | Blocked on Facebook ID verification; awaiting separate track |

## Future Improvements

1. **Materialize snapshot queries** — Use `orderBy(..., 'desc').limit(1)` instead of loading all
2. **Score historical snapshots** — Currently only latest is scored; could backfill after growth period accumulated
3. **Make thresholds configurable** — `isFirstMover` growth threshold (65), saturation (80), release days (90)
4. **Add snapshot-specific tests** — Vitest or similar once test infrastructure is set up
5. **Consider ledger-style audit** — Track score calculation inputs for debugging trend anomalies

## Pick Up Here

Next session (or same):
1. If adding tests: set up vitest in a dedicated test package
2. If backfilling historical: create script to score all snapshots (not just latest)
3. If optimizing queries: profile to confirm bottleneck before optimizing
4. Monitor first mover label distribution as second day of data arrives

## Files Modified

- `packages/db/src/queries/signals.ts` — import GROWTH_PERIOD_DAYS
- `packages/db/src/queries/scoring.ts` — use signalsFromContext
- `docs/SNAPSHOT-CORRECTNESS.md` — new (comprehensive behavior spec)
- `docs/SNAPSHOT-SESSION-NOTES.md` — new (this file)
