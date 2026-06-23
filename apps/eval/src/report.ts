/** Emit the metrics report: structured JSON + a readable summary that headlines the north-star. */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { ReportMetrics } from "./metrics.js";
import type { BuildResult } from "./types.js";

export interface FullReport {
  metrics: ReportMetrics;
  apiUrl: string;
  toolsDiscovered: string[];
  builds: BuildResult[];
}

export function writeReport(report: FullReport, outDir: string): { jsonPath: string; mdPath: string } {
  mkdirSync(outDir, { recursive: true });
  const stamp = report.metrics.generatedAt.replace(/[:.]/g, "-");
  const jsonPath = path.join(outDir, `eval-${stamp}.json`);
  const latestPath = path.join(outDir, "latest.json");
  const mdPath = path.join(outDir, "latest.md");
  const md = renderSummary(report);

  writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  writeFileSync(latestPath, JSON.stringify(report, null, 2));
  writeFileSync(mdPath, md);
  return { jsonPath, mdPath };
}

export function renderSummary(report: FullReport): string {
  const m = report.metrics;
  const ns = m.northStar;
  const L: string[] = [];

  L.push("# Kittie eval — shadow harness (L13 / #101)");
  L.push("");
  L.push(`_${m.generatedAt} · API ${report.apiUrl} · ${report.toolsDiscovered.length} MCP tools · shadow mode_`);
  L.push("");
  L.push("## ★ North-star");
  L.push("");
  L.push(`**${ns.value} market-backed decisions accepted per active build**`);
  L.push(`(${ns.acceptedDecisions} accepted of ${ns.totalDecisions} decisions across ${m.builds} builds · acceptance ${pctOf(ns.acceptanceRate)})`);
  L.push("");
  L.push(`> ${ns.note}`);
  L.push("");
  L.push(`Vanity contrast: ${m.vanity.totalToolCalls} total tool calls — ${m.vanity.note}`);
  L.push("");

  L.push("## Intervention quality");
  L.push(row("Relevant interventions", `${m.interventions.relevant}/${m.interventions.total} (${m.interventions.relevanceRatePct}%)`));
  L.push(row("False activations", `${m.interventions.falseActivations} (${m.interventions.falseActivationRatePct}%) — fired, added nothing`));
  L.push(row("Redundant calls", `${m.interventions.redundantCalls} (${m.interventions.redundantRatePct}%) — repeated within a build`));
  L.push(row("Errors", `${m.interventions.errors}`));
  L.push("");

  L.push("## Cost & latency");
  L.push(row("Tokens (est)", `${m.cost.totalTokensEst} total · ${m.cost.tokensPerBuild}/build · ${m.cost.tokensPerAcceptedDecision}/accepted decision`));
  L.push(row("Wasted tokens", `${m.cost.wastedTokensEst} — ${m.cost.wastedNote}`));
  L.push(row("Latency", `p50 ${m.latency.p50Ms}ms · p95 ${m.latency.p95Ms}ms · max ${m.latency.maxMs}ms`));
  L.push(row("Data freshness", m.freshness.medianDays == null ? `unknown for all (${m.freshness.datablePct}% datable)` : `median ${m.freshness.medianDays}d · ${m.freshness.datablePct}% datable`));
  L.push("");

  L.push("## Per golden prompt");
  L.push("| prompt | accepted | calls | relevant | false | avg ms | tokens |");
  L.push("|---|---|---|---|---|---|---|");
  for (const p of m.perPrompt) {
    L.push(`| ${p.promptId} | ${p.acceptedDecisions}/${p.totalDecisions} (${p.acceptanceRatePct}%) | ${p.calls} | ${p.relevant} | ${p.falseActivations} | ${p.avgLatencyMs} | ${p.tokensEst} |`);
  }
  L.push("");

  L.push("## Per tool");
  L.push("| tool | calls | relevant% | false | redundant | avg ms | tokens |");
  L.push("|---|---|---|---|---|---|---|");
  for (const t of m.perTool) {
    L.push(`| ${t.tool} | ${t.calls} | ${t.relevanceRatePct}% | ${t.falseActivations} | ${t.redundant} | ${t.avgLatencyMs} | ${t.tokensEst} |`);
  }
  L.push("");

  if (m.perAgent.length > 1) {
    L.push("## Per agent");
    L.push("| agent | builds | accepted | per build | calls | tokens |");
    L.push("|---|---|---|---|---|---|");
    for (const a of m.perAgent) {
      L.push(`| ${a.agent} | ${a.builds} | ${a.acceptedDecisions} | ${a.decisionsPerBuild} | ${a.calls} | ${a.tokensEst} |`);
    }
    L.push("");
  }

  return L.join("\n");
}

function row(label: string, value: string): string {
  return `- **${label}:** ${value}`;
}
function pctOf(ratio: number): string {
  return `${Math.round(ratio * 1000) / 10}%`;
}
