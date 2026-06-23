# App Canvas — prototype handoff

**Branch:** `feat/app-canvas`  
**Worktree:** `/Users/ellis/Documents/open-source-app-kittie-app-canvas`  
**Loop:** `.ai/loops/app-canvas/LOOP.md`  
**Goal prompt:** `.ai/loops/app-canvas/COMMAND.md`

## Dev ports (canonical)

| Service | Port |
|---------|------|
| API | `3008` |
| Web | `5173` |

```bash
# Web — LaunchAgent com.ellis.kittie-web-dev (serves app-canvas worktree while on this lane)
launchctl kickstart -k gui/$(id -u)/com.ellis.kittie-web-dev

# Or manual:
cd apps/web && VITE_API_ORIGIN=http://127.0.0.1:3008 pnpm dev -- --host 127.0.0.1 --port 5173
```

Shared DB: main repo `data/kittie.db`.

## Prototype apps (pick at M3 — hardcode IDs)

Criteria: screenshots, reviews, strong metrics. Fill after DB query:

| # | App ID | Title | Notes |
|---|--------|-------|-------|
| 1 | apple:544007664 | YouTube | High metrics + screenshots |
| 2 | apple:389801252 | Instagram | High metrics + screenshots |
| 3 | apple:570060128 | Duolingo | Reviews ingested (~500 rows) |

## Milestones

| ID | Item | Status | UX | Evidence |
|----|------|--------|-----|----------|
| M1 | Routes + nav + shell | done | — | `/dashboard/canvas`, sidebar App Canvas |
| M2 | React Flow interactive canvas | done | — | drag/pan/zoom/minimap |
| M3 | 3-app generalist grid | done | — | YouTube, Instagram, Duolingo |
| M4 | Full spoke tree on `:appId` | done | — | 7 spokes real + empty |
| M5 | Grid ↔ tree navigation | done | — | toolbar + card links |
| M6 | Overall UX ≥4/5 | pending | 3.5 | iter 1 — polish pass needed |

## Iteration log

| Iter | Score | Top gap | Action |
|------|-------|---------|--------|
| 1 | 3.5/5 | visual polish, edge routing | M1–M5 shipped; React Flow + 3 apps |

## Decisions (grill 2026-06-22)

- Hub-and-spoke tree; App at root; spokes = sidebar domains collated
- v1: 3 apps UI prototype; long-term: every app
- React Flow; fully interactive (drag/pan/zoom)
- Stop: milestones + UX ≥4/5 (loop D)
