# Handoff — Lane C · Rising

**Branch:** `feat/rising-rows` · **Ports:** web 5183 / api 3013 · **Current fidelity:** ~72% (target ≥4/5)
**Truth:** https://www.appkittie.com/dashboard/rising

## Setup
- Truth browser: `bash coordinator/truth-chrome.sh` → attach Chrome DevTools MCP (`list_pages → select_page`). Logged-in, zero-touch.
- Audit detail: `coordinator/.cache/live-2026-06-16/parity-report.html` (+ `rising.txt` / `rising.webp`).

## Owns
`apps/web/src/pages/RisingPage.tsx`; `packages/api/src/lib/params.ts` + `services/db-app-service.ts` (country param).

## Tasks
1. Row: **category before developer** (`·` separator) — S
2. Row: **per-row store glyph** from `a.store` — S
3. **Footer** "Showing the top 100 apps by MRR" + **Refresh** button (wire `refresh` into PageShell actions) — S
4. Store toggle "Apple Store" + icons · `GROWTH` header label · rank `#` prefix (4+) · green active dot — S
5. **Wire country filter → API** — `params.ts` + `db-app-service.ts` + `RisingPage.tsx` — M

## Cross-cutting
- You touch `db-app-service.ts` (country) — keep the change additive; flag in PR so it doesn't collide with other API edits. MRR cells consume Lane D's estimation model.

## DoD
Rows + chrome match truth · country filter functional · **fidelity ≥4/5** vs live `/dashboard/rising` · `pnpm typecheck` green · PR → `main`.
Data caveat (don't count against fidelity): `isFirstMover`/`growthPct` flat until a 2nd snapshot day.
