# 0002 — Hosted libSQL + scheduled snapshots for keyword rank-history

Status: Accepted (2026-06-08) — deferred to stage 2

## Context
"Tracking keywords" resolves to two stages: (1) a persisted shortlist workspace
(parity with AppKittie's visible behaviour), and (2) rank-over-time history — an
*improvement* over what AppKittie's keyword explorer visibly shows. The
`keyword_rankings` table already carries `observed_at`, so the schema supports
time-series; nothing yet writes repeated snapshots.

Rank history is only as continuous as the job capturing it. Our DB today is
local `better-sqlite3` — a snapshot job running in-process only captures history
while the dev machine + server are up, leaving gaps.

## Decision
For stage 2, run snapshotting as a **free scheduled GitHub Actions cron** writing
to a **free hosted libSQL (Turso)** database, replacing local `better-sqlite3`
with `@libsql/client`. Drizzle has first-class libSQL support, so the ORM layer
is unchanged; only the client/driver swaps.

Sequencing: **quality-first**. Stage-1 work (shortlist persistence, difficulty
model, idea sourcing, 26 markets) ships on the current local SQLite. The Turso +
GitHub Action migration lands when stage-2 rank-history begins — one migration,
no rework.

## Consequences
- **Good:** true daily continuity independent of the dev machine; stays free;
  guerilla always-on. Drizzle abstracts the driver so app code barely changes.
- **Bad:** introduces a hosted-DB dependency + network latency; the migration
  touches every package that opens the DB client; secrets (Turso URL/token) must
  live in `.env` + GitHub Actions secrets.
- **Reversible-ish:** libSQL is SQLite-compatible, so falling back to a local
  file is possible, but re-pointing every environment is non-trivial — hence an
  ADR.
