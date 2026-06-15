# Session Handoff — Foundation requests from Session 3 (Intelligence + Surface)

## Where it started

Foundation shipped DB read layer + score-on-write. API reads real data when `data/kittie.db` has apps. A minimal web table exists on the intelligence worktree. Rhodri will iterate UI from foundation; Session 3 owns API/surfaces polish and must stay wired to the shared DB.

**Your worktree:** `/Users/ellis/Documents/open-source-app-kittie-intelligence` — branch `feat/intelligence-surface`

**Shared DB:** `/Users/ellis/Documents/open-source-app-kittie/data/kittie.db` (copy or symlink `.env` `DATABASE_URL=file:../open-source-app-kittie/data/kittie.db`)

## What foundation needs from you

### P0 — UI can ship (you or Rhodri on web)

- **`pnpm dev:api`** on `:3000` — serves `/api/v1/apps`, `/:id`, `/:id/historicals`
- **`pnpm dev:web`** on `:5173` — Vite proxies `/api` → `:3000`
- Web must use **live DB** (not mocks) when `countApps > 0` — already in `app-service.ts`

### P0 — UI features foundation expects API to support

| UI need | API |
|---------|-----|
| App table sorted by growth/revenue | `GET /api/v1/apps?sortBy=growth&limit=50` |
| Search "sobriety" | `GET /api/v1/apps?search=sobriety&sortBy=revenue` |
| Detail drawer | `GET /api/v1/apps/:id` |
| Revenue chart | `GET /api/v1/apps/:id/historicals` (needs 2+ snapshot days from Session 2) |

### P1 — Web polish (`apps/web/src/App.tsx` exists)

- Search input → `search` query param
- Sort toggle (growth / revenue / reviews)
- Historical revenue mini-chart in detail drawer
- AppKittie-like layout (filters sidebar can be P2)

### P2 — Not blocking UI

- CLI (`apps/cli`) — `pluto trends`, `pluto search`
- MCP (`apps/mcp`) — `search_apps`, `get_app_detail`
- Keyword routes — `/api/v1/keywords/difficulty`

## Decisions locked

- API returns **precomputed** snapshot scores when present; falls back to live `scoreApp` only if null.
- Do **not** duplicate scoring logic in web — consume API only.
- Do **not** edit `packages/ingest/**` — Session 2 owns collectors.

## Key files

- `/Users/ellis/Documents/open-source-app-kittie-intelligence/apps/web/src/App.tsx` — current table + drawer
- `/Users/ellis/Documents/open-source-app-kittie-intelligence/packages/api/src/services/db-app-service.ts` — DB queries
- `/Users/ellis/Documents/open-source-app-kittie-intelligence/packages/api/src/routes/apps.ts` — routes
- `/Users/ellis/Documents/open-source-app-kittie-intelligence/apps/web/vite.config.ts` — API proxy

## Verification

```bash
cd /Users/ellis/Documents/open-source-app-kittie-intelligence
pnpm install
pnpm dev:api &
curl -s "http://localhost:3000/api/v1/apps?sortBy=revenue&limit=3" | head -c 500
```

```bash
pnpm dev:web
# Open http://localhost:5173 — table should show ~283 apps with revenue column
```

## Pick up here

Confirm API + web run against shared `kittie.db`. Add search + historical chart to `App.tsx`.
