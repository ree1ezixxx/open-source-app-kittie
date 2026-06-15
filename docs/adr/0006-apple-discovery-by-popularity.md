# 0006 — Apple discovery by popularity, then filter by release date

## Status

Accepted

## Context

The **New Big Hits** highlights widget lists apps released within the last 7
days, ranked by review volume. To populate it we need a steady intake of
newly-released Apple apps.

Apple exposes **no free "new releases" feed**. The free, no-auth endpoints we
can use are:

- Legacy genre **RSS charts** (`itunes.apple.com/<cc>/rss/<feed>/…/json`) —
  popularity-ranked, not release-ordered.
- The **iTunes Search API** (`/search?term=…&entity=software`) — keyword-ranked,
  not release-ordered.
- The **iTunes Lookup API** (`/lookup?id=…`) — full metadata, including
  `releaseDate`, but only for IDs you already have.

None of these lets us ask "what shipped in the last 7 days." There is no
date-ordered or date-filtered discovery surface on the free tier.

## Decision

**Discover broadly by popularity, then derive freshness from `releaseDate`.**

The Apple discovery collector scans the popularity charts + search top-up to
gather candidate app IDs, enriches each via Lookup, and persists it with a
same-run snapshot (snapshot-on-discover). "Newness" is then a **downstream
query filter** — `releasedAt` within 7 days — not a property of the data source.

Release dates pass through a future-date guard (`clampReleaseDate`) so Apple
pre-order / unreleased listings cannot poison the 7-day window.

The first cut is **US-only**, **capped (~500 apps/run)**, run on a daily sweep.

## Consequences

- **Honest limitation:** we only surface apps that already chart or match a
  search term, so coverage is a *fraction* of true new releases and skews toward
  apps with early traction. We will not match a paid provider's "everything new"
  breadth. Coverage grows as the country set and search-term list grow.
- Discovery cost is bounded by the per-run cap, not by the (unknown) true volume
  of daily releases.
- New Big Hits reflects "newly-released apps we happened to discover," which is
  acceptable for a first-mover signal but must never be presented as an
  exhaustive new-releases list.

## Alternatives considered

- **Scrape an unofficial new-releases listing** — fragile, rate-limited, and no
  stable free source exists; rejected.
- **Pay for a new-releases data feed** — out of scope for v1 (no paid sources).
