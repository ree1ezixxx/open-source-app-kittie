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
- **Maker** — Codex implementer (or, for `ci-triage`, its own maker step). Writes code, opens draft PR.
- **Objective checker** — the gate: `pnpm typecheck && pnpm build` (mirrors CI's `check` job).
- **Judgment reviewer** — Claude review loop sub-agents. Judges correctness/scope/spec-drift, never re-implements.
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
