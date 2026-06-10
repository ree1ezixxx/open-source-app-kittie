# PRD — Additive Edge (Handoff B, grilled 2026-06-10)

> **Worktree:** `open-source-app-kittie-additive` · **branch:** `feat/additive` (off `integrate/full-clone`).
> **Sibling:** clone-to-parity runs in `open-source-app-kittie-ui` / `integrate/full-clone` (Handoff A). Parity is never built here; additive is never built there.
> **Status of this document:** the grill session resolved every open decision in `HANDOFF-B-missing-features.md`. This PRD supersedes that handoff's sequencing and assumptions. Glossary terms (Tracked app, App change, Alert, Snapshot, Keyword, …) are defined in `CONTEXT.md` — three new entries (Tracked app, App change, Alert) were added during the grill.

## Problem Statement

An indie developer using Kittie can research apps, keywords, reviews, and ads — but only as point-in-time lookups. They cannot watch a competitor and find out *what changed* (price, metadata, rank, rating) without re-checking by hand; the live incumbent failure quote is "lost 40% of installs to a silent competitor metadata change." They cannot see which Keywords a competitor ranks for that they don't, which complaints recur across a whole niche, which markets a niche has left untapped, or two apps side-by-side. AppKittie (the product being cloned for parity) has **none of this either** — verified live on 2026-06-10: 17 sidebar surfaces, no alerts, no compare, no chat, no watchlist-diff. Everything in this PRD is net-new beyond AppKittie, built on free public data the platform already sweeps.

## Solution

A monitoring-and-intelligence layer on top of the existing Snapshot/Review/Keyword data:

1. A person **tracks an App** (durable, server-side). The server then **captures every field change** on that App, append-only, forever — the change history nobody else retains without a $450/mo data-retention paywall.
2. **Alerts** surface notable App changes in an in-app feed (plus an optional macOS banner), gated so they only fire on trustworthy, consecutive, above-threshold deltas — never on collection noise.
3. **Niche intelligence** mines what already exists: top complaints/requests across all indexed Reviews of a niche (the 1–2★ opportunity thesis), Keyword gaps between competing apps, cross-market localization gaps, and side-by-side comparison.
4. A **Keyword corpus at scale** (mined phrases, multi-market, paced free store APIs) turns the 31-keyword seed into the dataset the gap features need.
5. Once the parity lane proves the shared Gemini seam: an **AI research chat** grounded on the local DB, and an **Idea → PRD bridge** that goes beyond AppKittie's "Export as prompt."
6. **Multi-store consolidation** (Steam, itch.io) extends ingestion beyond the two mobile Stores — the loudest indie workflow pain, covered by no incumbent.

Everything is free, local, and unauthenticated, consistent with the platform's structural edge (no credit caps, no retention paywall, your own history accumulating daily).

## User Stories

1. As an indie dev, I want to add a competitor App to a tracked list so that the system watches it for me from that moment on.
2. As an indie dev, I want every change to a Tracked app (price, title, subtitle, description, screenshots, rating, chart rank, estimated metrics) recorded with old → new values and dates, so I can scroll a change timeline instead of diffing by memory.
3. As an indie dev, I want an Alert when a Tracked app makes a notable move (rank shift past threshold, price change, metadata change, rating drop, revenue-estimate swing) so silent competitor moves are no longer silent.
4. As an indie dev, I want alerts to be trustworthy — no floods, no impossible deltas, nothing fired off a single gappy capture — so I don't learn to ignore the feed.
5. As an indie dev, I want an in-app Alerts feed with unread state and a sidebar badge, and optionally a native macOS notification even when the browser tab is closed (while the local API runs), so the channel matches how I actually work.
6. As an indie dev, I want a daily-digest view that groups Alerts by day and App, so a missed day is a 30-second catch-up.
7. As an indie dev, I want to see the top recurring complaints and feature requests across every indexed Review in a niche (category or hand-picked App set), split by sentiment and improvement area, so I can find what a whole market is begging for — the 1–2★ reviews of incumbents are my roadmap.
8. As an indie dev, I want to jump from a niche complaint cluster to the underlying Reviews as evidence, so the insight is verifiable, not vibes.
9. As an indie dev, I want to compare 2–5 Apps side-by-side across all metrics (Observed and Estimated) with overlaid history charts, so head-to-head evaluation is one screen, not five tabs.
10. As an indie dev, I want to see which Keywords a competitor ranks for that my App doesn't (and vice versa), ranked by opportunity, so my ASO targets come from evidence.
11. As an indie dev, I want a cross-market view showing where a niche's Keywords are strong but competitors are absent or weak per market, so I can pick localization targets.
12. As an indie dev, I want the Keyword corpus to grow automatically (mined from real competitor listings, multi-market, free), so gap and localization views are dense without me feeding keywords by hand.
13. As an indie dev, I want to ask questions in plain language ("why is this app growing?", "summarize this niche's complaints") answered from the local database, so research that takes five surfaces takes one question. *(LLM-seam-gated)*
14. As an indie dev (Rhodri's ship-with-Claude-Code workflow), I want one click from a Hot idea to a full PRD plus a Claude-Code prompt-pack/repo skeleton — beyond AppKittie's existing "Export as prompt" — so idea-to-repo is minutes. *(LLM-seam-gated for the generative parts; Blueprint-templated parts work without it)*
15. As an indie game dev, I want Steam and itch.io titles ingested alongside the mobile Stores so my morning check is one dashboard, not four.

## Implementation Decisions

### Decisions locked in the grill (with rationale)

- **D1 — LLM-free v1; consume the parity lane's Gemini seam later.** Nothing in this repo calls an LLM today (verified: the AI service is an explicit mock; no Gemini key or SDK anywhere), and AppKittie's only LLM surfaces (Hot Ideas/Blueprints, App About narrative — both confirmed live) are **parity scope**, owned by Handoff A, which wires `@google/genai` + `GEMINI_API_KEY` server-side and must smoke-test the supplied key. This lane builds every Phase 1–3 feature without a model; Phase 4 features activate behind a provider flag once the seam is proven. No second Gemini integration is ever built here.
- **D2 — Change-capture is the keystone and ships first.** Verified data reality: snapshot history is 3 days with a gap (06-07 seed / 06-08 / 06-10), `revenue_estimate` is NULL on all bulk rows, rank coverage collapsed 9,517 → 279 between the two dense days, and 2,492 of 99,333 diffable apps show *impossible* cumulative-review decreases. Diff-on-snapshots today = noise. Therefore: build the append-only capture layer immediately so trustworthy history starts accruing, and surface Alerts **last**, not first.
- **D3 — Tracked app, not "watchlist", not Favorites.** Favorites is client-only localStorage — the server cannot attach history to it; it stays untouched. The durable anchor is a new server-side **`tracked_apps`** table mirroring the existing `tracked_keywords` pattern (the glossary already forbids "watchlist" in schema names). **Change-capture scopes to Tracked apps only** — not all 100k apps — keeping diffing cheap and competitor-focused.
- **D4 — Alert trust gate.** An Alert fires only when: the field was populated on ≥2 clean consecutive captures (no gap); the delta is possible (negative cumulative review counts are discarded as collection noise); rank alerts compare only ranked-on-both-captures; the delta clears a minimum magnitude (defaults: rank ±10, rating −0.2, price any change, metadata any change, revenue-estimate ±25%); price/metadata alerts require ≥2 captures in `app_changes`. Thresholds live in `alert_rules`, user-editable.
- **D5 — Notification channels.** In-app feed is canonical (new "Monitor" sidebar group, unread badge). Optional macOS banner fired **from the API process** (`osascript`, falling back to `node-notifier`), setting-gated, off by default — works with the tab closed, no permission dance. **No** Web Notifications API, **no** service-worker push, **no** email. Digest = in-app grouped-by-day view plus, optionally, one batched OS banner per day. All delivery inherits the documented "only while the API process is up" constraint.
- **D6 — Keyword corpus at scale, multi-market, owned sweep.** The corpus generator is the existing competitor-listing phrase miner (`suggestRelatedKeywords` — on-theme n-grams from titles/descriptions, brand-filtered, autocomplete top-up), seeded from categories + head terms — **not** raw `--from-titles`. A new rolling, resumable ingest job processes the corpus through the existing `syncKeyword` scorer across markets (target 26, matching parity), paced politely with backoff on 429s, low concurrency, smoke-test-then-ramp. Cost is $0 and days of wall-clock; a throttle slows it, never loses progress. The sweep also populates the **`keyword_rankings`** inverse index (currently empty: keyword_id, app_id, rank, observed_at) by exploding each lookup's top results — the fast join that gap analysis needs at scale.
- **D7 — Gap analysis reads the inverse index.** Keyword gap = set logic over `keyword_rankings` (keywords where competitor ranks top-N and subject doesn't), ranked by the existing Opportunity score. Localization gap = the same per-market, surfacing high-popularity/low-difficulty markets where a niche's competitors are absent. Both are pure queries + scoring — no LLM (Gemini clustering is a Phase 4 enhancement, not a dependency).
- **D8 — Review feature-mining runs on already-tagged data.** All 44,399 indexed Reviews across 278 apps carry persisted `sentiment` / `topics` / `improvement_areas` (the server-side classifier seam). v1 mining = aggregation over those columns: cluster by topic × sentiment across a category or hand-picked App set, rank complaint/request clusters by recurrence and rating-weight, link every cluster to its evidence Reviews. The LLM upgrade (richer clustering/labels) is the same one-function seam swap already documented for the classifier.
- **D9 — No-contamination discipline.** Additive = new pages/routes/services/tables/jobs. The only shared files touched are the app shell (`App.tsx`, `Sidebar.tsx`) with **append-only additions inside one clearly marked block** (the sidebar is a data-driven groups array — one appended "Monitor" group + appended items). Shared ingest code (`syncKeyword`, the miner) is **called, never edited**; new sweep logic lives in new job files. The DB is shared via symlink across worktrees — all additive tables are new, all writes additive-owned, migrations via the existing drizzle flow.
- **D10 — Multi-store gets done, as its own phase.** Steam (free Web API) and itch.io (public pages) become new ingestion collectors. Note: the glossary currently defines Store as exactly `apple | google` — Phase 5 begins with a CONTEXT.md amendment extending Store, and store-specific semantics (no chart ranks on itch; Steam concurrent players as a new Observed metric) get their own short design pass before code.
- **D11 — Idea → PRD bridge is the delta beyond parity.** AppKittie already ships "Export as prompt" (verified live on idea detail); the parity lane clones that. This lane adds the additive delta only: full PRD generation + Claude-Code prompt-pack/repo skeleton from a Hot idea's stored Blueprint. Template-assembled parts (PRD skeleton from Blueprint fields) work LLM-free; generative enrichment activates with the seam.

### Modules (deep-module bias: rich logic, narrow interface, isolatable)

| Module | Interface | Depth |
|---|---|---|
| **Change-capture engine** | `captureChanges(appId, fresh, prior) → AppChange[]` | Field-by-field diff, type-aware comparators (price, text, screenshot-set, numeric), impossible-delta rejection, append-only writes. Pure logic over two records — the keystone deep module. |
| **Alert evaluator** | `evaluateAlerts(changes, rules) → Alert[]` | Trust gate (D4) + threshold rules + dedup/cooldown. Pure function of recorded changes + rules. |
| **Gap analyzer** | `keywordGap(subjectAppId, competitorIds, market) → GapResult` | Set algebra over the inverse index + opportunity ranking; per-market variant feeds localization. |
| **Review miner** | `mineNiche(appIds | category) → ClusterReport` | Topic × sentiment aggregation, recurrence scoring, evidence linking. SQL + scoring, no model. |
| **Corpus sweep job** | new ingest job, resumable cursor | Seeding (categories + head terms → miner), paced multi-market `syncKeyword` fan-out, inverse-index population, backoff/ramp. |
| **Notifier** | `notify(alert) → void` | Channel fan-out: feed row (always), OS banner (flag-gated), daily batch. |
| Compare, Monitor UI, feed UI | thin pages over API routes | Deliberately shallow — read-only views. |

### Schema (all new, additive-owned)

- `tracked_apps` — id, app_id FK, note, tracked_at (mirror of `tracked_keywords`).
- `app_changes` — id, app_id FK, field, old_value, new_value, captured_at, capture_pair (prior/fresh dates). Append-only; indexed by (app_id, captured_at).
- `alert_rules` — id, rule type, threshold, enabled, channels.
- `alerts` — id, app_change FK, rule FK, created_at, read_at. (Per glossary, an Alert is derived from recorded App changes — this table materializes the feed + read-state; it is never written by any path other than the evaluator.)
- Phase 5: store-extension columns/semantics per the D10 design pass.

### API (new routes under the existing local API)

`/api/v1/tracked-apps` (CRUD), `/api/v1/tracked-apps/:id/changes` (timeline), `/api/v1/alerts` (+ mark-read, rules CRUD), `/api/v1/compare?ids=…`, `/api/v1/keyword-gap`, `/api/v1/localization-gap`, `/api/v1/niche-mining`, Phase 4: `/api/v1/chat`. Capture/evaluate hook into the existing boot-catch-up + interval sweep registry as new registered sweeps.

### Phasing (sequenced by data reality — everything ships, nothing parked)

- **Phase 1 — keystone + present-data features (start now):** `tracked_apps` + change-capture engine + Monitor surface; review feature-mining; compare. **Kick off the corpus sweep on day one** (it runs for days in the background; starting early is free parallelism).
- **Phase 2 — accrual unlocks:** change-diff timeline UI (needs ≥2 captures, i.e. ~2 days after Phase 1); keyword gap (US corpus dense); localization gap (markets fill progressively).
- **Phase 3 — alerts:** evaluator + feed + badge + OS banner + digest view, behind the D4 trust gate. **External dependency:** Handoff A's snapshot-pipeline fix (populated `revenue_estimate`, consistent rank coverage) gates the revenue/rank rule types only — price/metadata/rating rules run on our own captures regardless.
- **Phase 4 — LLM seam consumption (gated on Handoff A proving the Gemini key):** AI research chat grounded on the DB; Idea → PRD bridge (template core LLM-free, generative enrichment on the seam); optional Gemini upgrades to mining clusters and gap labels.
- **Phase 5 — multi-store:** CONTEXT Store-term amendment + design pass, then Steam/itch.io collectors, snapshot semantics, and surfaces.

## Testing Decisions

The repo currently has **no test harness** (no runner config, zero test files — verified). Introduce **vitest** scoped to the new packages/modules only; do not retrofit tests onto parity code. Test the deep modules where the risk lives — all pure logic, no network, no UI:

- **Change-capture engine** — the highest-value suite: field comparators, screenshot-set diffing, impossible-delta rejection (cumulative counts), gap handling (missing capture days), append-only invariants. Fixture pairs of app records.
- **Alert evaluator** — trust-gate matrix (each D4 condition flips independently), threshold edges, cooldown/dedup.
- **Gap analyzer + opportunity ranking** — set-logic correctness on a small fixture index; per-market variants.
- **Review miner** — clustering/recurrence scoring against a fixture review set with known expected clusters.
- **Corpus sweep** — resumability cursor + backoff logic only (network mocked); the live sweep is validated by the smoke-test-then-ramp protocol, not unit tests.

UI pages, API route plumbing, and the notifier shell stay untested (thin, low-risk); verification there is the run-and-drive protocol (boot both servers, exercise each surface, zero console errors) plus diffing against live data.

## Out of Scope

- Parity work of any kind (Handoff A territory): Hot Ideas generation, App About narrative, Keyword Explorer parity, live-sync pipeline fixes, Google Play scaling.
- Fixing the snapshot pipeline (rank coverage, score population) — consumed as a dependency, never owned here.
- Wiring a second/own LLM integration (the seam is Handoff A's; this lane only consumes it).
- Email digest, Web Notifications API, service-worker push.
- Auth, billing, deploy, multi-user anything.
- Meta ad-creative alert rule — dormant until Meta ID verification unblocks `meta_ads` ingestion (table is empty today); the rule type is designed but cannot fire.
- Fabricated data of any kind (creators rule applies here too).

## Further Notes

- **Verified live (2026-06-10, signed-in appkittie.com):** sidebar ceiling confirmed (no alerts/compare/chat/watchlist); Hot Ideas = 1,206 ideas with reasoning-prose Blueprints; App About = templated stats line + one LLM paragraph; "Export as prompt" already exists on idea pages. AppKittie's entire LLM footprint is those two surfaces — both parity, neither additive.
- **Data reality at grill time:** 100,085 apps; 3 snapshot days (gap on 06-09); 44,399 fully-tagged reviews across 278 apps; 31 keywords; `keyword_rankings`, `meta_ads`, `creators` all empty; `apps` table is overwrite-only (no history) — which is exactly why `app_changes` must exist before any alert can be honest.
- **Coordination with Handoff A:** shared DB (symlinked), shared sweep registry, shared shell files. Append-only discipline (D9) + new-files-only keeps merges trivial. The two lanes' only true touchpoints: the sidebar block, the sweep registry registration, and (Phase 4) the Gemini seam.
- **CONTEXT.md** was updated during the grill: Tracked app, App change, Alert added; Monitored-app collision fixed. Phase 5 requires the Store-term amendment (D10).
- Issue decomposition (vertical slices per phase) is the natural next step — run `/to-issues` on this PRD when ready to execute.
