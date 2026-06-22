# AGENTS.md — Open Source App Kittie (Codex)

Independent, open-source mobile app intelligence platform. AppKittie-inspired feature set; **no dependency on AppKittie's paid API**.

> **Cursor** reads [`.cursor/rules/app-kittie.mdc`](./.cursor/rules/app-kittie.mdc). **Claude Code** reads [`CLAUDE.md`](./CLAUDE.md).

## Mission

Surface profitable, fast-moving apps across iOS and Android: revenue estimates, download trends, ad intelligence, creator partnerships, ASO keywords, and reviews — with first-mover trend detection.

Not a commercial product (for now). Ship fast: **days, not months**.

## Communication

Ultra compression — say the minimum that conveys the answer.

- **Clear over clever.** Plain language beats jargon, metaphors, and throat-clearing.
- **No verbosity or filler.** Don't pad to sound smart. No recaps, hedge stacks, or diff narration.
- **Brevity by default.** Lead with the answer. A few bullets beat an essay. Expand only when asked or the task requires it.
- **Simplify always.** Refuse unnecessary complexity. Prefer the simplest correct approach; skip theory, option menus, and layers nobody needs.

## UI Conventions

- **Never loose text in a page — everything lives in a component.** Wrap sections in cards (`DetailCard`), facts in `Fact`, headline metrics in `MetricCard`; honest empty-states via `EmptyCard` for data not ingested yet. Loose `<p>`/`<dl>` blobs read as unfinished.
- The **app detail template is uniform** across every app — build it once (`pages/AppDetailPage.tsx`) and it repeats. Match AppKittie's section set: headline metric cards (clickable → drive chart) → trend chart (range selector) → details → listing media → about → contact & links → reviews → similar apps → intelligence (Meta/Apple ads, creators — empty-state until ingested).
- Reusable detail components: `MetricCard`, `DetailCard`/`EmptyCard`/`Fact`, `TrendPanel`, `SimilarApps`.

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

Each agent session works on its own branch off `main`:

| Branch | Focus |
|--------|-------|
| `feat/foundation` | `packages/types`, `packages/db`, `packages/core`, root tooling |
| `feat/ingest` | `packages/ingest` |
| `feat/intelligence` | `packages/intelligence`, `packages/api`, `apps/*` |

Merge to `main` when a slice is verified. Do not cross-edit another branch's owned paths.

## Codex Agent Practices

- **Parallel tool calls** when reads or checks are independent — don't serialize unnecessarily.
- **Minimal diffs.** Match surrounding code style. Don't refactor unrelated code. Don't add docs or tests unless asked.
- **Git hygiene.** Don't commit, push, or amend unless the user asks. Never force-push `main`.
- **Run commands yourself** to validate — don't ask the user to run steps you can execute in the sandbox.

## Chrome DevTools / Truth Browser

- When asked to use Chrome DevTools MCP or drive an existing Chrome tab, use `$chrome-devtools-cdp-fallback` if MCP `list_pages` is stale, wrong, or only shows `about:blank`.
- Treat Chrome's CDP endpoint as the real tab inventory when needed: `http://127.0.0.1:9222/json/list`.
- To control the already-open AppKittie truth tab, list and match via CDP, then navigate the matched tab:
  `python3 ~/.codex/skills/chrome-devtools-cdp-fallback/scripts/cdp_tabs.py list --port 9222`
  `python3 ~/.codex/skills/chrome-devtools-cdp-fallback/scripts/cdp_tabs.py navigate --match appkittie --url https://www.appkittie.com/dashboard/trending --port 9222`
- For AppKittie source-of-truth audits, never navigate the live truth Chrome to localhost unless explicitly requested. Use a separate isolated browser/profile for clone/localhost comparison.

## Truth-Derived Clone Planning

- Clone work starts from live AppKittie truth, not invention. Navigate the real page like a user, inspect pixel/interaction/network behavior, then turn that into PRDs and one-PR issues.
- If overnight planning is needed, create concise truth-derived PRDs/issues yourself: route, visible state, controls, interactions, expected data shape, screenshots/evidence, acceptance criteria, and a `>=4/5` fidelity gate.
- Do not reinvent product behavior. Copy AppKittie's flow unless local data availability forces an honest empty-state.
- Avoid Ads and Organic/UGC clone tickets for now; those ingest/data paths are not wired. Other existing surfaces are fair game after truth inspection.

## Context Management (Token Efficiency)

- **One objective per thread.** If scope creeps, stop and narrow before continuing.
- **Read `CONTEXT.md` once** at session start — do not re-paste domain definitions into chat.
- **Return summaries**, not raw file dumps, when reporting exploration results.
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
pnpm typecheck        # build all packages, then tsc --noEmit
```

## Validation

- `pnpm typecheck` must pass before handoff (runs `build` first — workspace packages resolve from `dist/`).
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
The explicit `DATABASE_URL` is the **shared** DB every lane's API reads — confirm the running API has *that* file open (`lsof -p <api pid> | grep kittie.db`), don't trust the default path resolution.

## Local Dev Port/Data Guardrail

The dashboard must show the full local dataset. Before assuming data is missing, verify the API and web proxy are aligned:

```bash
curl http://localhost:3008/health
curl "http://localhost:3008/api/v1/apps?limit=3&sortBy=reviews&sortOrder=desc"
lsof -p <api pid> | grep /Users/ellis/Documents/open-source-app-kittie/data/kittie.db
```

`apps/web/vite.config.ts` proxies `/api` to `VITE_API_ORIGIN`, defaulting to `http://localhost:3008`. If the app shell loads but tables are empty or show API errors, check `/tmp/web.log` for Vite proxy `ECONNREFUSED` before touching ingestion or the database.

Use the guardrail script after starting API + web:

```bash
pnpm dev:check-data
```

Expected local baseline as of 2026-06-12: ~100K Apps, ~300K Snapshots, ~114K Reviews, 0 Meta ads. An empty Ads Library currently means `meta_ads` has not been ingested; it does not mean the app database is gone.

**Gotchas that bit us once — don't repeat (this is the "no more manual reloads" list):**
1. **After a reseed, the API still serves the OLD count.** `db-app-service.ts` caches scored rows in-memory with **no TTL**. It runs under `tsx watch`, so reload it by making a **content edit** to any `packages/api/src` file. **`touch`/mtime alone does NOT trigger the watcher** — it must be a real content change.
2. **An app only appears once it has a snapshot row** (`listSnapshotContexts` skips snapshot-less apps). bulk-seed writes one per app, so this is handled — but any other insert path must also write a snapshot.
3. **GROWTH 7D / Trending / Rising need day-over-day snapshots.** Running bulk-seed 10× in one day adds apps but growth stays flat (all snapshots share today's date). To populate growth, run on **successive days** (or run `jobs/snapshot.ts` daily). This is a time-series requirement, not a missing field.
4. **The `rss.applemarketingtools.com` feed (old `seed.ts`) is failing.** Use genre-RSS (`itunes.apple.com/<cc>/rss/<feed>/limit/genre/json`) + Search — already wired in `discover.ts`.
5. **List-path is batched; detail-path is not.** `listSnapshotContexts` bulk-loads in ~4 queries (see `packages/db/src/queries/signals.ts`). `getSnapshotContext` (single-app detail) still fires per-app queries — fine for one id, don't use it in loops.

**Data completeness vs AppKittie's Database table (audited 2026-06-08):** their row = #·app·category·growth7d·rating·reviews·downloads·MRR·released·last-update·view. We capture **every underlying field** — rating/reviews from Lookup, downloads/revenue/growth **modeled at read-time** by `intelligence`, category/dates/icon/screenshots/description/price/contentRating/languages from Lookup. Not missing fundamental data. ~7% of apps legitimately have 0 US ratings (Apple returns 0 — not our bug).

**Screenshots — iTunes API is incomplete; backfill from the web listing.** Apple's iTunes Lookup/Search API returns **empty `screenshotUrls` for ~36% of apps** (newer screenshot formats — e.g. HelloChinese, Duolingo). The App Store *web* listing still embeds them. After any bulk-seed, run the web backfill to fill the gap (idempotent — only touches apps still empty):
```bash
cd packages/ingest
CONCURRENCY=6 DATABASE_URL=file:/Users/ellis/Documents/open-source-app-kittie/data/kittie.db \
  pnpm exec tsx src/jobs/backfill-screenshots-web.ts
```
It scrapes `apps.apple.com/us/app/id<ID>` (browser User-Agent required — a bot UA returns 0 bytes), extracts `PurpleSource*` mzstatic templates (skipping `AppIcon`, `/Features` banners, and `Placeholder.mill` video posters), renders at 392×696, dedups by basename, writes ONLY the `screenshot_urls` column. ~96% fill rate, 0 failures observed. `apple/scrape.ts` + `jobs/backfill-screenshots-web.ts`. (The lookup-only `backfill-screenshots.ts` is superseded for these — iTunes returns nothing for them in any storefront.) Note the detail page then probes each URL in-browser and needs ≥3 working to render the collection.

**Forward-compat — capture-now-or-refetch-2M-later:** Apple Lookup also returns fields we currently drop. To avoid re-fetching the whole catalog later, file a `docs/schema-requests.md` entry for `feat/foundation` to add columns for: **trackViewUrl** (App Store listing URL, for the View action), **version**, **fileSizeBytes**, **minimumOsVersion**, **primaryGenreId**, **price currency**. Then map them in `apple/lookup.ts` + `db/apps.ts`. Cheap now, expensive across 2M later.

## AppKittie Reference (not a dependency)

Their open-source [aso-mcp-skills](https://github.com/AppKittie/aso-mcp-skills) repo is MIT but wraps their **paid** API. We mirror their **API shape** where useful (`/api/v1/apps` filters, growth windows) but source data ourselves.

## Non-Goals (v1)

- Screenshot generator (design tool — defer)
- Paid billing / credit system
- 2M-app day-one coverage (grow catalog incrementally)
