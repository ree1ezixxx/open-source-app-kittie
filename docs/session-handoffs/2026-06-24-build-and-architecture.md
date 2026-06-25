# Handoff — Open Source App Kittie: current build + full architecture

**Date:** 2026-06-24
**Repo:** `/Users/ellis/Documents/open-source-app-kittie` (primary) — the AppKittie clone, an independent open-source mobile-app intelligence platform.
**Purpose of this doc:** snapshot the current build state and the full architecture so a fresh agent can orient instantly. No active task was in flight in the originating session — this is a reference handoff, not a mid-task pickup.

> Don't duplicate the canon. Read these first, this doc only stitches them together:
> - `CLAUDE.md` (project root) — mission, canonical UI, truth-clone rules, fidelity gate, ports.
> - `CONTEXT.md` — domain terms (read before naming types/APIs).
> - `docs/adr/0001…0011` — the load-bearing technical decisions (see map below).
> - `README.md`, `AGENTS.md` — package map + agent rules.

---

## Current build state

- **Active worktree for this session:** `/Users/ellis/Documents/open-source-app-kittie-workspace` on branch `chore/pin-canonical-port-5175` (HEAD `9302e0a`).
- **Open PRs:**
  - **#144** `chore(web): pin canonical dev port to 5175` — **green** (`check` = SUCCESS), **MERGEABLE**. Trivial: pins web dev server to `:5175` (`strictPort:false`), updates CLAUDE.md ports. Safe to squash-merge. This is the only substantive open non-draft PR.
  - **#95** `ASO App Tracking add-flow and keyword polish` — **DRAFT** (`codex/issue-27-add-flow-polish`).
- **`main` HEAD:** `615f72c` — light-mode "App Teardown" UI made canonical (#143).
- **Uncommitted in workspace:** untracked coordinator tooling only — `coordinator/.govern/`, `coordinator/govern.sh`, `coordinator/govern-watch.sh`, `.td-shots/`. Not part of any PR; leave or gitignore.
- **Canonical run:** `pnpm dev:web` (web **:5175**) + `pnpm dev:api` (API **:3008**). Web proxies `/api` → 3008; override API origin with `VITE_API_ORIGIN`. Teardown canvas: any app → **View** → **Teardown** tab.
- **Validation gate:** `pnpm typecheck` (= `pnpm -r build` then `pnpm -r typecheck`; workspace packages resolve from `dist/`). `main` is branch-protected behind required `check`.

### Live worktree lanes (each its own branch + port pair)
| Worktree dir | Branch | Notes |
|---|---|---|
| `…/open-source-app-kittie` | `codex/issue-27-add-flow-polish` | primary checkout |
| `…/open-source-app-kittie-workspace` | `chore/pin-canonical-port-5175` | this session |
| `…/osk-agent` | `feat/agent-readable-surfaces` | agent-first surfaces (see ADR pivot) |
| `…/osk-ia` | `feat/ia-appdetail` | information-architecture / app-detail |
| `…/osk-visual` | `feat/teardown-visual-polish` | teardown canvas polish |

Dozens of `origin/codex/issue-*` and `origin/feat/*` branches exist (per-surface clone lanes); most are landed or stale. `feat/reviews-parity` vs `fix/explore-apps-oom` historically conflicted on `db-app-service.ts` — see memory `apps-route-ooms-at-catalog-scale`.

---

## Full architecture

**Shape:** pnpm + TypeScript monorepo. Drizzle ORM over SQLite (local `data/kittie.db`; hosted libsql for some rank history — ADR 0002). Hono REST API. Data sourced first-party (Apple/Google scraping + modelled estimates) — **no dependency on AppKittie's paid API**.

### Packages (`packages/*`)
- **`@kittie/types`** — shared TS contracts. The cross-lane interface; lanes must not cross-edit owned paths, only share via types.
- **`@kittie/db`** — Drizzle schema + migrations. **All schema changes go here.** New columns needed by ingest/API → note in `docs/schema-requests.md` first. `pnpm db:generate` / `pnpm db:migrate`.
- **`@kittie/core`** — shared foundation utilities.
- **`@kittie/ingest`** — collectors + snapshot jobs (Apple/Google). Bottleneck is Apple IP rate, not SQLite — parallelize by host, per-host token bucket (memory `ingest-bottleneck-is-apple-ip-not-sqlite`). Snapshot worker is **due-driven and out-of-process** (ADR 0008) so API boot can't OOM (memory `boot-catchup-ooms-the-api`).
- **`@kittie/intelligence`** — scoring + estimation models (revenue/downloads), composite demand signal, decision-packet builder, `synthesizeOpportunity`. Estimates are modelled + labelled, never presented as ground truth.
- **`@kittie/api`** — Hono REST server (:3008). Mirrors AppKittie's API *shape* (`/api/v1/apps` filters, growth windows) over first-party data. Perf-tuned: keyset pagination + revenue precompute (#141), FTS keyset search (#142), index-only filtered count (#140).
- **`@kittie/build-context`** — portable project-memory for coding agents (dual-store, ADR 0010).
- **`@kittie/clone-engine`** — clone/parity tooling.
- **`@kittie/visual`** — derive UI blueprint from competitor listing media (L7).
- **`@kittie/billing`** — parked engine (L8/L9, #99/#100); not active (Non-Goal v1).

### Surfaces (`apps/*`)
- **`@kittie/web`** — Vite + React (:5175). **Canonical UI = light-mode "App Teardown"** (`apps/web/src/lib/theme.ts` light default; dark via toggle). Signature view = pannable **react-flow node graph** in `apps/web/src/components/teardown/`, reached via Classic ⇄ Teardown toggle (#135). **Do NOT revive** deprecated directions ("App Canvas" hub-and-spoke, "Exponential UI", alt shells).
- **`@kittie/cli`** — CLI surface.
- **`@kittie/mcp`** — MCP server surface (L5 intent layer + hardening, #107/#123).
- **`@kittie/eval`** — shadow eval harness for the market-awareness layer (L13, #101).

### Cloned dashboard surfaces (vs truth `appkittie.com`)
`/dashboard/explore` (apps DB root) · `/ads` (Meta Ad Library — empty-state until FB ID verification clears) · `/organic` (creator videos) · `/highlights` (Big Hits / Gainers / Losers) · plus Trending, Rising, ASO, Reviews, Hot Ideas. Each cloned per-path against the **live** site; fidelity gate = **≥4/5** or stop on a hard external blocker.

### Strategic direction
Pivoting toward **agent-first surfaces** (serve AI agents, not just humans) — P0/P1/P2 shipped (#42); remote-MCP / registry / x402 deferred to infra decisions (memory `agent-first-surface-direction`, branch `feat/agent-readable-surfaces`).

### ADR map (the decisions that constrain new work)
`0001` keyword autocomplete proxy · `0002` hosted libsql for rank history · `0003` tracked-keywords separate table · `0004` single freshness scheduler · `0005` Hot Ideas Gemini batch · `0006` Apple discovery by popularity · `0007` per-country app snapshots · `0008` due-driven (external) snapshot worker · `0009` chart rankings table · `0010` build-context dual store · `0011` request-time competitor discovery.

---

## Landmines / non-obvious (verify before trusting — files may have moved)
- **Snapshot worker must be registered with the scheduler** or "Refresh" gives stale data (memory `live-pipeline-needs-scheduler-registration`); deltas need date-2 (memory `snapshot-gap-reconciliation`).
- **libsql transactions must be `{behavior:"immediate"}`** — deferred multi-statement txns deadlock the fleet (memory `libsql-transactions-must-be-immediate`).
- **drizzle-kit migrate silently swallows SQL errors** — local DB drifted 2 migrations behind + freelist corruption; fix via manual `sqlite3` apply + `VACUUM` (memory `kittie-db-migration-drift-and-freelist-fix`).
- **better-sqlite3 native rebuild** sometimes needed after `pnpm install` (rebuild cmd in CLAUDE.md → Commands).
- **Web port is ALWAYS :5175**, never :5173 — kill any stray server on 5175 rather than accept a fallback port.
- **Dev server lifecycle:** run as pure `run_in_background`, kill by pid not pkill-path (memory `bg-dev-server-lifecycle`).
- **Honest data rule:** blocked/empty source → empty-state, never fabricated rows.

---

## Suggested skills for the next session
- **`/coordinator`** — the accountability loop for this project; sole Chrome owner, QAs one section worktree vs live truth and writes gap reports. Use for any clone/parity verification.
- **`/clone`** — drive Chrome DevTools MCP to audit a surface against `appkittie.com` and produce a parity matrix + score (the 4/5 fidelity gate).
- **`/chrome-devtools`** + **`coordinator/truth-chrome.sh`** (port 9222, profile `~/.kittie-truth-chrome`) — attach to the logged-in truth browser; `list_pages` → `select_page`, never `new_page` first.
- **`/improve-codebase-architecture`** — if the next task is architectural deepening (it reads CONTEXT.md + ADRs).
- **`/review`** or **`/code-review`** — before landing any lane PR to `main`.
- **`/diagnose`** — for the ingest/snapshot/OOM-class bugs catalogued in memory.

## Open questions for Rhodri
1. Merge PR #144 (green, trivial port pin) now, or hold?
2. What's the next surface/lane to drive — agent-readable surfaces (`osk-agent`), teardown visual polish (`osk-visual`), or app-detail IA (`osk-ia`)?
3. The untracked `coordinator/.govern/` + `govern*.sh` tooling — commit, gitignore, or discard?
