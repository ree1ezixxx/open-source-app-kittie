# CLAUDE.md — Open Source App Kittie (the Kittie clone)

Independent, open-source mobile app intelligence platform. AppKittie-inspired feature set; **no dependency on AppKittie's paid API**.

## Mission

Surface profitable, fast-moving apps across iOS and Android: revenue estimates, download trends, ad intelligence, creator partnerships, ASO keywords, and reviews — with first-mover trend detection.

Not a commercial product (for now). Ship fast: **days, not months**.

## Canonical UI design (single source of truth — do NOT introduce competing designs)

The **one** UI direction is the **light-mode "App Teardown"** design:
- **Light theme by default** (`apps/web/src/lib/theme.ts`); dark stays available via the toggle.
- The signature view is the **App Teardown canvas** — an app's intelligence exploded onto a
  pannable react-flow node graph (`apps/web/src/components/teardown/`), reached from each app's
  detail page via the **Classic ⇄ Teardown** toggle.
- **Run it:** `pnpm dev:web` (web) + `pnpm dev:api` (API). Canonical dev ports: **web `5173`,
  API `3008`** (web proxies `/api` → `3008`; override with `VITE_API_ORIGIN`). The teardown
  canvas is at any app → **View** → **Teardown** tab.
- **Do NOT build, open, or revive other design directions** — the "App Canvas" hub-and-spoke
  view, the "Exponential UI" redesign, or any alternative shell. They are deprecated. If a fresh
  visual exploration is ever wanted, it must be an explicit, separate decision — never a default.

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
- **"Truth" = the LIVE site. When auditing parity or cloning a feature, drive `appkittie.com` directly
  via the Chrome DevTools MCP** — navigate to the page (use the explicit URLs above; if a page has no
  listed URL, go to `/dashboard/explore` and click through the left-nav to reach it), then **exercise
  the actual functionality** (open dropdowns, change filters, paginate, sort, hover, click rows) so the
  audit reflects real behaviour, not just static structure. Compare live truth ↔ our clone ↔ gaps, per page.
- **Truth browser — zero-touch launch (do this yourself, don't ask Rhodri):** run
  `bash coordinator/truth-chrome.sh`. It boots Chrome on debug port **9222** with the **persistent
  profile `~/.kittie-truth-chrome`** (already logged into appkittie.com — login survives reboots). If
  it's already running it no-ops. Then attach via Chrome DevTools MCP: `list_pages` → `select_page`;
  never `new_page` as the first action.
- Only if the live page redirects to a login screen (session genuinely expired) do you STOP and ask
  Rhodri to sign in once in that window — never guess from memory or stale snapshots.
- Any staged `TRUTH-<view>.snapshot.txt` / `coordinator/.cache/*-truth.txt` dumps are a **point-in-time
  cache only** — never a substitute for live navigation in a real audit. The live site wins on conflict.

## Clone Fidelity Score (HARD GATE — applies to every cloned page/feature)

- Every cloned surface MUST be scored **out of 5** for visual + behavioural fidelity to the LIVE source
  of truth (appkittie.com), judged by side-by-side comparison in the truth browser (`coordinator/truth-chrome.sh`).
- **Minimum acceptable = 4/5. A score of 3 or below is NOT a deliverable.** Do not hand work back as
  "done" at ≤3 — keep iterating (re-inspect truth → fix the gap → re-score) until it reaches ≥4. Three
  rounds is not a finish line; ten is not too many. Always state the score explicitly when reporting.
- **Only permitted stop below 4:** a hard EXTERNAL blocker — a third-party API key / approval or data
  that genuinely cannot be obtained (e.g. Meta/TikTok/Instagram ad ingest, paid feeds). Then STOP,
  report the exact blocker, the current score, and precisely what would unblock it. Internal effort
  (more components, more passes, more polish) is never a valid reason to ship a 3.
- Rubric: **5** = pixel- & behaviour-indistinguishable · **4** = only minor cosmetic deltas, all
  functionality present & correct · **3** = noticeable structural/behavioural gaps (REJECTED) ·
  **≤2** = missing features or wrong data (REJECTED).

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

## Parallel Clone Lanes — Chrome Isolation (evergreen)

When >1 lane clones in parallel, each agent drives the Chrome DevTools MCP. **The MCP drives ONE browser
instance; two agents on the same Chrome collide over tabs/navigation and burn tokens fighting each other.**
So each lane gets its **own Chrome on its own debug port + its own profile**. (All lanes may open the same
truth URL at once — reading a public page never conflicts; the collision is the browser *instance*, not the URL.)

**Slot → port scheme (independent of branch / section / worktree name):**
- **Primary worktree = slot 0 → port 9222** (the default global chrome-devtools MCP + `~/.kittie-truth-chrome`).
- **Each additional lane = slot N → port 9222+N** (slot 1 → 9223, slot 2 → 9224, …), profile `~/.kittie-chrome-laneN`.

**Per-lane setup (do once per lane, then never again):**
1. Launch the lane's isolated Chrome: `bash coordinator/lane-chrome.sh <slot>` (idempotent; slot 0 also
   works via the existing `coordinator/truth-chrome.sh`). Extra-lane profiles are seeded from the truth
   profile so they inherit the appkittie.com login. If a lane still lands on a login screen, STOP and ask
   Rhodri to sign in once in that window — never guess from memory.
2. Bind the lane's MCP to its port with an **untracked `.mcp.json`** at the worktree root:
   ```json
   { "mcpServers": { "chrome-devtools": { "type": "stdio", "command": "npx",
     "args": ["-y", "chrome-devtools-mcp@latest", "--browserUrl=http://127.0.0.1:<port>"] } } }
   ```
   (Slot 0 needs none — it uses the global 9222 default.)
3. On first boot, confirm via `list_pages` that the attached Chrome shows *this lane's* port/tabs, not 9222.

**Stable-slot principle (this is what makes the above evergreen):** keep the worktree *directories* as
permanent lane-slots and **rotate the branch inside them** — when a section is done, the slot checks out the
next section's branch. Same dir, same port, same `.mcp.json`. The section name lives in the *branch*, not the
dir. The wiring (script + port map + `.mcp.json`) is set once and survives every section rotation; only the
branch + the section handoff change.

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
