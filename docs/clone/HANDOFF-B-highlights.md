# Handoff — Lane B · Highlights  (fastest win)

**Branch:** `feat/highlights-routes` · **Ports:** web 5182 / api 3012 · **Current fidelity:** ~75% (target ≥4/5)
**Truth:** https://www.appkittie.com/dashboard/highlights

## Setup
- Truth browser: `bash coordinator/truth-chrome.sh` → attach Chrome DevTools MCP (`list_pages → select_page`). Logged-in, zero-touch.
- Audit detail: `coordinator/.cache/live-2026-06-16/parity-report.html` (+ `highlights.txt` / `highlights.webp`).

## Owns
`apps/web/src/pages/HighlightsPage.tsx` + router.

## Tasks (mostly S)
1. Fix "View all" param names: `sort→sortBy`, `order→sortOrder`, `rel→releasedAfter` — S
2. Top Gainers "View all" → `/dashboard/rising` — S
3. Top Losers "View all" → `/dashboard/movers?type=losers` — S
4. Subtitle copy → "Filter apps by store source." — S
5. Scaffold `/dashboard/movers` route (gainers/losers via `type` param) so link isn't dead — M

## Cross-cutting
- `/dashboard/rising` is Lane C's page; `/movers` is new and yours. Coordinate the router entry only.

## DoD
Routes/params match truth · `/movers` resolves · **fidelity ≥4/5** vs live `/dashboard/highlights` · `pnpm typecheck` green · PR → `main`.
Data caveat (don't count against fidelity): Gainers/Losers 1D deltas flat until a 2nd snapshot day.
