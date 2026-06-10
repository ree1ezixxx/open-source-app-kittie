# LANE C — AI Studio
**Worktree:** `~/Documents/open-source-app-kittie-ai-studio`  ·  **Branch:** `feat/ai-studio` (forked from `feat/ui`)

> Full scope: `~/.claude/plans/delegated-finding-spark.md`
> Data contract: `~/Documents/open-source-app-kittie/docs/clone/api-contract.md`
> Hard limits: `~/Documents/open-source-app-kittie-ui/docs/session-handoffs/2026-06-07-clone-cant-do-capability-gaps.md`

## Shared context
- pnpm monorepo; web = `apps/web` (Vite + React 19 + RR7). Design: dark, lime `#c6f24d`, pill chips; tokens `src/index.css`; `lib/api.ts` (`/api/v1/*`).
- **Run:** backend from `~/Documents/open-source-app-kittie-ingest` → `PORT=3007 pnpm dev:api` (bg). Here: `pnpm install && pnpm dev:web`; preview `open -a "Dia" http://localhost:5173`.
- **Shell dependency:** Lane A owns sidebar/router + shared components (`Tabs`, `MasterDetail`, `EmptyState`, `FilterRail`). Build your **page bodies** in isolated files now; **rebase onto `feat/ui` once the shell lands**, then mount routes.
- **These are all net-new** — no backend exists. Define **one typed `aiService` interface** (`generateScreenshots`, `translateScreenshots`, `listIdeas`) with a **mock implementation**, and flag the 3 real integrations for Rhodri (out of scope to wire). Every flow needs an **honest empty-state** + loading/skeleton state.

## Pages
- **Screenshot Generator** `/dashboard/aso/screenshots` — "AI Screenshot Generator". Left: tracked-apps list + **Previous Generations** history. Right: 3-step flow **Select app (or "describe new/unreleased") → Upload screenshots → Generate** optimized App-Store visuals. "Add generation" button. Empty history: "No generations yet".
- **Screenshot Translation** `/dashboard/aso/screenshot-translation` — "Screenshot Translation". Same master/flow shape: **Select app / upload → Select target countries → translate on-image text into target languages**. **Recent Translations** history. **Share the uploader + generation-card + history-list components with Screenshots** (build them once under `components/aistudio/`).
- **Hot Ideas** `/dashboard/hot-ideas` — "Hot app ideas". `FilterRail`: search · App-Store category · idea category · sort metric (Created) · order · **blueprint tags** (Needs backend / Needs database / Needs AI). Responsive grid of idea cards: title, description, source-app category, reviews, ★ rating. Pagination ("N ideas · Page x of y"). Back with a mock ideas dataset (~30 sample ideas) until a real ideas store exists.
- **Pricing Calculator** `/tools/pricing-calculator` — public tool, **fully functional offline**. Input base USD price(s) (Add Price) → localized price table across 190+ countries via a **static PPP-index dataset** (ship `data/ppp-index.json` in-repo). Copy JSON / Export JSON. No backend, no auth.

## Merge hygiene (you're 1 of 4 parallel lanes — keep merge-back clean)
- **Own files only:** new pages/components under `components/aistudio/`; don't refactor shared code.
- **CSS:** lane styles in a new `src/styles/aistudio.css` imported by your pages — don't pile into `index.css` (shell owns tokens).
- **API/service:** put the `aiService` + any endpoints in new `src/lib/aiService.ts` / `src/lib/api/ideas.ts` — don't edit shared `lib/api.ts`.
- **Routes:** only swap YOUR route placeholders in `App.tsx`.
- **Dev port:** `pnpm dev:web -- --port 5175` (webs collide on 5173); all proxy to shared API `:3007`. Sync `feat/ui` before first merge.

## DoD
4 routes render live-matching; uploader + history shared between Screenshots/Translation; `aiService` typed + mocked with the 3 integration points flagged; Pricing Calculator works with no backend; empty + loading states everywhere.
