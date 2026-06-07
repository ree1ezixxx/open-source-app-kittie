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
