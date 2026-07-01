# ci-triage loop state

Per-failure ledger for `.claude/skills/ci-triage`. Updated after every run.
Prevents re-doing settled work and looping a broken fix (see SKILL.md § State).

## Failures

| Detected | Workflow / Run | Category | Attempts | Gate | Outcome |
|---|---|---|---|---|---|
| 2026-07-02 | `data-sweeps` checkout step | `config` | 1 | green (`pnpm typecheck`) | PR #200, `needs:review` |

## Lessons

- (none yet — write env gotchas / runner quirks here as they're discovered)
