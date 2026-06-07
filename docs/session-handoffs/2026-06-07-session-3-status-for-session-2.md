# Session Handoff — Session 3 status (for Session 2)

## Answer to Session 2's question

**Yes — Session 3 has connected DB → API → UI and runs scoring on snapshot data.**

Session 2's handoff assumption ("Session 3 still needs to wire DB to API") is **out of date**. That work shipped in this thread.

| Claim | Status |
|-------|--------|
| API reads from SQLite | **Done** — auto-detects `data/kittie.db`; falls back to mock fixtures only if `apps` table is empty |
| Scoring models run on snapshot data | **Done** — live via `@kittie/intelligence` on each request, OR uses pre-computed columns if present |
| UI connected | **Done** — Vite web proxies `/api` → API; table + drawer call same endpoints |

## How the wiring works

```
app_snapshots + apps (+ iaps, meta_ads, etc.)
        ↓
@kittie/db  listSnapshotContexts / getSnapshotContext
        ↓
@kittie/intelligence  signalsFromContext → scoreApp (growth, revenue, downloads, first-mover)
        ↓
packages/api  db-app-service.ts → app-service.ts (dbHasApps ? DB : mock)
        ↓
apps/web (proxy)  |  apps/cli (pluto)  |  apps/mcp
```

**Scoring path in API** (`/Users/ellis/Documents/open-source-app-kittie/packages/api/src/services/db-app-service.ts`):

1. Load `SnapshotContext` per app from DB.
2. If `app_snapshots.growth_score` AND `revenue_estimate` are already set → use stored values (Session 2's `pnpm ingest:score` output).
3. Else → compute live with `scoreApp(signalsFromContext(ctx))`.

As of handoff time: **283 apps, 283 snapshots, 283 with `growth_score` populated** (ingest score job has run).

## Key files

- `/Users/ellis/Documents/open-source-app-kittie/packages/api/src/services/db-app-service.ts` — DB read + score orchestration
- `/Users/ellis/Documents/open-source-app-kittie/packages/api/src/services/app-service.ts` — DB vs mock switch
- `/Users/ellis/Documents/open-source-app-kittie/packages/db/src/queries/signals.ts` — snapshot context queries
- `/Users/ellis/Documents/open-source-app-kittie/packages/db/src/queries/scoring.ts` — `enrichSnapshotScores` (used by ingest score job)
- `/Users/ellis/Documents/open-source-app-kittie/packages/intelligence/src/` — growth, revenue, keyword heuristics
- `/Users/ellis/Documents/open-source-app-kittie/apps/web/vite.config.ts` — proxies `/api` → `localhost:3000`
- `/Users/ellis/Documents/open-source-app-kittie/apps/cli/` — CLI renamed to **`pluto`** (`pnpm pluto trends`)

## Verification

```bash
cd /Users/ellis/Documents/open-source-app-kittie
pnpm dev:api                                    # default :3000
curl "http://localhost:3000/api/v1/apps?sortBy=growth&limit=3"
# → real apps (e.g. ChatGPT), growthScore + revenueEstimate30d populated

pnpm dev:web                                    # :5173, proxies to API
pnpm pluto trends                               # CLI against API
```

DB sanity:

```bash
sqlite3 data/kittie.db "SELECT COUNT(*) FROM apps;"
sqlite3 data/kittie.db "SELECT COUNT(*) FROM app_snapshots WHERE growth_score IS NOT NULL;"
```

## What Session 2 should focus on next (unblocks richer Session 3 output)

Session 3 is **wired** but several features are **data-starved**, not code-missing:

| Session 2 deliverable | Why Session 3 cares |
|----------------------|---------------------|
| **Daily `ingest:snapshot`** (2+ snapshots per app) | Growth scores currently cluster — `review_delta_7d` / `rank_delta_7d` need prior snapshot |
| **Meta ads ingest** | `hasMetaAds` filter + ad_activity_bonus in revenue model |
| **IAP ingest** | `iap_count_bonus` in revenue model |
| **Review sync** | `POST /api/v1/reviews` returns empty today |
| **Keyword rankings** | keyword difficulty endpoint still uses chart-app heuristics, not `keyword_rankings` table |
| **Creators** (P2) | `hasCreators` filter |

After each ingest job, Session 3 API may need **cache bust** — `db-app-service.ts` caches scored rows in memory until API restart. Consider documenting `pnpm ingest:score` → restart API, or Session 3 can add cache invalidation later.

## Session 3 still thin (not blocked on Session 2 finishing)

- Web: table only, no search/filters UI
- MCP: built, not verified in Cursor config
- Keywords/reviews endpoints: partial (mock or empty)
- API loads all apps per search request (OK at 283 rows, won't scale)
- Intelligence unit tests not written

## Running state

- Background API processes from dev sessions may be stale; restart with `pnpm dev:api`
- Port 3000 may conflict with other local apps — use `PORT=3001` if needed
- DB path: `/Users/ellis/Documents/open-source-app-kittie/data/kittie.db`

## Pick up here (Session 2)

Run daily snapshots so apps have prior rows for 7d growth deltas. Re-run `pnpm ingest:score` after snapshot runs. Session 3 will automatically surface richer scores — no API rewiring required.
