# Handoff A — Clone to Full Parity

> **Pick up in:** worktree `open-source-app-kittie-ui`, branch `integrate/full-clone`.
> **Goal:** finish cloning appkittie.com so every surface is fully functional + self-updating — not a static clone.
> **Sibling work:** additive "what AppKittie lacks" features run in a SEPARATE worktree (`feat/additive`) — see [HANDOFF-B-missing-features.md](./HANDOFF-B-missing-features.md). Don't build those here.

## Where things stand (verified 2026-06-10)

- One trunk `integrate/full-clone` (off `feat/ui`), all 6 lane branches merged, typecheck green.
- **17 live sidebar surfaces render** + `/dashboard/ads` (Ads Library, built). Live-format URLs `/app/<slug>-id<storeAppId>` work.
- DB: `/Users/ellis/Documents/open-source-app-kittie/data/kittie.db` — **100,085 apps** (100K Apple + 85 Google), 3 snapshot days (2026-06-07/08/10), 30K+ reviews, 31 keywords, `meta_ads`/`creators` empty.
- Run: API `PORT=3009 pnpm dev:api` (bg) + `pnpm dev:web` → :5173 (proxies /api → :3009). Backup DB exists: `kittie.backup-2026-06-10.db`.
- **"API" = `packages/api`**, the local Hono backend on :3009. All sweeps live in that process.

## Grill decisions LOCKED (this is the spec — build to these)

### AI engine
- **Free Gemini** (`gemini-2.5-flash`), server-side in `packages/api`. Key in `.env` as `GEMINI_API_KEY` (`.env.example` gets a placeholder, never the real key). SDK `@google/genai`.
- **Copy AppKittie's architecture:** batch-generate → store in DB → refresh on cadence. Never generate per-view (except App About, below).
- ⚠️ **Key reality (verified 2026-06-10):** the `AQ.…` key WORKS (200) but its project free tier is **20 requests/day/model** — not the assumed ~250. Mitigations built: batch sweeps run on `gemini-2.5-flash-lite` (separate daily bucket), user-facing calls fall back flash→flash-lite, per-day quota errors fail fast and sweeps pause+resume. **Rhodri: grab a free `AIza…` key from aistudio.google.com for ~10× headroom** — drop into `.env` `GEMINI_API_KEY`, everything lights up (1,200 ideas ≈ 2 days on flash-lite).

### Hot Ideas (biggest gap — currently 30 mock cards in `apps/web/src/lib/api/ideas.ts`)
- Match live **~1,200 ideas**, each derived from one real fast-growing **source App**.
- Source-app selection: top apps by growth-score + low-hanging-fruit sift (high-rev / low-rating / rising). NOTE: growth is thin (3 snapshot days) — interim, blend growth + rising + recent-release until snapshots accrue.
- Each idea gets a **full Blueprint** (difficulty+reasoning, timeline, requirements, MVP/key/V2 features, architecture, tech stack, MVP scope, 3rd-party services) — Gemini-generated, **stored in DB** (new table, e.g. `app_ideas` + blueprint JSON, FK to source app).
- **Per-idea detail page**: route `/dashboard/hot-ideas/app-<slug>-id<storeAppId>`. Tabs **Building / Opportunity / Marketing**. Buttons: Export as prompt, Save idea, App Store, Appkittie-profile. Source-app card (reviews/dl/rev/rating/price/IAPs) + Similar Apps.
- **UI mockup image** = reuse the existing deterministic **screenshot-generator engine** (`apps/web/src/components/aistudio/screenshot-engine`) fed idea title+features. No image model. Free.
- **Freshness:** regenerate incrementally via boot catch-up sweep; full cycle ~7d (rate-limit: ~1,200 calls × 15rpm free ≈ 80 min, so slice per boot/day, never block).

### App Detail (extend `apps/web/src/pages/AppDetailPage.tsx`)
Build to parity:
- Breadcrumb (Home/Apps/<app>), SEO `<title>`.
- Info table: Size, Compatibility (iOS x+), Languages count, Age rating, Provider, Released.
- IAPs section (schema `iaps` exists — populate from Apple lookup where present).
- Organic Content / **Creators** block = **UI + honest empty state** (real ingestion DEFERRED — see below).
- **AI "About" narrative** (live: "generates est $X monthly… strategy includes N creators…"): **lazy-on-view, Gemini, cached forever in DB.** First detail open → 1 call → store → instant after. Never regen (descriptive, not time-sensitive). Only apps actually viewed cost a call.

### Keyword Explorer — **exact clone** (extend `apps/web/src/pages/aso/KeywordExplorerPage.tsx`)
- **Store + Markets modal** on Explore (store toggle, 26 markets, Select all, "Explore N countries" CTA, "more = longer analysis").
- Markets **14 → 26** (CONTEXT.md names 26 as target).
- **Async**: in-process job queue in API — keyword persists instantly as Pending, per-market analysis runs paced in background, UI polls/SSE → fills live (mirror the reviews SSE pattern).
- Tracked-keyword **re-score on boot sweep** when >7d stale (Greece-safe freshness).

### Live-sync (unified freshness service in `packages/api`)
Single registry of paced sweeps, boot catch-up + interval while API up:
| Sweep | Cadence |
|---|---|
| Snapshots (100K, batched 200/req via `snapshot-bulk`) | daily |
| Chart ranks | daily (with snapshots) |
| Reviews delta | existing in-process sweep |
| Keyword re-score | 7d stale |
| Hot ideas slice | rolling, full cycle ~7d |
- Status footer in UI: "data as of <date>" + sweep spinner.
- Constraint (unavoidable, local tool): sweeps run only while :3009 alive. Boot catch-up makes it invisible.

### Deferred (confirmed)
- **Creators (TikTok/IG) real data** — hardest free-data item, high fake-data risk. UI + empty state only; real social ingestion = separate spike. NEVER fabricate handles.
- Auth (Google OAuth), Stripe billing, real-domain deploy, Meta-ads data (blocked on Meta ID verification). All Rhodri's call, all out of this scope.

## Grill items — ALL RESOLVED + BUILT (2026-06-10, /goal run)
1. **Unified freshness service** — ✅ BUILT. One registry (`freshness-service.ts`), 5 sweeps live (reviews-delta 6h, snapshots-daily 24h, keyword-rescore 24h, hot-ideas 6h, google-expand 24h), `sweep_state` persists last-runs, `GET /api/v1/freshness` + sidebar footer ("data as of <date>" + sweep spinner). ADR 0004.
2. **Screenshots + Translation real AI** — ✅ BOTH REAL. `POST /api/v1/ai/art-direction` (Gemini copy, deterministic fallback) + `POST /api/v1/ai/translate-screenshot` (Gemini vision reads + translates on-image text, honest no-image-editing). Both cache-through `ai_generations`.
3. **Hot Ideas** — ✅ BUILT + LIVE. Selection gate = rising+recency+low-fruit blend (growth weight scales with snapshot-history depth); display sorts = exact live 7 (Created/Released/Reviews/Downloads/Revenue/Rating/Price) + blueprint toggles; `app_ideas` table; batch sweep on flash-lite (24/1,200 generated, paused on day-quota, auto-resumes); detail page `/dashboard/hot-ideas/app-<slug>-id<id>` with Building/Opportunity/Marketing tabs + export-as-prompt + deterministic CSS mockups. ADR 0005.
4. **Google Play scale** — ✅ BUILT. `google-expand` sweep: top-free+grossing × all Play categories, 400 new apps/run, target 5,000 (485 after first run), idempotent.
5. **Sequencing** — executed: Gemini seam → scheduler → Hot Ideas → App Detail (breadcrumb, SEO title, Size/Compatibility/Provider lazy-backfilled from Apple lookup, lazy AI About cached forever) → Keyword Explorer (26 markets, Store+Markets modal, SSE live market fill, re-score sweep) → AI Studio real → Google expand.

Verification: `pnpm -r typecheck` 9/9 clean, 15 unit tests green (scheduler due-selection + idea gate), zero console errors on every touched route, all 5 sweeps observed running live against the real DB. Committed as `608fef5` on `integrate/full-clone`.

## Post-review parity fixes (2026-06-10, after blind A/B test)
A blind two-analyst A/B review (swapped labels, isolated browsers) scored us level on UX/polish but behind on data correctness + volume. Everything actionable was fixed:
1. **Rising uniform "+7.5%" — FIXED.** Root cause: prior-snapshot lookup demanded ≥7-day-old history (we have 3 days) → no prior → all deltas zero → every app scored `0.15×updateRecency = 57.5`, UI showed `score−50`. Now: `pickPrior` falls back to the oldest available snapshot, deltas scale to the period via `priorDays`, and a REAL `growthPct` (period-scaled review velocity, null-honest, ±999 cap) flows through AppListItem → Rising/RankList. Verified live: +30.6 / +17.6 / +560 / +731.8.
2. **Grey icon boxes — FIXED.** DB icons are 100% present & URLs 200; the grey was the `.app-icon` background during cold loads + no error fallback. New shared `AppIcon` component (lettermark fallback on missing/failed, `decoding=async`) used by AppTable/Rising/Trending/RankList + CDN `preconnect` hints in index.html.
3. **Trending 24h "—" — FIXED.** Estimators are pure → API recomputes PRIOR-day estimates from prior-snapshot signals (`priorEstimates` in intelligence, `downloadsEstimatePrior`/`revenueEstimatePrior` on AppListItem); TrendingPage derives real ▲/▼ position deltas within the visible set.
4. **Hot Ideas 24 vs 1,206 — THROUGHPUT 8×.** Sweep now batches 8 source apps per Gemini call (`BATCH_RESPONSE_SCHEMA` with `sourceIndex` mapping); per-run cap 320 so the daily quota (not a constant) is the limiter. ~160 ideas/day on the AQ. key; ~1 day to target on an `AIza…` key. Both daily buckets were exhausted today by verification runs — sweep auto-resumes at quota reset (midnight PT); fail-fast verified on both models.
5. **Chart-rank coverage 280 → 4,078.** Added `fetchAppleGenreCharts` (legacy iTunes RSS, 24 genres × free+grossing, paced) into `fetchChartRankLookup` — 51 chart categories; persists with tomorrow's snapshot sweep, making rank deltas real at scale.
6. **Ads Library — externally blocked, not effort-blocked.** Inspected appkittie's network (logged-in): tRPC `ads.getAdsByAppSlug` served from THEIR pre-ingested Meta Ad Library DB. Real creatives require Meta ID verification (pending, Rhodri's side). Scraping Meta's site = ToS violation — not built. Empty state stays honest.

### Re-test (blind A/B round 2, same protocol, post-fixes)
- **Round-1 bugs verified gone:** no uniform +7.5% (Rising showed 75.3→999 varied), no grey icons, Trending 24h differentiated (▲1/▼9/▲8; top mega-apps legitimately 0 — same order both days, checked against API). Zero console errors on ours, both analysts.
- **Open-access analyst → ours, HIGH confidence** (appkittie 100% paywalled to logged-out visitors; ours fully usable).
- **Full-view analyst → appkittie, MEDIUM confidence (was High)**; ours now ahead on Keyword Explorer (pre-rendered insights), App Detail chart consistency (theirs showed 20K-monthly vs 93-chart mismatch), idea list thumbnails. Remaining deficits ONLY: Ads Library (Meta verification) + idea count 24 vs 1,206 (quota; batched sweep fills ~160/day, ~1 day on an AIza key).
- Commits: `608fef5` (parity build), `e303af7` (post-review fixes).

## Verification protocol
- `pnpm typecheck` clean; both servers boot; zero console errors per route.
- Diff each surface against the live signed-in appkittie.com tab (Claude-in-Chrome extension; `:9222` not used).
- Never wipe DB; all ingest idempotent upsert-only.
- Gemini-touching code: test call first; respect free rate limits (paced).

## Context docs
- `CONTEXT.md` — glossary (just resolved a committed merge-conflict; added Hot idea, Blueprint, Boot catch-up sweep). Read it.
- `docs/adr/` — 0001-0003 exist. Write **0004-hot-ideas-gemini-batch.md** (why free-Gemini-batch not paid/Claude) at build time.
- Plan file: `~/.claude/plans/appkittie-clone-full-parity.md` (marked EXECUTED for the first pass).
