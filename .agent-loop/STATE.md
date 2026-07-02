# STATE.md — open-source-app-kittie

Source of truth shared by the Claude and Codex loops. Claude (coordinator) is sole writer.
GitHub is the actual control plane — this file is a reconciled snapshot.

Repo: `ree1ezixxx/open-source-app-kittie` · Coordinator worktree: `open-source-app-kittie-workspace`

## ⚠ Corrections (cold-review 2026-07-02) — read first

- **data-sweeps is NOT fixed.** PRs #200 + #204 each fixed a layer, but the scheduled sweep still
  dies at runtime: `LibsqlError HTTP 404` from Turso (`freshness-service.ts:72`). The DB endpoint /
  secret is dead. The "always-on substrate" has never run. Tracked: **#205 (P0, needs:human)**. The
  ci-triage loop's "sweeps fixed" verdicts were false — it verified `typecheck && build`, which never
  exercises the sweep.
- **Reviews are advisory, not independent.** All overnight merges were authored, review-verdict'd, and
  merged by the same identity (`ree1ezixxx`); no formal `gh pr review --approve`. Treat the human as the
  real merge gate until a distinct reviewer identity + formal approvals are in place.

## Active Work

| PR/Issue | Title | Status | Next |
|---|---|---|---|
| #198 (#185) | Scaffold local-first CLI | `needs:rework` (draft) | **STALL** — Codex reworks; Codex loop appears dead |
| #205 | data-sweeps Turso 404 | `needs:human`, P0 | Rhodri: restore Turso DB URL/token secret |

## Completed (merged to main)

| Date | Issue | PR | Notes |
|---|---|---|---|
| 2026-07-01 | #180/#181/#182 | #195/#196/#197 | Contracts + app-detail + trends intelligence paths |
| 2026-07-02 | (infra) | #201 | Bootstrap `.agent-loop/` STATE + pr-lifecycle |
| 2026-07-02 | #183 | #199 | Compare-apps intelligence path |
| 2026-07-02 | (ci seed) | #200 | data-sweeps ref fix — ⚠ did NOT fully fix (see #205) |
| 2026-07-02 | (state) | #202 | STATE reconcile #3 |
| 2026-07-02 | #187 | #203 | Report renderer `@kittie/reports` — first full Claude cycle |
| 2026-07-02 | (ci) | #204 | data-sweeps build-deps fix — ⚠ did NOT fully fix (see #205) |

## Ready (`agent:ready`, unblocked — worker 6 queue)

- #188 App-teardown/category-pulse reports (risk:low)
- #189 Build-brief report (risk:low)
- #190 MCP server scaffold (risk:low)
- #193 Reports web surface (risk:low)
- #184 validate-idea intelligence path (risk:medium — only if prompt allows medium)

## In progress

- #185 CLI scaffold — PR #198 (Codex, in rework)

## Blocked (`blocked:dependency`)

- #186 Wire CLI commands — on #185 (PR #198)
- #191 MCP compare/validate/report tools — on #190

## Human-gated (`needs:human`)

- #192 Ask page · #194 Sidebar simplification · #205 Turso outage

## Fleet health (2026-07-02 ~06:30)

- Workers 1–4 (pr-review, ci-triage, rework-c, dep-unblock): **alive**, cycling.
- Worker 6 (issue-builder): died 00:23, **restarted as durable 15m cron** this pass.
- Worker 5 (PRD-refill): dormant (correct — queue not drained).
- Codex (external implementer): appears **dead** — #198 unreworked all night.
- Merged this cycle: #199, #200, #201, #202, #203, #204.

## Last Run

**2026-07-02 · reconcile #4** — post-cold-review correction. Recorded the data-sweeps false-signal
(#205), the review-identity caveat, and the fleet-death event. Restarted worker 6. Board: 1 stuck PR
(#198), 5 ready issues, Turso outage the top external blocker.
