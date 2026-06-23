---
name: goal
description: >-
  Run a user goal as a dynamic clone-parity loop: inspect appkittie.com truth,
  fix localhost clone, re-score until ≥4/5 or blocked. Use when the user runs
  /goal.
disable-model-invocation: true
---
# Goal — Clone Parity Loop

Run the user's goal as a **dynamic `/loop`** (see built-in **loop** skill). Execute once immediately, then self-pace until done or stopped.

Loop spec: `.ai/loops/clone-parity/LOOP.md`

## Parse

Accept `/goal <goal text>`.

- Everything after `/goal` is the goal. Preserve it verbatim.
- Empty goal → show usage: `/goal <surface or outcome>` (e.g. `/goal /dashboard/rising ≥4/5 parity with truth`).

## Browsers (confirmed setup)

| Role | URL | Control |
|------|-----|---------|
| **Truth** | `https://www.appkittie.com` | Chrome DevTools MCP on **:9222** — `list_pages` → `select_page` |
| **Clone** | `http://127.0.0.1:5173` | Same Chrome (:9222), different tab — never navigate truth tab to localhost |
| **API** | `http://127.0.0.1:3008` | `curl /health` smoke; `pnpm typecheck` before handoff |

Boot truth Chrome if down: `bash coordinator/truth-chrome.sh`

## Loop body (each iteration)

1. **Scope** — restate goal, truth path, clone path, viewport.
2. **Inspect truth** — navigate like a user; exercise filters, sort, pagination, hover, row click.
3. **Inspect clone** — same journey on localhost tab.
4. **Score** — fidelity **out of 5** (see `CLAUDE.md` rubric). State score explicitly.
5. **If ≥4/5** — stop loop; summarize what was verified.
6. **If <4/5** — smallest fix next; implement; `pnpm typecheck` on touched packages; reload clone tab; re-score.
7. **Log** — one line per iteration: score, top gap, action taken.

## Dynamic loop arming

After the first run, arm per **loop** skill dynamic schedule:

- Primary wake: meaningful state change (file saved, typecheck pass/fail, fidelity score change).
- Fallback heartbeat: `sleep 120` then `AGENT_LOOP_WAKE_clone-parity {"prompt":"Continue /goal: <goal>"}`.
- Sentinel: `AGENT_LOOP_WAKE_clone-parity`.
- Do not create duplicate sleepers.

## Stop conditions

| Condition | Action |
|-----------|--------|
| Fidelity ≥4/5 | Stop; report score + evidence |
| External blocker (missing API key / data) | Stop; report blocker + current score |
| Same error 3× | Stop; report stuck point |
| 10 iterations | Stop; report best score + remaining gaps |
| User says stop | Kill sleeper/watcher PIDs |

## Rules

- Truth wins on conflict. Never fabricate data — honest empty-states.
- Minimal diffs; match existing code style.
- Do not commit unless asked.
- One objective per goal — if scope creeps, narrow and restate.
