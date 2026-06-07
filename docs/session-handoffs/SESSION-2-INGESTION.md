# Session Handoff — Ingestion Layer

## Where it started

Rhodri wants an **open-source AppKittie alternative** — full intelligence platform, built in days across 3 parallel Cursor sessions. AppKittie's MIT repo only open-sources skills/MCP plumbing; their 2M-app database is paid ($49/mo API). We build our own data pipeline from public sources.

**You are Session 2.** You own all data collection. Session 1 (foundation) provides schema + types. Session 3 builds scoring, API, MCP, CLI, web on top of your data.

## Decisions locked

- **No AppKittie API dependency** — scrape/collect from public sources only
- **Full platform scope** — ingestion must feed: apps, snapshots, reviews, ads, creators (creators can be v1-lite)
- **Timeline: days** — ship working collectors, not perfect coverage
- **pnpm monorepo** at `/Users/ellis/Documents/open-source-app-kittie`
- **SQLite** for local dev via Drizzle (`packages/db`)

## Key files — read these first

- `/Users/ellis/Documents/open-source-app-kittie/AGENTS.md` — rules + ownership
- `/Users/ellis/Documents/open-source-app-kittie/CONTEXT.md` — domain glossary
- `/Users/ellis/Documents/open-source-app-kittie/AGENTS.md` — package map (`packages/ingest` is yours)
- `/Users/ellis/Documents/open-source-app-kittie/packages/db/src/schema.ts` — tables you write to
- `/Users/ellis/Documents/open-source-app-kittie/packages/types/src/index.ts` — shared types

## Your scope — `packages/ingest/**` only

Do NOT edit `packages/db/schema.ts` without coordinating Session 1. Propose changes in `docs/schema-requests.md`.

### Build these collectors

| Collector | Source | Priority |
|-----------|--------|----------|
| Apple charts | iTunes RSS top charts | P0 |
| Apple metadata | iTunes Search/Lookup API (free, no key) | P0 |
| Google Play metadata | `google-play-scraper` or similar | P0 |
| Reviews — Apple | RSS / public endpoints | P1 |
| Reviews — Google | Play scraper | P1 |
| Meta ads | Meta Ad Library API (public) | P1 |
| Apple Search Ads | Infer from search results or defer | P2 |
| Creators | TikTok/IG bio linking — defer or stub | P2 |

### Jobs

- `snapshot-daily` — for each tracked app, write `app_snapshots` row (review_count, rating, rank if available)
- `chart-seed` — pull top charts, upsert into `apps`, enqueue for snapshot
- `review-sync` — paginate reviews into `reviews` table

### Suggested package layout

```
packages/ingest/
├── src/
│   ├── apple/
│   │   ├── charts.ts
│   │   ├── lookup.ts
│   │   └── reviews.ts
│   ├── google/
│   │   ├── metadata.ts
│   │   └── reviews.ts
│   ├── meta/
│   │   └── ad-library.ts
│   ├── jobs/
│   │   ├── snapshot.ts
│   │   └── seed.ts
│   └── index.ts
├── package.json
└── README.md
```

### Exit criteria

```bash
cd /Users/ellis/Documents/open-source-app-kittie
pnpm install
pnpm ingest:seed    # you add this script
pnpm ingest:snapshot
# Verify: sqlite3 data/kittie.db "SELECT COUNT(*) FROM apps;"
# Expect: >50 apps with snapshot rows
```

## Running state

- Workspace: `/Users/ellis/Documents/open-source-app-kittie`
- DB path: `data/kittie.db` (gitignored)
- No external services required for P0 (Apple iTunes API is free)

## Open questions

- Rate limiting strategy for Meta Ad Library — start conservative (1 req/s)
- Google Play scraper package choice — pick one, don't evaluate for hours

## Pick up here

1. `cd /Users/ellis/Documents/open-source-app-kittie && pnpm install`
2. Read schema in `packages/db/src/schema.ts`
3. Scaffold `packages/ingest` and implement Apple chart seed + lookup first
4. Wire `pnpm ingest:seed` script at root
