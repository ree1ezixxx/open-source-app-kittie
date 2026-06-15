# CLAUDE.md — Open Source App Kittie (the Kittie clone)

Independent, open-source mobile app intelligence platform. AppKittie-inspired feature set; **no dependency on AppKittie's paid API**.

## Mission

Surface profitable, fast-moving apps across iOS and Android: revenue estimates, download trends, ad intelligence, creator partnerships, ASO keywords, and reviews — with first-mover trend detection.

Not a commercial product (for now). Ship fast: **days, not months**.

## Communication

Ultra compression — say the minimum that conveys the answer.

- **Clear over clever.** Plain language beats jargon, metaphors, and throat-clearing.
- **No verbosity or filler.** Don't pad to sound smart. No recaps, hedge stacks, or diff narration.
- **Brevity by default.** Lead with the answer. A few bullets beat an essay. Expand only when asked or the task requires it.
- **Simplify always.** Refuse unnecessary complexity. Prefer the simplest correct approach; skip theory, option menus, and layers nobody needs.

## Source of Truth (cross-check ALL clone work against this)

- **The clone target / source of truth is `https://www.appkittie.com`.**
- Dashboard root: **`https://www.appkittie.com/dashboard/explore`**. We clone the site view-by-view
  through separate git worktrees (one lane per surface), navigating each view as we go:
  - `/dashboard/explore` — apps database (root dashboard)
  - `/dashboard/ads` — Meta Ad Library
  - `/dashboard/organic` — creator/organic videos
  - `/dashboard/highlights` — New Big Hits / Top Gainers / Losers
  - …and the rest of the left-nav (Trending, Rising, ASO, Reviews, Hot Ideas, etc.)
- **Cross-check the clone's localhost against the matching truth URL by path** (compared by path, not
  label) to confirm structure, data shape, behaviour, and visuals.
- A separate **coordinator** owns the live browser and QAs each worktree against truth. Build agents do
  **not** drive a browser; staged `TRUTH-<view>.snapshot.txt` a11y dumps live in each worktree for
  offline cross-checking.

## Read First

| File | When |
|------|------|
| [CONTEXT.md](./CONTEXT.md) | Domain terms — read before naming types or APIs |
| `docs/glossary/<view>.md` | Per-view glossary fragments (coordinator merges into CONTEXT.md) |
| `HANDOFF-<view>.md` (per worktree) | Picking up a lane mid-flight — scope, ports, DoD |

## Stack

- **pnpm** monorepo (never `npm` / `npx`)
- **TypeScript** everywhere
- **Drizzle ORM** + SQLite (local dev) — schema in `packages/db`
- **Hono** REST API — `packages/api`
- Collectors in `packages/ingest`; scoring/models in `packages/intelligence`
- Surfaces: `apps/web` (Vite + React), `apps/cli`, `apps/mcp`

## Package Map

```
packages/types, packages/db, packages/core   — shared foundation
packages/ingest                              — collectors + snapshot jobs
packages/intelligence                        — scoring + estimation models
packages/api                                 — REST server
apps/web, apps/cli, apps/mcp                 — surfaces
```

Schema changes go through `packages/db` only. If ingest or API work needs a new column, note it in
`docs/schema-requests.md` first.

## Worktree Lanes

- **One lane per surface**, each on its own branch off `main`, in its own worktree (`feat/ads`,
  `feat/highlights`, `feat/ingest`, `feat/organic`, `feat/keywords`, …).
- Each lane runs its **own web/API port pair** — see its `HANDOFF`. Don't assume default ports.
- **Do not cross-edit another lane's owned paths.** Shared types in `packages/types` are the contract.
- `main` is **branch-protected** (required status check `check`). Land a lane via **PR → main** once it's
  verified and CI is green — never push to `main` directly.

## Subagents & Token Efficiency

- **No agent fan-outs by default** — build sequentially; token cost beats wall-clock. Fan out only when
  the user explicitly opts in (e.g. `/code-review`, a workflow).
- **Subagents return summaries only**, never raw file contents.
- **3+ file reads → delegate to a subagent.** Haiku subagents for text-heavy research only; anything
  needing judgement (code, builds, design) stays on Sonnet/Opus.
- **One objective per thread.** If scope creeps, stop and narrow.
- **Targeted edits** during iteration — full-file `Write` only when >60% changes.
- **No narrating diffs.** State what to verify, then stop. Durable decisions → `CONTEXT.md` or `docs/adr/`.

## Honest Data

- **Never fabricate.** Source blocked or empty (e.g. Meta ads) → empty-state, not fake rows.
- Estimates (downloads/revenue) are modelled and labelled as such — never presented as ground truth.

## Secrets

- All keys in `.env` (never committed). `.env.example` documents required vars with placeholders only.

## Commands

```bash
pnpm install          # root — if db:migrate fails, rebuild: cd node_modules/.pnpm/better-sqlite3@*/node_modules/better-sqlite3 && npm run build-release
mkdir -p data
pnpm db:generate      # drizzle generate
pnpm db:migrate       # apply migrations → data/kittie.db at repo root
pnpm typecheck        # build all packages, then tsc --noEmit
```

## Validation

- `pnpm typecheck` must pass before handoff (runs `build` first — workspace packages resolve from `dist/`).
- **UI changes:** the coordinator QAs against truth on a real browser — build-green ≠ feature-correct.
- Ingest jobs: log row counts, not full payloads. API: curl smoke tests in package READMEs.

## AppKittie Reference (not a dependency)

Their open-source [aso-mcp-skills](https://github.com/AppKittie/aso-mcp-skills) repo is MIT but wraps
their **paid** API. We mirror their **API shape** where useful (`/api/v1/apps` filters, growth windows)
but source data ourselves.

## Non-Goals (v1)

- Paid billing / credit system
- 2M-app day-one coverage (grow catalog incrementally)
- Meta ad ingestion until Facebook ID verification clears (defer; empty-state meanwhile)
