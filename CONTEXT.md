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

## Flagged ambiguities

_None yet._

## Example dialogue

**Dev**: "This app is trending — should we flag it as a first mover?"
**Domain**: "Check the Growth score over 7d and whether review velocity is accelerating. First mover means it's climbing *before* the category fills up — high revenue alone doesn't qualify if the niche already has ten copycats."
