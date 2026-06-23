# HANDOFF — `al/eval`  ·  Lane L13

> Self-contained. Everything a fresh instance needs is in this file. Ignore the repo's generic `HANDOFF.md` (that's the clone-era doc).

---

## PART 1 — The project (shared context)

**What this is.** `open-source-app-kittie` is pivoting (2026-06-23) from "clone appkittie.com's UI" to a new product:

> **Kittie is the market-awareness layer for mobile coding agents.** It gives Codex / Claude Code / Cursor / Xcode agents a persistent, live understanding of the app they're building, turns App Store evidence into product *decisions*, generates original implementation artefacts, and re-checks those decisions through development and launch.

**Why this, not "App Store data via MCP".** Raw app-intelligence over MCP is already commoditised — Appfigures shipped an official MCP (2026-06-05, multi-million-app catalog, 120+ fields, screenshots, video); Appeeky sells an "Agentic Scale" MCP+skills plan; community store-intel MCPs are appearing fast. The data is the *floor*, not the product.
- **Wedge:** the decision loop installed inside an iOS coding agent **before it writes the first meaningful feature**.
- **Product:** the decision loop. **Moat:** a build→outcome graph.

**The loop:** idea → market evidence → product blueprint → implementation → market-aware verification → App Store launch → outcome monitoring → better future decisions.

**Honesty is structural:** every field carries provenance + a coverage status; empty is a collection state, never a fact; distinguish observed/modelled/derived/inference/missing; never fabricate. (Your harness should *measure* whether Kittie honours this.)

**Stack:** pnpm monorepo, TypeScript, Drizzle + SQLite (`data/kittie.db`), Hono REST API. Packages: `types`,`core` · `db`,`ingest` · `intelligence` · `api` · `apps/mcp` (**a 12-tool MCP already exists at `apps/mcp/src/index.ts` — build against it now**), `apps/web`, `apps/cli`. **pnpm only.**

**14 lanes (epic #97):** L0 provenance → L1 schema → L2 decision packet → L3 build-context → L4 demand signal → L5 intent layer → L6 scaffold → L7 visual → L8 billing → L9 auth → L10 plugin → L11 distribution → L12 outcome graph → **L13 eval ← THIS LANE**. Each wave branches off `main` after the prior merges.

**Your place:** the measurement rig. **Fully independent** — build against the existing 12-tool MCP now; retarget to the L5 intent layer once it lands. Start NOW in parallel; no blocks.

---

## PART 2 — This lane: `al/eval`

**Worktree:** `/Users/ellis/Documents/open-source-app-kittie-al-eval` · **Branch:** `al/eval` (off `origin/main`)
**Ticket:** #101 (L13 eval / shadow harness) · **Epic:** #97

**#101 · L13 — Eval / shadow harness** — owns **new `apps/eval`** (or extend `apps/cli`).
- **Shadow-mode runner** across 10–20 real app builds: observe where Kittie *would* intervene without forcing it.
- **Fixed golden prompts** (run across Codex / Claude Code / Cursor):
  1. "Build a meditation app for UK adults."
  2. "Which feature should I implement next?"
  3. "Should this app include streaks?"
  4. "Create the onboarding."
  5. "Prepare this app for launch."
  6. "Review the current implementation against the market brief."
- **Log per run:** intervention relevance, acceptance, implementation impact, latency, token cost, data freshness, false activations, repeated/unnecessary calls.
- **North-star metric:** *market-backed decisions accepted per active build* — **NOT API calls.** Make the report headline this.
- Emit a structured metrics report (JSON + a readable summary).

### Boundaries (do NOT cross)
Own `apps/eval` only. **Read** from `apps/mcp` / the API; **do not modify** them (other lanes own those). If you need a hook the MCP doesn't expose, note it as a request on #101 — don't reach into `apps/mcp`. No edits to `packages/*`.

### Run / verify
```
pnpm install
# if better-sqlite3 fails: cd node_modules/.pnpm/better-sqlite3@*/node_modules/better-sqlite3 && npm run build-release
PORT=3012 pnpm dev:api     # YOUR port = 3012 (3000=mobbin, 3007/3011 taken — never reuse)
# the MCP is stdio (no port); point it at KITTIE_API_URL=http://localhost:3012
pnpm typecheck
```

### DoD → merge protocol
- Harness runs end-to-end against the current MCP, emits a metrics report; `pnpm typecheck` green.
- Independent of foundation → PR `al/eval` → `main` whenever ready; `gh issue close 101` on merge.
- Later (separate follow-up): retarget the golden prompts at the L5 intent tools once #107 lands.

Repo: `ree1ezixxx/open-source-app-kittie`. Full architecture: epic #97.
