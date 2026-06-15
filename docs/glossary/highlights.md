# Glossary — Dashboard Highlights

Fragments for the canonical `CONTEXT.md`; the coordinator merges these. Same
`**Term**:` / definition / `_Avoid_:` format as the root glossary.

**Rank delta (1D)**:
The signed change in an App's store **chart rank** between its two most recent
ranked snapshot days — `priorRank − latestRank`, so a positive value means the
App *climbed* (e.g. rank 99 → 1 reads `+98`). Rendered as a signed integer in
the Highlights "1D" column; powers the Top Gainers (largest positive) and Top
Losers (largest negative) widgets. Null when the App lacks two ranked
snapshots. Sourced from real `app_snapshots.chart_rank` history — never seeded.
_Avoid_: Growth % (that is the review-velocity proxy `growthPct`, a different
metric); 1-day (the two latest snapshot dates may not be calendar-adjacent — it
is "latest movement", not a literal 24-hour window).

**New Big Hits**:
Highlights widget listing newly released Apps (released within 7 days) ranked by
review volume — the truth query is `sortBy=reviews`, `sortOrder=desc`,
`releasedAfter=7d`. Carries a `(N)` count of all matching Apps; the only
Highlights widget with a count.
_Avoid_: Trending, Rising (those are separate dashboard surfaces with their own
ranking logic).
