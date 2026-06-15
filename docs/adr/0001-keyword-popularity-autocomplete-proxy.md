# 0001 — Keyword popularity from autocomplete rank, not the real Apple index

Status: Accepted (2026-06-08)

## Context
AppKittie serves a real Apple 0–100 search-popularity index, almost certainly
scraped from the Apple Search Ads dashboard or bought from a vendor
(AppTweak / Sensor Tower / data.ai, ~$100–500+/mo). There is **no free,
legitimate API** that returns this number. We are building a guerilla (free,
open-source) clone and want high-quality output without a paid feed or a
ToS-grey scraper.

The whole keyword pipeline (difficulty weighting, opportunity ranking,
cross-market "untapped" flags) inherits whatever popularity signal we choose,
so this is a root decision.

## Decision
Derive popularity from **Apple search autocomplete rank** (MZSearchHints) —
a free signal that reflects *real* search demand, because Apple orders hints by
actual popularity. Score = full-term breadth + short-prefix reach. Expose it
behind a **pluggable interface** so a real index (scrape or vendor) can replace
it later without touching the difficulty/opportunity layer.

We explicitly do **not** scrape Search Ads or buy a vendor feed at this stage.

## Consequences
- **Good:** free, open-source-honest, no auth/infra, no ToS-grey scraping. ~80%
  rank-correlation with the real index in the mid-range — enough for the core
  "which terms should I target" decision (ordering, not absolute volume).
- **Bad:** absolute numbers are fuzzy (we may say 85 where the real index says
  98); the long tail collapses toward similar low scores; the very top
  saturates. Not a calibrated volume figure — must be labelled a proxy in the UI.
- **Mitigation:** pluggable source means upgrading is a drop-in later. Honesty
  rule (see ADR none / project principle): never present the proxy as if it were
  a precise volume.
