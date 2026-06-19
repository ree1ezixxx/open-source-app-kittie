---
status: accepted
---

# Due-driven streaming snapshot worker (out-of-process, tiered)

## Context & decision

`runSnapshotBulk` (snapshot-bulk.ts:34) materializes the entire ~1.1M-app
catalog into one array per run, hits ~4 GB heap, OOMs, and — because the sweep
runs **inside the API process** (ADR 0004's in-process scheduler) — takes the API
down with it. On restart, boot catch-up re-runs the same bulk pass, so the API
**crash-loops**. Result: `snapshots-daily` has not completed in days; ranks,
growth scores and revenue/download estimates are frozen while `/freshness` is the
only thing that knows it. This is the "stale in a week" risk.

The OOM is a symptom. The root cause is the **model**: snapshotting all 1.1M apps
every 24h is physically impossible at the Apple/Google IP rate ceiling (the
Google leg alone is ~12h single-threaded at 150ms/app; the bottleneck is the
store IP limit, not SQLite). ADR 0007 already concluded this ("Full-catalog × 14
daily is infeasible") and declared the streaming fix a hard dependency. This ADR
is that mechanism.

**Decision — three coupled changes:**

1. **Due-driven, not catalog-iterating.** The job never loads the catalog. It
   queries *what is overdue*, priority-ordered, `LIMIT batch`, snapshots the
   batch, advances each app's `lastSnapshotDate`, and loops until the due-set is
   empty or a wall-clock / request budget is spent. The DB row state **is** the
   checkpoint — a crash resumes from the still-due set with no bookkeeping.

2. **Tiered cadence** (operationalizes ADR 0007's market-visible vs long-tail):
   - **Hot** = currently-charting ∪ tracked apps (the visible ~4–5k/market). Due
     if no snapshot dated *today*. Refreshed **daily**.
   - **Cold** = the long tail. Due if `lastSnapshotDate` older than a rolling
     window (target ≤ 7d, period = catalog ÷ sustainable throughput). Nothing
     ever exceeds the window.
   Hot drains before cold each cycle, so user-visible data is always freshest.

3. **Out-of-process, supervised.** The snapshot worker is its own process
   (`pnpm dev:worker`) against the same SQLite. An OOM/crash kills the *worker*,
   not the serving API → the crash-loop is structurally impossible and the API
   keeps serving + honestly reports staleness via `/freshness`. This revises ADR
   0004 for the heavy sweep only: the single registry/“data as of” concept stays;
   the *execution* of the expensive snapshot sweep moves to the worker.

To find "due" in O(batch) without scanning 1.1M rows each loop, denormalize
`apps.lastSnapshotDate` (text, indexed), maintained on every snapshot write and
backfilled once from `max(app_snapshots.snapshot_date)`.

## Considered options

- **Due-driven streaming worker (chosen).** Bounded memory (one batch), resumable
  by construction, naturally tiered, self-healing. Cost: a new process + one
  denormalized column + migration.
- **Stream the full-catalog pass in-process, paginated + resumable.** Kills the
  OOM but keeps an impossible goal (long tail can't complete daily) and keeps a
  heavy job in the API event loop — an OOM still risks the API. Rejected: fixes
  the crash, not the staleness.
- **Shard the catalog across workers.** Doesn't help — the limit is the store IP
  ceiling, not local compute (memory `ingest-bottleneck-is-apple-ip-not-sqlite`).
  More workers = more 429s. Rejected.

## Consequences

- **Hot data daily, everything ≤ rolling window.** Satisfies the actual promise:
  what users look at is fresh every day; nothing is ever stale-in-a-week.
- **Decouple the sweep queue.** Today all sweeps serialize behind
  `snapshots-daily`; when it stalls, reviews/keywords/hot-ideas starve. Cheap
  sweeps must not wait on the heavy one (run them in the worker’s queue ahead of
  cold cold-tier batches, or keep them in-API).
- **Schema migration.** `apps.lastSnapshotDate` + index, via `packages/db` only
  (note in `docs/schema-requests.md` if ingest needs it first). One-time backfill.
- **API boot no longer runs the bulk sweep.** `RUN_SWEEPS=0` stops being the only
  way to keep the API alive; the API simply never owns the heavy job.
- **Unblocks ADR 0007.** Per-country bulk can now widen coverage at IP-safe rates
  on top of the due-set, instead of multiplying an already-OOMing pass.
- **Multi-country charts + overall top-grossing** (fixing the hardcoded
  `fetchChartRankLookup("us")` and the missing grossing feed) layer on as
  follow-ups once the worker is the single snapshot writer.

## Rollout (vertical slice first)

1. **Slice (this build):** `lastSnapshotDate` column + backfill → due-driven
   worker process snapshotting the **hot** set daily + cold on the rolling window,
   bounded memory → API stops running the bulk sweep. DoD: worker drains the hot
   set with bounded RSS (no OOM), `/freshness` shows `snapshots-daily` advancing,
   hot apps carry today's snapshot, API never crash-loops.
2. **Follow-ups:** decouple cheap sweeps from the heavy one · multi-country chart
   lookup · overall top-grossing feed · `/freshness` watchdog + degraded-health
   alert so staleness is never silent again.
