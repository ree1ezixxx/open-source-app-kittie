# AGENTS.md — Open Source App Kittie

Independent, open-source mobile app intelligence platform. AppKittie-inspired feature set; **no dependency on AppKittie's paid API**.

## Mission

Surface profitable, fast-moving apps across iOS and Android: revenue estimates, download trends, ad intelligence, creator partnerships, ASO keywords, and reviews — with first-mover trend detection.

Not a commercial product (for now). Ship fast: **days, not months**.

## Read First

| File | When |
|------|------|
| [CONTEXT.md](./CONTEXT.md) | Domain terms — read before naming types or APIs |
| [docs/session-handoffs/](./docs/session-handoffs/) | Optional context when picking up a workstream mid-flight |

## Stack

- **pnpm** monorepo (never `npm` / `npx`)
- **TypeScript** everywhere
- **Drizzle ORM** + SQLite (local dev) — schema in `packages/db`
- **Hono** REST API — `packages/api`
- Collectors in `packages/ingest`
- Scoring/models in `packages/intelligence`
- Surfaces: `apps/web`, `apps/cli`, `apps/mcp`

## Package Map

```
packages/types, packages/db, packages/core   — shared foundation
packages/ingest                              — collectors + snapshot jobs
packages/intelligence                        — scoring + estimation models
packages/api                                 — REST server
apps/web, apps/cli, apps/mcp                 — surfaces
```

Schema changes go through `packages/db` only. If ingestion or API work needs a new column, note it in `docs/schema-requests.md` first.

### Branching

Each Cursor instance works on its own branch off `main`:

| Branch | Focus |
|--------|-------|
| `feat/foundation` | `packages/types`, `packages/db`, `packages/core`, root tooling |
| `feat/ingest` | `packages/ingest` |
| `feat/intelligence` | `packages/intelligence`, `packages/api`, `apps/*` |

Merge to `main` when a slice is verified. Do not cross-edit another branch's owned paths.

## Context Management (Token Efficiency)

- **One objective per thread.** If scope creeps, stop and narrow before continuing.
- **Read `CONTEXT.md` once** at session start — do not re-paste domain definitions into chat.
- **Subagents for 3+ file reads.** Return summaries only, never raw dumps.
- **Targeted edits** during iteration — no full-file rewrites unless >60% changes.
- **No narrating diffs.** State what to verify, then stop.
- Durable decisions → `CONTEXT.md` or `docs/adr/`. Chat is ephemeral.

## Secrets

- All keys in `.env` (never committed).
- `.env.example` documents required vars with placeholders only.

## Commands

```bash
pnpm install          # root — if db:migrate fails, rebuild: cd node_modules/.pnpm/better-sqlite3@*/node_modules/better-sqlite3 && npm run build-release
mkdir -p data
pnpm db:generate      # drizzle generate
pnpm db:migrate       # apply migrations → data/kittie.db at repo root
pnpm typecheck        # all packages
```

## Validation

- `pnpm typecheck` must pass before handoff.
- Ingestion jobs: log row counts, not full payloads.
- API: curl smoke tests documented in package READMEs.

## AppKittie Reference (not a dependency)

Their open-source [aso-mcp-skills](https://github.com/AppKittie/aso-mcp-skills) repo is MIT but wraps their **paid** API. We mirror their **API shape** where useful (`/api/v1/apps` filters, growth windows) but source data ourselves.

## Non-Goals (v1)

- Screenshot generator (design tool — defer)
- Paid billing / credit system
- 2M-app day-one coverage (grow catalog incrementally)
