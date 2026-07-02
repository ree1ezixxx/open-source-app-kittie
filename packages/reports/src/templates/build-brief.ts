/**
 * Build-brief report: template + a builder that turns a validate-idea
 * intelligence response (#184) into a build handoff a human or coding agent
 * can act on.
 *
 * The validate-idea path does NO LLM synthesis, so the brief's feature list,
 * non-goals, and agent-ready tasks are DERIVED deterministically from the
 * grounded signals (verdict, opportunities, risks, competitors). When the
 * evidence is thin (low/insufficient confidence, or an unvalidated verdict) the
 * brief speaks cautiously and adds a weak-evidence caveat.
 */
import type {
  IdeaVerdict,
  IntelligenceCaveat,
  IntelligenceConfidenceLabel,
  IntelligenceReportContract,
  ValidateIdeaIntelligenceResponse,
} from "@kittie/types";
import type { ReportDocument, ReportSection } from "../document.js";
import type { ReportTemplate } from "../registry.js";

export const BUILD_BRIEF_TEMPLATE = "build_brief";

export interface BuildBriefCompetitor {
  title: string;
  developer: string;
  similarity: string;
}

export interface BuildBriefOutput {
  thesis: string;
  verdict: IdeaVerdict;
  /** True when evidence is thin — the brief is framed as provisional. */
  cautious: boolean;
  opportunity: string[];
  risks: string[];
  competitors: BuildBriefCompetitor[];
  features: string[];
  nonGoals: string[];
  agentTasks: string[];
}

export interface BuildBriefOptions {
  reportId?: string;
  expiresAt?: string | null;
}

const CROWDED_VERDICTS: ReadonlySet<IdeaVerdict> = new Set<IdeaVerdict>(["crowded", "saturated"]);
const WEAK_VERDICTS: ReadonlySet<IdeaVerdict> = new Set<IdeaVerdict>(["unvalidated", "not_enough_data"]);
const WEAK_CONFIDENCE: ReadonlySet<IntelligenceConfidenceLabel> = new Set<IntelligenceConfidenceLabel>([
  "low",
  "insufficient",
]);

function isCautious(label: IntelligenceConfidenceLabel, verdict: IdeaVerdict): boolean {
  return WEAK_CONFIDENCE.has(label) || WEAK_VERDICTS.has(verdict);
}

function slug(idea: string): string {
  const s = idea
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return s.length > 0 ? s : "idea";
}

function deriveFeatures(opportunities: string[], category: string | null): string[] {
  if (opportunities.length > 0) return opportunities.map((o) => `Address: ${o}`);
  return [`Ship the core ${category ?? "app"} experience competitors are rated on.`];
}

function deriveNonGoals(risks: string[], verdict: IdeaVerdict): string[] {
  const out = risks.map((r) => `Avoid: ${r}`);
  if (CROWDED_VERDICTS.has(verdict)) {
    out.push("Don't compete head-on with incumbents on their core feature — win on a wedge.");
  }
  if (out.length === 0) out.push("No non-goals surfaced from the evidence.");
  return out;
}

function deriveAgentTasks(
  idea: string,
  opportunity: string[],
  risks: string[],
  topCompetitor: string | null,
  cautious: boolean,
): string[] {
  const tasks: string[] = [`Prototype the core flow for: ${idea}.`];
  const firstOpportunity = opportunity[0];
  if (firstOpportunity) tasks.push(`Build toward the strongest opportunity: ${firstOpportunity}.`);
  const firstRisk = risks[0];
  if (firstRisk) tasks.push(`De-risk early: ${firstRisk}.`);
  if (topCompetitor) tasks.push(`Define a clear differentiator vs ${topCompetitor}.`);
  if (cautious) {
    tasks.push("Gather more market evidence before committing — current confidence is low.");
  } else {
    tasks.push("Validate the prototype with real users before scaling.");
  }
  return tasks;
}

export function buildBuildBriefReport(
  response: ValidateIdeaIntelligenceResponse,
  options: BuildBriefOptions = {},
): IntelligenceReportContract<BuildBriefOutput> {
  const data = response.data;
  const confidence = response.confidence;
  const generatedAt = response.metadata.generatedAt;
  const cautious = isCautious(confidence.label, data.verdict);

  const opportunity = data.opportunities.map((o) => o.message);
  const risks = data.risks.map((r) => r.message);
  const competitors: BuildBriefCompetitor[] = data.competitors.map((c) => ({
    title: c.title,
    developer: c.developer,
    similarity: c.similarityClass,
  }));
  const topCompetitor = data.competitors[0]?.title ?? null;

  const thesisCore = data.verdictReason.trim().length > 0 ? data.verdictReason : `Validation for "${data.idea}".`;
  const thesis = cautious ? `Provisional (evidence is thin): ${thesisCore}` : thesisCore;

  const output: BuildBriefOutput = {
    thesis,
    verdict: data.verdict,
    cautious,
    opportunity,
    risks,
    competitors,
    features: deriveFeatures(opportunity, data.likelyCategory),
    nonGoals: deriveNonGoals(risks, data.verdict),
    agentTasks: deriveAgentTasks(data.idea, opportunity, risks, topCompetitor, cautious),
  };

  const extraCaveats: IntelligenceCaveat[] = [];
  if (cautious && !response.caveats.some((c) => c.kind === "weak_evidence")) {
    extraCaveats.push({
      kind: "weak_evidence",
      sourceType: null,
      message: "Evidence is thin; treat this build brief as provisional, not a validated plan.",
    });
  }

  const ideaLabel = data.idea.length > 60 ? `${data.idea.slice(0, 57)}…` : data.idea;

  return {
    reportId: options.reportId ?? `rpt_brief_${slug(data.idea)}_${response.metadata.snapshotId ?? "nosnap"}`,
    template: BUILD_BRIEF_TEMPLATE,
    format: "json",
    status: response.status === "insufficient" ? "partial" : "complete",
    sourceQuery: response.metadata.sourceQuery,
    evidenceSnapshot: {
      generatedAt,
      evidence: response.evidence,
      caveats: [...response.caveats, ...extraCaveats],
      confidence,
    },
    output,
    outputMetadata: {
      title: `Build brief — ${ideaLabel}`,
      generatedAt,
      expiresAt: options.expiresAt ?? null,
    },
  };
}

export const buildBriefTemplate: ReportTemplate = (contract): ReportDocument => {
  const output = contract.output as BuildBriefOutput | null;
  if (!output) {
    return { title: contract.outputMetadata.title, summary: "No build-brief output was produced.", sections: [] };
  }

  const sections: ReportSection[] = [
    {
      heading: "Thesis",
      blocks: [
        { kind: "text", text: output.thesis },
        { kind: "keyValue", entries: [{ label: "Verdict", value: output.verdict }] },
      ],
    },
    {
      heading: "Opportunity",
      blocks: [
        output.opportunity.length > 0
          ? { kind: "list", items: output.opportunity }
          : { kind: "text", text: "No standout opportunities surfaced." },
      ],
    },
    {
      heading: "Competitors",
      blocks: [
        output.competitors.length > 0
          ? { kind: "list", items: output.competitors.map((c) => `${c.title} — ${c.developer} (${c.similarity})`) }
          : { kind: "text", text: "No competitors matched." },
      ],
    },
    { heading: "Risks", blocks: [blockList(output.risks, "No risks surfaced.")] },
    { heading: "Feature list", blocks: [blockList(output.features, "No features derived.")] },
    { heading: "Non-goals", blocks: [blockList(output.nonGoals, "No non-goals.")] },
    { heading: "Agent-ready tasks", blocks: [blockList(output.agentTasks, "No tasks derived.")] },
  ];

  return {
    title: contract.outputMetadata.title,
    summary: output.cautious ? "Provisional build brief — evidence is thin." : "Build brief.",
    sections,
  };
};

function blockList(items: string[], emptyText: string): { kind: "list"; items: string[] } | { kind: "text"; text: string } {
  return items.length > 0 ? { kind: "list", items } : { kind: "text", text: emptyText };
}
