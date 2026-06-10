# Single freshness scheduler (one registry, not per-feature timers)

All derived datasets (Reviews, Snapshots, chart ranks, Tracked keyword re-score, Hot ideas) are kept fresh by **one** in-process scheduler — a registry where each sweep declares `{ name, cadence, lastRun, run() }`. On API boot it runs anything past its cadence (the Boot catch-up sweep); an interval re-checks while the API is up. The existing reviews sweep (`sweepFreshSet`) becomes the first registered entry.

We chose this over per-feature `setInterval`s because the UI "data as of <date>" footer needs a single source that knows every sweep's last-run and next-due, and because one place lets a global pacing budget stop five sweeps from hitting the stores concurrently at 100K-app scale. The cost is a small abstraction to build before any new sweep pays off; accepted because the alternative reconstructs the same registry implicitly.

Constraint (unavoidable for a local tool): sweeps run only while the API process is alive. Boot catch-up makes the gap invisible.
