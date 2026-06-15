# Session 3 worktree

| | |
|---|---|
| **Path** | `/Users/ellis/Documents/open-source-app-kittie-intelligence` |
| **Branch** | `feat/intelligence-surface` |
| **Scope** | `packages/intelligence`, `packages/api`, `apps/cli` (pluto), `apps/mcp`, `apps/web` |

## Sibling worktrees

| Path | Branch | Session |
|------|--------|---------|
| `/Users/ellis/Documents/open-source-app-kittie` | `feat/foundation` | 1 — schema, types, db, core |
| `/Users/ellis/Documents/open-source-app-kittie-ingest` | `feat/ingest` | 2 — ingestion |
| This directory | `feat/intelligence-surface` | 3 — scoring, API, surfaces |

## Shared data

`data/` symlinks to `/Users/ellis/Documents/open-source-app-kittie/data` (shared SQLite).

## Commands

```bash
pnpm dev:api
pnpm dev:web
pnpm pluto trends
pnpm typecheck
```
