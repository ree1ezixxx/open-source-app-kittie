# Autonomous Loop — app-canvas (localhost prototype)

**Not clone-parity.** Interactive **App Canvas** — hub-and-spoke visual breakdown per
App (React Flow), collating signals currently spread across sidebar surfaces.

Tracker: `docs/session-handoffs/app-canvas-prototype.md`
Preview: `http://127.0.0.1:5173` (API `:3008`, DB shared `data/kittie.db` at main repo)
Worktree: `/Users/ellis/Documents/open-source-app-kittie-app-canvas`
Branch: `feat/app-canvas` (off `origin/main`)

## Phases (auto-advance — no human GO)

```text
A CATALOG   → milestone checklist + UX rubric for App Canvas
B VERIFY    → exercise localhost:5173; log pass/fail + UX score /5
C IMPROVE   → smallest code change per failure; pnpm typecheck
D RE-VERIFY → re-run failed IDs; mark Passed with evidence
→ repeat C↔D until stop
```

**Do not** open appkittie.com unless user explicitly asks.

## Product shape (locked)

| Layer | Spec |
|-------|------|
| Nav | **App Canvas** under Explore (after Pulse) |
| Routes | `/dashboard/canvas` (grid) → `/dashboard/canvas/:appId` (tree) |
| Generalist v1 | **3 hardcoded apps** (rich screenshots + reviews + metrics from DB) |
| Tree | App at **root**; spokes feed in: Metrics/Trend, Listing media, Reviews, Similar apps (**real**); Ads, Creators, Keywords (**EmptyCard**) |
| Engine | `@xyflow/react` — drag, pan, zoom, edges; no static-only mock |
| Data | Existing API only — no new ingest in this loop |
| Long-term | Every app gets a canvas; v1 proves UI on 3 |

## Milestones (all required before stop)

- [ ] M1 — Routes + sidebar nav + empty shell pages
- [ ] M2 — React Flow canvas: pan/zoom/drag + dot grid + connector edges
- [ ] M3 — Generalist grid: 3 app cards with headline signals
- [ ] M4 — One full tree: all spoke slots (real + empty) on `:appId` route
- [ ] M5 — Back navigation grid ↔ tree; link-out to classic `/app/:slug` optional
- [ ] M6 — UX ≥4/5 on grid + tree interactivity + spoke honesty

## Limits

| Limit | Value |
|-------|------|
| Max fix attempts per milestone | 5 |
| Same error 3× | `needs:human`, skip |
| Max loop iterations / session | 10 |
| Min UX score to stop | 4/5 (after all milestones) |
| Human gates | schema, merge/push, login |

## Checks (localhost only)

- API: `curl http://127.0.0.1:3008/health`
- `pnpm typecheck` after code changes
- Browser on `:5173` — exercise grid → click → drag/pan tree → back
- Update tracker every iteration

## Stop

- All milestones Passed **and** UX ≥4/5
- External blocker
- 10 iterations or 3× same error
- User says stop

## Do not

- Wait for GO between phases
- Commit/push unless asked
- Fabricate data
- Ship static non-interactive layout as "done"
- Cross-edit other lanes (`feat/intelligence-pulse`, etc.)
