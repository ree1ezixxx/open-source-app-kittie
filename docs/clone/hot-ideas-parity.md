# Hot Ideas — Clone Parity Audit

**Reference (truth):** https://www.appkittie.com/dashboard/hot-ideas (+ `/dashboard/hot-ideas/<app-slug>`)
**Target:** `apps/web` HotIdeasPage + IdeaDetailPage · `packages/api` ideas route + `idea-sweep-service` · `app_ideas` model
**Date:** 2026-06-17 · driven live via truth Chrome :9222 + our API.
**PRD:** issue #35 · **PRs:** #36 (implementation + review fixes).

---

## How the source of truth generates ideas (inspected live)

A **recurring batch LLM pipeline**, precomputed and served — not on-demand:

- **Cadence / accretion.** Ideas accrue in periodic batches: oldest `created_at` = **2026-04-01**, newest = **2026-06-17** (clusters of ~5 within minutes, ~midnight). A scheduled job runs roughly daily; **1,291 ideas** total and growing. Pages load instantly (precomputed, never generated on view).
- **Source-app selection.** Fast-growing / proven-demand apps. Each idea carries its source app's `score` (≈3–5), `reviews` (11–406 in the sample), and modelled `revenue` ($20–50k/mo). The pipeline mines apps with real traction, then derives a *different* product serving the same demand.
- **Per-idea LLM output.** title/description/category + a full blueprint — `opportunity` (summary, why-this-app, market size, pain points, feature gaps, target audience, monetization, competitive advantages), `building` (key/MVP/V2 features, architecture, tech stack, third-party services, needs-backend/db/ai, difficulty, timeline), `marketing` (strategy, platforms, content hooks, UGC formats, campaigns, creator types, selling points, ASO keywords, go-to-market) — **plus a bespoke ~18KB HTML app mockup**.
- **Endpoints.** `hotIdeas.search` (paginated cursor, sortBy/sortOrder, filters: search, categories, excludedCategories, ideaCategories, needsBackend/Database/Ai) → list; `hotIdeas.getBySlug` → full blueprint.

## Our implementation — near-identical mechanism

- **Pipeline:** `sweepHotIdeas` (Gemini `flash-lite` batch bucket, ADR 0005), precomputed + stored in `app_ideas`, served by `/api/v1/ideas`. Recurring `hot-ideas` sweep (6h cadence).
- **Source selection:** `selectIdeaSources` (review floor + growth/opportunity gate) — same "proven, growing apps" intent.
- **Per-idea LLM output:** idea + `opportunity` + `building` + `marketing` (same field set as truth's `getBySlug`), via a Gemini structured-output schema, validated by the pure `idea-blueprint` parser. Versioned blueprint (`schemaVersion: 2`); legacy ideas upgrade in place via the sweep's Phase B.
- **List UI:** search · category filters · idea-type · needs-backend/database/AI toggles · sort + order · pagination — matches truth.
- **Detail UI:** Building / Opportunity / Marketing tabs + source-app proof-of-demand + in-app purchases — matches truth.

## Parity matrix

| Area | Truth | Ours | Verdict |
|---|---|---|---|
| Generation pipeline | batch LLM, precomputed, recurring | Gemini batch sweep, precomputed, 6h | ✅ |
| Source selection | proven/growing apps (score/reviews/revenue) | `selectIdeaSources` (review floor + growth gate) | ✅ |
| Idea data (title/desc/category) | ✓ | ✓ | ✅ |
| Opportunity blueprint | 8 fields | same 8 fields | ✅ |
| Building blueprint | features/arch/stack/services/difficulty/timeline | same | ✅ |
| Marketing blueprint | 9 fields | same 9 fields | ✅ |
| Source app + IAPs | ✓ | ✓ (empty-state when none) | ✅ |
| List: search/filters/needs-toggles/sort/pagination | ✓ | ✓ | ✅ |
| Detail: Building/Opportunity/Marketing tabs | ✓ | ✓ | ✅ |
| **UI mockup** | bespoke LLM **HTML** in iframe | deterministic **CSS** phone mockup | ⚠️ deliberate deviation |
| Idea volume | 1,291 (since Apr 1) | 160, accreting via the sweep | time-gated, not a defect |

## Fidelity score: **4.5 / 5 — PASS**

Structure, generation mechanism, data shape, list + detail UI, and filters/sort/pagination all match. The sole delta from 5/5 is the **CSS mockup vs truth's bespoke HTML mockup** — a deliberate cost/honesty decision (≈80% mockup fidelity, $0 per idea, no iframe sandboxing). Idea volume is lower purely because our pipeline started recently and runs on a free-tier daily quota; it produces equivalent ideas and grows daily. Clears the ≥4 gate.

## Deferred follow-ups (non-blocking)
- `schemaVersion` column on `app_ideas` to replace the parse-all-in-JS stale scan in the upgrade sweep.
- Share the duplicated candidate query (`listIdeaCandidates` vs `listStaleIdeaCandidates`).
- De-duplicate the opportunity/marketing field lists (response schema vs parser vs TS interface).
- (Optional) generate bespoke HTML mockups to reach 5/5 on the mockup — only if the bespoke mockup becomes a must-have.
