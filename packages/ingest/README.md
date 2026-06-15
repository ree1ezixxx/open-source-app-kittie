# @kittie/ingest

Data collection for App Kittie — Apple charts, store metadata, and daily snapshots.

## Worktree DB (shared)

From a sibling worktree, symlink the shared SQLite DB:

```bash
ln -sf ../open-source-app-kittie/data data
```

Never commit `data/` — it is gitignored.

## Commands

From repo root (after `pnpm db:migrate`):

```bash
pnpm ingest:seed      # Pull top charts → upsert apps → write today's snapshots
pnpm ingest:snapshot  # Fresh chart ranks + review/rating for all tracked apps
pnpm ingest:score     # Re-score latest snapshots (revenue, growth)
pnpm ingest:reviews   # Paginate store reviews into the reviews table
```

### Daily cadence

Run once per calendar day (order matters):

```bash
./scripts/daily-ingest.sh
# or: pnpm ingest:snapshot && pnpm ingest:score
```

Same-day reruns overwrite that date's row — they do not add history. The API's App discovery read cache refreshes within 60s after scoring.

## Sources (P0)

| Collector | Source |
|-----------|--------|
| Apple charts | `rss.applemarketingtools.com` RSS JSON |
| Apple metadata | iTunes Lookup API (free, no key) |
| Google Play | `google-play-scraper` (charts + app detail) |

## Verify

```bash
sqlite3 data/kittie.db "SELECT COUNT(*) FROM apps;"
sqlite3 data/kittie.db "SELECT COUNT(DISTINCT snapshot_date) FROM app_snapshots;"
```

Expect 50+ apps after `ingest:seed`. Trend charts need ≥2 distinct `snapshot_date` values.
