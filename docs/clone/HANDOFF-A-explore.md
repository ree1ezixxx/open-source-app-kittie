# Handoff — Lane A · Apps / Explore

**Branch:** `feat/explore-parity-ui` · **Ports:** web 5181 / api 3011 · **Current fidelity:** ~82% (target ≥4/5)
**Truth:** https://www.appkittie.com/dashboard/explore

## Setup
- Truth browser: `bash coordinator/truth-chrome.sh` → attach Chrome DevTools MCP (`list_pages → select_page`). Logged-in, zero-touch.
- Audit detail: `coordinator/.cache/live-2026-06-16/parity-report.html` (+ `explore.txt` / `explore.webp`).

## Owns
`apps/web/src/components/{FilterSelectPopover,ExploreFilterRail,Topbar}.tsx`, `apps/web/src/pages/ExplorePage.tsx`, + small API category-store-presence addition.

## Tasks
1. Category popover **search box** ("Search categories…") — `FilterSelectPopover.tsx` — S
2. **Per-store icons + circular selector** on category rows — `FilterSelectPopover.tsx` + `ExploreFilterRail.tsx` + API category endpoint — M
3. **Dual pagination** (above + below table) — `ExplorePage.tsx` — S
4. **Contacts → collapsible** block in Marketing Signals — `ExploreFilterRail.tsx` — S
5. **User account menu** in topbar — `Topbar.tsx` + auth state — M

## Cross-cutting
- Category store-presence API addition is yours; per-row `store` glyph already exists. Flag in PR.

## DoD
All tasks done · side-by-side **fidelity ≥4/5** vs live `/dashboard/explore` · `pnpm typecheck` green · PR → `main`.
Data caveat (don't count against fidelity): sparkline/first-mover flat until a 2nd snapshot day.
