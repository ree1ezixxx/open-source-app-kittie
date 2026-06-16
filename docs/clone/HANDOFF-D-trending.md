# Handoff — Lane D · Trending  (heaviest lift)

**Branch:** `feat/trending-metrics` · **Ports:** web 5184 / api 3014 · **Current fidelity:** ~55% (target ≥4/5)
**Truth:** https://www.appkittie.com/dashboard/trending

## Setup
- Truth browser: `bash coordinator/truth-chrome.sh` → attach Chrome DevTools MCP (`list_pages → select_page`). Logged-in, zero-touch.
- Audit detail: `coordinator/.cache/live-2026-06-16/parity-report.html` (+ `trending.txt` / `trending.webp`).

## Owns
`apps/web/src/pages/TrendingPage.tsx`; `packages/types` (`TopChartsEntry`); `packages/db` charts query; `packages/api/src/routes/charts.ts`; `packages/intelligence` (MRR model); `packages/ingest` (RSS).

## Tasks
1. Add **Downloads + MRR** to `TopChartsEntry` type + DB/charts query — M
2. Swap **Rating/Reviews → Downloads + MRR** columns — `TrendingPage.tsx` — S
3. **Country selector** (static US, wired to API `country` param) + status badge (`🇺🇸 💼 • 100 apps`) — S
4. Trend-line delta icon · refresh button · top-3 medal styling — S
5. **Revenue-estimation model** feeding MRR — `packages/intelligence` — L
6. Extend iTunes RSS ingest: 3 chart types × all genres — `packages/ingest` — M

## Cross-cutting (YOU own these for everyone)
- **MRR estimation model** (`packages/intelligence`) is shared — Rising/Highlights MRR cells consume it. Build it first; export a clean helper.
- Start the model early; tasks 1–4 (UI) can land before realism is perfect.

## DoD
Correct columns w/ real estimates · country selector · **fidelity ≥4/5** vs live `/dashboard/trending` · `pnpm typecheck` green · PR → `main`.
If MRR realism is blocked by data/feeds: STOP, report current score + exact blocker + unblock path (per fidelity gate). Data caveat: rank-delta flat until a 2nd snapshot day.
