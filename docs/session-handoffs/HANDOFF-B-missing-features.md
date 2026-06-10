# Handoff B — Missing Features (what AppKittie LACKS, we add)

> **Pick up in:** a SEPARATE worktree `open-source-app-kittie-additive`, branch `feat/additive` (off `integrate/full-clone`).
> **Goal:** additive edge — features AppKittie doesn't have, all free (existing public data + free Gemini).
> **Sibling work:** the clone-to-parity build runs in `open-source-app-kittie-ui` / `integrate/full-clone` — see [HANDOFF-A-clone-to-parity.md](./HANDOFF-A-clone-to-parity.md). Don't build parity here.
> **No contamination rule:** additive = NEW pages/routes/services/tables. Touch shared shell files (`App.tsx`, `Sidebar.tsx`) ONLY with append-only additions in a clearly-marked block; coordinate to avoid clashing with parity work. Everything else additive-owned.

## Why these (validated by 2 research passes, 2026-06-10)
AppKittie ceiling confirmed live: 17 sidebar items, **no alerts, no compare, no in-app chat, no watchlist-diff.** Demand evidence (Indie Hackers / DEV.to / ASO blogs / X) ranked what indies actually beg for. Skip anything needing a usage panel (install counts, cohorts, device splits, price forecasting) — we can't replicate Sensor Tower's panel and shouldn't try.

## Build scope

### Tier 1 — VALIDATED (strong demand, cheap, free)
1. **Alerts / change-notifications** — strongest demand ("lost 40% installs to a silent competitor metadata change"). Rules: revenue spike, rank shift, price/metadata change, rating drop, new Meta ad creative (when ad data lands). → in-app feed + macOS notification + daily digest. Mechanism: diff consecutive Snapshots (data already swept). **HIGH / MED.**
2. **Keyword gap analysis** — "keywords competitors rank for that you don't." Core ASO job. Uses existing ranking data + set logic + Gemini clustering. **HIGH / MED.**
3. **Cross-app review feature-mining** — "top requests/complaints across a whole niche." THIS is the Rodrigue thesis (1–2★ reviews = the opportunity). Aggregate existing per-app sentiment via Gemini. Pairs with Hot Ideas. **HIGH / MED.**
4. **Watchlist + change-diff** — track apps, see what changed over time (update history, screenshot/price diff). Extends Favorites. **HIGH / LOW-MED.**
5. **Cross-country localization gap** — "where competitors exist (or notably don't) per market." Uses existing multi-market keyword data. Surfaced as a high-demand gap NOT in the original list. **MED-HIGH / LOW-MED.**
6. **App comparison (side-by-side)** — 2–5 apps across all metrics + overlaid history charts. UI affordance that supports 1–5. **MED / LOW-MED.**

### Tier 2 — CHEAP BETS (unproven demand, near-zero cost since Gemini wired) — ship LAST
7. **In-app AI research chat** — Gemini grounded on our DB ("why is this app growing", "summarize this niche"). Novel, supply-led (no indie *asking*), but stickiest if it lands. **MED / MED.**
8. **Idea → scaffold / PRD bridge** — one-click from a Hot idea → PRD + Claude-Code prompt-pack / repo skeleton. Fits Rhodri's ship-with-Claude-Code workflow even if broad market doesn't ask. **MED / LOW-MED.**

### Tier 3 — STRETCH (biggest novel edge, real data lift)
9. **Multi-store consolidation (Steam / itch.io)** — loudest workflow pain ("check 4 dashboards every morning"); NO incumbent covers indie distribution. New ingestion sources (Steam/itch public data), creators-style spike. Park until Tier 1 ships. **HIGH value / HIGH effort.**

## Structural edge (already true — just frame it)
Free · local · no paywall · no 25k-credit cap · your own Snapshot history accumulating forever (no data-retention paywall like the $450/mo incumbents). Lead messaging with this — research said free/local is the single most-requested "feature."

## Data + infra notes
- All Tier 1–2 run on data already in `kittie.db` + free Gemini (`gemini-2.5-flash`, key in `.env`). Same Gemini setup as Handoff A — share the seam.
- Alerts/watchlist need the snapshot history (3 days now, grows daily via the parity live-sync). Diff logic only.
- New tables likely: `alerts`/`alert_rules`, `watchlist`/`watchlist_diffs`. New API routes under `/api/v1/`. New sidebar group ("Monitor" or similar) appended.
- Multi-store (Tier 3) = new ingest collectors (Steam Web API is public/free; itch.io has public pages) — its own design spike; don't start until asked.

## Sequencing recommendation
Tier 1 (1→6) first, in that order (alerts + keyword gap + review mining have the strongest demand). Tier 2 (7,8) only after Tier 1 is solid. Tier 3 (9) parked pending explicit go-ahead. Build AFTER or alongside parity — but parity is the priority; this is the edge layer on top.

## Open decisions for Rhodri (confirm before building)
- Final cut: all of Tier 1+2, or trim 7/8?
- Multi-store (9): in or parked?
- Notification mechanism: macOS native notification vs in-app-only feed.
