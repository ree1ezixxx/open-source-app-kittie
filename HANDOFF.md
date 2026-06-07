# LANE A — Explore & Rankings  +  SHELL OWNER
**Worktree:** `~/Documents/open-source-app-kittie-ui`  ·  **Branch:** `feat/ui`
**You own the shared shell** — build it FIRST and commit early so Lanes B/C/D can rebase onto it.

> Full scope + every other lane: `~/.claude/plans/delegated-finding-spark.md`
> Data contract (read it): `~/Documents/open-source-app-kittie/docs/clone/api-contract.md`
> Hard limits (read it): `docs/session-handoffs/2026-06-07-clone-cant-do-capability-gaps.md`

## Mission
Clone the **full** AppKittie product UI. We now build **all** surfaces (superseding the earlier "ship only data-backed surfaces" stance in commit `8bf3ccc`) — using **honest empty-states** wherever data/AI is absent.

## Shared context
- **Stack:** pnpm monorepo; web = `apps/web` (Vite 6 + React 19 + React Router 7). Custom CSS design system in `src/index.css`; dark, lime `#c6f24d`, pill chips; category colors `lib/palette.ts`; API client `lib/api.ts` (`/api/v1/*`).
- **Run:** backend from `~/Documents/open-source-app-kittie-ingest` → `PORT=3007 pnpm dev:api` (bg). Here: `pnpm install && pnpm dev:web`. Preview in **Dia**: `open -a "Dia" http://localhost:5173`. (Vite proxy already → `:3007`.) If DB routes 500: build `better-sqlite3` (`npm run build-release` in its node_modules dir).
- **Data reality:** 283 apps · **1 snapshot day** · 13,320 reviews · **0 meta_ads/iaps/creators/keywords**. ⇒ growth-7d sparkline + first-mover have **no signal** → render but label **"pending baseline."**
- ⚠ **You have uncommitted WIP here** (`ExplorePage/Topbar/AppDetailPage/api.ts/index.css`) — that's yours; commit it as you go. Don't `git restore .`.

## Build order
### 1. SHELL FIRST (then commit + push — unblocks B/C/D)
- **`components/Sidebar.tsx`** — full grouped nav matching live AppKittie:
  EXPLORE: Database `/dashboard/explore` · Highlights `/dashboard/highlights` · Trending `/dashboard/trending` · Rising `/dashboard/rising`
  YOUR APPS: Favorites `/dashboard/favorites`
  ASO: App Tracking `/dashboard/aso/apps` · Keyword Explorer `/dashboard/aso/keywords` · Screenshots `/dashboard/aso/screenshots` · Translations `/dashboard/aso/screenshot-translation`
  ANALYTICS: Reviews `/dashboard/reviews`
  APP IDEAS: Hot ideas `/dashboard/hot-ideas`
  API: API Keys `/settings/api-keys` · MCP `/mcp` · API Docs `/docs`
  TOOLS: Pricing Calculator `/tools/pricing-calculator` · Settings `/settings`
- **`App.tsx`** — register every route. Routes owned by other lanes point at a temporary `Placeholder` page (title + EmptyState) until they land.
- **Shared components (stub with real prop interfaces, commit):** `Tabs`, `Widget`, `EmptyState`, `MasterDetail` (left list / right detail), `FilterRail`, `FavoriteToggle`. B/C/D import these — keep the prop API stable; extend additively.
- Keep `/` redirect → `/dashboard/explore`; keep `/apps/:id`.

### 2. Your pages
- **Explore** `/dashboard/explore` (extend `ExplorePage.tsx`): full filter rail — Time (released/updated 7/14/30/60/90/custom) · Source (Apple/Google) · Category (include/exclude) · App Language (include/exclude) · **Marketing Signals** (Meta Ads/Apple Ads/Creators — all 0 rows → chips still work, results empty) · Contacts · Growth-sort window · Price. Columns: #, App (icon+title+developer), Category pill, **Growth-7d sparkline +% (label "pending baseline")**, Rating ★, Reviews, Downloads, MRR, Released, Last-Update, View. Pagination "Showing 50 of N", search, Refresh, Clear, **CSV + JSON** export. Wire all 40 `getApps` params (see contract).
- **Highlights** `/dashboard/highlights`: 3 `Widget`s — New Big Hits / Top Gainers (+N 1D) / Top Losers (−N), each rank/name/category/DL/MRR + "View all"; store filter. (1-day deltas absent → "pending baseline" empty-state.)
- **Trending** `/dashboard/trending` "Store Rankings": tabs Top Free/Paid/Grossing, store + country + category pickers, "Updated Nh ago". Cols Rank/24h Δ/App/Downloads/MRR. No charts API yet → mock list behind `lib/api.ts` + a TODO for `GET /charts`.
- **Rising** `/dashboard/rising` "Rising Apps": Launched 3M/6M/1Y · Growth-signal 2W/1M/3M · store · country/category · "View in Explore". Cols Rank/App·dev/MRR/Growth%/Downloads.
- **Favorites** `/dashboard/favorites`→`/favorites/apps`: saved hub, `Tabs` Apps/Meta-ads/Apple-ads/Creators/Hot-ideas. No user store (auth out) → back `FavoriteToggle` with **localStorage**; empty-state "click the heart on Explore". Wire `FavoriteToggle` onto Explore rows + detail.

## Merge hygiene (shell owner — you set the conventions for 4 parallel lanes)
- You own `index.css` tokens, `App.tsx` router, `Sidebar.tsx`, the shared components, and the `lib/api.ts` base — **land + push these early** so B/C/D can rebase.
- B/C/D are instructed to add lane-scoped `src/styles/<lane>.css` + `src/lib/api/<lane>.ts` and only swap their own route placeholder — pushing the shell first is what makes that conflict-free.
- **Dev port:** `pnpm dev:web -- --port 5173`; shared backend on `:3007`.

## DoD
All 6 routes render live-matching; shell (sidebar + router + shared components) committed & pushed early; real data where present, honest empty-states elsewhere; no fabricated data shown as real.
