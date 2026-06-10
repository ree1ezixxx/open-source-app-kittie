# Session Handoff — Session 3 pause (Intelligence + Surface)

## Where it started

Build AppKittie-clone **Session 3**: scoring models, REST API, CLI (`pluto`), MCP, minimal web UI. Work isolated to a dedicated worktree so `feat/foundation` stays clean for Session 1.

## Decisions locked + what shipped

- **Worktree split** — Session 3 on `feat/intelligence-surface` at `/Users/ellis/Documents/open-source-app-kittie-intelligence`; foundation stripped of API/intelligence/apps in `e398553`
- **DB → API → UI** — API reads `data/kittie.db` when apps exist; scores from precomputed snapshot columns or live `@kittie/intelligence`
- **CLI renamed** — `pnpm pluto` (not `kittie`)
- **Shared DB** — `data/` symlink → `/Users/ellis/Documents/open-source-app-kittie/data/kittie.db`
- **Handoffs for other sessions** — `2026-06-07-session-3-handoff-to-foundation.md` committed for Session 1

## Key files for next session

- `/Users/ellis/Documents/open-source-app-kittie-intelligence/docs/session-handoffs/WORKTREE.md` — worktree map
- `/Users/ellis/Documents/open-source-app-kittie-intelligence/packages/api/src/services/db-app-service.ts` — DB + scoring
- `/Users/ellis/Documents/open-source-app-kittie-intelligence/apps/web/src/App.tsx` — web table + drawer (P1 polish here)
- `/Users/ellis/Documents/open-source-app-kittie-intelligence/docs/session-handoffs/2026-06-07-foundation-needs-from-session-3.md` — P0/P1 checklist from foundation

## Worktree layout

| Path | Branch | Owner |
|------|--------|-------|
| `/Users/ellis/Documents/open-source-app-kittie` | `feat/foundation` | Session 1 |
| `/Users/ellis/Documents/open-source-app-kittie-ingest` | `feat/ingest` | Session 2 |
| `/Users/ellis/Documents/open-source-app-kittie-intelligence` | `feat/intelligence-surface` | **Session 3 — work here** |

Latest commit: `1e2e109` — docs handoff for foundation integration.

## Running state

- Background processes: none (API on `:3000` may conflict with other local apps — use `PORT=3001` if needed)
- Dev servers: not running
- Open worktrees: all three above

## Verification — confirm things still work

```bash
cd /Users/ellis/Documents/open-source-app-kittie-intelligence
pnpm install
pnpm dev:api
# other terminal:
curl -s "http://localhost:3000/api/v1/apps?sortBy=growth&limit=3"
pnpm pluto trends
pnpm dev:web   # http://localhost:5173
```

## Done (P0)

- [x] `packages/intelligence` — growth, revenue, keyword heuristics
- [x] `packages/api` — Hono, filters, DB path + mock fallback
- [x] `apps/cli` — `pluto search|trends|detail`
- [x] `apps/mcp` — stdio tools (not verified in Cursor config)
- [x] `apps/web` — growth-sorted table + detail drawer
- [x] ~283 real apps from shared SQLite

## Not done — pick up here (P1)

1. **Web search** — input bound to `?search=` API param
2. **Web sort toggle** — growth / revenue / reviews
3. **Historical mini-chart** in detail drawer (blocked until Session 2 runs daily `ingest:snapshot` — need 2+ days per app)
4. **MCP** — add to Cursor, smoke-test `search_apps`
5. **API cache** — `db-app-service.ts` caches scored rows until restart; invalidate after ingest or add TTL

## Blocked on Session 2 (not Session 3 code)

- Meaningful growth score spread (currently flat-ish — one snapshot per app)
- `hasMetaAds` / creators filters (empty tables)
- Reviews + keyword difficulty from real data

## Blocked on Session 1 (when integrating)

- Merge `feat/intelligence-surface` → `feat/foundation` (or cherry-pick `packages/db` scoring into foundation)
- Session 1 reads: `docs/session-handoffs/2026-06-07-session-3-handoff-to-foundation.md`

## Git note

Commits on `feat/intelligence-surface` are visible locally to all worktrees without push. Push only when you want remote/another machine.

## Pick up here

Open `/Users/ellis/Documents/open-source-app-kittie-intelligence`, run verification above, then start P1 web polish in `apps/web/src/App.tsx` — or wait for Session 2 snapshots before the historical chart is useful.
