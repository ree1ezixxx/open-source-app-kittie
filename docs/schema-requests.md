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

## #245 — dialect-aware query RUNTIME (follow-up to #242)

No schema change — this makes the query layer run on both dialects. **The four
breaks from the #242 review are now dialect-aware:**

1. **Session-only methods.** SQLite (libsql) exposes `.all()/.get()/.run()`;
   Postgres (`PgDatabase`) exposes only `.execute()` (→ `{ rows, affectedRows }`).
   New seam `packages/db/src/dialect.ts`: `dbAll` / `dbGet` / `dbRun` route to
   whichever escape hatch the live handle has (feature-detected via `.all`), plus
   `dialectOf` / `isPostgres`. Builder queries (`db.select()…`) were already portable.
2. **`carry-forward.ts`.** `INSERT OR IGNORE` → pg `INSERT … ON CONFLICT DO NOTHING`;
   the `created_at` literal is now dialect-branched (SQLite epoch **seconds** int
   vs pg `'…'::timestamptz`) so it no longer writes a 1970 epoch-int into `timestamptz`.
3. **FTS5.** SQLite-only. `ensureAppsFts` no-ops on pg; `searchAppIds` /
   `countAppIdsByText` fall back to a portable `LIKE` scan; `app-query.ts` forces the
   non-FTS branch on pg (its `buildConditions` already applies a `LIKE` on the search
   text). Native pg full-text (tsvector / `pg_trgm`) is still **#244**.
4. **Timestamp coercion.** New `coerceTimestamp(value)`: `number` → `*1000` (SQLite
   epoch-seconds), `string` → `new Date(str)` (pg `timestamptz`), `Date` → passthrough.
   Replaces the `new Date(r.releasedAt * 1000)` reads in `ideas.ts` that produced
   `Invalid Date` on pg.

**Value-representation mapping (runtime reads/writes, not DDL):**

| Column kind | SQLite raw value | Postgres raw value (`.execute()`) | Coercion |
|---|---|---|---|
| `timestamp` (`released_at`, `created_at`, …) | epoch **seconds** `number` | ISO-ish `string` (`2026-07-02 19:17:57+00`) | `coerceTimestamp` (write: dialect-branched literal in carry-forward) |
| `count(*)` / aggregates | `number` (or bigint via intMode) | `string` (pg bigint) | wrap in `Number(...)` |
| raw-SQL result set | bare array (`.all`) | `{ rows, affectedRows }` (`.execute`) | `dbAll/dbGet/dbRun` |

**pglite tests:** `packages/db/src/pg-dialect.test.ts` (seam + `ideas` +
`fts` fallback) and `packages/ingest/src/jobs/carry-forward.pg.test.ts`
(real `carryForwardSnapshots` on pglite: carry, idempotent `ON CONFLICT`,
`timestamptz` sanity). SQLite tests unchanged.

## #244 — native Postgres full-text search (tsvector/GIN, follow-up to #245)

**Additive pg-only schema change** (SQLite schema untouched): `apps.search_tsv`,
a **generated STORED `tsvector`** over `coalesce(title,'') || ' ' || coalesce(developer,'')`
with config **`'simple'`** (no stemming/stopwords — parity with FTS5's unicode61
tokenizer), plus GIN index `apps_search_tsv_idx`. Declared in `schema.pg.ts`
(drizzle `customType` + `.generatedAlwaysAs`), migration `drizzle/pg/0001_*.sql`.
Generated-stored ⇒ self-syncing on insert/update — no triggers, no backfill job.

**Runtime:** the #245 `LIKE` fallback is replaced. `ensureAppsFts` on pg now
idempotently creates the column + index (covers pre-#244 databases; no-op after
the migration). `searchAppIds` / `countAppIdsByText` query
`search_tsv @@ to_tsquery('simple', …)` ranked by `ts_rank`. The tsquery is built
by the same tokenizer as the FTS5 match string — each token becomes a `:*` prefix
term, `&`-combined ("candy cru" → `candy:* & cru:*`) — so both dialects return the
same token-prefix results ("duo" → Duolingo). New seam `appsFtsQuery(db, query)`
returns dialect-appropriate `{ from, match, rank }` SQL fragments;
`app-query.ts`'s search flow (pool, count, keyset) now composes those instead of
forcing the non-FTS branch on pg. `pg_trgm` was NOT added — token-prefix parity
doesn't need it (FTS5 doesn't do mid-word substring either), and it would add an
extension dependency for no behavioural gain.

**pglite tests:** `pg-dialect.test.ts` — migration creates column+GIN index;
`ensureAppsFts` creates them on a pre-#244 db (idempotent); token-prefix +
developer-field + order-independence parity; ts_rank ordering; empty/garbage/
hostile queries return empty (never throw); fragment composition with joins/
filters (the API search-flow shape). SQLite FTS5 path byte-identical, tests unchanged.

**`createDb()` guard — LEFT IN PLACE (intentional).** `packages/db` has **no
Postgres runtime driver** (`pg` / `postgres-js`); only `@electric-sql/pglite` as a
dev-dep for tests. The query modules are now dialect-safe and pglite-proven, but
`createDb()` still can't open a real `postgres://` connection, so the hard-throw
stays until a pg driver + connection wiring lands (with #244 / #238). Relaxing it
now would let `DATABASE_URL=postgres://` fail at connect-time instead of guard-time.
