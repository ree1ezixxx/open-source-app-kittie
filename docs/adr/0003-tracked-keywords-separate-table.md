# 0003 — Tracked keywords live in their own table, separate from the lookup cache

Status: Accepted (2026-06-08)

## Context
A blind two-judge evaluation of our Keyword Explorer against the reference
product (AppKittie) found we lose on exactly one axis: **durability**. Our
tracked shortlist was in-memory — it reset to "Tracked 0" on every page reload —
which one judge called structurally disqualifying for a feature literally named
*tracking*. Persisting the shortlist server-side is the single fix that flips the
verdict.

Our `keywords` table is a **scored-lookup cache**: one row per
(keyword, country, store), a 7-day TTL, re-synced on read when stale. It carries
no notion of user intent. "This keyword is on my shortlist" is a genuinely new
concept that has to be modelled.

Three options were considered:
1. Add a `tracked` flag to the `keywords` cache row.
2. A separate `tracked_keywords` table referencing the cache row.
3. Per-seed "research workspaces" (the reference product's model).

## Decision
Introduce a **separate `tracked_keywords` table** — `keywordId → keywords.id`,
`trackedAt`, optional `note` — as the durable source of truth for the shortlist.
The cache row still holds current metrics; the tracked row holds the user's
commitment to watch it.

Scope is **stage-1 shortlist persistence only**. Capturing rank-over-time on
track is explicitly deferred to stage 2 (see [ADR 0002](0002-hosted-libsql-for-keyword-rank-history.md)),
which needs the hosted-libSQL + scheduled-snapshot substrate. On reload we
restore the tracked shortlist only — untracked ideas from a generation are
ephemeral candidates, not commitments. We did **not** adopt per-seed workspaces:
the judges faulted the lost list, not the lack of workspaces, so workspaces are
out of scope here.

## Consequences
- **Good:** a tracked keyword is structurally immune to cache eviction — durable
  user intent is cleanly separated from ephemeral lookup data, which is the exact
  trust axis we were losing on. Rank-history (stage 2) attaches naturally via the
  existing `keyword_rankings` table keyed on the same `keywords.id`. Deep-links
  reuse the stable `keywords.id` the cache already mints.
- **Bad:** reads that need "tracked + current metrics" join two tables instead of
  reading one flagged row. A tracked keyword whose cache row is later re-synced
  could drift if not refreshed — handled by the manual Refresh action.
- **Reversible-ish:** collapsing back to a flag, or growing up into workspaces,
  both mean a migration once rows exist — hence an ADR.
