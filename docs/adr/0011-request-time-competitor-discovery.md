# 0011 — Request-time competitor discovery for an arbitrary idea

## Status

Accepted

## Context

ADR 0006 discovers Apps **broadly by popularity** in a batch sweep and persists
them; user-facing search (`/api/v1/apps?search=`) then reads the **local DB
only**. That is correct for browsing a catalog.

Slice 1's Build Decision Workspace inverts the entry point: a builder types an
**arbitrary idea** ("a sobriety tracker", "a kids maths game") and expects a
**competitor set + demand signal right now** — including for niches no batch sweep
has happened to cover yet. DB-only search can't answer that: a novel idea returns
nothing, so the verdict has no evidence.

The free Apple surfaces (iTunes Search) can answer it live, but there is a hard
**per-IP rate wall** (ADR 0007) — we cannot hit the store for every keystroke of
every user at scale.

## Decision

**Discover competitors at request time from short search terms, cache the
results into the shared catalog, and degrade honestly when the store throttles.**

1. **Idea → terms.** An AI step turns the free-text idea into 1–3 short
   store-style search terms (e.g. `sobriety`, `tracker`, `health`). The terms are
   stored on the Build Context and are **user-editable** — if we guessed wrong,
   the builder corrects them and re-runs. No long natural-language strings are
   sent to the store.
2. **DB-first, live top-up.** For each term, reuse already-ingested Apps where
   present; only hit live iTunes Search for the gap. Newly-discovered Apps are
   **ingested into the catalog** (snapshot-on-discover, as in ADR 0006), so a
   later, similar idea hits cache and the catalog grows for everyone.
3. **Cache the set.** The competitor set for a `(normalised term, country)` is
   cached with a freshness window; reuse within window, re-discover when stale.
4. **Honest degradation.** If the rate wall throttles mid-discovery, return the
   competitor set found so far as a **`Provenanced` value with `coverage:
   partial`** (or `stale`), never an error and never fabricated rows. The verdict
   downstream lowers confidence and shows a "partial data" badge — the product's
   honesty model absorbs the limit instead of fighting it.

## Consequences

- **Extends, doesn't replace, ADR 0006.** The popularity batch sweep still runs;
  this adds an on-demand keyword-discovery path on top. The two share one catalog.
- A validate request carries request-time latency + one AI call; caching and
  DB-first reuse keep the steady-state store hits low.
- The Apple per-IP wall is the throughput ceiling. Caching, term de-duplication,
  and graceful partial coverage are how we live under it — not proxies or scraping.
- Coverage for a brand-new niche is a **fraction** of the true field on first run
  and improves as the catalog fills; this must always be shown honestly
  (`observed` competitors vs `partial` coverage), never as an exhaustive list.

## Alternatives considered

- **DB-only (no live discovery)** — novel ideas return no competitors, so the
  core "validate any idea" promise fails. No.
- **Always-live, no cache** — hits the rate wall immediately, slow, and re-fetches
  the same field repeatedly for popular niches. No.
- **Proxy pool to beat the IP wall** — operational cost + ToS risk for a v1; the
  honest-degradation path is cheaper and matches the product's stance. Deferred.
