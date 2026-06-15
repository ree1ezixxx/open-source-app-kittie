# HANDOFF — Event-Driven Ticket Loops (operating model)

Purpose: orient another harness/agent to how I want parallel agent work run. Read this and confirm you understand the model before acting. This is a **workflow brief**, not a task — nothing here asks you to build yet.

## The intent in one line
Turn an aligned plan into tracked issues, fan them out to **parallel isolated agents**, and let a **governor** verify/merge each as it finishes — **event-driven, not timed**, so nothing idles and nothing gets babysat.

## The flow
1. **Align** — plan mode / a "grill" session until the human and agent agree on what to build.
2. **`/to-prd`** — synthesize the conversation into a PRD, filed as an issue. It quizzes the human on which modules are touched (design-first).
3. **`/to-issues`** — break the PRD into **vertical slices**: independently-grabbable issues, each a complete piece of functionality (UI → DB), sized so no agent takes on too much.
4. **Fan out** — each issue gets its **own git worktree + branch**, one agent each, **all launched at once** (concurrent, not sequential).
5. **Events** — the harness wakes the **governor** as each agent completes → it QAs + merges that ticket while the others are still running.
6. **Close** — PR with `Closes #N` auto-closes the issue on merge.

## Why event-driven (the core point)
- **Timed/polling loop**: wakes every N minutes. A ticket that finishes in 2 min on a 10-min interval wastes 8 min idle. Avoid for this.
- **Event-driven**: no timer — wake on completion. Zero idle, zero polling.
- **Don't run tickets sequentially.** Independent tickets launch simultaneously; total wall-clock ≈ the **slowest** ticket, not the **sum**.
- **Chain only for dependencies**: if ticket 2 needs ticket 1's output, completion of 1 triggers 2 (a pipeline). Otherwise fire-and-forget all of them.

## The real constraint: contention, not cadence
Parallel agents editing the same file collide. **One worktree per ticket** isolates them. Engineer the isolation; the polling cadence is a non-issue once you're event-driven.

## Loop types (so you pick the right one)
- **Dynamic** — same session, keeps context, self-paced delay. For iterative work needing memory.
- **Interval/cron** — fresh session each fire, **rebuilds state from disk**. For a persistent set-and-forget governor.
- **Event-driven** — no timer, wake on completion. **Best for parallel tickets.**

## Governor responsibilities (the set-and-forget guarantee)
- Sole owner of any shared, stateful resource (e.g. a single browser) — build agents never touch it.
- Verifies each ticket against its acceptance criteria on completion; decides "done" from evidence, not the agent's self-report.
- **Hygiene/lane discipline**: each agent stays in its worktree; flag edits to shared/root files (e.g. repo-wide config, a shared glossary) — that's the merge-conflict risk. Prevent mechanically where possible (e.g. a pre-commit hook rejecting out-of-lane paths).

## Current live context (so you know what "this" refers to)
- Project: cloning the `appkittie.com` dashboard ("truth") into a local app ("clone"), section by section.
- Already running this model manually: a **coordinator** governor (sole browser owner) QAs section worktrees (`ads`, `organic`, `highlights`, …) against truth, writing gap reports back per worktree. State in `coordinator/sections.json`.
- Next evolution: drive the same shape off **GitHub issues** instead of a hand-kept registry — `/to-prd` → `/to-issues` → fan-out → governor merges on completion.

## What to confirm back
1. You understand event-driven ≠ timed polling, and why.
2. You understand parallel launch ≠ sequential — and when chaining applies.
3. You understand one-worktree-per-ticket isolation as the contention fix.
4. You understand the governor's verify + hygiene role.
