# Open Source App Kittie

An open-source mobile app intelligence platform for discovering, scoring, and monitoring apps across the App Store and Google Play.

## Language

**App**:
A single mobile application on one store (Apple or Google). The same product on both stores is two Apps.
_Avoid_: Product (when meaning one store listing)

**Store**:
Either `apple` or `google`. Every App belongs to exactly one Store.
_Avoid_: Platform, source (in user-facing copy)

**Chart country**:
A storefront market (ISO alpha-2, e.g. `US`, `JP`) that an App's charts AND Observed/Estimated metrics are scoped to. A first-class **include/exclude query dimension** (surfaced as "Country" in the UI/API, mirroring truth's `countries`/`excludedCountries`) — the same App can hold a different rank, review count, rating and Revenue estimate per market. `US` is the default view. Sourced from the same free Store endpoints with a different country parameter — not a paid tier. The full per-market set is tracked for the **market-visible** App set (apps charting in that market); the long-tail catalog keeps a `US`-only Snapshot. See [[per-country-app-snapshots]] (ADR 0007).
_Avoid_: Region (ambiguous), locale

**Observed metric**:
A value taken directly from public Store listing data — review count, rating, chart rank. We do not treat these as exact business truth (stores round, lag, and geo-scope), but they are not modeled by us.
_Avoid_: Actual revenue, real downloads

**Estimated metric**:
A value computed by our models from Observed metrics and other public signals. Includes Revenue estimate, Download estimate, and Growth score. Never implied to come from Apple or Google. Shown with coarse rounding and explicit "estimated" labeling — directional, not precise.
_Avoid_: Revenue (unqualified), real growth, false precision ($54,231)

**Snapshot**:
A point-in-time record of an App's Observed metrics (review count, rating, chart rank) plus Estimated metrics (revenue, downloads, growth score) for one App, on a specific date, **in one Chart country**. Identity is `(App, date, Chart country)` — a market-visible App has one Snapshot per tracked market per day; long-tail apps have just a `US` Snapshot. Trend detection compares Snapshots across dates *within the same market*.
_Avoid_: Reading, data point

**Revenue estimate**:
An Estimated metric: modeled monthly revenue (USD) from public signals (chart rank, category, IAP catalog, review velocity, ad activity) — not reported by Apple or Google.
_Avoid_: Revenue (unqualified), MRR (unless subscription-specific)

**Download estimate**:
An Estimated metric: modeled downloads derived from Revenue estimate and category heuristics — not reported by Apple or Google.
_Avoid_: Installs (unless Google Play context)

**Growth period**:
How far back we compare Snapshots when computing momentum — `7d`, `14d`, `30d`, `60d`, or `90d`. Default `7d` (what moved this week); `30d` for sustained climb vs one-week spike.
_Avoid_: Trending window, rolling average

**Growth score**:
An Estimated metric: composite 0–100 momentum score for a given Growth period, from *changes* in Observed signals (review count, chart rank) plus ad activity and update recency. Not a store-reported growth rate.
_Avoid_: Trending, hot

**First mover**:
An App showing strong Growth score in a niche before category saturation — early signal, not proof of long-term success.
_Avoid_: Winner, validated

**Ad creative**:
A Meta (Facebook/Instagram) ad asset linked to an App, sourced from the public Ad Library.
_Avoid_: Campaign (unless referring to a grouped set of creatives); Listing media (that is the App's own store assets, not an ad)

**Listing media**:
The visual assets on an App's *own* store listing — screenshots (images) and preview videos — that show what the app looks like before download. Sourced from the App Store / Google Play listing itself, never from advertising. Sub-types: **screenshot** (image; collected today) and **preview** (video; not yet ingested).
_Avoid_: Ad creative (Meta-only); Screenshot (that is one sub-type, not the whole concept); Asset (too generic)

**Keyword**:
A search term users type in an app store. ASO intelligence tracks difficulty, traffic proxy, and which Apps rank for it.
_Avoid_: Tag, search query (in domain docs)

**Keyword lookup**:
A user-initiated check of one Keyword — who ranks in the top results, and how hard it would be to compete.
_Avoid_: Search, query (in domain docs)

**Keyword suggestion**:
A Keyword proposed by the system for the user to run a Keyword lookup on. Sources: (1) a specific App's metadata and niche, or (2) patterns across the tracked App database (category phrases, recurring title terms).
_Avoid_: Recommendation, auto-keyword

**Competing app count**:
The true depth of the field ranking for a Keyword — how many apps the store returns for the term (e.g. ~170 for "learn chinese"), sourced from the search `resultCount`, not the handful displayed. Difficulty is still judged on the top 10; this number is the honest size of the competition.
_Avoid_: Ranking apps / results shown (those mean the displayed top 10, a different, smaller number)

**Tracked keyword**:
A Keyword the user has explicitly added to a durable shortlist to monitor. Distinct from a Keyword lookup (an ephemeral, cache-backed scored result): a Tracked keyword persists independently of the lookup cache — it is never cache-evicted — and is the anchor a future rank-history attaches to. Lives in its own store, referencing the lookup row for current metrics.
_Avoid_: Saved search, favorite, watchlist (in schema names — the table is `tracked_keywords`)

**Keyword difficulty**:
A modeled 0–100 score for how hard it is to rank in the top results for a Keyword, based on the strength of Apps currently ranking there — not an official store metric.
_Avoid_: Competition score (in schema names)

**Traffic score**:
A modeled 0–100 proxy for how much search interest a Keyword likely has. v1 derives this from ranking-page signals, not reported store search volume.
_Avoid_: Search volume, impressions (unless sourced from real data later)

**Keyword ranking**:
An App's position in store search results for a specific Keyword (1 = top result). Observed from public search APIs — a snapshot of Apple's/Google's full ranking, not something Kittie controls.
_Avoid_: Chart rank (different signal — top charts, not search)

**ASO intelligence**:
Kittie's research layer for app store visibility. Keyword lookup is one part; other parts (Growth score, Review intelligence, Ad creative) cover different levers. Kittie does not change a user's listing or installs — it surfaces signals so a human can decide.
_Avoid_: Optimization (as a promise), ranking guarantee

**Keyword insight**:
A short, observable hint shown alongside Keyword lookup results. v1 standard set: term in #1 title; average reviews of top 5; weakest app in top 10; review gap between #1 and #10. Rule-based; not prescriptive coaching.
_Avoid_: ASO coach, recommendation (as a product promise)

**Keyword Explorer**:
The dedicated UI surface for Keyword lookup and suggestions — sidebar entry under ASO, not buried inside app explore. Supports single lookup and batch compare (up to 10 Keywords), matching AppKittie's multi-keyword ASO workflow.
_Avoid_: Keywords tab (on explore), ASO page (too broad)

**Keyword batch compare**:
Evaluating up to 10 Keywords in one request, ranked by opportunity — because ASO targets a set of terms, not a single word.
_Avoid_: Bulk search (implies app search, not keyword difficulty)

**Opportunity score**:
A modeled ranking for batch compare — which Keywords to prioritize first. v1: `(popularity × 0.4) + ((100 − difficulty) × 0.3)`; higher = better target.
_Avoid_: Priority score, ranking score (in user-facing copy — "opportunity" is the term)

**Creator partnership**:
A social account (TikTok, Instagram, etc.) promoting an App, linked via bio, caption, or sponsored content signals.
_Avoid_: Influencer (acceptable in UI copy, not in schema names)

**Ingestion job**:
A scheduled task that fetches external data and writes Snapshots or related records to the database.
_Avoid_: Crawler, scraper (in domain docs)

**Snapshot refresh**:
Each run fetches fresh Observed metrics from Store sources for that calendar day. Prior Snapshot values are used only when a fetch fails or a metric is unavailable (e.g. rank when the App is not on a chart) — not as a default shortcut.
_Avoid_: Stale copy-forward

**Daily cadence**:
Run snapshot then score once per calendar day. No API cost barrier — more days of Snapshots improve trend and Growth period accuracy. Same-day reruns overwrite that date's row; they do not add history.
_Avoid_: Every other day, batch weekly (for Observed metrics)

**Build Context**:
The persistent, portable memory a coding-AI keeps about *one project it is helping build* — the idea, audience, target markets, monetisation, constraints, the Apps/features the user has asked about, decisions accepted and rejected, the current build phase, evidence gathered, and outstanding unknowns. Identified by a `context_id`. This is project memory, not app-catalog data. It holds three legitimate kinds of content, all traceable: (1) **market data** (snapshots/reviews/growth, `observed`/`modelled`), (2) **user input** (what the user stated/likes), and (3) **data-grounded insights** — analytical assumptions like "build X, these apps are trending" carried as a `DecisionPacket` (evidence + assumptions + confidence). Anything with no data and no user statement is an explicit `unknown`, never a guess.
A Build Context is the *same concept* regardless of where it is stored. It has two stores: as plain files in a `.kittie/` folder **inside the user's own project repo** (the agent surface — any agent that opens that repo inherits the same understanding), or in **Kittie's own store** (the web surface — for a builder who starts from kittie.com with no repo yet). A web Build Context is not a separate thing; the **agent handoff** renders it back into `.kittie/` files, so a web builder's context becomes the exact portable artifact an agent inherits once pasted into a repo. The web's "project" is a Build Context — there is no rival "project" entity.
_Avoid_: Session, conversation, profile, project (unqualified — a web "project" is a Build Context)

**Market lock**:
The reproducibility pin for a build decision — a record of *exactly which live market data a recommendation was based on*: snapshot date, competitor App IDs, data-source versions, scoring-model version, evidence coverage, tool versions. Lets any agent re-derive or sanity-check the same decision later, or detect that the world has moved. A Market lock whose snapshot is older than its freshness window, or whose pinned source/model versions no longer match, is `stale` (a `CoverageStatus`). Stored as `.kittie/market.lock.json`.
_Avoid_: Snapshot (that is one App's metric row; a Market lock pins a *set* of them for a decision), cache

**Build plan**:
The exported, human-readable build plan for the *user's own project* (`.kittie/build-plan.md`) — distinct from a **Blueprint**, which is the build plan attached to a *Hot idea* and stored in Kittie's DB. Same idea (a structured plan to build something), different owner: a Build plan belongs to the active Build Context; a Blueprint belongs to a Hot idea.
_Avoid_: Blueprint (reserved for the Hot-idea plan), spec

**Standing preference**:
A durable like/dislike or "always/never" rule the user holds, which the agent must honour on *every* call — the "sticky note on the agent's forehead" (mirrors how `CLAUDE.md` rules are always in scope, e.g. "always HTML over md"). Distinct from a one-off project fact or a decision: a Standing preference is a persistent directive that shapes how the agent acts, not a thing the agent learned about the market. Always present in the digest a Build Context returns. **Global to the user** — lives in a global store (`~/.kittie/`, the user's home, or the app account), one per user, and rides across *every* project they build. Merged on top of per-project state whenever a Build Context is read. Contrast with project state (idea/audience/decisions), which is per-project so app A's facts never bleed into app B.
_Avoid_: Setting, config, decision (a decision is market-derived; a preference is user-asserted taste)

## Flagged ambiguities

**Chart visibility**: Free chart feeds only expose apps currently in top lists (e.g. top 100). Apps outside those lists have no Observed rank until they chart — rank is unknown, not zero.

**Meta ad signal**: Growth score reserves 20% for ad-creative momentum. Ingest is blocked on Meta ID verification — that slice is dormant until Ad Library sync ships; no rebalancing until then.

**Popularity vs traffic score** — decoupled in v1: popularity from SERP volume signals (total reviews in top 10); traffic from leader avg reviews; difficulty stays separate.

**Keyword storefront scope** — Apple and Google Play, **multi-market**. v1 was US-only; now 14 markets wired (target: AppKittie's 26). Each Keyword is scored per-country, with a cross-market view that flags untapped markets (high popularity + low difficulty).

**Keyword popularity source** — derived from Apple search **autocomplete rank** (a free signal that reflects real search demand), NOT Apple's official popularity index (which is paid/scraped and has no free equivalent). Directionally accurate for ranking terms; not a calibrated volume figure. Architected pluggable so a real source can drop in later. See ADR.

**Review**:
A single written, user-submitted review of an App on its Store — rating + optional title + body + author + date. Rating-only reviews (no written body) are not indexed.
_Avoid_: Rating (that is one field of a Review, not the whole thing); Comment

**Monitored app**:
An App a person has bookmarked in the Reviews surface to view its reviews and sentiment. A personal bookmark only — it does **not** determine what the server keeps fresh. An App can be kept fresh while monitored by nobody, and monitoring an App never, on its own, adds it to the fresh set.
_Avoid_: Tracked app, Subscribed app

**Fresh set**:
The set of Apps the ingestion job keeps continuously up to date — defined as *every App that already has at least one indexed Review*. Membership follows ingestion history, not monitoring. This is how review data stays live without any user/auth backend.
_Avoid_: Monitored set, Watched apps

**Hot idea**:
An AI-generated app concept derived from one real fast-growing App (its source App). Pre-generated in batch and stored — never generated per-view. Each Hot idea has a Blueprint.
_Avoid_: Suggestion, app idea (when meaning the stored entity)

**Blueprint**:
The structured build plan attached to a Hot idea — difficulty + reasoning, timeline, requirements, MVP/key/V2 features, architecture, tech stack, MVP scope, third-party services. Generated once with the Hot idea, stored in DB.
_Avoid_: Spec, plan (too generic in this domain)

**Boot catch-up sweep**:
The freshness mechanism for every derived dataset (Snapshots, Reviews, Tracked keyword scores, Hot ideas): on API boot, anything staler than its cadence regenerates in a paced background pass; an in-process interval keeps it fresh while the API runs. No OS cron, no hosted infra.
_Avoid_: Cron job, scheduler (implies external infra)

## Resolved decisions

**Continuous-refresh runtime** — runs in-process inside the API: a catch-up sweep on boot (top up anything stale) plus an interval while the API is up. No hosted server, no OS cron. Free to run; the only ceiling is store rate-limiting, so the sweep is *paced* (polite delays, low concurrency) and uses **delta fetches** (only Reviews newer than the latest stored), never full re-pulls.

**On-add flow** — adding an App opens a 5-stage progress modal driven by a **real SSE stream** from the sync endpoint (fetch → parse → analyse → save → done). No faked timers. The App is populated and in the fresh set when the modal closes.

**Classifier seam** — the per-Review tagging (sentiment, topics, improvement areas) moves **server-side** during sync, and tags are **persisted** to the DB (not recomputed in each browser). Engine is the existing **keyword taxonomy** for now ($0). The seam is a single function; swapping in a real LLM later is a one-function change, deliberately deferred to avoid per-review API cost. Future: a positive/negative review filter layered on the stored sentiment.

**Explore parity bar** — match AppKittie Explore UI and filter *behavior*; do not fake catalog scale or ingested signals. Smaller app count (~100K vs ~2M) and empty marketing-signal filters are OK when shown honestly. Sidebar labels, filter controls, and table interactions should match truth; data volume catches up on separate ingest tracks.

**Explore filter UX** — Category and App Language use **dropdown popovers** (“Select categories”, “Select languages”) matching live AppKittie — not always-visible inline pill grids.

**Clone scope (Explore lane)** — **App-data surfaces in scope** (Apps database, Highlights, Trending, Rising, Favorites, app detail, app-tracking). **Ads-related surfaces deferred** for now (Ads Library, Organic, Meta/Apple ad filters as parity work — links may exist but are not the current clone target).

**Explore marketing-signal filters** — keep Meta Ads / Apple Ads / Creators / Contacts toggles **visible** (UI matches truth) but **do not prioritize ingest or filter wiring** for ad/creator data — AppKittie serves those from pre-ingested DB, not live APIs; our priority is **data-heavy app catalog work** (scale, snapshots, growth, search/filter behavior on app fields).

**Explore data priority** — **snapshots cadence first**: daily day-over-day snapshots so Growth 7d, sparklines, and period filters behave like truth before chasing catalog scale or filter-rail UI polish.

## Example dialogue

**Dev**: "This app is trending — should we flag it as a first mover?"
**Domain**: "Check the Growth score over 7d and whether review velocity is accelerating. First mover means it's climbing *before* the category fills up — high revenue alone doesn't qualify if the niche already has ten copycats."

**Dev**: "Should we tell them exactly what to put in their keyword field?"
**Domain**: "No — that's ASO coach territory. Show who ranks, Keyword difficulty, and a Keyword insight or two from what we can see. Let them decide; agentic hints later if we want, still not 'we'll make it amazing for you'."
