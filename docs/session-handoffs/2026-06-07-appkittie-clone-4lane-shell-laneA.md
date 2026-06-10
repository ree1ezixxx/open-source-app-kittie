# Session Handoff — AppKittie full clone: 4-lane setup + Lane A shell & Explore-family pages

## Where it started
Rhodri signed into the live AppKittie Pro trial and asked for the whole product to be walked (via his Chrome on `:9222`) and scoped for a full open-source clone. The repo already existed as an apps-database MVP (~85% of the product UI missing). Scope settled on: clone the full frontend across **4 parallel Claude instances** (one per worktree); backend/auth/billing are Rhodri's lane and out of scope here. This session acted as orchestrator + then took **Lane A**.

## Decisions locked + what shipped
- **Operating model:** 4 parallel lanes, each its own worktree forked off the `feat/ui` shell; this session = orchestrator + Lane A. Locked in plan file.
- **Framework:** stay Vite 6 + React 19 + React Router 7 (no Next.js port). Routes mirror live `/dashboard/*` paths 1:1.
- **Data contract written** — `/Users/ellis/Documents/open-source-app-kittie/docs/clone/api-contract.md` (every tRPC proc seen live + the 40-param `getApps` input verbatim + per-surface data needs + data-reality caveats).
- **3 fresh worktrees created** off `feat/ui` (non-destructive `git worktree add`): `feat/aso-keywords`, `feat/ai-studio`, `feat/reviews-meta`. Each worktree root + the `-ui` worktree got a self-contained `HANDOFF.md`.
- **Lane A shell shipped** — commit `6ba4a1f` on `feat/ui`: full grouped sidebar (all 16 routes), router with placeholders for other lanes, shared primitives `Tabs/Widget/EmptyState/MasterDetail/FilterRail/FavoriteToggle/PageShell/Segmented/RankList`, local favorites store, +9 icons.
- **Lane A pages shipped** — commit `bb0a050` on `feat/ui`: Highlights (3 widgets), Trending (Store Rankings), Rising (launched+signal windows), Favorites (5-tab hub). Typecheck clean; all four verified rendering against the live API.
- **Honest empty/baseline states** throughout, per the capability-gaps doc (1 snapshot day → no growth signal; 0 rows in meta_ads/iaps/creators/keywords).
- **Memory updated** with the 4-lane map.

## Key files for next session
- Plan (READ FIRST): `/Users/ellis/.claude/plans/delegated-finding-spark.md` — full granular scope, per-lane handoff briefs, open decisions.
- Data contract: `/Users/ellis/Documents/open-source-app-kittie/docs/clone/api-contract.md`
- Capability limits (G1–G7): `/Users/ellis/Documents/open-source-app-kittie-ui/docs/session-handoffs/2026-06-07-clone-cant-do-capability-gaps.md`
- Per-lane briefs: `HANDOFF.md` at the root of each of the 4 worktrees (paths below).
- Lane A source (this session's work, all under `/Users/ellis/Documents/open-source-app-kittie-ui/apps/web/src/`): `App.tsx`, `components/Sidebar.tsx`, `icons.tsx`, `index.css`, new `components/{Tabs,Widget,EmptyState,MasterDetail,FilterRail,FavoriteToggle,PageShell,Segmented,RankList}.tsx`, `lib/favorites.ts`, new `pages/{Highlights,Trending,Rising,Favorites,Placeholder}Page.tsx`.
- Memory touched: `/Users/ellis/.claude/projects/-Users-ellis/memory/project_open_source_app_kittie.md` and `/Users/ellis/.claude/projects/-Users-ellis/memory/MEMORY.md`.

## Running state
- Background process: **Vite dev server, bash ID `bz4r60hhv`** — Lane A web, serving on **http://localhost:5175** (5173/5174 were already taken by other lanes). Kill via that shell ID, or `pkill -f 'vite --port 5173'`.
- Other background shells (already completed, no action): `box2san1f` (pnpm install), `bs9u2zg78` (Chrome launch).
- Backend API: expected on **:3007** (run from `/Users/ellis/Documents/open-source-app-kittie-ingest` with `PORT=3007 pnpm dev:api`). It was responding this session (Explore/Highlights showed real data) — likely started by Rhodri or another lane; not owned by this session.
- Reference browser: Google Chrome on **:9222** (profile `~/.cache/appkittie-chrome`) holding the signed-in live AppKittie tabs + localhost tabs — used for side-by-side diffing. Other lanes' dev servers observed on 5176/5177.
- Worktrees / branches:
  - `/Users/ellis/Documents/open-source-app-kittie-ui` — `feat/ui` (Lane A) — apps/web committed; `packages/api/src/routes/reviews.ts` left modified (pre-existing backend WIP, NOT this session's) + two untracked reference docs.
  - `/Users/ellis/Documents/open-source-app-kittie-aso-keywords` — `feat/aso-keywords` (Lane B)
  - `/Users/ellis/Documents/open-source-app-kittie-ai-studio` — `feat/ai-studio` (Lane C)
  - `/Users/ellis/Documents/open-source-app-kittie-reviews-meta` — `feat/reviews-meta` (Lane D)
  - Pre-existing: `open-source-app-kittie` (feat/foundation), `-ingest` (feat/keywords-aso), `-snapshots` (feat/ingest), `-intelligence` (feat/intelligence-surface).

## Verification — how to confirm things still work
- `cd /Users/ellis/Documents/open-source-app-kittie-ui/apps/web && pnpm typecheck` — expect no output (clean).
- Backend up: from `/Users/ellis/Documents/open-source-app-kittie-ingest`, `PORT=3007 pnpm dev:api`.
- Open `http://localhost:5175/dashboard/explore` in Dia — full sidebar (16 grouped items), Explore table with ~283 apps; `/dashboard/highlights` (3 populated widgets), `/dashboard/trending` (50-row ranking table), `/dashboard/rising` (50-row table), `/dashboard/favorites` (5 tabs + "No favorite apps yet" empty-state).
- `git -C /Users/ellis/Documents/open-source-app-kittie-ui log --oneline -2` — expect `bb0a050` then `6ba4a1f`.

## Deferred + open questions
- Deferred (Rhodri said pause Lane A here): **Explore deep-filter pass** — extend `ExplorePage.tsx` to the full ~40-param `getApps` filter rail (marketing signals, price, lifetime, content rating, languages, contacts), growth sparklines, and JSON export. This is the only remaining piece of Lane A's DoD.
- Deferred (Rhodri's lane): consolidation of the 3 overlapping backend branches (`feat/ingest` ≈ `feat/keywords-aso` ≈ `feat/intelligence-surface`).
- Open: AI feature depth for Lane C (full AI integration vs UI + typed mock first) — handoffs currently assume mock-first.
- In flight elsewhere: Lanes B/C/D are being built in their own Claude instances; they rebase onto `feat/ui` (`git rebase feat/ui`) to consume the shell, then merge back.

## Pick up here
Either resume Lane A's Explore deep-filter pass (extend `ExplorePage.tsx`), or switch to integration mode — watch Lanes B/C/D land and help merge them back onto `feat/ui` cleanly (each owns separate page files; shared files are `App.tsx`/`Sidebar.tsx`/`index.css`).
