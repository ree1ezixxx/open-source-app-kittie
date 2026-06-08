# AGENTS.md — Open Source App Kittie

Independent, open-source mobile app intelligence platform. AppKittie-inspired feature set; **no dependency on AppKittie's paid API**.

## Mission

Surface profitable, fast-moving apps across iOS and Android: revenue estimates, download trends, ad intelligence, creator partnerships, ASO keywords, and reviews — with first-mover trend detection.

Not a commercial product (for now). Ship fast: **days, not months**.

## Communication

- **Concise and direct.** Lead with the answer or decision. No preamble, no recap of what the user just said.
- **Short by default.** A few sentences or bullets beat a essay. Expand only when the user asks or the task genuinely needs it.
- **No filler.** Cut throat-clearing ("Great question", "Let me break this down"), hedge stacks, and repeated explanations of the same point.
- **Don't overcomplicate.** Prefer the simplest correct approach. Skip theory, analogies, and option menus unless a real fork needs a decision.
- **Punctual.** State what changed or what to do next. Skip "What changed" diff narration — the user can see the diff.
- **Clear over clever.** Plain language. One idea per sentence.

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

## Bulk App Ingestion — Runbook (read before re-running)

Growing the catalog toward AppKittie's ~2M. Pull **directly from Apple's free APIs** (genre-RSS charts + iTunes Search + Lookup) — never scrape AppKittie's UI. Pipeline: `packages/ingest/src/apple/discover.ts` + `jobs/bulk-seed.ts` (idempotent `upsertApp`/`upsertSnapshot`).

**Run it (turnkey):**
```bash
cd packages/ingest
TARGET=10000 DATABASE_URL=file:/Users/ellis/Documents/open-source-app-kittie/data/kittie.db \
  pnpm exec tsx src/jobs/bulk-seed.ts
```
The explicit `DATABASE_URL` is the **shared** DB every lane's API reads — confirm the running API has *that* file open (`lsof -p <:3007 pid> | grep .db`), don't trust the default path resolution.

**Gotchas that bit us once — don't repeat (this is the "no more manual reloads" list):**
1. **After a reseed, the API still serves the OLD count.** `db-app-service.ts` caches scored rows in-memory with **no TTL**. It runs under `tsx watch`, so reload it by making a **content edit** to any `packages/api/src` file. **`touch`/mtime alone does NOT trigger the watcher** — it must be a real content change.
2. **An app only appears once it has a snapshot row** (`listSnapshotContexts` skips snapshot-less apps). bulk-seed writes one per app, so this is handled — but any other insert path must also write a snapshot.
3. **GROWTH 7D / Trending / Rising need day-over-day snapshots.** Running bulk-seed 10× in one day adds apps but growth stays flat (all snapshots share today's date). To populate growth, run on **successive days** (or run `jobs/snapshot.ts` daily). This is a time-series requirement, not a missing field.
4. **The `rss.applemarketingtools.com` feed (old `seed.ts`) is failing.** Use genre-RSS (`itunes.apple.com/<cc>/rss/<feed>/limit/genre/json`) + Search — already wired in `discover.ts`.
5. **Read-path is N+1** (per-app `countAppsInCategory` etc. in `signals.ts`) → first load after a reload is slow and gets worse with N. **Must be optimized (batch the per-app queries) before scaling past ~50K.**

**Data completeness vs AppKittie's Database table (audited 2026-06-08):** their row = #·app·category·growth7d·rating·reviews·downloads·MRR·released·last-update·view. We capture **every underlying field** — rating/reviews from Lookup, downloads/revenue/growth **modeled at read-time** by `intelligence`, category/dates/icon/screenshots/description/price/contentRating/languages from Lookup. Not missing fundamental data. ~7% of apps legitimately have 0 US ratings (Apple returns 0 — not our bug).

**Forward-compat — capture-now-or-refetch-2M-later:** Apple Lookup also returns fields we currently drop. To avoid re-fetching the whole catalog later, file a `docs/schema-requests.md` entry for `feat/foundation` to add columns for: **trackViewUrl** (App Store listing URL, for the View action), **version**, **fileSizeBytes**, **minimumOsVersion**, **primaryGenreId**, **price currency**. Then map them in `apple/lookup.ts` + `db/apps.ts`. Cheap now, expensive across 2M later.

## AppKittie Reference (not a dependency)

Their open-source [aso-mcp-skills](https://github.com/AppKittie/aso-mcp-skills) repo is MIT but wraps their **paid** API. We mirror their **API shape** where useful (`/api/v1/apps` filters, growth windows) but source data ourselves.

## Non-Goals (v1)

- Screenshot generator (design tool — defer)
- Paid billing / credit system
- 2M-app day-one coverage (grow catalog incrementally)
