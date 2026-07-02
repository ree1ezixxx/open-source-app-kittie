# STATE.md — open-source-app-kittie

Source of truth shared by the loops. Claude (coordinator) is sole writer.
GitHub is the actual control plane — this file is a reconciled snapshot.

Repo: `ree1ezixxx/open-source-app-kittie` · Coordinator worktree: `open-source-app-kittie-workspace`

## Standing caveats — read first

- **data-sweeps deferred (not broken-unresolved).** The hosted Turso DB 404s; rather than restore it,
  the scheduled sweep was **disabled** (PR #209) and #205 **closed** — data infra is a deferred, scoped
  decision (likely Neon) for post-MVP. `workflow_dispatch` retained for manual runs against a future DB.
- **Reviews are same-identity (advisory).** All merges run under `ree1ezixxx`; GitHub `reviews: []`, no
  formal approvals (author can't self-approve). The independent check is the **Codex auditor loop** (2nd
  voice, different family) + the human. Not "independent review" in the GitHub sense until a 2nd identity exists.
- **CI now runs tests** (this reconcile's PR adds `pnpm -r test`) — closes the prior gap where CI proved
  only typecheck+build and PR "N tests passed" claims were unverified by the gate.

## Active Work

| PR/Issue | Title | Status | Next |
|---|---|---|---|
| #218 (#184) | Validate-idea intelligence path | `needs:rework` (coordinator ruling: consolidate — canonical route = `/validate-idea`, retire legacy `/validate`, repoint CLI, fix 2 bugs) | coordinator's sub-agent reworking now |

## Completed (merged to main)

| Date | Issue | PR | Notes |
|---|---|---|---|
| 2026-07-01 | #180/#181/#182 | #195/#196/#197 | Contracts + app-detail + trends intelligence paths |
| 2026-07-02 | (infra) | #201 | Bootstrap `.agent-loop/` STATE + pr-lifecycle |
| 2026-07-02 | #183 | #199 | Compare-apps intelligence path |
| 2026-07-02 | #187 | #203 | Report renderer `@kittie/reports` (first full Claude cycle) |
| 2026-07-02 | #188 | #208 | App-teardown + category-pulse report templates |
| 2026-07-02 | #190 | #210 | MCP `get_app_detail` + `find_trending_apps` |
| 2026-07-02 | #211 | #212 | Sync MCP consumers to intelligence envelope |
| 2026-07-02 | (audit) | #213 | CI now runs `pnpm -r test` + STATE reconcile #5 |
| 2026-07-02 | (fix) | #215 | CLI+MCP default API URL → canonical `127.0.0.1:3008` |
| 2026-07-02 | (audit) | #216 | STATE reconcile #6 + advisory-review policy |
| 2026-07-02 | #185 | #214 | Local-first CLI foundation (2 rework rounds) |
| 2026-07-02 | #186 | #217 | CLI app/trending/compare/validate commands — ⚠ merged with blocker #184 open; validate repoints to `/validate-idea` via #218 |
| 2026-07-02 | (ci/infra) | #200/#202/#204/#206/#209 | sweeps ref+build fixes, STATE reconciles, sweep disabled |

## In progress

- **#184** validate-idea path — coordinator take-over (risk:medium); PR #218 in rework per ruling.

## Ready (`agent:ready`, unblocked)

- _None._ Everything remaining funnels through #184/#218.

## Blocked (`blocked:dependency`)

- #189 Build-brief report — on #184
- #191 MCP compare/validate/report tools — on **#184** (its other blockers #183/#187/#190 are all merged;
  auditors: still-blocked is CORRECT, multi-blocker issue)
- #193 Reports web surface — on #189

## Human-gated (`needs:human`)

- #192 Ask page · #194 Sidebar/dashboard simplification

## Fleet health (2026-07-02 ~09:00)

- Live workers: pr-review (1), ci-triage (2), dep-unblock (4), issue-builder (6) — cycling.
- Worker 5 (PRD-refill): dormant (correct — queue not drained).
- rework-c (3): **removed**; `needs:rework (C)` now escalates/relabels (no lane).
- Codex: **dropped** for implementation — fleet is Claude-only.
- Coordinator: set-and-forget + strict (auto-merge `needs:merge`; nudge/restart/take-over idle workers).

## Last Run

**2026-07-02 · reconcile #7** — #214 (#185) + #217 (#186) merged; #218 in rework under coordinator
ruling (canonical validate route consolidation + CLI repoint — fixes the #217/#218 contract mismatch the
Codex audit flagged). Review contract hardened: reviewer must check linked-issue blockers before a clean
verdict (the #217 miss). needs:human resolution authority moved to coordinator.

**2026-07-02 · reconcile #6** — #215 merged (canonical port); #214 in rework round 2 (conflicting,
worker 6 rebasing with 127.0.0.1:3008 requirement pinned); PRD's + HIGH FIDELITY sessions archived
(coordinator takes over backlog-refill at drain); Codex audit checkout fixed to track origin/main.

**2026-07-02 · reconcile #5** — post-Codex-audit correction. Fixed: #205 closed (was listed active P0);
#188/#190 moved to Completed (were listed ready); #189/#193 to Blocked (were listed ready); #185 now
Claude-owned in-progress. Added `pnpm -r test` to CI in the same PR.
