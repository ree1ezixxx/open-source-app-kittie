/**
 * Kittie eval — shadow harness (Lane L13 / #101).
 *
 * Runs the 6 golden prompts across simulated app builds, driving the real MCP (apps/mcp) over
 * stdio against the API, and emits a metrics report headlining the north-star:
 *   market-backed decisions accepted per active build.
 *
 * Usage:
 *   PORT=3012 pnpm dev:api            # in another shell — the API the MCP reads
 *   pnpm --filter @kittie/eval dev    # run the harness (defaults to http://localhost:3012)
 *
 * Flags:
 *   --api-url <url>      API the MCP targets (default $KITTIE_API_URL or http://localhost:3012)
 *   --agents a,b,c       agent profiles to run (kittie-shadow|codex|claude|cursor; default kittie-shadow)
 *   --limit <n>          run only the first N scenarios
 *   --scenario id,id     run only these scenario ids
 *   --out <dir>          report output dir (default apps/eval/reports)
 *   --require-api        hard-fail if the API is unreachable (default: warn and run anyway)
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { McpHarness } from "./mcp-client.js";
import { summarise } from "./metrics.js";
import { GOLDEN_PROMPTS } from "./prompts.js";
import { writeReport, type FullReport } from "./report.js";
import { runSuite } from "./runner.js";
import { SCENARIOS } from "./scenarios.js";
import type { AgentName } from "./types.js";

const VALID_AGENTS: AgentName[] = ["kittie-shadow", "codex", "claude", "cursor"];

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function preflight(apiUrl: string): Promise<boolean> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 4000);
  try {
    const res = await fetch(`${apiUrl}/api/v1/countries`, { signal: ctrl.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

async function main(): Promise<void> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(here, "../../..");
  const mcpEntry = path.join(repoRoot, "apps/mcp/src/index.ts");

  const apiUrl = arg("api-url") ?? process.env.KITTIE_API_URL ?? "http://localhost:3012";
  const outDir = arg("out") ?? path.join(repoRoot, "apps/eval/reports");

  const agents = (arg("agents")?.split(",").map((a) => a.trim()) ?? ["kittie-shadow"]).filter(
    (a): a is AgentName => {
      if (VALID_AGENTS.includes(a as AgentName)) return true;
      console.warn(`! ignoring unknown agent "${a}" (valid: ${VALID_AGENTS.join(", ")})`);
      return false;
    },
  );
  if (agents.length === 0) agents.push("kittie-shadow");

  let scenarios = SCENARIOS;
  const only = arg("scenario");
  if (only) {
    const ids = new Set(only.split(",").map((s) => s.trim()));
    scenarios = scenarios.filter((s) => ids.has(s.id));
  }
  const limit = arg("limit");
  if (limit) scenarios = scenarios.slice(0, Number(limit));

  if (scenarios.length === 0) {
    console.error("No scenarios selected.");
    process.exit(1);
  }

  console.log(`\nKittie eval — shadow harness (L13/#101)`);
  console.log(`API: ${apiUrl}  ·  agents: ${agents.join(", ")}  ·  builds: ${agents.length * scenarios.length}\n`);

  const apiUp = await preflight(apiUrl);
  if (!apiUp) {
    const msg = `API unreachable at ${apiUrl} — start it with: PORT=${new URL(apiUrl).port || "3012"} pnpm dev:api`;
    if (flag("require-api")) {
      console.error(`✗ ${msg}`);
      process.exit(2);
    }
    console.warn(`! ${msg}\n  Running anyway; calls will record as errors/false-activations (the report stays honest).\n`);
  }

  const harness = new McpHarness({ apiUrl, mcpEntry, repoRoot });
  await harness.connect();
  console.log(`Connected to MCP — ${harness.toolNames.length} tools: ${harness.toolNames.join(", ")}\n`);

  const builds = await runSuite(harness, {
    scenarios,
    prompts: GOLDEN_PROMPTS,
    agents,
    onProgress: (m) => console.log("  " + m),
  });
  await harness.close();

  const metrics = summarise(builds, new Date().toISOString());
  const report: FullReport = {
    metrics,
    apiUrl,
    toolsDiscovered: harness.toolNames,
    builds,
  };
  const { jsonPath, mdPath } = writeReport(report, outDir);

  console.log("\n" + "═".repeat(64));
  console.log(`★ NORTH-STAR: ${metrics.northStar.value} market-backed decisions accepted / build`);
  console.log(`  ${metrics.northStar.acceptedDecisions}/${metrics.northStar.totalDecisions} decisions accepted · ${metrics.vanity.totalToolCalls} tool calls (cost, not value)`);
  console.log(`  relevance ${metrics.interventions.relevanceRatePct}% · false-activations ${metrics.interventions.falseActivationRatePct}% · redundant ${metrics.interventions.redundantRatePct}%`);
  console.log(`  latency p50 ${metrics.latency.p50Ms}ms / p95 ${metrics.latency.p95Ms}ms · ${metrics.cost.totalTokensEst} tokens est`);
  console.log("═".repeat(64));
  console.log(`\nReport: ${jsonPath}\n        ${mdPath}\n`);
}

main().catch((err) => {
  console.error("\n✗ eval failed:", err instanceof Error ? err.stack ?? err.message : err);
  process.exit(1);
});
