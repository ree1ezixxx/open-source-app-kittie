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
_Avoid_: Campaign (unless referring to a grouped set of creatives)

**Keyword**:
A search term users type in an app store. ASO intelligence tracks difficulty, traffic proxy, and which Apps rank for it.
_Avoid_: Tag, search query (in domain docs)

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

## Flagged ambiguities

**Chart visibility**: Free chart feeds only expose apps currently in top lists (e.g. top 100). Apps outside those lists have no Observed rank until they chart — rank is unknown, not zero.

**Meta ad signal**: Growth score reserves 20% for ad-creative momentum. Ingest is blocked on Meta ID verification — that slice is dormant until Ad Library sync ships; no rebalancing until then.

## Example dialogue

**Dev**: "This app is trending — should we flag it as a first mover?"
**Domain**: "Check the Growth score over 7d and whether review velocity is accelerating. First mover means it's climbing *before* the category fills up — high revenue alone doesn't qualify if the niche already has ten copycats."
