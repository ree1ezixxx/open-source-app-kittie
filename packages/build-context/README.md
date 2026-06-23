# @kittie/build-context (lane L3, #105)

Persistent, portable **project memory** a coding-AI keeps about one project it is
helping build — the **Build Context**. Lets any agent that opens the project's
repo inherit the same understanding. See the canonical glossary in the root
`CONTEXT.md` (`Build Context`, `Standing preference`, `Market lock`, `Build plan`).

## Model

- **Two tiers.** Global **Standing preferences** (`~/.kittie/preferences.json`) ride
  across every project; per-project state (`<repo>/.kittie/`) is about one app, so
  app A's facts never bleed into app B. Reads merge global + project.
- **Files are the source of truth — no DB.** `context.json` is written atomically;
  `memory.md` is re-rendered from it on every write (a view, never hand-edited);
  `decisions.jsonl` is append-only.
- **Honest data.** Every fact is a `Provenanced<T>` (`@kittie/core`): user-asserted
  (`observed`, source `"user"`), market data (`observed`/`modelled`), or `missing`
  with a coverage reason. No data + no user statement ⇒ an explicit `unknown`,
  never a guess.

## Verbs → API

| MCP verb | Method |
|---|---|
| `create_build_context` | `BuildContextManager#create()` |
| `update_build_context` | `#update()` — merges; never blanks unset fields |
| `get_build_context` | `#get()` — compact digest by default; `include: ["decisions" \| "full"]` to drill down |
| `advise_next_build_decision` | `#adviseNextBuildDecision(candidates)` |

```ts
import { createBuildContextManager } from "@kittie/build-context";

const mgr = createBuildContextManager({ projectDir: process.cwd() });
mgr.create({ profile: { idea: "AI recipe planner", platforms: ["apple"] } });
mgr.update({ phase: "scoping", profile: { monetisation: "subscription" } });
const digest = mgr.get();
```

## `advise_next_build_decision`

Does **not** crawl the stores. It consumes the **L4 demand signal** as injected
`DemandCandidate[]` (each a 0–100 score from `computeDemandSignal`) and ranks it
through the user's preferences — `dislike`/`never` exclude, `like`/`always` boost —
returning a `DecisionPacket`. With no eligible candidate it returns an honest
"no recommendation" packet. Wire the real `@kittie/intelligence` engine to the
seam in production; tests inject a deterministic stub.

## `.kittie/` files

`context.json` · `memory.md` · `decisions.jsonl` · `market.lock.json` ·
`build-plan.md` · `launch-plan.json`

## Test

```
pnpm --filter @kittie/build-context test
pnpm --filter @kittie/build-context typecheck
```
