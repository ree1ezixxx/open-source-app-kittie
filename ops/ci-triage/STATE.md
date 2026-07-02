# ci-triage loop state

Per-failure ledger for `.claude/skills/ci-triage`. Updated after every run.
Prevents re-doing settled work and looping a broken fix (see SKILL.md § State).

## Failures

| Detected | Workflow / Run | Category | Attempts | Gate | Outcome |
|---|---|---|---|---|---|
| 2026-07-02 | `data-sweeps` checkout step | `config` | 1 | green (`pnpm typecheck`) | PR #200, merged |
| 2026-07-02 | `data-sweeps` run 28565683847 (sha e574a17, post-#200) — "Run due sweeps" `ERR_MODULE_NOT_FOUND` on `@kittie/types/dist/index.js` | `config` | 1 | green (`pnpm typecheck && pnpm build`; sweep dry-run resolves modules → real work, no ERR_MODULE_NOT_FOUND) | PR #204, `needs:review` (cold-verified APPROVE) |

## Lessons

- **`sweeps.yml` needs a build step before the tsx sweep.** `run-sweeps-once.ts`
  runs from source via tsx but transitively imports `@kittie/{types,core,
  intelligence,db,ingest,clone-engine}`, all resolved via `dist/index.js`
  (`main` field). `pnpm install` alone leaves no `dist/` → `ERR_MODULE_NOT_FOUND`.
  Fix = `pnpm build` (topological) before "Run due sweeps", mirroring CI's
  `check` job. Any workflow running a tsx entrypoint against workspace pkgs
  needs the same build-before-run.
- The #200 checkout-ref fix (`ref: main`) was necessary but not sufficient —
  it fixed the *checkout*, exposing this downstream *build* gap. Two distinct
  `config` failures on the same workflow, fixed in sequence.
