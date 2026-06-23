/** Shadow-mode suite runner: every scenario × agent run through all 6 golden prompts in order. */
import type { McpHarness } from "./mcp-client.js";
import { evaluateDecisions } from "./metrics.js";
import type { BuildContext, GoldenPrompt } from "./prompts.js";
import type { AgentName, BuildResult, BuildScenario, InterventionResult } from "./types.js";

export interface RunOptions {
  scenarios: BuildScenario[];
  prompts: GoldenPrompt[];
  agents: AgentName[];
  onProgress?: (msg: string) => void;
}

export async function runSuite(h: McpHarness, opts: RunOptions): Promise<BuildResult[]> {
  const builds: BuildResult[] = [];
  const total = opts.agents.length * opts.scenarios.length;
  let n = 0;

  for (const agent of opts.agents) {
    for (const scenario of opts.scenarios) {
      n += 1;
      h.newBuild(); // reset per-build redundancy tracking — one build = one app
      const ctx: BuildContext = { relatedKeywords: [] };
      const interventions: InterventionResult[] = [];

      for (const prompt of opts.prompts) {
        const records = await prompt.run(h, scenario, ctx);
        const decisions = evaluateDecisions([prompt.decision], records);
        interventions.push({
          scenarioId: scenario.id,
          promptId: prompt.id,
          promptText: prompt.text(scenario),
          agent,
          decisions,
          records,
        });
      }

      const accepted = interventions.flatMap((i) => i.decisions).filter((d) => d.accepted).length;
      const calls = interventions.reduce((s, i) => s + i.records.length, 0);
      opts.onProgress?.(
        `[${n}/${total}] ${agent} · ${scenario.id} — ${accepted}/${opts.prompts.length} decisions accepted (${calls} calls)`,
      );

      builds.push({ scenarioId: scenario.id, idea: scenario.idea, agent, interventions });
    }
  }
  return builds;
}
