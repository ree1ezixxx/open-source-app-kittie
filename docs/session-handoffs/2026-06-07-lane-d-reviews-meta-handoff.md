# Lane D — Reviews & Meta — Session Handoff
**Date:** 2026-06-07 · **Branch:** `feat/reviews-meta` (forked from `feat/ui`) · **Worktree:** `~/Documents/open-source-app-kittie-reviews-meta`

Delivers the four surfaces from `HANDOFF.md` / `~/.claude/plans/delegated-finding-spark.md`. Typechecks clean (`pnpm --filter @kittie/web typecheck`). Verified live in-browser against the shared API on `:3007` (real reviews) — see "Verified" below.

---

## What shipped

| Surface | Route(s) | State |
|---|---|---|
| **Reviews** | `/reviews/:tab` (`overview`\|`reviews`\|`semantics`\|`improvements`); `/reviews` & `/dashboard/reviews` → redirect `…/overview` | 4 tabs render; **real** review text + rating distribution; sentiment/semantics/improvements **mocked + labelled** |
| **MCP landing** | `/mcp` | Static. Hero, copy-paste terminal, 6 tools, 9 skill cards, 3-step setup, GitHub links |
| **Settings** | `/settings` | Plan / Team / Export History; auth+billing buttons render → toast "not wired" |
| **App-Detail parity** | `/apps/:id` (extends existing) | Meta-ads · Apple-ads · Creators · IAPs sections, all honest empty-states (0 rows today) |

## Files (all lane-owned / isolated)

**New**
- `apps/web/src/lib/api/reviews.ts` — real `POST /api/v1/reviews` client (`fetchReviews`), rating-distribution helpers (real), **typed mock layer** (`getReviewInsights` → `{ mock:true, sentiment, clusters, improvements }`), localStorage monitored-apps store (`kittie.reviews.monitored.v1`).
- `apps/web/src/components/reviews/primitives.tsx` — `PageHeader`, `Tabs`, `EmptyState`, `MockBadge`, `MockNotice`. **Imports `styles/reviews.css`.**
- `apps/web/src/components/reviews/AppPicker.tsx` — modal listing **real** apps from shared `lib/api.ts#listApps`.
- `apps/web/src/pages/reviews/ReviewsPage.tsx` + `reviewTabs.tsx`.
- `apps/web/src/pages/McpLandingPage.tsx`, `apps/web/src/pages/SettingsPage.tsx`.
- `apps/web/src/components/detail/ParitySections.tsx` — `<DetailParitySections app={app} />`.
- `apps/web/src/styles/reviews.css` — **all** lane CSS (consumes shell tokens; nothing added to `index.css`).

**Edited (surgical)**
- `App.tsx` — mounted lane routes only.
- `AppDetailPage.tsx` — +import, +`<DetailParitySections/>` render line, removed the inline IAP block (now owned by ParitySections).
- `Sidebar.tsx` — **temporary** Workspace nav group (Reviews / MCP) + wired the dead Settings button. ⚠ Lane A owns the shell — see rebase note.

## Real vs. mock boundary (do not blur)
- **REAL:** review bodies/titles/authors/ratings/dates (`POST /reviews`, 13,320 rows); rating distribution + average computed from those rows; app list in the picker.
- **MOCK (labelled):** sentiment summary, semantic clusters, improvement suggestions — every payload carries `mock:true` and renders a `MockBadge`/`MockNotice`. Swap `getReviewInsights()` for a `fetch()` when `reviews.sentiment|semantics|improvements` lands on the backend; the component shapes already match.
- **EMPTY (honest):** meta_ads / apple_search_ads / creators / iaps = 0 rows → dashed empty-states matching the page's existing "Preview videos aren't collected yet" tone.

## ⚠ Rebase onto `feat/ui` (when the shell lands)
1. `git rebase feat/ui` (sync first per HANDOFF).
2. **Swap local primitives for Lane A's shared shell:** `components/reviews/primitives.tsx#Tabs`/`EmptyState` → shared `Tabs`/`EmptyState`. Delete the local versions if fully replaced. `PageHeader` may map to the shared `Topbar`.
3. **Drop the temporary `Sidebar.tsx` nav** — let Lane A's nav own Reviews/MCP/Settings entries. (My edits are clearly commented `Lane D — temporary`.)
4. Re-mount routes on the shell's router; keep the redirect routes.
5. Confirm `Chart` import still resolves (parity uses the page's existing `HistoryChart`, untouched).

## Run
```
# backend (once, from ingest worktree):
cd ~/Documents/open-source-app-kittie-ingest && PORT=3007 pnpm dev:api    # bg
# this lane:
cd ~/Documents/open-source-app-kittie-reviews-meta
pnpm --filter @kittie/types build      # first run only — produces dist/ the web app imports
pnpm install
pnpm --filter @kittie/web exec vite --port 5176 --strictPort     # :5176 avoids lane collisions on 5173
open -a "Dia" http://localhost:5176/reviews/overview
```
> Note: `pnpm dev:web -- --port 5176` does **not** propagate the port through both pnpm layers (lands on a fallback port). Use the `exec vite` form above.

## Verified (live, 2026-06-07)
Reviews empty-state → add real app → Overview (avg 2.82 from 50 real YouTube rows, distribution populated, sentiment mock-badged) → Reviews (50 real cards, filters) → Semantics (5 clusters + banner) → Improvements (3 suggestions + banner) → picker lists 40 real apps (monitored ones disabled). MCP (6 tools/9 skills/3 steps). Settings (3 sections, stub toasts fire). App-Detail (4 parity empty-states render).

## Heads-up
- Two demo apps (YouTube, Spotify) are seeded into browser localStorage on the verifying machine so Reviews shows data on open. Remove from the rail to see the first-run empty-state. Not code — pure local state.
- DoD met: 4 tabs (real text; sentiment/semantics/improvements mocked+labelled); MCP matches brief; Settings sections with stubbed auth/billing; detail parity with empty-states; no real auth wired.
