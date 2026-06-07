# UI worktree — `feat/ui`

**Path:** `/Users/ellis/Documents/open-source-app-kittie-ui`  
**Branch:** `feat/ui` (from `feat/intelligence-surface`)

## Scope

**Only `apps/web/**`** — dashboard design and iteration. AppKittie-style table, search, detail drawer, charts.

Do not edit `packages/ingest`, `packages/db/schema`, or ingestion jobs.

## Stack

```bash
pnpm dev:api   # :3000
pnpm dev:web   # :5173
```

DB: `data/` → symlink to `../open-source-app-kittie/data/kittie.db`

## Sibling worktrees

| Path | Branch | Owns |
|------|--------|------|
| `open-source-app-kittie` | `feat/foundation` | schema, types, core |
| `open-source-app-kittie-ingest` | `feat/ingest` | collectors, snapshots |
| `open-source-app-kittie-intelligence` | `feat/intelligence-surface` | API, MCP, pluto, intelligence |
| **this** | `feat/ui` | **web dashboard only** |

## P0

- Search + sort controls
- AppKittie-like layout polish
- Detail drawer
- Revenue historical chart (needs 2+ snapshot days from ingest)
