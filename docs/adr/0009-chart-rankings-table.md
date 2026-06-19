---
status: accepted
---

# Dedicated chart_rankings table (one row per app × chart × day)

## Context & decision

Trending's signature 24h rank-delta column was null on every row. Two causes:

1. **Intraday pollution.** Chart positions were stored on the per-app
   `app_snapshots` row. The metric worker (ADR 0008) re-fetched the shifting
   chart every cycle; apps that dropped off the chart fell out of the hot set and
   were never re-touched, so their stale rank persisted. A day accumulated
   duplicate ranks (148 `top-free` rows / 93 distinct). The read assembler
   (`charts.ts`) rejects any day whose ranks aren't unique, so no clean prior day
   existed and every delta resolved to null.

2. **The single chart slot.** `app_snapshots` is keyed `(app_id, snapshot_date,
   chart_country)` — ONE chart position per app per day per market. But an app is
   on many charts at once (#5 overall Free *and* #1 in Games *and* #2 Games
   Grossing). Whichever the capture wrote last won; the rest were lost. The
   overall chart came back half-empty (50 of 100) because its apps' rows had been
   overwritten with a genre encoding.

**Decision:** chart positions move to a dedicated **`chart_rankings`** table —
one row per `(app_id, snapshot_date, country, chart_category)`, where
`chart_category` is the leaderboard identity (`top-free` overall, `top-free:Games`
genre, …). An app holds as many rows as charts it's on. The daily **chart
capture** SET-REPLACEs each leaderboard (delete the day's rows for that
store/country/encoding, insert the current Top-N) so ranks stay unique and the
day is clean. Capture runs **once per UTC day** (matching appkittie's periodic
"Updated Nh ago" snapshot). The frequent metric pass writes review/rating via
`upsertMetricSnapshot`, which never touches chart columns, so it can't re-pollute.
The charts read (`charts-query.ts`) sources rank/category from `chart_rankings`
and joins the metric snapshot for review/rating/estimates. The pure assembler is
unchanged.

## Considered options

- **Dedicated `chart_rankings` table (chosen).** Correctly represents multi-chart
  membership; clean set-replace; indexable. Cost: one table + migration + repoint
  the read.
- **`chart_category` in the `app_snapshots` key.** Lets an app have multiple chart
  rows, but review/rating (app-level facts) would be duplicated across them or
  ambiguous for the metric upsert. Rejected — conflates chart and metric identity.
- **Overall-precedence single slot.** Keep one slot, let the overall chart win.
  Overall completes, but any app also on a genre chart vanishes from that genre —
  visibly wrong vs truth, caps Trending below the gate. Rejected.
- **JSON `chart_positions` column.** One row holds all memberships as JSON. Loses
  the partial chart index; chart reads can't use it efficiently. Rejected.

## Consequences

- **Both overall AND genre charts are complete and clean** (Apple Free US 50→99;
  genre Games 100/100), so 24h rank-delta resolves against the prior clean day.
  It is null on a chart's first captured day (a real warmup, like truth's blank
  24h on a new chart) and populates from the second daily capture.
- **`app_snapshots.chart_rank/chart_category` are now legacy** — unused by reads.
  Left in place (historical data); a later migration may drop them.
- **Apple overall top-grossing stays empty by design** — no free Apple overall
  grossing feed exists (`applemarketingtools` returns 0); an external limit, like
  Meta ads. Google overall grossing and Apple per-genre grossing populate.
- **Non-US is one flag away** — capture takes a country list
  (`WORKER_CHART_COUNTRIES`, default `US`); adding `GB` etc. just widens it.
- Builds on ADR 0008's metric/chart write split; the worker owns both passes.
