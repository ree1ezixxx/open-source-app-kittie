# Schema Change Requests

Sessions 2 and 3: if you need a schema change, add a row here. Session 1 applies it.

| Date | Requester | Change | Status |
|------|-----------|--------|--------|
| 2026-07-01 | issue #169 / Audit Engine | Later Audit Engine slices need persisted `review_pain_text`/pain cluster fields for written Review evidence, Google Play install bucket fields for lagging install calibration, and source coverage/status fields (`source_status`) so missing or stale sources lower confidence instead of scoring as zero. | Requested |

## #242 — dual-dialect port (SQLite local / Postgres prod)

`packages/db` now has a Postgres mirror (`src/schema.pg.ts`) of the canonical
SQLite schema (`src/schema.ts`), selected at runtime by `createDb()` when
`DATABASE_URL` is `postgres://` / `postgresql://` (else libsql/SQLite as before).
It is a **mechanical dialect port** — same tables, columns, indexes; no schema
semantics changed. Type mappings applied:

| SQLite (schema.ts) | Postgres (schema.pg.ts) | Note |
|---|---|---|
| `integer(col, { mode: "timestamp" })` | `timestamp(col, { withTimezone: true })` | epoch int → `timestamptz` |
| `integer(col, { mode: "boolean" })` | `boolean(col)` | |
| `real(col)` | `doublePrecision(col)` | SQLite REAL is 8-byte; `double precision` matches |
| `text(col)` incl. JSON-string columns (`languages`, `screenshot_urls`, `top_results`, `blueprint`, `topics`, …) | `text(col)` | **kept as `text`, NOT `jsonb`** — consumers serialize/parse JSON themselves; switching to `jsonb` would be a semantic change |
| `text` / `integer` (plain), enums, PK/FK/indexes | identical | incl. partial + expression indexes |

**Runtime status:** only the DDL mirror + migration are done. The pg query
RUNTIME is NOT production-ready — the ~20 query modules are SQLite-dialect:
`.all()/.get()/.run()` (Postgres exposes only `.execute()`), `carry-forward.ts`'s
`INSERT OR IGNORE` + epoch-int timestamps, FTS5, and `epoch*1000` date coercion
all break on Postgres. So `createDb()` **hard-throws on `postgres://`** until
those land — nobody can silently enable a broken backend. Follow-ups: **#245**
(dialect-aware query layer — the four breaks) and **#244** (pg FTS via tsvector /
`pg_trgm`). **No data migration** here (that is #238 step 3, needs the live secret).
