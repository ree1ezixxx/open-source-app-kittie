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
Which storefront's charts and Observed metrics we track (ISO market, e.g. `US`). v1 is US-only; other markets use the same free Store sources with a different country parameter — not a paid tier.
_Avoid_: Region (ambiguous), locale

**Observed metric**:
A value taken directly from public Store listing data — review count, rating, chart rank. We do not treat these as exact business truth (stores round, lag, and geo-scope), but they are not modeled by us.
_Avoid_: Actual revenue, real downloads

**Estimated metric**:
A value computed by our models from Observed metrics and other public signals. Includes Revenue estimate, Download estimate, and Growth score. Never implied to come from Apple or Google. Shown with coarse rounding and explicit "estimated" labeling — directional, not precise.
_Avoid_: Revenue (unqualified), real growth, false precision ($54,231)

**Snapshot**:
A point-in-time record of an App's Observed metrics (review count, rating, chart rank) plus Estimated metrics (revenue, downloads, growth score) on a specific date. Trend detection compares Snapshots across dates.
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

<<<<<<< HEAD
**Snapshot refresh**:
Each run fetches fresh Observed metrics from Store sources for that calendar day. Prior Snapshot values are used only when a fetch fails or a metric is unavailable (e.g. rank when the App is not on a chart) — not as a default shortcut.
_Avoid_: Stale copy-forward

**Daily cadence**:
Run snapshot then score once per calendar day. No API cost barrier — more days of Snapshots improve trend and Growth period accuracy. Same-day reruns overwrite that date's row; they do not add history.
_Avoid_: Every other day, batch weekly (for Observed metrics)

## Flagged ambiguities

**Chart visibility**: Free chart feeds only expose apps currently in top lists (e.g. top 100). Apps outside those lists have no Observed rank until they chart — rank is unknown, not zero.

**Meta ad signal**: Growth score reserves 20% for ad-creative momentum. Ingest is blocked on Meta ID verification — that slice is dormant until Ad Library sync ships; no rebalancing until then.

**Popularity vs traffic score** — decoupled in v1: popularity from SERP volume signals (total reviews in top 10); traffic from leader avg reviews; difficulty stays separate.

**Keyword storefront scope** — Apple and Google Play, **multi-market**. v1 was US-only; now 14 markets wired (target: AppKittie's 26). Each Keyword is scored per-country, with a cross-market view that flags untapped markets (high popularity + low difficulty).

**Keyword popularity source** — derived from Apple search **autocomplete rank** (a free signal that reflects real search demand), NOT Apple's official popularity index (which is paid/scraped and has no free equivalent). Directionally accurate for ranking terms; not a calibrated volume figure. Architected pluggable so a real source can drop in later. See ADR.
=======
**Review**:
A single written, user-submitted review of an App on its Store — rating + optional title + body + author + date. Rating-only reviews (no written body) are not indexed.
_Avoid_: Rating (that is one field of a Review, not the whole thing); Comment

**Monitored app**:
An App a person has bookmarked in the Reviews surface to view its reviews and sentiment. A personal bookmark only — it does **not** determine what the server keeps fresh. An App can be kept fresh while monitored by nobody, and monitoring an App never, on its own, adds it to the fresh set.
_Avoid_: Tracked app, Subscribed app

**Fresh set**:
The set of Apps the ingestion job keeps continuously up to date — defined as *every App that already has at least one indexed Review*. Membership follows ingestion history, not monitoring. This is how review data stays live without any user/auth backend.
_Avoid_: Monitored set, Watched apps

## Flagged ambiguities

_None open._

## Resolved decisions

**Continuous-refresh runtime** — runs in-process inside the API: a catch-up sweep on boot (top up anything stale) plus an interval while the API is up. No hosted server, no OS cron. Free to run; the only ceiling is store rate-limiting, so the sweep is *paced* (polite delays, low concurrency) and uses **delta fetches** (only Reviews newer than the latest stored), never full re-pulls.

**On-add flow** — adding an App opens a 5-stage progress modal driven by a **real SSE stream** from the sync endpoint (fetch → parse → analyse → save → done). No faked timers. The App is populated and in the fresh set when the modal closes.

**Classifier seam** — the per-Review tagging (sentiment, topics, improvement areas) moves **server-side** during sync, and tags are **persisted** to the DB (not recomputed in each browser). Engine is the existing **keyword taxonomy** for now ($0). The seam is a single function; swapping in a real LLM later is a one-function change, deliberately deferred to avoid per-review API cost. Future: a positive/negative review filter layered on the stored sentiment.
>>>>>>> feat/reviews-meta

## Example dialogue

**Dev**: "This app is trending — should we flag it as a first mover?"
**Domain**: "Check the Growth score over 7d and whether review velocity is accelerating. First mover means it's climbing *before* the category fills up — high revenue alone doesn't qualify if the niche already has ten copycats."

**Dev**: "Should we tell them exactly what to put in their keyword field?"
**Domain**: "No — that's ASO coach territory. Show who ranks, Keyword difficulty, and a Keyword insight or two from what we can see. Let them decide; agentic hints later if we want, still not 'we'll make it amazing for you'."
