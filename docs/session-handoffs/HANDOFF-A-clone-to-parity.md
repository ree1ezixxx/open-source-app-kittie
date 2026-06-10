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
- ⚠️ **Key format flag:** the key Rhodri supplied starts `AQ.Ab8RN6Ik…` — NOT the usual Google AI Studio `AIza…` format. **First build step = one test call.** If it 401s, Rhodri grabs a free `AIza…` key from aistudio.google.com. Whole AI plan hinges on this.

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

## OPEN grill items (resume with Rhodri before/while building)
1. **Unified freshness service** — posed, not explicitly confirmed. Likely yes.
2. **Screenshots + Translation real AI** — now Gemini is available, wire real art-direction/translation, or keep deterministic/mock? Currently deterministic (screenshots real on render, mock on art-direction; translation = typed mock).
3. **Hot Ideas source-app selection** while growth data is thin (3 snapshot days).
4. **Google Play scale** — 85 → thousands (scraper exists, `google-play-scraper`). Target + when. Buildable, no creds.
5. Final parity build sequencing.

## Verification protocol
- `pnpm typecheck` clean; both servers boot; zero console errors per route.
- Diff each surface against the live signed-in appkittie.com tab (Claude-in-Chrome extension; `:9222` not used).
- Never wipe DB; all ingest idempotent upsert-only.
- Gemini-touching code: test call first; respect free rate limits (paced).

## Context docs
- `CONTEXT.md` — glossary (just resolved a committed merge-conflict; added Hot idea, Blueprint, Boot catch-up sweep). Read it.
- `docs/adr/` — 0001-0003 exist. Write **0004-hot-ideas-gemini-batch.md** (why free-Gemini-batch not paid/Claude) at build time.
- Plan file: `~/.claude/plans/appkittie-clone-full-parity.md` (marked EXECUTED for the first pass).
