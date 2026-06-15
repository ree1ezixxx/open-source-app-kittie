# PRD — AppKittie Clone to Full Parity

> Worktree `open-source-app-kittie-ui`, branch `integrate/full-clone`.
> Synthesised from the 2026-06-10 grill session (all five open items LOCKED). Base spec: [HANDOFF-A-clone-to-parity.md](./session-handoffs/HANDOFF-A-clone-to-parity.md). Glossary: [CONTEXT.md](../CONTEXT.md). Decisions of record: ADR 0004 (single freshness scheduler), ADR 0005 (Hot Ideas Gemini batch).
> This PRD is the input for a `/goal` execution run.

## Problem Statement

Kittie renders all 17 AppKittie surfaces, but several are hollow: Hot Ideas is 30 mock cards against AppKittie's ~1,206 real AI-generated ideas; App Detail lacks the AI About narrative and full info parity; Keyword Explorer covers 14 of 26 markets and blocks on synchronous lookups; screenshot art-direction copy and translations are fake; and data freshness is a single hardcoded reviews sweep with no user-visible "data as of" signal. A user comparing Kittie side-by-side with appkittie.com immediately sees the gaps.

## Solution

Wire a free Gemini engine (`gemini-2.5-flash`) server-side and a single freshness scheduler into the API, then rebuild each gap to live parity: ~1,200 real Hot Ideas with Blueprints generated in batch and stored, App Detail with lazy-cached AI About, an async 26-market Keyword Explorer, real AI art-direction and translation, and a visible freshness footer — all self-updating via paced in-process sweeps, all free.

## User Stories

1. As a researcher, I browse ~1,200 Hot Ideas (not 30 mocks), each derived from a real source App, with working pagination ("N ideas · Page x of y").
2. As a researcher, I filter Hot Ideas by search text, App Store category, idea-category labels, and Blueprint needs (backend / database / AI), and sort by AppKittie's exact seven metrics: Created, Released, Reviews, Downloads, Revenue, Rating, Price (High→low / Low→high).
3. As a researcher, I open a Hot Idea detail page at `/dashboard/hot-ideas/app-<slug>-id<storeAppId>` with Building / Opportunity / Marketing tabs, a full Blueprint (difficulty + reasoning, timeline, requirements, MVP/key/V2 features, architecture, tech stack, MVP scope, third-party services), a source-App card, and Similar Apps.
4. As a builder, I export a Hot Idea as a prompt, save it, and jump to its App Store page or Kittie profile from the detail page.
5. As a researcher, each Hot Idea card shows a UI mockup image produced by the existing deterministic screenshot engine fed the idea's title + features.
6. As a researcher, on first opening an App Detail page I see an AI-generated About narrative (revenue framing, strategy summary); reopening is instant because it is cached forever.
7. As a researcher, App Detail shows breadcrumb (Home / Apps / app), SEO title, full info table (Size, Compatibility, Languages count, Age rating, Provider, Released), populated IAPs where Apple provides them, and an honest empty Creators block.
8. As an ASO user, exploring a Keyword opens a Store + Markets modal (store toggle, 26 markets, Select all, "Explore N countries" CTA, "more = longer analysis" hint).
9. As an ASO user, submitting a Keyword persists it instantly as Pending; per-market analysis fills in live without blocking the page, and Tracked keywords older than 7 days re-score automatically.
10. As a user, I see a status footer on data surfaces: "data as of <date>" plus a spinner while a sweep is running.
11. As an AI Studio user, generating screenshots produces real Gemini art-direction copy, and translating screenshot copy produces real translations — both cached so repeat requests are free.
12. As a researcher, Google Play coverage grows to ~3–5K apps via a background sweep (after parity features ship).
13. As an operator, all of the above stays fresh automatically while the API runs: boot catch-up sweep plus interval, no cron, no hosted infra, no cost.

## Implementation Decisions

**Gemini engine (the seam everything AI shares)**
- One server-side Gemini client module in the API package, SDK `@google/genai`, model `gemini-2.5-flash`, key from `GEMINI_API_KEY` in `.env` (placeholder in `.env.example`, never the real key).
- **First build step is a single test call.** The supplied key starts `AQ.` (not `AIza…`); if it 401s, halt AI work and ask Rhodri for a free AI Studio key. Everything AI-dependent sequences behind this gate.
- Architecture copies AppKittie: batch-generate → store in DB → refresh on cadence. Never generate per page view. Two deliberate exceptions, both user-triggered and DB-cached by input key: App About (lazy on first view, cached forever) and Screenshots/Translation (cached by app + prompt / app + target language).
- All generated artifacts persist in the DB (new tables; a shared `ai_generations` cache table keyed by kind + subject + input hash is acceptable for About/translation/art-direction). Paced to free-tier rate limits (~15 rpm) — sweeps slice work per boot/day, never block.

**Single freshness scheduler (ADR 0004)**
- One registry in the API process; each sweep declares name, cadence, last-run, and a run function. Boot catch-up runs anything past cadence; an interval re-checks while up. Last-run state persists in the DB so catch-up survives restarts.
- Registered sweeps and cadences: Snapshots + chart ranks (daily, reusing the existing bulk snapshot job from the ingest package — currently CLI-only, must become callable in-process), Reviews delta (existing sweep, migrated into the registry as the first entry), Tracked-keyword re-score (>7 days stale), Hot Ideas slice (rolling, full cycle ~7 days), Google Play expansion (paced, post-parity).
- One global pacing budget so sweeps never hammer stores concurrently. A status endpoint reads the registry and powers the UI footer.

**Hot Ideas (ADR 0005)**
- New tables: app ideas (FK to source App) with Blueprint JSON. Target ~1,200 ideas to match live (1,206 observed).
- Selection gate (which Apps earn an idea): blend of Rising + recently-Released + low-hanging-fruit (high Revenue estimate, low Rating, decent review volume). Not pure Growth score while Snapshot history is thin; growth weight rises as history accrues. The gate is a pure scoring function, testable in isolation.
- Display sort never uses growth: exactly Created / Released / Reviews / Downloads / Revenue / Rating / Price, plus Blueprint filter toggles — verified against the live site 2026-06-10.
- New ideas API endpoints replace the mock module: list (filter/sort/paginate) and detail. The web Hot Ideas page swaps its in-memory mock query for the real endpoint, keeping the existing filter UI.
- Mockup images: feed idea title + features into the existing deterministic screenshot engine. No image model.

**App Detail parity**
- Extend the existing detail page: breadcrumb, SEO title, info table fields, IAPs from Apple lookup, Creators block with honest empty state (no fabricated handles, ever).
- AI About: lazy-on-view via a dedicated endpoint — first open generates one Gemini call, stores forever, never regenerates.

**Keyword Explorer exact clone**
- Markets 14 → 26 (extend the shared market list in API and web).
- Async pattern: an in-process job queue in the API; keyword persists instantly as Pending, per-market analysis runs paced in the background, the UI fills live following the established reviews SSE pattern (start/progress/done events) or polling — SSE preferred for consistency.
- Store + Markets modal on Explore, cloned from live.

**Screenshots + Translation (real Gemini)**
- Art-direction copy generation moves from derived-phrase heuristics to a Gemini call (user-triggered, cached). The deterministic rendering engine itself is unchanged.
- Translation becomes a real Gemini translation endpoint (user-triggered, cached by app + target language). There is currently no translation mock module to replace — this is a new seam in the existing AI Studio flow.

**Google Play scale**
- Target ~3–5K apps via top-charts-per-category collection using the existing scraper dependency, registered as a paced scheduler sweep. Explicitly after parity features ship; not a blocker for anything above.

## Testing Decisions

Deep modules with pure logic get unit tests; thin UI wiring is verified by the live-diff protocol instead.

- **Freshness scheduler registry** — cadence/staleness math, boot catch-up selection, pacing budget. Pure logic, highest blast radius (five sweeps depend on it).
- **Hot Ideas selection gate** — the blend scoring function: given fixture Apps, the right ones pass the gate; growth weight shifts with history depth.
- **Gemini client seam** — prompt construction and response parsing against recorded fixtures; cache-key derivation (kind + subject + input hash). No live API calls in tests.
- **Keyword job queue** — pending → per-market progress → complete state transitions; 7-day re-score eligibility.
- Verification protocol per the handoff: `pnpm typecheck` clean, both servers boot, zero console errors per route, each surface diffed against the live signed-in appkittie.com tab. Never wipe the DB; all ingest is idempotent upsert-only.

## Out of Scope

- Creators (TikTok/Instagram) real ingestion — UI + empty state only; real social data is a separate spike. Never fabricate handles.
- Auth (Google OAuth), Stripe billing, real-domain deploy, Meta-ads data (blocked on Meta ID verification).
- All Handoff B additive features (alerts, keyword gap, review mining, watchlist diff, comparison, AI chat, multi-store) — separate worktree `feat/additive`.
- Calibrated traffic/volume data, paid data sources of any kind.

## Further Notes

- **Build order (locked):** ① Gemini key test call → ② freshness scheduler (migrate reviews sweep, register snapshots + chart ranks) → ③ Hot Ideas → ④ App Detail parity + lazy AI About → ⑤ Keyword Explorer clone → ⑥ Screenshots/Translation real Gemini → ⑦ Google Play sweep.
- DB lives at `data/kittie.db` in the sibling main worktree (100,085 apps; 3 snapshot days; 30K+ reviews; 31 keywords; `meta_ads`/`creators` empty). Backup exists (`kittie.backup-2026-06-10.db`).
- Run: API `PORT=3009 pnpm dev:api` (background) + `pnpm dev:web` → :5173 proxying /api.
- Rate-limit envelope for Hot Ideas full cycle: ~1,200 calls at ~15 rpm ≈ 80 minutes of paced calls, sliced across boots/days.
- Glossary terms are binding: Hot idea, Blueprint, Boot catch-up sweep, Snapshot, Observed vs Estimated metric, Tracked keyword — see CONTEXT.md.
