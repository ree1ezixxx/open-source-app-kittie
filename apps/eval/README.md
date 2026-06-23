# @kittie/eval — shadow harness (Lane L13 · #101)

The **measurement rig** for Kittie-as-a-market-awareness-layer. It runs the fixed golden prompts
across simulated app builds, drives the **real MCP** (`apps/mcp`) over stdio against the API, and
reports how good and how cheap Kittie's interventions are.

**North-star:** _market-backed decisions accepted per active build_ — **not** API/tool calls. Calls
are cost; accepted decisions are value. The report headlines the north-star and prints total tool
calls only as a vanity contrast.

## How it works

- **Shadow mode.** For each build (a simulated app) the harness runs the 6 golden prompts in order.
  Each prompt resolves **one product decision** by issuing the MCP calls Kittie *would* make to ground
  it. We observe; we never force the agent to act.
- **Real chaining.** Discoveries thread forward through a `BuildContext` (the top incumbent found while
  answering "build this app" is reused to answer "what feature next?") — exactly how an agent chains
  tools, and how repeated/unnecessary calls actually arise.
- **Honest scoring.** A call is *relevant* only if it returned usable, non-empty evidence; *empty* or
  errored calls are *false activations*; a repeat of the same tool+args within a build is *redundant*.
  A decision is *accepted* only when its **substantive** tool(s) returned real evidence — trivial
  supporting calls (coverage lists, seed lookups) never inflate acceptance.

## The 6 golden prompts → decisions

| prompt | decision | substantive evidence |
|---|---|---|
| `Build {idea}.` | market viability | `find_rising_apps` / `search_apps` |
| `Which feature should I implement next?` | next feature | `get_app_reviews` |
| `Should this app include streaks?` | streaks yes/no | `get_app_reviews` / `search_apps` |
| `Create the onboarding.` | onboarding structure | `get_app_detail` |
| `Prepare this app for launch.` | launch readiness | `*_keyword_difficulty` / `get_keyword_markets` |
| `Review the current implementation against the market brief.` | market re-check | `find_rising_apps` / `get_app_history` |

All 12 MCP tools are exercised across the suite (`clone_ios_app` is the L6 scaffold generator and is
intentionally out of the decision-loop default — it is a separate follow-up).

## Run

```bash
PORT=3012 pnpm dev:api                       # shell 1 — the API the MCP reads (3000/3007/3011 are taken)
pnpm --filter @kittie/eval dev               # shell 2 — run the harness (defaults to :3012)
```

Flags: `--api-url <url>` · `--agents kittie-shadow,codex,claude,cursor` · `--limit <n>` ·
`--scenario id,id` · `--out <dir>` · `--require-api`.

Output → `apps/eval/reports/` (gitignored): a timestamped `eval-*.json`, `latest.json`, and a
readable `latest.md`. The harness runs end-to-end even with an empty/down API — the report just
shows the coverage honestly (that *is* the measurement).

## Modelled, not faked

- **Acceptance** is modelled from evidence sufficiency in shadow mode. Real acceptance (did the agent
  *use* the evidence?) needs Kittie installed in the agent — the **L5 intent layer (#107)** / **L10
  plugin**. The report labels this everywhere.
- **Agents** (`codex`/`claude`/`cursor`) are run as profiles over the same MCP; per-agent behavioural
  divergence is a documented follow-up once the plugin lands. Default runs one canonical profile.
- **Follow-up (#101):** retarget the golden prompts at the L5 intent tools once #107 merges.

## Boundaries

Owns `apps/eval` only. Reads `apps/mcp` / the API; never modifies them or `packages/*`.
