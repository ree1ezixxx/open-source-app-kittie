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

**Creator partnership**:
A social account (TikTok, Instagram, etc.) promoting an App, linked via bio, caption, or sponsored content signals.
_Avoid_: Influencer (acceptable in UI copy, not in schema names)

**Ingestion job**:
A scheduled task that fetches external data and writes Snapshots or related records to the database.
_Avoid_: Crawler, scraper (in domain docs)

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

## Example dialogue

**Dev**: "This app is trending — should we flag it as a first mover?"
**Domain**: "Check the Growth score over 7d and whether review velocity is accelerating. First mover means it's climbing *before* the category fills up — high revenue alone doesn't qualify if the niche already has ten copycats."
