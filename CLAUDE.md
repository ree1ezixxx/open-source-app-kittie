# CLAUDE.md — Open Source App Kittie (the Kittie clone)

Independent, open-source mobile-app intelligence platform. AppKittie-inspired feature set; **no dependency on AppKittie's paid API**.

## Mission

Surface profitable, fast-moving iOS + Android apps: revenue/download estimates, trend signals, ad intelligence, creator partnerships, ASO keywords, reviews — with first-mover trend detection. Not commercial (for now). Ship fast: **days, not months**.

## Canonical UI (single source of truth — do NOT introduce competing designs)

The **one** direction is the **light-mode "App Teardown"** design:
- **Light theme by default** (`apps/web/src/lib/theme.ts`); dark stays available via the toggle.
- Signature view = **App Teardown canvas** — an app's intelligence exploded onto a pannable react-flow node graph (`apps/web/src/components/teardown/`), reached from each app's detail page via the **Classic ⇄ Teardown** toggle.
- **Run it:** `pnpm dev:web` + `pnpm dev:api`. Canonical ports: **web `5175`, API `3008`** (pinned in `apps/web/vite.config.ts`; web proxies `/api` → `3008`; override API origin with `VITE_API_ORIGIN`).
- **Web localhost is ALWAYS `:5175`. Never `:5173`.** `strictPort:false` only falls back if 5175 is genuinely occupied — never by choice. See another port → a stray server holds 5175: kill it, re-run on 5175.
- **Do NOT build or revive other design directions** — the "App Canvas" hub-and-spoke, the "Exponential UI" redesign, any alternative shell. Deprecated. A fresh visual exploration must be an explicit, separate decision.

## Communication

Ultra-compression — say the minimum that conveys the answer. Lead with the verdict.
- **Clear over clever; no filler.** Plain language; no recaps, hedges, or diff narration.
- **Bullets > essays.** Expand only when asked or the task requires it.
- **Simplest correct approach.** Refuse needless complexity, theory, option menus.

## Source of Truth (cross-check ALL clone work against this)

- **Source of truth = the LIVE site `https://www.appkittie.com`**; dashboard root `…/dashboard/explore`. Clone view-by-view, one lane per surface: `/dashboard/{explore,ads,organic,highlights}` + the rest of the left-nav (Trending, Rising, ASO, Reviews, Hot Ideas, …).
- **Cross-check the clone's localhost against the matching truth URL by path** (not label) — structure, data shape, behaviour, visuals.
- **Audit live, not from memory:** drive `appkittie.com` via the Chrome DevTools MCP and **exercise real functionality** (dropdowns, filters, paginate, sort, hover, click rows) — not just static structure. Compare truth ↔ clone ↔ gaps, per page.
- **Truth browser (zero-touch, don't ask Rhodri):** `bash coordinator/truth-chrome.sh` → Chrome debug port **9222**, persistent profile `~/.kittie-truth-chrome` (logged in, survives reboots; no-ops if already up). Attach: `list_pages` → `select_page`; never `new_page` first.
- Only if the live page redirects to login (session truly expired) → STOP and ask Rhodri to sign in once; never guess.
- Staged `TRUTH-*.snapshot.txt` / `coordinator/.cache/*-truth.txt` dumps are a point-in-time cache only — the live site wins on conflict.

## Clone Fidelity Score (HARD GATE — every cloned page/feature)

- Score each cloned surface **/5** for visual + behavioural fidelity to LIVE truth, side-by-side in the truth browser.
- **Minimum = 4/5. ≤3 is NOT a deliverable** — keep iterating (re-inspect truth → fix → re-score) until ≥4. Three rounds isn't a finish line, ten isn't too many. Always state the score.
- **Only stop below 4 on a hard EXTERNAL blocker** (third-party key/approval or unobtainable data, e.g. Meta/TikTok/Instagram ad ingest). Then report the blocker, current score, and what unblocks it. Internal effort is never a reason to ship a 3.
- Rubric: **5** indistinguishable · **4** minor cosmetic deltas, all function correct · **3** structural/behavioural gaps (REJECTED) · **≤2** missing features / wrong data (REJECTED).

## Read First

| File | When |
|------|------|
| `CONTEXT.md` | Domain terms — read before naming types or APIs |
| `docs/glossary/<view>.md` | Per-view glossary (coordinator merges into CONTEXT.md) |
| `docs/adr/` | Past architectural decisions (0001–0011) |
| `docs/perf/latency-log.md` | Why the `/apps` query is shaped the way it is |
| `HANDOFF-<view>.md` (per worktree) | Picking up a lane mid-flight — scope, ports, DoD |

## Stack

- **pnpm** monorepo (never `npm` / `npx`); **TypeScript** everywhere.
- **Drizzle ORM** + SQLite/libsql — schema in `packages/db` (migrations → `data/kittie.db`).
- **Hono** REST API (`packages/api`); **Vite + React** web (`apps/web`).

## Package Map

```
packages/types, db, core      — shared foundation (types = cross-lane contract)
packages/ingest               — collectors (apple/google/meta) + snapshot jobs + scheduler
packages/intelligence         — scoring, revenue/download models, DecisionPacket builder
packages/api                  — Hono REST server (routes + services)
packages/build-context, clone-engine, visual, billing — L-series engines (aux/parked)
apps/web, apps/cli, apps/mcp, apps/eval               — surfaces
```

Schema changes go through `packages/db` ONLY. New column needed → note it in `docs/schema-requests.md` first.

## Performance (don't re-derive — read the log)

Cold `/apps` latency was cut via keyset (seek) pagination `(sortValue, app_id)` + LIMIT, FTS5 search (`apps_fts` MATCH/bm25), and precomputed revenue/downloads on snapshot rows (gated by `revenueColumnReady`) — not by materialising a row pool. Full experiment log + planner gotchas (ANALYZE regressions, `coalesce` defeating indexes, NULL-sink semantics) in `docs/perf/latency-log.md`. Verify parity with `scripts/capture-pages.mjs` + `scripts/bench-cold.mjs` before changing the query path.

## Worktree Lanes

- **One lane per surface**, own branch off `main`, own worktree (`feat/ads`, `feat/organic`, …), own web/API port pair (see its `HANDOFF`).
- **Don't cross-edit another lane's owned paths.** `packages/types` is the contract.
- `main` is **branch-protected** (required check `check`). Land via **PR → main** when verified + CI green — never push `main` directly.

## Parallel Lanes — Chrome Isolation (evergreen)

The Chrome DevTools MCP drives ONE browser instance; two agents on the same Chrome collide. So each parallel lane gets its **own Chrome on its own debug port + profile** (all lanes may open the same truth URL — reading a public page never conflicts; the collision is the instance).
- **Slot → port:** primary = slot 0 → 9222 (global MCP + `~/.kittie-truth-chrome`); lane N → 9222+N, profile `~/.kittie-chrome-laneN`.
- **Per-lane setup (once):** `bash coordinator/lane-chrome.sh <slot>` (idempotent; seeds the profile from truth so it inherits the login). Bind the MCP via an **untracked `.mcp.json`** at the worktree root pointing `chrome-devtools` at `--browserUrl=http://127.0.0.1:<port>`. Confirm with `list_pages` it's this lane's port. Login screen → STOP, ask Rhodri once.
- **Stable-slot principle:** worktree *dirs* are permanent slots; rotate the *branch* inside them. Same dir/port/`.mcp.json` survive every section; only the branch + handoff change.

## Subagents & Token Efficiency

- **No agent fan-outs by default** — build sequentially; token cost beats wall-clock. Fan out only on explicit opt-in (`/code-review`, a workflow).
- **Subagents return summaries only**, never raw file contents. **3+ file reads → delegate.** Haiku for text-heavy research only; judgement (code/builds/design) stays Sonnet/Opus.
- **One objective per thread**; scope creep → stop and narrow. **Targeted edits**; full-file `Write` only at >60% change. **No narrating diffs.** Durable decisions → `CONTEXT.md` or `docs/adr/`.

## Honest Data

- **Never fabricate.** Blocked/empty source (e.g. Meta ads) → empty-state, not fake rows.
- Estimates (downloads/revenue) are **modelled** and labelled as such — never ground truth.
- The honesty contract is typed: wrap fielded data in `Provenanced<T>` and strategic outputs in `DecisionPacket` (`packages/types`) — coverage/confidence/freshness must trace to real evidence, never an invented score.

## Secrets

All keys in `.env` (never committed). `.env.example` documents required vars with placeholders only.

## Commands

```bash
pnpm install        # if db:migrate fails: cd node_modules/.pnpm/better-sqlite3@*/node_modules/better-sqlite3 && npm run build-release
mkdir -p data
pnpm db:generate    # drizzle generate
pnpm db:migrate     # apply migrations → data/kittie.db
pnpm typecheck      # build all packages, then tsc --noEmit
```

## Validation

- `pnpm typecheck` must pass before handoff (builds first — workspace packages resolve from `dist/`).
- **UI changes:** QA against truth in a real browser — build-green ≠ feature-correct.
- Ingest: log row counts, not payloads. API: curl smoke tests in package READMEs.

## AppKittie Reference (not a dependency)

Their MIT [aso-mcp-skills](https://github.com/AppKittie/aso-mcp-skills) wraps their **paid** API. We mirror their **API shape** where useful (`/api/v1/apps` filters, growth windows) but source data ourselves.

## Non-Goals (v1)

- Paid billing / credit system
- 2M-app day-one coverage (grow catalog incrementally)
- Meta ad ingestion until Facebook ID verification clears (empty-state meanwhile)
