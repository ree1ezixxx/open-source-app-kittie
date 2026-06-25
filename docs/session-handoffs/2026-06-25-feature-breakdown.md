# Handoff — Surgical feature breakdown (every surface + its core purpose)

**Date:** 2026-06-25
**Repo:** `/Users/ellis/Documents/open-source-app-kittie` — AppKittie clone, independent open-source mobile-app intelligence platform.
**Scope:** one row per shipped feature: route → page component → API → backing service → *what it exists to do*. Source of truth for routes = `apps/web/src/App.tsx`; for API = `packages/api/src/app.ts` (mounted under `/api/v1/*`).

> Architecture/build state lives in `docs/session-handoffs/2026-06-24-build-and-architecture.md`. This doc is features only.

---

## 1. Discovery & catalog

| Feature | Route | Page | API | Service | Core purpose |
|---|---|---|---|---|---|
| **Pulse** (landing/home) | `/dashboard/pulse` (`/` redirects here) | `PulsePage.tsx` | charts/apps reads | `warm-cache.ts` | First screen. Centralized landing queries + route prefetch — the "intelligence pulse" digest of what's moving right now. |
| **Explore** (apps database) | `/dashboard/explore` | `ExplorePage.tsx` | `/apps` | `db-app-service.ts`, `app-query.ts`, `filter-sort.ts`, `app-list-scoring.ts` | The core apps DB. Filter/sort/paginate the whole catalog. Perf-critical: keyset pagination + FTS5 search + precomputed revenue (see `docs/perf/latency-log.md`). |
| **App detail** | `/apps/:id`, `/app/:slug` | `AppDetailPage.tsx` | `/apps/:id`, `/app-intelligence/teardown` | `app-service.ts`, `app-about-service.ts`, `teardown-service.ts` | Single-app intelligence. Classic ⇄ **Teardown** toggle → the signature pannable react-flow node graph (`components/teardown/`). |
| **Favorites** | `/dashboard/favorites/:tab` | `FavoritesPage.tsx` | `/apps` (filtered) | tracked-app reads | User-saved apps/ideas shortlist. |

## 2. Trend signals

| Feature | Route | Page | API | Service | Core purpose |
|---|---|---|---|---|---|
| **Trending** | `/dashboard/trending` | `TrendingPage.tsx` | `/charts`, `/apps` | `charts.ts`, `freshness-service.ts` | Apps with sustained upward chart movement. |
| **Rising** | `/dashboard/rising` | `RisingPage.tsx` | `/charts`, `/apps` | `charts.ts` | First-mover detection — fast climbers before they peak. |
| **Highlights** | `/dashboard/highlights` | `HighlightsPage.tsx` | `/charts` | `charts.ts` | New Big Hits / Top Gainers / Losers buckets. |

## 3. Ad & organic intelligence

| Feature | Route | Page | API | Service | Core purpose |
|---|---|---|---|---|---|
| **Ads Library** | `/dashboard/ads` | `AdsLibraryPage.tsx` | `/ads` | `routes/ads.ts` | Meta Ad Library mirror. **Blocked on FB ID verification → honest empty-state**, never fake rows. |
| **Organic** | `/dashboard/organic` | `OrganicPage.tsx` | (blocked-surface list pattern) | — | Creator/organic video intel. Drives from small owned table, hydrates page slice, honest empty-state. |

## 4. ASO (App Store Optimization)

| Feature | Route | Page | API | Service | Core purpose |
|---|---|---|---|---|---|
| **App Tracking** | `/dashboard/aso/apps` | `aso/AppTrackingPage.tsx` | `/keywords`, `/apps` | `tracked-app-service.ts` | Track owned/competitor apps + their keyword ranks over time (add-flow polish = PR #95 draft). |
| **Keyword Explorer** | `/dashboard/aso/keywords` | `aso/KeywordExplorerPage.tsx` | `/keywords` | `keyword-service.ts`, `keyword-rescore-service.ts` | Keyword popularity + difficulty + rank history (autocomplete proxy ADR 0001; tracked-keywords table ADR 0003). |
| **Screenshot Generator** | `/dashboard/aso/screenshots` | `ScreenshotGeneratorPage.tsx` | `/ai`, `/builder` | `lib/visual-qa.ts` | Generate App Store screenshot sets. |
| **Screenshot Translation** | `/dashboard/aso/screenshot-translation` | `ScreenshotTranslationPage.tsx` | `/ai` | — | Localize screenshots; honest empty-state when no source. |

## 5. Reviews

| Feature | Route | Page | API | Service | Core purpose |
|---|---|---|---|---|---|
| **Reviews** (tabbed: overview/feed/…) | `/dashboard/reviews/:tab` | `reviews/ReviewsPage.tsx` + `reviewTabs.tsx` | `/reviews` | `review-sweep-service.ts`, `review-sync-service.ts` | Review mining/sentiment per app. Legacy `/reviews/*` routes redirect into the tabbed shell. |

## 6. Hot Ideas (opportunity engine)

| Feature | Route | Page | API | Service | Core purpose |
|---|---|---|---|---|---|
| **Hot Ideas rail** | `/dashboard/hot-ideas` | `HotIdeasPage.tsx` | `/ideas` | `idea-sweep-service.ts`, `idea-gate.ts`, `idea-blueprint.ts` | Surfaced app-opportunity ideas. Gemini batch scoring (ADR 0005); `idea-gate` filters quality before display. |
| **Idea detail** | `/dashboard/hot-ideas/:slug` | `IdeaDetailPage.tsx` | `/ideas/:slug` | `idea-blueprint.ts` | Per-idea blueprint: why it's an opportunity, build shape. |

## 7. App Intelligence (agent-first / decision surfaces)

| Feature | Route | Page | API | Service | Core purpose |
|---|---|---|---|---|---|
| **Intelligence home** | `/intelligence` | `AppIntelligence/IntelligenceHome.tsx` | `/app-intelligence` | `routes/app-intelligence/index.ts` | Hub for the decision-packet / agent-readable layer. |
| **Validate idea** | `/intelligence/validate` | `AppIntelligence/ValidatePage.tsx` | `/app-intelligence/validate` | `validate-idea-service.ts` | Deterministic scoring + verdict + cached LLM narrative for an app idea (Lane A, #152). |
| **Similar apps** | `/intelligence/similar` | `AppIntelligence/SimilarPage.tsx` | `/app-intelligence/similar` | `similar-apps-service.ts` | Multi-pass retrieval + deterministic rerank to find comparable apps (Lane A, #151). |
| **Teardown (data)** | (powers App detail) | — | `/app-intelligence/teardown` | `teardown-service.ts` | Backend for the react-flow teardown canvas; quick/standard/deep depth (Lane B, #153). |

## 8. Builder / App Engine (clone-to-build)

| Feature | Route | Page | API | Service | Core purpose |
|---|---|---|---|---|---|
| **Studio / Builder** | `/studio`, `/studio/:id`, `/dashboard/builder/:id` | `BuilderPage.tsx` | `/builder`, `/clone` | `lib/repair-runner.ts`, `lib/preview.ts`, `lib/workspace.ts`, `lib/visual-qa.ts` | Generate/iterate an app build (clone-engine + visual blueprint, L7). Repair loop + preview + visual QA. |
| **App Engine** | `/dashboard/app-engine` | `AppEnginePage.tsx` | `/app-engine` | `routes/app-engine.ts` (seed: `scripts/seed-app-engine.ts`) | Engine surface driving builds from competitor intelligence. |

## 9. Tools, platform & meta

| Feature | Route | Page | API | Core purpose |
|---|---|---|---|---|
| **Pricing Calculator** | `/tools/pricing-calculator` | `PricingCalculatorPage.tsx` | — | Model app pricing/revenue scenarios (billing engine parked; this is the calculator UI). |
| **MCP landing** | `/mcp` | `McpLandingPage.tsx` | — | Pitch/entry for the MCP server surface (`@kittie/mcp`, L5). |
| **Docs** | `/docs` | `DocsPage.tsx` | `/openapi.json` | API/usage docs; OpenAPI document served at `/openapi.json`. |
| **Settings** | `/settings` | `SettingsPage.tsx` | — | App preferences (incl. theme toggle). |
| **API Keys** | `/settings/api-keys` | `ApiKeysPage.tsx` | — | Manage API keys for programmatic access. |

## Cross-cutting backend (not a page, but load-bearing)
- **`sweeps.ts` / `freshness-service.ts`** — the single freshness scheduler (ADR 0004). Snapshot worker is **due-driven + out-of-process** (ADR 0008) so API boot can't OOM. Must be registered or data goes stale.
- **`run-events.ts`** — live run/event stream (builder + sweeps progress).
- **LLM adapters** — `lib/gemini.ts`, `lib/ollama.ts`, `lib/gamma.ts` (Gemini free key = 20 req/day/model — fail fast on PerDay 429s).
- **Honesty contract** — fielded data wrapped in `Provenanced<T>`, strategic output in `DecisionPacket` (`packages/types`). Coverage/confidence/freshness must trace to real evidence.

---

## Verification notes for whoever picks this up
- Route list is exact as of `App.tsx` today; **API service file may have moved** — `grep` before trusting a path.
- Some services back multiple surfaces (e.g. `charts.ts` → Trending/Rising/Highlights). Don't assume 1:1.
- Two parity-blocked surfaces (Ads, Organic) are **intentionally** empty-state, not broken.

## Suggested skills
- **`/clone`** + **`/coordinator`** — audit any surface above against live `appkittie.com`, score ≥4/5.
- **`/improve-codebase-architecture`** — if consolidating the service layer.
- **`/diagnose`** — for sweep/freshness/OOM-class issues.
