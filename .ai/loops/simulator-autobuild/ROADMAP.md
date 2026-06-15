# Roadmap — simulator-autobuild

> Recalibrated 2026-06-12 for THIS repo (open-source-app-kittie-rork-engine).
> Not greenfield: the builder workspace, chat, run timeline, blueprint engine,
> Expo + native Xcode codegen, and zip export already exist (see commit 4ac1c04).
> Milestones 1–4 below are therefore partially or fully ✅. The loop's centre of
> gravity is **5–10: a real generated Expo app running live in the phone frame**.
> Reference comparison target: rork.com (open it in the existing Chrome tab via
> chrome-devtools MCP — `list_pages` → `select_page`, never `new_page`).

## 1. Repo discovery — ✅ DONE

- Framework: pnpm monorepo. `apps/web` = React 18 + Vite (NOT Next.js). `packages/api` = Hono on :3007. `packages/clone-engine` = blueprint → Expo codegen (`expo-codegen.ts`) + native SwiftUI/Xcode codegen (`codegen.ts`). `packages/db` = Drizzle + SQLite (`data/kittie.db`).
- Scripts: `pnpm dev:api`, `pnpm dev:web` (:5173 proxies /api), per-package `typecheck`.
- Editor route: `/studio/:id` → `apps/web/src/pages/BuilderPage.tsx`.
- Engine resolution: Ollama → Gemini → deterministic heuristic (`packages/api/src/routes/builder.ts`).

## 2. Simulator shell — ✅ DONE (as mockup shell)

- Three-panel studio: chat + run timeline (left), phone frame (centre), Code/Export views.
- Phone frame: `apps/web/src/components/PhonePreview.tsx` + `styles/phone.css` — iOS chrome, status bar, tab bar, five screen kinds, detail push.
- Gap carried forward: the frame renders a React **mockup** of the blueprint, not the generated app itself. Closed by milestone 6.

## 3. Mock run loop — ✅ DONE

- `AgentRun` transcript per assistant turn (plan, todos, steps, changed files) — `RunCard` / `PendingRun` in BuilderPage; persisted in `builder_messages.runJson`.
- Gap: events are synthesized after the fact, not streamed phase-by-phase. Closed by milestone 7 (SSE).

## 4. Files/code/logs inspector — ◐ PARTIAL

- ✅ File tree + read-only viewer, Swift/Expo target toggle, changed-file chips.
- ☐ Goal: search, changed-file badges in tree, Diff tab (per-run additions/deletions), Logs tab (empty until milestone 7).
- Files: `BuilderPage.tsx`, `styles/builder.css`; diff data needs per-run file snapshots (milestone 5).
- Acceptance: open a project → see tree with badges; Diff tab shows last run's changes; search filters tree.
- Risks: payload size if every message carries full file sets — diff server-side.
- Validation: web typecheck clean; manual click-through on :5173.

## 5. Generated workspace abstraction — ☐ NOT STARTED (next major slice)

- Goal: materialize each project's generated Expo files to disk at `generated-workspaces/<projectId>/current/`, with per-run snapshots `runs/<runId>/{before,after,logs}/`. Platform code never imports workspace code; workspaces gitignored.
- Files: new `packages/api/src/lib/workspace.ts`; wire into `builder.ts` message/create handlers; `.gitignore`.
- Acceptance: creating/revising a project writes real files to disk; inspector reads from workspace (or stays consistent with it); per-run before/after captured (powers Diff tab).
- Risks: path traversal from generated file names (sanitize); disk bloat (cap runs kept per project).
- Validation: `ls generated-workspaces/<id>/current/` matches Code tab; api typecheck clean.

## 6. Expo preview path — ☐ NOT STARTED (the product moment)

- Goal: generated app actually runs inside the phone frame. Hybrid per PRD §5.4: `npx expo start --web --port <assigned>` per project for interactive preview; `expo export --platform web` snapshot after success. Preview URL proxied; iframe mounted inside `PhonePreview`'s screen area (mockup remains instant fallback while preview boots).
- Files: new `packages/api/src/lib/preview.ts` (process manager: spawn/stop/healthcheck/port registry); preview routes (`/preview/start|stop|status`); `PhonePreview.tsx` iframe mode.
- Acceptance: click "Run" on a project → real Expo web app loads in the frame and is tappable; reload button works; stale processes cleaned up.
- Risks: port conflicts (allocate from a range, persist in `preview_sessions` table); first `npm install` in workspace is slow (template `node_modules` cache/symlink); long-running process leaks (healthcheck + idle reaper).
- Validation: iframe loads with zero console errors; second project gets a distinct port; kill -9 test → status endpoint reports dead → restart works.

## 7. Build log capture — ☐ NOT STARTED

- Goal: every workspace command (install/typecheck/export/start) captured with stdout/stderr, persisted per run, streamed live to the UI Logs tab via SSE (`GET /api/v1/builder/runs/:runId/events`), following the PRD §12.5 event shape.
- Files: `workspace.ts` command wrapper; new SSE route; Logs tab in BuilderPage.
- Acceptance: trigger a run → Logs tab fills live; phases appear in the run timeline as they happen (replacing the fake `PendingRun` ticker).
- Risks: SSE through the Vite proxy (verify flush behaviour); log volume (truncate per step).
- Validation: visible live logs on a fresh generation; transcript persisted and re-readable after reload.

## 8. Repair loop — ☐ NOT STARTED

- Goal: classify build failures (missing_dependency / invalid_import / typescript_error / jsx_syntax / expo_config / router_error / asset_missing / runtime_error / style_error / unknown) and patch the smallest responsible file, ≤5 attempts, stop on same-error ×3. Heuristic fixes first (it must work with no model configured), model-assisted patches when Ollama/Gemini available.
- Files: new `packages/clone-engine/src/repair.ts` (pure classifier — unit-testable); `packages/api/src/lib/repair-runner.ts`.
- Acceptance: seed a known-bad generated file → loop classifies, patches, rebuilds to green within attempt budget; attempts visible in timeline ("Fixing build issue, attempt 2/5").
- Risks: repair loops thrashing (hard caps + error-signature dedup); patches widening scope (whitelist: only files in the workspace).
- Validation: unit tests on classifier fixtures; one end-to-end self-repair demo logged with artifacts.

## 9. Chat iteration — ◐ PARTIAL

- ✅ Follow-up prompts revise the blueprint and regenerate files; honest no-op handling.
- ☐ Goal: follow-up triggers the full pipeline — patch workspace → rebuild → reload the LIVE preview (not just the mockup) → Diff tab updated.
- Acceptance: "make the accent red" → real Expo preview reloads showing red within one run.
- Validation: end-to-end on :5173 against a running preview.

## 10. Visual QA loop — ☐ NOT STARTED

- Goal: after preview ready, screenshot the preview (headless Chrome :9222 / chrome-devtools MCP), score against the PRD §9.3 rubric, apply UI-only patches, re-screenshot. Store `before_visual_qa.png`, `after_visual_qa.png`, `visual_score.json`, `visual_qa_notes.md` under the run's workspace dir.
- Risks: screenshot flakiness (retry once, then skip QA rather than fail the run).
- Acceptance: one generation shows a measurable before→after improvement with artifacts on disk.

## 11. Clone/export — ◐ PARTIAL

- ✅ Zip export (Expo + native Xcode target, `?target=xcode`).
- ☐ Goal: project Clone (snapshot blueprint + files + message history into a new project, no secrets); GitHub export placeholder button (wired to "coming soon", no OAuth).
- Acceptance: Clone yields an independent project that previews on its own port.

## 12. Final hardening — ☐ NOT STARTED

- Goal: loading/error/crash overlays in the frame (PRD §5.5 state machine: idle→queued→…→ready/failed), preview idle reaper, stale-port cleanup, docs refresh, FINAL_STATUS.md.
- Acceptance: PRD §16 functional + reliability checklist passes; "if only one thing works" test passes: prompt → app in frame → follow-up → frame reloads changed app.
