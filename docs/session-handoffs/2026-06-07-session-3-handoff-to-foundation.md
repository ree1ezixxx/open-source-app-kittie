# Session Handoff — Session 3 → Foundation (Session 1)

## Branch and worktree

| | |
|---|---|
| **Branch** | `feat/intelligence-surface` |
| **Worktree** | `/Users/ellis/Documents/open-source-app-kittie-intelligence` |
| **Foundation branch** | `feat/foundation` at `/Users/ellis/Documents/open-source-app-kittie` |

## What Session 3 shipped (on `feat/intelligence-surface`)

- `packages/intelligence` — growth/revenue/keyword heuristics
- `packages/api` — Hono REST, reads SQLite when `apps` table non-empty (mock fallback otherwise)
- `packages/db` additions — `enrichSnapshotScores`, `detail.ts` queries, `countApps` (not on `feat/foundation` after isolation)
- `apps/cli` — **`pluto`** (`pnpm pluto trends|search|detail`)
- `apps/mcp` — stdio MCP wrapping API
- `apps/web` — Vite table + detail drawer, proxies `/api` → `:3000`
- `data` symlink → `/Users/ellis/Documents/open-source-app-kittie/data/kittie.db`

## What foundation (`feat/foundation`) has now

Schema, types, core, ingest stub only. Session 3 packages removed in `e398553` to avoid cross-session contamination.

## For Session 1 to continue

```bash
git log feat/intelligence-surface --oneline -5   # no push required — same local repo
```

When integrating: merge `feat/intelligence-surface` into `feat/foundation` (or cherry-pick `packages/db` scoring if foundation should own shared DB helpers).

## P0 done / P1 remaining (Session 3)

- Done: API + DB wiring, basic web table, pluto CLI, MCP scaffold
- Next: web search input, sort toggle, historical chart (needs 2+ snapshot days from Session 2)

## Sibling worktrees

- Session 2: `/Users/ellis/Documents/open-source-app-kittie-ingest` — `feat/ingest`
