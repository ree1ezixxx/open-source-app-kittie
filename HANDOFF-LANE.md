# HANDOFF — `al/foundation` (Wave 0)  ·  Lane L0 + L1

> Self-contained. Everything a fresh instance needs is in this file. Ignore the repo's generic `HANDOFF.md` (that's the clone-era doc).

---

## PART 1 — The project (shared context)

**What this is.** `open-source-app-kittie` is pivoting (2026-06-23) from "clone appkittie.com's UI" to a new product:

> **Kittie is the market-awareness layer for mobile coding agents.** It gives Codex / Claude Code / Cursor / Xcode agents a persistent, live understanding of the app they're building, turns App Store evidence into product *decisions*, generates original implementation artefacts, and re-checks those decisions through development and launch.

**Why this, not "App Store data via MCP".** Raw app-intelligence over MCP is already commoditised — Appfigures shipped an official MCP (2026-06-05, multi-million-app catalog, 120+ fields, screenshots, video); Appeeky sells an "Agentic Scale" MCP+skills plan; community store-intel MCPs are appearing fast. So the data is the *floor*, not the product.
- **Wedge:** the decision loop installed inside an iOS coding agent **before it writes the first meaningful feature**.
- **Product:** the decision loop. **Moat:** a build→outcome graph that learns which signals predict good builds.

**The loop:** idea → market evidence → product blueprint → implementation → market-aware verification → App Store launch → outcome monitoring → better future decisions.

**Six layers the full product needs:** MCP (what the agent *can* do) · skill/server instructions (when/why) · hooks (the moment to intervene) · build context (what it remembers) · decision evidence (why it's trustworthy) · budget/permissions (what it may spend/change).

**Honesty is structural (applies to every lane):**
- Every data field carries **provenance** and a **coverage status**. Empty is a *collection state*, never silently a market fact.
- Always distinguish **observed fact / modelled estimate / derived metric / agent inference / missing**.
- Never fabricate; blocked sources return empty + a status, not fake rows.

**Stack:** pnpm monorepo, TypeScript everywhere, Drizzle + SQLite (`data/kittie.db`), Hono REST API. Packages: `types`, `core` (foundation) · `db`, `ingest` · `intelligence` (scoring) · `api` · `apps/mcp` (a 12-tool MCP already exists at `apps/mcp/src/index.ts`), `apps/web`, `apps/cli`. **pnpm only — never npm/npx.**

**The build is split into 14 dependency-ordered worktree lanes (epic #97):**
`L0` provenance/coverage core → `L1` canonical schema → `L2` decision packet → `L3` build-context/`.kittie/` → `L4` composite demand signal → `L5` intent layer (over the 12 MCP tools) → `L6` original-scaffold generator → `L7` visual intelligence → `L8` billing → `L9` trust/auth → `L10` lifecycle plugin → `L11` distribution → `L12` outcome graph → `L13` eval harness.

**Wave plan (this is how cross-worktree blocking is avoided):** each wave branches off `main` only after the previous merges, so a lane always finds its prerequisite already on `main` — never live-blocked by a sibling branch. Blocker+blocked pairs live in the *same* worktree (internal, sequential). **This worktree is Wave 0 — the bedrock everyone waits on.**

---

## PART 2 — This lane: `al/foundation`

**Worktree:** `/Users/ellis/Documents/open-source-app-kittie-al-foundation` · **Branch:** `al/foundation` (off `origin/main`)
**Tickets:** #98 (L0), #102 (L1) · **Epic:** #97
**Role:** build the bedrock types every other lane imports, get green, PR to `main` **first** — then the Wave-1 worktrees branch off the updated `main`.

### Build in this order (sequential, same desk)

**#98 · L0 — Provenance & coverage core** *(do first)* — pure value types, no I/O. Owns `packages/types` + `packages/core`.
- `CoverageStatus`: `not_attempted | source_omitted | scrape_failed | confirmed_absent | stale | ok`
- `ValueKind`: `observed | modelled | derived | inferred | missing`
- `Provenanced<T>`: `{ value, kind, source, collection_method, observed_at, freshness, coverage, license_class, transform_version, confidence }`
- **Also place the shared decision-packet + coverage *types* here** (in `packages/types`) so L2 (#103) and L3 (#105) don't block each other later.
- Constructor / merge / downgrade helpers. **An empty value must be impossible to construct without a coverage status.**
- **Tests (MANDATED):** each status/kind constructs; downgrade+merge (`stale + ok => stale`); no bare empty without a status; `Provenanced` carries all fields. Pure, no mocks. Prior art: `packages/intelligence/src/keyword-rank.test.ts`, `growth.test.ts` (vitest, behaviour-level).

**#102 · L1 — Canonical schema + source adapters** *(after L0)* — owns `packages/db` + `packages/ingest`. Kittie-owned canonical records; **removes the dependency on appkittie.com's API shape**.
- Canonical record types where every field is `Provenanced<T>` (from L0).
- Source adapters: `adapter.toCanonical(raw) => CanonicalRecord` (Apple, Google; structure for future licensed feeds).
- Per-record freshness + coverage view.
- Schema changes route through `packages/db` + note in `docs/schema-requests.md`.

### Boundaries (do NOT cross)
Touch only `packages/types`, `packages/core`, `packages/db`, `packages/ingest`. Nothing in `apps/*` or `packages/intelligence|api|billing`. The types you export are the contract every other lane imports — design them to rarely change.

### Run / verify
```
pnpm install
# if db:migrate or better-sqlite3 fails: cd node_modules/.pnpm/better-sqlite3@*/node_modules/better-sqlite3 && npm run build-release
pnpm typecheck      # must pass before PR
```
Pure packages — **no dev server, no port needed.**

### DoD → merge protocol
- L0 + L1 exported, tests green, `pnpm typecheck` passes.
- PR `al/foundation` → `main`. **Must land before any Wave-1 worktree (al/intelligence #103/#104, al/context #105, al/visual #106) is created** — they branch off updated `main` so they inherit L0/L1.
- After merge: `gh issue close 98 102`, then spin up Wave 1.

Repo: `ree1ezixxx/open-source-app-kittie`. Full architecture: epic #97.
