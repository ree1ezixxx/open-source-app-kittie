# PR Lifecycle Contract

Shared by the Claude and Codex loops on this repo. A PR carries **exactly one**
lifecycle label at a time. Whoever transitions a PR removes the old lifecycle
label atomically when adding the new one.

```
Codex implements, opens draft PR             → needs:review
Claude review loop: clean                    → needs:merge      (coordinator merges, terminal)
Claude review loop: issues, code-only fix    → needs:rework      (back to Codex)
Claude review loop: issues, needs a sim      → needs:rework (C)  (Claude high-fidelity lane;
                                                                   Codex must not pick this up)
```

Roles:
- **Maker** — the issue-builder worker (Claude; Codex dropped 2026-07-02). Writes code, opens draft PR.
- **Objective checker** — the gate: `pnpm typecheck && pnpm build && pnpm -r test` (mirrors CI's `check` job, tests added 2026-07-02 via #213).
- **Judgment reviewer** — Claude review loop sub-agents. Judges correctness/scope/spec-drift, never re-implements.

**Reviews are ADVISORY BY DESIGN (accepted, documented — not process drift):** every agent acts under the
single identity `ree1ezixxx`, and GitHub forbids an author formally approving their own PR, so `reviews: []`
on merged PRs is expected and permanent until a second GitHub identity (bot account) exists. The review
artifact of record is the "Review loop verdict" PR comment; the independent checks are the Codex auditor
loop (different model family, read-only) and CI. Auditors: do not re-flag `reviews: []` alone as a finding —
flag only a MISSING verdict comment on a merged PR. Exception: coordinator ops PRs (STATE.md reconciles,
CI/workflow hygiene — e.g. #202, #206, #209, #213) are sole-writer operational changes, self-merged on green
CI without a verdict comment; that is by design, not a gap.
- **Merge gate** — the coordinator loop (`$claude-coordinator-loop`), authorized 2026-07-02 by Rhodri to
  merge any PR labeled `needs:merge`. No other loop merges — `claude-review-loop`, `ci-triage`, and the
  rework(C) lane all still terminate at relabeling, never at merging. The coordinator merges only when
  ALL hold: CI/required checks green, non-draft (or intentionally left draft only for visibility — flip
  ready-for-review first), no merge conflicts with `main`, exactly one lifecycle label (`needs:merge`),
  squash merge (matches this repo's existing merged-PR history), never force-push/rewrite `main`.

Rules:
- Never leave a PR with zero or multiple lifecycle labels — normalize to `needs:rework` and comment.
- `needs:rework (C)` dominates over `needs:rework` when a PR needs both a code fix and a sim/visual check — one lane owns the whole PR.
- `ci-triage` PRs (branch `fix/ci-<slug>`) follow the same rule: draft PR → `needs:review` → review loop →
  `needs:merge` → coordinator merges.
- Judgment calls (ambiguous scope, conflicting reviewer findings, anything that reads as a product/architecture
  decision rather than a mechanical check) are escalated by the coordinator to Rhodri, not auto-merged.

See `.claude/skills/claude-review-loop/SKILL.md` and `.claude/skills/ci-triage/SKILL.md` for the full per-loop mechanics.
