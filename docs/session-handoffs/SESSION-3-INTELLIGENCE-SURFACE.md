# Session Handoff — Intelligence + Surface Layer

## Where it started

Rhodri wants an **open-source AppKittie alternative** — full intelligence platform, built in days across 3 parallel Cursor sessions. This is Session 3: scoring models, REST API, MCP, CLI, and a minimal web dashboard.

Session 1 provides schema + types. Session 2 populates the DB via ingestion. You consume their data and expose it.

## Decisions locked

- **AppKittie API shape as reference** — mirror filter params where sensible (`sortBy=growth`, `minRevenue`, `hasMetaAds`, growth windows 7d/30d/90d)
- **Revenue/download numbers are estimates** — heuristic model, not store-reported
- **Not commercial** — no credit system, no billing
- **Timeline: days** — working API + MCP + basic UI, polish later
- **pnpm monorepo** at `/Users/ellis/Documents/open-source-app-kittie`

## Key files — read these first

- `/Users/ellis/Documents/open-source-app-kittie/AGENTS.md`
- `/Users/ellis/Documents/open-source-app-kittie/CONTEXT.md`
- `/Users/ellis/Documents/open-source-app-kittie/AGENTS.md` — package map
- `/Users/ellis/Documents/open-source-app-kittie/packages/types/src/index.ts` — API contracts
- `/Users/ellis/Documents/open-source-app-kittie/packages/db/src/schema.ts`
- AppKittie reference: https://github.com/AppKittie/aso-mcp-skills (API filter docs in README)

## Your scope

| Path | What |
|------|------|
| `packages/intelligence/**` | Revenue model, growth scoring, keyword difficulty, trend detection |
| `packages/api/**` | Hono REST server |
| `apps/mcp/**` | MCP server (`search_apps`, `get_app_detail`, keyword tools) |
| `apps/cli/**` | `kittie search`, `kittie trends`, `kittie detail <id>` |
| `apps/web/**` | Minimal dashboard — app table, growth sort, detail drawer |

Do NOT edit `packages/ingest/**` (Session 2).

## Intelligence — estimation approach (v1 heuristics)

Revenue/download estimates don't need ML on day one:

```
base_revenue = category_benchmark[category] * rank_decay(chart_rank)
adjustments:
  + review_velocity_bonus (reviews growing fast → multiplier)
  + iap_count_bonus (more IAPs → higher ceiling)
  + ad_activity_bonus (has Meta ads → likely spending on UA → revenue proxy)
```

Growth score:
```
growth_score = weighted(
  review_delta_7d,
  rank_delta_7d,      # negative rank change = climbing
  ad_creative_count_delta,
  update_recency
)
```

First-mover flag: `growth_score > threshold AND category_app_count < saturation_threshold AND released_within_90d`

Keyword difficulty (v1): count of apps ranking in top 10 for keyword + avg review count of those apps.

## API endpoints (mirror AppKittie)

| Route | Notes |
|-------|-------|
| `GET /api/v1/apps` | Filter + sort + cursor pagination |
| `GET /api/v1/apps/:id` | Full detail + related ads, creators, IAPs |
| `GET /api/v1/apps/:id/historicals` | Snapshot time series |
| `GET /api/v1/keywords/difficulty` | Single keyword |
| `POST /api/v1/keywords/difficulty` | Batch ≤10 |
| `POST /api/v1/reviews` | Fetch reviews (from DB cache, trigger ingest if stale) |

No auth/credits for v1 (local OSS tool). Add API keys later if needed.

## MCP tools (match AppKittie names for skill compatibility)

- `search_apps` — wraps `GET /api/v1/apps`
- `get_app_detail` — wraps detail endpoint
- `get_keyword_difficulty` / `batch_keyword_difficulty`
- `get_supported_countries` — return static list

Reference MCP source: https://github.com/AppKittie/aso-mcp-skills/tree/main/src

## Suggested start order

1. `packages/intelligence` — growth score + revenue heuristic (unit test with fixture data)
2. `packages/api` — Hono server, mock data first if Session 2 not ready
3. `apps/cli` — fastest way to verify end-to-end
4. `apps/mcp` — stdio MCP server wrapping API
5. `apps/web` — Next.js or Vite + table (last priority)

## Exit criteria

```bash
pnpm dev:api          # API on :3000
curl "localhost:3000/api/v1/apps?sortBy=growth&limit=10"
pnpm dev:mcp          # MCP responds to search_apps
pnpm kittie trends    # CLI prints top movers
```

## Running state

- API port: 3000 (default)
- Session 2 may not have data yet — build with fixture/mock, swap to real DB queries when ready

## Open questions

- Web framework: Next.js vs Vite — pick fastest path, don't bikeshed
- Whether to fork AppKittie's agent skills into `.cursor/skills/` for this repo

## Pick up here

1. `cd /Users/ellis/Documents/open-source-app-kittie && pnpm install`
2. Implement `packages/intelligence/src/growth.ts` + `revenue.ts`
3. Scaffold `packages/api` with Hono + Drizzle queries
4. CLI smoke test before MCP or web
