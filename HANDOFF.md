# LANE B — ASO Keywords
**Worktree:** `~/Documents/open-source-app-kittie-aso-keywords`  ·  **Branch:** `feat/aso-keywords` (forked from `feat/ui`)

> Full scope: `~/.claude/plans/delegated-finding-spark.md`
> Data contract: `~/Documents/open-source-app-kittie/docs/clone/api-contract.md`
> Hard limits: `~/Documents/open-source-app-kittie-ui/docs/session-handoffs/2026-06-07-clone-cant-do-capability-gaps.md`
> **Existing locked spec (grill-with-docs) — follow it:** `~/Documents/open-source-app-kittie-ui/docs/session-handoffs/2026-06-07-grill-keywords-ui-handoff.md`

## Shared context
- pnpm monorepo; web = `apps/web` (Vite + React 19 + RR7). Design: dark, lime `#c6f24d`, pill chips; tokens `src/index.css`; `lib/api.ts` (`/api/v1/*`).
- **Run:** backend from `~/Documents/open-source-app-kittie-ingest` → `PORT=3007 pnpm dev:api` (bg). Here: `pnpm install && pnpm dev:web`; preview `open -a "Dia" http://localhost:5173`.
- **Shell dependency:** Lane A owns the sidebar/router + shared components (`Tabs`, `MasterDetail`, `EmptyState`, `FilterRail`, `FavoriteToggle`). Build your **page bodies** now in isolated files; **rebase onto `feat/ui` once Lane A pushes the shell**, then mount your routes. Don't edit the sidebar/router yourself beyond adding your two routes.
- **Data reality:** `keywords` + `keyword_rankings` tables = **0 rows**. The keyword-difficulty **service exists** (`feat/keywords-aso`: live store search + `/api/v1/keywords/difficulty`). Render against it; mock + empty-state where dry.

## Pages
- **App Tracking** `/dashboard/aso/apps` — "App Keyword Tracking". `MasterDetail`: left = "Your Apps" list (icon, title, country flag, "N keywords", relative time) + **Add** button; right = selected app's keyword rankings table + AI keyword-opportunity panel. Empty right-pane: "Select an app".
- **Keyword Explorer** `/dashboard/aso/keywords` — "Keyword Workspace". **Implement per the locked grill spec** (lookup-first + suggestions; single lookup default + batch compare ≤10 via `POST /keywords/difficulty` sorted by opportunity `(popularity×0.4)+((100−difficulty)×0.3)`; US only; Apple+Google; standard Keyword-insights panel; suggestion chips on empty-state seeded from tracked app titles+categories; tap chip → immediate lookup). Top input "Search, paste keywords, or start a topic…"; sort "Newest"; tabs All / Opportunities / Low-diff / Pending (with counts). Top-10 ranking-apps table (icon, title, rank, reviews, rating).
  - Note: the grill spec used route `/keywords`; **use the live path `/dashboard/aso/keywords`** to match AppKittie (keep a `/keywords` redirect if cheap).

## API wiring
`GET`/`POST /api/v1/keywords/difficulty`; `GET /api/v1/keywords/suggestions` (chips). Rebase onto live keyword API from `feat/keywords-aso` per the locked spec.

## Merge hygiene (you're 1 of 4 parallel lanes — keep merge-back clean)
- **Own files only:** new pages/components under your own folder; don't refactor shared code.
- **CSS:** lane styles in a new `src/styles/aso.css` imported by your pages — don't pile into `index.css` (shell owns tokens).
- **API:** add endpoints in a new `src/lib/api/keywords.ts` — don't edit shared `lib/api.ts`.
- **Routes:** only swap YOUR two route placeholders in `App.tsx`.
- **Dev port:** `pnpm dev:web -- --port 5174` (webs collide on 5173); all proxy to shared API `:3007`. Sync `feat/ui` before first merge.

## DoD
Both routes render; master-detail works; difficulty/popularity/traffic/insights + batch-compare + suggestion chips functional against live API (mock + empty-state when dry). Sidebar ASO placement matches AppKittie.
