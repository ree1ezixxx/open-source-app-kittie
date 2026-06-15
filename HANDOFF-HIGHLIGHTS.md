# HANDOFF — Dashboard Highlights (`/dashboard/highlights`)

You are the **build agent** for the **Highlights** page of the Kittie clone. Build in THIS worktree only:
`/Users/ellis/Documents/open-source-app-kittie-highlights` (branch `feat/highlights`, cut from `feat/simulator-first-builder`).

> A stale `HANDOFF.md` (with merge-conflict markers) may exist from an earlier lane plan — **ignore it; this file supersedes it.** Background docs if present: `docs/clone/api-contract.md`, `docs/session-handoffs/2026-06-07-clone-cant-do-capability-gaps.md`.

## The project in one paragraph
We are cloning the app-intelligence dashboard at **`appkittie.com`** ("**truth**") into our local app ("**clone**"). A separate **coordinator** owns the browser and will QA your output against truth — you do **not** drive a browser. Make `/dashboard/highlights` on the clone match truth in structure, data shape, behaviour, and visuals. Pages are compared by **URL path**, not label.

## This is NOT greenfield — it's ~70% built; your job is a parity pass
The page already exists and renders three widgets. You are **refining an existing scaffold to match truth exactly**, not building from scratch.
- `apps/web/src/pages/HighlightsPage.tsx` — the page (store toolbar + 3 widgets).
- `apps/web/src/components/Widget.tsx` — card shell (header + action slot + body).
- `apps/web/src/components/RankList.tsx` — the ranked-rows table (RK · 1D · NAME · DL · MRR).
- Sidebar entry + route already wired (`/dashboard/highlights`, `IconSpark`).
- **No `highlights` API route** — the page composes existing `useApps(...)` queries (`packages/api/src/routes/apps.ts`). Keep it that way; Highlights is an aggregation of existing endpoints, not a new one.

## Your source of truth
- Live page: `https://www.appkittie.com/dashboard/highlights` (you can't open it — the coordinator does).
- **Full a11y snapshot of truth staged here: `TRUTH-highlights.snapshot.txt`** — read it for exact structure, labels, ordering, and values.

### What truth looks like (verify against TRUTH-highlights.snapshot.txt)
- A shared top **search box** ("Search apps, developers, descriptions...").
- H2 **"Dashboard Highlights"**, then a single descriptive line: **"Filter all widgets by store source."**
- **Store-source filter = TWO independent toggle buttons:** **"Select Apple Store"** and **"Select Google Play"**. They are multi-toggle (each has a `pressed` state), label flips to **"Included Apple Store"** / **"Included Google Play"** when on. **Default = neither pressed = ALL stores combined.**
- **Three widgets**, in this order:
  1. **New Big Hits** — title carries a **count badge `(5,929)`** next to it. Columns **RK · NAME · DL · MRR** (no 1D). "View all" → `/dashboard/explore?sortBy=reviews&sortOrder=desc&releasedAfter=7d`.
  2. **Top Gainers** — columns **RK · 1D · NAME · DL · MRR**. "View all" → **`/dashboard/rising`**.
  3. **Top Losers** — columns **RK · 1D · NAME · DL · MRR**. "View all" → **`/dashboard/movers?type=losers`**.
- **Row shape:** rank `#N`, app icon, app name (links to app page), **category** as the secondary line, then **DL** and **MRR**. Gainers/Losers rows additionally show a signed **1D rank delta** as an **integer** (e.g. `+96`, `-83`) — *not* a percentage.
- Value formatting: DL like `1M` / `210K` / `<100`; MRR like `$110` / `$6K` / **`$<100`** (sub-100 shows the literal `$<100`).

## Gaps to close (clone → truth)

### Structure
1. **Store filter control.** Clone uses a `Segmented` single-pick (apple|google) defaulting to apple. Truth uses **two independent toggle buttons** defaulting to **none selected (= all stores)**. Rebuild as two toggles; support all four states (none/apple/google/both). "None selected" must mean "all sources" (truth's default 5,929 combined count, Google app ranked #1).
2. **New Big Hits count badge.** Add the `(N)` count next to the "New Big Hits" title (truth shows `(5,929)`). Only this widget has a count — Top Gainers/Losers have none. Extend `Widget` with an optional `count` prop.
3. **Sub line under H2.** Truth's only descriptive line is **"Filter all widgets by store source."** Clone currently sets a different `PageShell` sub ("New big hits, top gainers & losers…") plus a toolbar meta. Make the visible descriptive text match truth.

### Data shape
4. **New Big Hits query + View-all params.** Truth = **`sortBy=reviews`, `sortOrder=desc`, `releasedAfter=7d`**. Clone currently uses `sortBy: "downloads"` and `releasedAfter` = 90 days, and its "View all" emits `sort=downloads&rel=90`. Align both the `useApps` query and the `viewAll` link to **reviews / desc / 7d**.
5. **Gainers/Losers "View all" targets.** Truth → **`/dashboard/rising`** (gainers) and **`/dashboard/movers?type=losers`** (losers). Clone points both at `/dashboard/explore?...growth`. Point them at the truth routes. (`/dashboard/rising` exists in the clone; if `/dashboard/movers` does not, link to it anyway for path parity — the coordinator compares by URL — and note it as a downstream page to build.)
6. **1D column is a rank delta, not a percent.** `RankList` currently renders `growthPct` as `+12.3%`. Truth shows a **signed integer rank-position delta** (`+96` / `-83`). Switch the 1D column to the rank delta. This requires a day-over-day **rank** per app (see capability gap below).
7. **Row secondary line = category.** Clone shows `developer || category` (prefers developer). Truth's secondary line is the **category**. Show category.
8. **`$<100` money formatting.** Ensure `formatMoney` renders sub-100 MRR as the literal **`$<100`** to match truth (truth never shows `$0`/`$12` — it floors to `$<100`).

### Behaviour
9. **Toggles filter every widget at once** and update each "View all" link's `source` param (truth appends e.g. `&source=apple_mobile`; Google = `&source=google_play`). Wire the two toggles so all three widgets + all three View-all links react together. Confirm the clone's `source` values map to truth's `apple_mobile` / `google_play` (rename if the API expects different tokens).

### Capability gap — be honest
10. **Top Gainers / Top Losers need ≥2 snapshot days** to compute a rank delta. The seed currently has **1 snapshot day**, so these widgets correctly fall back to a "Building baseline" empty state. To render like truth you must **seed a second snapshot day with shifted ranks** (so `+96`/`-83`-style deltas compute). If you cannot, leave the honest empty state and flag it — do **not** fabricate a fake `1D` from a single day. New Big Hits works on one day and should render real rows immediately.

## Files you will touch (exact paths)
- `apps/web/src/pages/HighlightsPage.tsx` — store toggles, query params, view-all targets, sub text.
- `apps/web/src/components/Widget.tsx` — add optional `count` badge.
- `apps/web/src/components/RankList.tsx` — 1D rank-delta column, category secondary line.
- `apps/web/src/lib/format.ts` — `$<100` flooring if not already handled.
- Seed script under `packages/db` / `packages/ingest` — add a second snapshot day with rank movement (for gainers/losers).
- **Reference, do not edit:** `apps/web/src/pages/ExplorePage.tsx` (filter/query patterns), `apps/web/src/pages/RisingPage.tsx` (growth/rank-delta patterns — likely already computes the delta you need), `packages/api/src/routes/apps.ts` (the `useApps` backend; check it exposes `sortBy=reviews`, `releasedAfter`, `growth*`, and a rank-delta field).

## Styling
No Tailwind / CSS-in-JS. Global CSS vars in `apps/web/src/index.css` (`--panel`, `--surface`, `--border`, `--text`, `--text-secondary`, `--text-tertiary`, `--accent` `#c6f24d`, `--radius`, `--radius-lg`); theme via `lib/theme.ts`; category colours via `lib/palette.ts`. Reuse the existing `.widget` / `.rank-row` / `.delta` (`.up`/`.down`/`.flat`) classes already in `index.css`.

## Setup & run — OWN ports (`:5173`/`:3007`, `:5174`/`:3017`, `:5175`/`:3018` are taken by other worktrees)
```bash
cd /Users/ellis/Documents/open-source-app-kittie-highlights
pnpm install
pnpm db:migrate              # creates this worktree's data/kittie.db (per-worktree, gitignored)
pnpm ingest:seed            # seeds the 283 apps + reviews
# then run your second-snapshot-day seed for gainers/losers
PORT=3019 pnpm dev:api       # API on 3019
pnpm dev:web -- --port 5176  # web on 5176
```
- **Edit `apps/web/vite.config.ts`**: set `server.port` to **5176** and the `/api` proxy target to **`http://localhost:3019`**.
- Shortcut for base data: copy a populated `data/kittie.db` from `../open-source-app-kittie-simulator-first-builder/data/`, then add your second snapshot day.

## Definition of done (coordinator verifies against truth)
1. `/dashboard/highlights` on `:5176` shows the **two independent store toggles** (default none = all stores) that filter **all three widgets** + their View-all links together.
2. **New Big Hits** renders real rows (reviews/desc/7d), with a **`(N)` count badge**, columns RK · NAME · DL · MRR, "View all" → `explore?sortBy=reviews&sortOrder=desc&releasedAfter=7d`.
3. **Top Gainers / Top Losers** render columns RK · **1D** · NAME · DL · MRR with a signed **integer rank delta**; "View all" → `/dashboard/rising` and `/dashboard/movers?type=losers`. (Or honest empty state if a 2nd snapshot day isn't seeded — flagged, not faked.)
4. Row secondary line = **category**; DL/MRR formatting matches truth (incl. **`$<100`**).
5. `pnpm typecheck` passes. No console errors.

## Working rules
- Stay in this worktree. Do not edit other branches' paths.
- **Docs hygiene (avoid CONTEXT.md merge conflicts):** do NOT add glossary terms to root `CONTEXT.md`. Write new domain terms to **`docs/glossary/highlights.md`** (same `**Term**:` / def / `_Avoid_:` format). If `grill-with-docs` edited root `CONTEXT.md`, relocate those additions into `docs/glossary/highlights.md` and revert `CONTEXT.md` to base before committing. The coordinator merges fragments into canonical `CONTEXT.md`.
- After each QA pass the coordinator drops **`CLONE-GAP.md`** here — **read it and fix the listed gaps.** Don't self-declare done; the coordinator decides from the live diff.
- Commit in small, coherent steps on `feat/highlights`.
