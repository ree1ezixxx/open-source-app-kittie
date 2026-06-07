# @kittie/ingest

Data collection for App Kittie — Apple charts, store metadata, and daily snapshots.

## Commands

From repo root (after `pnpm db:migrate`):

```bash
pnpm ingest:seed      # Pull top charts → upsert apps → write today's snapshots
pnpm ingest:snapshot  # Refresh metrics for all tracked apps
pnpm ingest:reviews   # Paginate store reviews into the reviews table
```

## Sources (P0)

| Collector | Source |
|-----------|--------|
| Apple charts | `rss.applemarketingtools.com` RSS JSON |
| Apple metadata | iTunes Lookup API (free, no key) |
| Google Play | `google-play-scraper` (charts + app detail) |

## Verify

```bash
sqlite3 data/kittie.db "SELECT COUNT(*) FROM apps;"
sqlite3 data/kittie.db "SELECT COUNT(*) FROM app_snapshots;"
```

Expect 50+ apps with snapshot rows after `ingest:seed`.
