# Session Handoff — PR #1 ready to merge

## Status

| PR | Branch | State |
|----|--------|-------|
| **#2** keywords | `feat/keywords-aso` | **MERGED** to `main` |
| **#1** ingest | `feat/ingest` | **OPEN** — rebased on `main`, `CONTEXT.md` consolidated |

https://github.com/ree1ezixxx/open-source-app-kittie/pull/1

## What was cleaned up

- Merged `origin/main` (PR #2) into `feat/ingest`
- `CONTEXT.md` — both glossaries: ingest (Observed/Estimated, snapshots) + keywords (ASO terms); all **Flagged ambiguities** from both tracks
- Stale handoff lines updated (chart rank refresh shipped)
- `.gitignore` — `/data` symlink cannot be re-committed

## After merge

```bash
# every worktree
git fetch origin
git merge origin/main
pnpm db:migrate   # applies 0001_keyword_top_results from PR #2 if not run
```

Daily ingest: `./scripts/daily-ingest.sh` (needs ≥2 calendar days for trends).

## Pick up here

Merge PR #1 on GitHub when ready.
