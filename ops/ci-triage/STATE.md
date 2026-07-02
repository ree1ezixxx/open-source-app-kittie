# ci-triage loop state

Per-failure ledger for `.claude/skills/ci-triage`. Updated after every run.
Prevents re-doing settled work and looping a broken fix (see SKILL.md § State).

## Failures

| Detected | Workflow / Run | Category | Attempts | Gate | Outcome |
|---|---|---|---|---|---|
| 2026-07-02 | `data-sweeps` checkout step | `config` | 1 | green (`pnpm typecheck`) | PR #200, merged |
| 2026-07-02 | `data-sweeps` run 28565683847 (sha e574a17, post-#200) — "Run due sweeps" `ERR_MODULE_NOT_FOUND` on `@kittie/types/dist/index.js` | `config` | 1 | green (`pnpm typecheck && pnpm build`; sweep dry-run resolves modules → real work, no ERR_MODULE_NOT_FOUND) | PR #204, merged |
| 2026-07-02 | `data-sweeps` run 28569896829 (sha 6583197, post-#204) — "Run due sweeps" `LibsqlError: SERVER_ERROR: Server returned HTTP status 404` on `select … from sweep_state` | `infra` / credentials | re-run 1× (attempt 2, same 404 — not transient) | n/a — no code fix; external | **ESCALATED to coordinator/Rhodri.** Turso DB endpoint 404s → data substrate down. Not in allow-list (secrets/infra). |

## Lessons

- **Turso 404 = external blocker, escalate — do NOT code-fix.** After #204 the
  sweep reaches the DB and fails `LibsqlError: SERVER_ERROR … HTTP status 404`
  on `sweep_state`. HTTP 404 (not 5xx/timeout) = the DB endpoint in
  `TURSO_DATABASE_URL` doesn't resolve — deleted, archived (Turso free-tier
  auto-archives inactive DBs), or a stale secret URL. Confirmed persistent via
  one re-run. Fix requires Turso credential/DB action (verify `turso db list`
  / unarchive / refresh secret) — outside the ci-triage allow-list
  (`.env`/secrets/Turso credentials are escalate-only). Loop must NOT re-draft
  or re-run this on future passes until the secret/DB is fixed.
- #200 (checkout ref) → #204 (build step) → Turso 404: each fix peeled back to
  expose the next layer. The first two were in-scope `config`; this third is a
  hard external blocker and stops here.

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
