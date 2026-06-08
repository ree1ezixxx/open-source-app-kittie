# Open Source App Kittie

An open-source mobile app intelligence platform for discovering, scoring, and monitoring apps across the App Store and Google Play.

## Language

**App**:
A single mobile application on one store (Apple or Google). The same product on both stores is two Apps.
_Avoid_: Product (when meaning one store listing)

**Store**:
Either `apple` or `google`. Every App belongs to exactly one Store.
_Avoid_: Platform, source (in user-facing copy)

**Snapshot**:
A point-in-time record of an App's metrics (review count, rating, rank, estimated revenue/downloads) taken on a specific date. Trend detection compares Snapshots.
_Avoid_: Reading, data point

**Revenue estimate**:
A modeled monthly revenue figure derived from public signals (chart rank, category, IAP catalog, review velocity) — not reported by Apple or Google.
_Avoid_: Revenue (unqualified), MRR (unless subscription-specific)

**Download estimate**:
A modeled download figure using the same public-signal approach as Revenue estimate.
_Avoid_: Installs (unless Google Play context)

**Growth score**:
A composite number ranking how fast an App is accelerating over a window (7d, 30d, 90d) across reviews, rank, and ad activity.
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

## Flagged ambiguities

**Popularity vs traffic score** — decoupled in v1: popularity from SERP volume signals (total reviews in top 10); traffic from leader avg reviews; difficulty stays separate.

**Keyword storefront scope** — Apple and Google Play, **multi-market**. v1 was US-only; now 14 markets wired (target: AppKittie's 26). Each Keyword is scored per-country, with a cross-market view that flags untapped markets (high popularity + low difficulty).

**Keyword popularity source** — derived from Apple search **autocomplete rank** (a free signal that reflects real search demand), NOT Apple's official popularity index (which is paid/scraped and has no free equivalent). Directionally accurate for ranking terms; not a calibrated volume figure. Architected pluggable so a real source can drop in later. See ADR.

## Example dialogue

**Dev**: "This app is trending — should we flag it as a first mover?"
**Domain**: "Check the Growth score over 7d and whether review velocity is accelerating. First mover means it's climbing *before* the category fills up — high revenue alone doesn't qualify if the niche already has ten copycats."

**Dev**: "Should we tell them exactly what to put in their keyword field?"
**Domain**: "No — that's ASO coach territory. Show who ranks, Keyword difficulty, and a Keyword insight or two from what we can see. Let them decide; agentic hints later if we want, still not 'we'll make it amazing for you'."
