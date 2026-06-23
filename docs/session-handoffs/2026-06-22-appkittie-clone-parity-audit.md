# Session Handoff — appkittie.com clone parity audit (truth ↔ clone, per-surface ranking + gap map)

## Where it started
User asked for a strict, ruthless, top-to-bottom parity audit of the **open-source-app-kittie clone** (`apps/web`, Vite+React on `:5173`) against the **live source of truth `https://www.appkittie.com`**, then a ranking of "where we're dropping the ball." Goal of the overarching project: clone appkittie.com **completely**. Brand rename to "Kittie" (wordmark/logo) is the **only** intentional divergence — everything else (IA, layout, behaviour, data shape, visuals) is in scope. Per repo `CLAUDE.md`, every surface is scored **/5 with a hard ≥4 gate**. User deprioritised Ads + Organic-video data for now (data-ingestion blocked) but they still count in the ranking.

## Decisions locked + what shipped
- **No code changes this session.** This was an audit only. Branch `main`, clean.
- **Captured truth + clone to disk** for a path-by-path diff. Artifacts in `/Users/ellis/Documents/open-source-app-kittie/tmp/audit/` — `ref-*.json`/`ref-*.png` = truth (all 19 surfaces, desktop), `tgt-*.json`/`tgt-*.png` = clone. Each `*.json` is a structured DOM extraction (h1/h2/h3, nav links+href, buttons, tabs, table headers+rows, inputs, empty-states, pills). Screenshots are full-page where they didn't time out.
- **Key discovery — same URL paths.** The clone mirrors truth's routes exactly (`/dashboard/explore`, `/dashboard/ads`, `/dashboard/organic`, `/dashboard/aso/*`, `/dashboard/reviews`, `/dashboard/hot-ideas`, `/settings`, `/settings/api-keys`, `/mcp`, `/docs`, `/tools/pricing-calculator`). Compare path-for-path.
- **Overall rank: ~2.9 / 5 (≈58%).** Core dashboards are a solid clone (~3.5/5); the score is dragged down by one **missing page** (Organic), one **wrong-tool page** (Pricing Calculator), thin **account/dev** surfaces, IA/taxonomy drift, and repeating heading/polish gaps. Only Rising + Reviews clear ≥4 cleanly.

#### Environment facts the next agent MUST know (gotchas)
- **Clone dev servers were already running (not started this session):** web `:5173` (`@kittie/web`, `pnpm dev:web`), API `:3008` (`@kittie/api`, `pnpm dev:api`). `apps/web/.env.local` sets `VITE_API_ORIGIN=http://localhost:3011` which is **dead**, but the running Vite server proxies to `:3008` and serves live data — don't "fix" `.env.local` blindly; the running server works. `vite.config.ts` defaults to `:3008` when the env var is unset.
- **Truth browser:** Chrome on debug port **9223** (repo `.mcp.json` binds `chrome-devtools` MCP to `http://127.0.0.1:9223`). It had two tabs: truth `appkittie.com` and clone `127.0.0.1:5173`. (Repo `CLAUDE.md` documents a separate `coordinator/truth-chrome.sh` → port 9222 with persistent login profile `~/.kittie-truth-chrome`; this session used the already-open 9223 instance.) **One browser instance only — never fan out browser-driving agents onto it; they collide.**
- **390px viewport trap (cost a re-capture):** the clone tab was pinned to a **390px emulated viewport** inside a 1580px window (`innerWidth 390`, `meta viewport` is correct `width=device-width`). The clone's `@media (max-width:900px)` then fired → sidebar `display:none`, `.app-shell` collapsed to a single `390px` grid column → "huge dead space" on the right. **This was an emulation artifact, NOT a clone bug.** Fixed via Chrome MCP `emulate viewport=1440x900x1` (persists across navigations on that tab). All clone captures EXCEPT ads were retaken at 1440px; ads `tgt-ads.*` is still the 390px mobile capture.
- **Real bug surfaced underneath:** at 1440px the apps `table.apps` has a fixed **1302px** intrinsic width inside the **1196px** content column → ~106px horizontal overflow. Separate from the dead-space.
- **`/dashboard/explore` would not rasterise** (3× `Page.captureScreenshot timed out`) while `evaluate_script` worked and 53 rows were present — suspected **perpetual CSS animation** preventing a stable compositor frame. `tgt-explore.png` is the only clone screenshot captured at 1440 that succeeded after retries; app-detail/rising full-page also time out (tall pages) → use viewport shots / the JSON.

#### Scorecard (✅ ≥4 pass · ⚠️ 3–3.5 · ❌ ≤2.5) — clone vs truth
| Surface | Truth path | /5 | Headline gap |
|---|---|---|---|
| Sidebar / IA | (all) | ⚠️3.0 | Group headers + order + labels differ: truth `EXPLORE / YOUR APPS / ASO / ANALYTICS / APP IDEAS` → clone `Discover / Research / Watchlist / Studio / Developers`; "Ads"→"Ads Library"; Studio+Developers collapsed |
| Explore | `/dashboard/explore` | ⚠️3.5 | No `h1` "Explore Apps"; renders a dense semantic **table** vs truth's card-rows; extra columns (Reviews/Downloads/Released/Last update/Action); 1302px overflow; raster timeout |
| App detail | `/app/...` | ⚠️3.5 | Missing **Organic Content** section; truth's 6 top stat-cards (Creators/Meta Ads/Apple Ads/Size/Platforms/Rating) collapsed into one "Details" card; no media All/Videos/Images tabs; chart Daily/Total + 30D/90D/300D/ALL ✅ matches |
| Highlights | `/dashboard/highlights` | ⚠️3.5 | No page `h2` "Dashboard Highlights"; missing column-header rows + "#" rank prefix (old `CLONE-GAP.md` items STILL open); count baked into `New Big Hits (126)` vs sibling badge |
| Trending | `/dashboard/trending` | ⚠️3.5 | No `h1` "Store Rankings"; "24h" movement column shows "—" (needs 2nd snapshot); Top Free/Paid/Grossing + country/category ✅ |
| Rising | `/dashboard/rising` | ✅4.0 | Missing `h1` "Rising Apps" + "View in Explore" deep-link; windows 3M/6M/1Y + 2W/1M ✅; growth% column ✅ |
| Reviews | `/dashboard/reviews` | ✅4.0 | Tabs Overview/Reviews/Semantics/Improvements ✅; **Semantics + Improvements are mocked** vs truth real AI; Apple sync pending (data) |
| Favorites | `/dashboard/favorites` | ⚠️3.5 | Verify subnav tabs (apps/ads/apple-ads/creators/ideas) + empty copy ("No favorite apps yet", "0 apps saved") |
| Keyword Explorer | `/dashboard/aso/keywords` | ⚠️3.5 | Verify input copy "Search, paste keywords, or start a topic…" + tabs All/Opportunities/Low diff/Pending |
| App Tracking | `/dashboard/aso/apps` | ⚠️3.5 | Truth "App Keyword Tracking" + Add-app empty flow ("No apps tracked yet") |
| Screenshots | `/dashboard/aso/screenshots` | ⚠️3.5 | Truth "AI Screenshot Generator" (Previous Generations + New/Unreleased path); clone Gemini-gated on `GOOGLE_GENAI_API_KEY` |
| Translations | `/dashboard/aso/screenshot-translation` | ⚠️3.5 | Truth "Screenshot Translation" (Recent Translations + target countries); clone Gemini-gated |
| Hot Ideas | `/dashboard/hot-ideas` | ⚠️3.5 | Truth shows "Needs backend/database/AI" labels + "1,296 ideas · Page 1 of 144" pagination; verify clone parity |
| Ads | `/dashboard/ads` | ❌2.5 | UI shell OK but **0 ads** (Meta ingest blocked — data). NOTE clone capture is the stale 390px one |
| Settings | `/settings` | ❌2.5 | Truth has Pro-Plan card, Export History, real Team Members (≤5 invites, Stripe portal); clone = toast stubs |
| API Keys | `/settings/api-keys` | ❌2.5 | Truth has API Credits + Rate Limits + Recent Requests + buy tiers (10k–2M) + per-call credit model (1/app, 10/kw-difficulty…); clone = stubs |
| MCP landing | `/mcp` | ⚠️3.0 | Truth = deep page (connect steps, tool list search_apps/get_app_detail…, FAQ, `claude mcp add` + config JSON + `npx skills add`); clone thinner |
| Docs | `/docs` | ❌2.5 | Truth = full Mintlify site (Quickstart/Auth/Filters/Credits/Rate-Limiting/Errors + endpoint list); clone = single page |
| **Pricing Calculator** | `/tools/pricing-calculator` | ❌1.0 | **WRONG TOOL.** Truth = Global-Purchasing-Power localizer (title "…Global Purchasing Power Index"): base USD price → **244-country** localized price table, Add Price, Copy/Export JSON. Clone = a revenue/MRR estimator (downloads×price). |
| **Organic** | `/dashboard/organic` | ❌0.0 | **Page missing entirely** — clone `/dashboard/organic` redirects to Explore. Truth = `h1` "Organic Content" + Filters + grid of TikTok/Instagram creator videos per app |

#### The 5 fixable themes dragging the score (NOT data-blocked)
1. **Organic page doesn't exist** — add route + page: creator-video grid (TikTok/Instagram) with category / ad-language / sort (Newest indexed, High/Low) filters + Prev/Next. Biggest single hole.
2. **Pricing Calculator is the wrong feature** — rebuild `PricingCalculatorPage.tsx` as a PPP price-localizer: base-price inputs → per-country currency+price table (244 rows), Copy/Export JSON. Not a revenue estimator.
3. **Account/dev surfaces are stubs** — Settings (Pro plan, Export History, team members), API Keys (credit balance/tiers, rate limits, request log), Docs (multi-page). Some overlaps the auth/billing lane — confirm ownership before building billing.
4. **IA/taxonomy drift** — realign sidebar groups/order/labels to truth's `EXPLORE / YOUR APPS / ASO / ANALYTICS / APP IDEAS` (unless the IA divergence is also intentional — OPEN QUESTION).
5. **Repeating heading + polish gaps** — add page `h1`/`h2` on Explore/Trending/Rising/Highlights; "#" rank prefix + column-header rows (Highlights); fix the 1302px table overflow; investigate the explore raster/animation.

#### External data blockers (legitimately cap surfaces <4 — not code defects)
Meta ad ingest (Ads + app-detail Meta Ads), Apple Search Ads, creators/organic video data, non-US markets (Trending/Rising), Apple review sync (Reviews), AI keys `GOOGLE_GENAI_API_KEY` (Screenshots/Translations), billing/auth (Settings/API Keys). Honest empty-states are the correct behaviour per repo policy — do NOT fabricate rows.

#### Clone-only over-builds to reconcile with the user
"Clone to iOS" card on app-detail; the Builder / App Engine / Studio section. None exist on truth.

## Key files for next session
- `/Users/ellis/Documents/open-source-app-kittie/docs/session-handoffs/2026-06-22-appkittie-clone-parity-audit.md` — this file.
- `/Users/ellis/Documents/open-source-app-kittie/tmp/audit/` — all capture artifacts (`ref-*` truth, `tgt-*` clone). Read these to see exact truth structure/copy per surface.
- `/Users/ellis/Documents/open-source-app-kittie/CLAUDE.md` — source-of-truth rules + the /5 fidelity gate + truth-chrome launch.
- `/Users/ellis/Documents/open-source-app-kittie/CLONE-GAP.md` — prior Highlights QA pass; its open items (header rows, page h2, "#" prefix) are STILL unresolved.
- `/Users/ellis/Documents/open-source-app-kittie/CONTEXT.md` — domain terms.
- Clone source per surface (all under `/Users/ellis/Documents/open-source-app-kittie/apps/web/src/`):
  - Sidebar/IA: `components/Sidebar.tsx`, `components/PageShell.tsx`, `components/Topbar.tsx`, `App.tsx` (routes)
  - Explore: `pages/ExplorePage.tsx`, `components/ExploreFilterRail.tsx`, `components/AppTable.tsx`, `components/Pagination.tsx`, `lib/exploreFilters.ts`
  - App detail: `pages/AppDetailPage.tsx`, `components/MetricBar.tsx`, `components/TrendPanel.tsx`, `components/DetailCard.tsx`, `components/Lightbox.tsx`, `components/detail/CloneToIosCard.tsx`
  - Highlights: `pages/HighlightsPage.tsx`, `components/RankList.tsx`
  - Trending: `pages/TrendingPage.tsx` · Rising: `pages/RisingPage.tsx` · Ads: `pages/AdsLibraryPage.tsx`
  - Organic: **does not exist** — create page + add route in `App.tsx`
  - Favorites: `pages/FavoritesPage.tsx`, `lib/favorites.ts`
  - ASO: `pages/aso/KeywordExplorerPage.tsx`, `pages/aso/AppTrackingPage.tsx`, `components/aso/KeywordBits.tsx`, `lib/api/keywords.ts`
  - Screenshots/Translations: `pages/ScreenshotGeneratorPage.tsx`, `pages/ScreenshotTranslationPage.tsx`
  - Reviews: `pages/reviews/ReviewsPage.tsx`, `pages/reviews/reviewTabs.tsx`, `lib/api/reviews.ts`
  - Hot Ideas: `pages/HotIdeasPage.tsx`, `pages/IdeaDetailPage.tsx`, `lib/api/ideas.ts`
  - Settings/API Keys/MCP/Docs/Pricing: `pages/SettingsPage.tsx`, `pages/ApiKeysPage.tsx`, `pages/McpLandingPage.tsx`, `pages/DocsPage.tsx`, `pages/PricingCalculatorPage.tsx`
- Plan file: none.
- Memory files touched: none.

## Running state
- Background processes: none started this session. A fan-out Workflow (`kittie-parity-audit`, run `wf_bf7b520c-e61`) was launched then **stopped** by the user; its auto-handoff was abandoned. Script persists at `/Users/ellis/.claude/projects/-Users-ellis-Documents-open-source-app-kittie/6bac979e-009b-420e-90d4-4963d6c7e631/workflows/scripts/kittie-parity-audit-wf_44d4fe0f-35d.js` if anyone wants to resume it (it analyses captures + writes a handoff; not needed now).
- Dev servers / ports: web `http://127.0.0.1:5173` (`@kittie/web`), API `http://localhost:3008` (`@kittie/api`) — both pre-existing, not owned by this session. Other listeners seen: 3000 (mobbin-mirror), 3008, 3099, 5173, 8081/8082/8083 (RN metros, unrelated).
- Browser: Chrome debug port **9223** (truth + clone tabs). The **clone tab has an emulated viewport override of 1440×900** set this session (to escape the 390px pin) — it persists until that tab/profile resets. Repo `.mcp.json` → `chrome-devtools` MCP on 9223.
- Open worktrees / branches: repo on `main` (clean). Many sibling worktrees exist under `~/.codex/worktrees/` (per the earlier clean-worktrees handoff) — untouched here.

## Verification — how to confirm things still work
- `git -C /Users/ellis/Documents/open-source-app-kittie status --branch --short` — expect only `## main...origin/main`.
- `curl -s "http://localhost:5173/api/v1/apps?limit=2"` — expect JSON app data (proves web→API proxy works).
- Re-open truth vs clone path-for-path via Chrome MCP on 9223: `list_pages` → `select_page` → `navigate_page`. **Set the clone tab to desktop first**: `emulate viewport=1440x900x1` (else it renders mobile at 390px). Never `new_page` first.
- Re-capture a surface: `navigate_page` to the path, then `evaluate_script` (structured DOM extract → save with `filePath`) + `take_screenshot` (use viewport, not `fullPage`, on tall pages like app-detail/rising or it times out).
- Clone build sanity: `cd /Users/ellis/Documents/open-source-app-kittie && pnpm typecheck`.

## Deferred + open questions
- Deferred: **Ads + Organic-video data** — user said don't worry about them yet (Meta/creator ingest blocked). The Organic *page shell* is still a fixable code gap even without data.
- Deferred: clone browser captures were taken at desktop only for explore/app-detail/highlights/trending/rising; **Favorites, Keyword Explorer, App Tracking, Screenshots, Translations, Reviews, Hot Ideas, Settings, API Keys, MCP, Docs, Pricing were ranked from truth-capture + clone source code, not a live clone screenshot.** Next agent should browser-verify those at 1440px before acting on their scores.
- Deferred: a prioritised P0/P1/P2 fix backlog (with files + acceptance criteria) was offered but not yet produced.
- Open: **Is the sidebar IA divergence intentional** (like the brand) or should it be realigned to truth's taxonomy? Needs the user's call before touching `Sidebar.tsx`.
- Open: **Which fix first** — build the missing Organic page, or rebuild Pricing Calculator as the PPP localizer? Both are the lowest-scoring fixable surfaces.
- Open: ownership of billing/auth (Settings/API Keys) — confirm whether another lane owns it before building.

## Pick up here
Browser-verify the code-only surfaces at 1440px, then start the highest-leverage fixable gap — most likely **add the missing `/dashboard/organic` page** or **rebuild `PricingCalculatorPage.tsx` as the PPP price-localizer** — or first emit the P0/P1/P2 backlog from the scorecard above.
