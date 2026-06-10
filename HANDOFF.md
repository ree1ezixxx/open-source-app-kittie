<<<<<<< HEAD
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
=======
# LANE D — Reviews & Meta
**Worktree:** `~/Documents/open-source-app-kittie-reviews-meta`  ·  **Branch:** `feat/reviews-meta` (forked from `feat/ui`)

> Full scope: `~/.claude/plans/delegated-finding-spark.md`
> Data contract: `~/Documents/open-source-app-kittie/docs/clone/api-contract.md`
> Hard limits: `~/Documents/open-source-app-kittie-ui/docs/session-handoffs/2026-06-07-clone-cant-do-capability-gaps.md`

## Shared context
- pnpm monorepo; web = `apps/web` (Vite + React 19 + RR7). Design: dark, lime `#c6f24d`, pill chips; tokens `src/index.css`; `lib/api.ts` (`/api/v1/*`).
- **Run:** backend from `~/Documents/open-source-app-kittie-ingest` → `PORT=3007 pnpm dev:api` (bg). Here: `pnpm install && pnpm dev:web`; preview `open -a "Dia" http://localhost:5173`.
- **Shell dependency:** Lane A owns sidebar/router + shared components (`Tabs`, `EmptyState`, `Chart`). Build your **page bodies** in isolated files now; **rebase onto `feat/ui` once the shell lands**, then mount routes.
- **Data reality:** review **text bodies exist** (13,320 reviews; `POST /api/v1/reviews` returns counts **and text**) → Reviews list/Overview can show **real data**. **Sentiment / semantics / improvements are NOT built** → put behind a typed mock interface + empty-states. `meta_ads/apple_search_ads/creators/iaps` = **0 rows** → detail-page sections render empty.

## Pages
- **Reviews** `/dashboard/reviews` → `/reviews/overview` — "Monitor reviews, sentiment & AI insights". `Tabs`: **Overview / Reviews / Semantics / Improvements**. Per-app monitoring list (empty: "No apps monitored yet — Add your first app"). 
  - *Overview* = rating distribution + sentiment summary (sentiment mocked).
  - *Reviews* = filterable review list using **real `POST /reviews` text** (rating, title, body, author, date; filters by rating/recency).
  - *Semantics* = clustered themes (mock).
  - *Improvements* = AI suggestions (mock).
  - Add a "How review monitoring works" affordance.
- **MCP landing** `/mcp` — marketing page. Hero "App Store intelligence in your IDE"; copy-paste terminal (`claude mcp add appkittie --transport http https://mcp.appkittie.com --header "Authorization: Bearer YOUR_API_KEY"`); **6 tools** (search_apps, get_app_detail, get_keyword_difficulty, batch_keyword_difficulty, get_app_reviews, get_supported_countries); **9 skill cards** (App Discovery, Keyword Research, Metadata Optimization, Competitor Analysis, Growth Analysis, Ad Intelligence, Revenue Analysis, +2); 3-step quick-setup; "View on GitHub". Static content — no backend.
- **Settings** `/settings` — sections: **Plan** (status/price/renew + "Subscription & billing" button → stub), **Team** ("Create a Team", share ≤5 → stub), **Export History** (list + empty-state "No exports yet"). Auth/billing buttons are **stubs** (Rhodri's lane) — render them, don't wire.
- **App-Detail parity** `/apps/:id` — extend the existing page: add **Meta-ads · Apple-ads · Creators · IAPs** sections + **historical revenue/reviews charts** (use `Chart`). All back tables are empty today → each section gets an **honest empty-state** ("No data yet"), not fabricated content. (Note: `AppDetailPage.tsx` already has a "Preview videos aren't collected yet" honest empty-state — match that tone.)

## Merge hygiene (you're 1 of 4 parallel lanes — keep merge-back clean)
- **Own files only:** new pages/components under your own folders; for App-Detail parity, add **new section components** and import them — minimise edits to the shared `AppDetailPage.tsx`.
- **CSS:** lane styles in a new `src/styles/reviews.css` imported by your pages — don't pile into `index.css` (shell owns tokens).
- **API:** add endpoints in a new `src/lib/api/reviews.ts` — don't edit shared `lib/api.ts`.
- **Routes:** only swap YOUR route placeholders in `App.tsx`.
- **Dev port:** `pnpm dev:web -- --port 5176` (webs collide on 5173); all proxy to shared API `:3007`. Sync `feat/ui` before first merge.

## DoD
Reviews 4 tabs render (real review text; sentiment/semantics/improvements mocked + labelled); MCP landing matches live; Settings sections present with stubbed auth/billing; detail parity sections added with empty-states. No real auth wired.
>>>>>>> feat/reviews-meta
