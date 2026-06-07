# Session Handoff — Daily snapshots & trends

## Scope split (read this first)

| Track | Branch | Worktree | What it owns |
|-------|--------|----------|--------------|
| **Keywords / ASO** | `feat/keywords-aso` | `open-source-app-kittie-ingest` | Store search, keyword difficulty, `keywords` table |
| **Snapshots / trends** | `feat/ingest` | `open-source-app-kittie-snapshots` | Daily metrics history, growth scores, revenue charts |

These are **different jobs**. Keyword work does not unblock trend charts. Trend charts need **multiple `snapshot_date` rows per app**.

## Where it started

Foundation + intelligence surface read precomputed scores from `app_snapshots`. UI revenue/growth charts and trending views compare snapshots across days. Ingest built `pnpm ingest:seed`, `pnpm ingest:snapshot`, and `pnpm ingest:score` — but only **one calendar day** of data exists so far.

**You own:** keeping the DB fed with fresh daily rows and making the snapshot pipeline reliable.

## Shared DB (all worktrees)

`/Users/ellis/Documents/open-source-app-kittie/data/kittie.db`

Symlink from your worktree: `data -> ../open-source-app-kittie/data`

## Current DB state

```bash
sqlite3 ../open-source-app-kittie/data/kittie.db \
  "SELECT COUNT(DISTINCT snapshot_date) AS days, MIN(snapshot_date), MAX(snapshot_date), COUNT(*) FROM app_snapshots;"
# Expect today: 1 day, 283 rows
```

Charts need **≥2 distinct `snapshot_date` values**. Running snapshot twice on the **same** day upserts the same row — you need a new calendar day (or a dev backfill — see below).

## What the pipeline does

1. **`pnpm ingest:seed`** — pull top charts, upsert apps, write **today's** snapshot (includes chart rank).
2. **`pnpm ingest:snapshot`** — for every tracked app, fetch live review count + rating from store APIs, write **today's** row. Chart rank is copied from the prior snapshot (ranks do not refresh until re-seed).
3. **`pnpm ingest:score`** — run `enrichSnapshotScores` on each app's **latest** snapshot → fills `revenue_estimate`, `downloads_estimate`, `growth_score`, `is_first_mover`.

Growth/trend logic in `@kittie/db` compares snapshot A vs snapshot B N days ago. No second day → flat trends.

## P0 — pick up here

### 1. Establish daily cadence

Run once per calendar day (manual or cron):

```bash
cd /Users/ellis/Documents/open-source-app-kittie-snapshots
pnpm ingest:snapshot
pnpm ingest:score
```

Verify:

```bash
sqlite3 ../open-source-app-kittie/data/kittie.db \
  "SELECT COUNT(DISTINCT snapshot_date) FROM app_snapshots;"
```

After day 2+: intelligence API `GET /api/v1/apps/:id/historicals` and UI trend charts should show movement.

### 2. Document or add cron

Optional `scripts/daily-ingest.sh` + launchd/cron example in `packages/ingest/README.md`. Order matters: snapshot → score.

## P1 — improve snapshot quality

| Gap | Detail |
|-----|--------|
| **Frozen chart ranks** | `snapshot.ts` copies `chartRank` from prior row. Re-run `pnpm ingest:seed` weekly, or add chart refresh into snapshot/seed job. |
| **Score only latest** | `ingest:score` scores latest snapshot per app. After historical days accumulate, consider scoring each new day's row on write (already happens in `upsertSnapshot` via `enrichSnapshotScores` in `db/apps.ts` — confirm still wired). |
| **Dev backfill (optional)** | For testing without waiting overnight: script that shifts/copies prior day or writes synthetic prior snapshot. Not for production. |

## Key files

- `packages/ingest/src/jobs/snapshot.ts` — daily refresh
- `packages/ingest/src/jobs/seed.ts` — chart seed + initial ranks
- `packages/ingest/src/jobs/score.ts` — re-score latest rows
- `packages/ingest/src/db/apps.ts` — `upsertSnapshot` + `enrichSnapshotScores`
- `packages/db/src/queries/signals.ts` — growth/historical queries

## Do NOT touch (other tracks)

- `packages/ingest/src/apple/search.ts`, `google/search.ts`, `jobs/keyword-sync.ts` — **keywords ASO** on `feat/keywords-aso`
- Meta ads — blocked on Facebook ID verification (separate handoff)

## Worktree setup

```bash
cd /Users/ellis/Documents/open-source-app-kittie
git worktree add ../open-source-app-kittie-snapshots feat/ingest
cd ../open-source-app-kittie-snapshots
ln -sf ../open-source-app-kittie/data data
pnpm install
```

Open `open-source-app-kittie-snapshots` as a separate Cursor workspace for this session.

## Exit criteria

- [ ] `COUNT(DISTINCT snapshot_date) >= 2` in shared DB
- [ ] Daily run documented (README or script)
- [ ] Spot-check: one app's `historicals` endpoint returns 2+ points
- [ ] (P1) Chart ranks refresh strategy decided

## Related handoffs

- `2026-06-07-foundation-needs-from-session-2.md` — foundation's ask (snapshot-focused, older)
- `SESSION-2-INGESTION.md` — original ingest scope
- `2026-06-07-ingest-meta-ads-blocked-on-id-verification.md` — Meta ads (deferred)
