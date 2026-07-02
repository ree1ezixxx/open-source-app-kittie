/**
 * Build-brief report: template + a builder that turns a validate-idea
 * intelligence response (#184) into a build handoff a human or coding agent
 * can act on.
 *
 * The validate-idea path does NO LLM synthesis, so the brief's feature list,
 * non-goals, and agent-ready tasks are DERIVED deterministically from the
 * grounded signals (verdict, opportunities, risks, competitors) — and are
 * labelled "(derived)" in the rendered artifact so they're never read as
 * observed findings. When the evidence is thin (low/insufficient confidence,
 * or an unvalidated verdict) the brief speaks cautiously, ties `status` to
 * `partial`, adds a weak-evidence caveat, and its feature list becomes a
 * validation step rather than a concrete "ship this" feature.
 *
 * Per-claim `evidenceIds` are carried through from the response so a reader can
 * audit which envelope evidence backs each opportunity/risk/competitor/feature.
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

/** A brief line grounded in specific envelope evidence ids. */
export interface BuildBriefFinding {
  message: string;
  evidenceIds: string[];
}

export interface BuildBriefCompetitor {
  title: string;
  developer: string;
  similarity: string;
  evidenceIds: string[];
}

export interface BuildBriefOutput {
  thesis: string;
  verdict: IdeaVerdict;
  /** True when evidence is thin — the brief is framed as provisional. */
  cautious: boolean;
  opportunity: BuildBriefFinding[];
  risks: BuildBriefFinding[];
  competitors: BuildBriefCompetitor[];
  /** Derived — not observed findings. */
  features: BuildBriefFinding[];
  nonGoals: BuildBriefFinding[];
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

function deriveFeatures(
  opportunities: BuildBriefFinding[],
  category: string | null,
  cautious: boolean,
): BuildBriefFinding[] {
  if (opportunities.length > 0) {
    return opportunities.map((o) => ({ message: `Address: ${o.message}`, evidenceIds: o.evidenceIds }));
  }
  // No opportunities: on thin evidence, do NOT invent a concrete feature —
  // hand back a validation step so the cautious framing holds (AC).
  if (cautious) {
    return [{ message: "Gather demand evidence before committing to features — validation is inconclusive.", evidenceIds: [] }];
  }
  return [{ message: `Ship the core ${category ?? "app"} experience competitors are rated on.`, evidenceIds: [] }];
}

function deriveNonGoals(risks: BuildBriefFinding[], verdict: IdeaVerdict): BuildBriefFinding[] {
  const out: BuildBriefFinding[] = risks.map((r) => ({ message: `Avoid: ${r.message}`, evidenceIds: r.evidenceIds }));
  if (CROWDED_VERDICTS.has(verdict)) {
    out.push({ message: "Don't compete head-on with incumbents on their core feature — win on a wedge.", evidenceIds: [] });
  }
  if (out.length === 0) out.push({ message: "No non-goals surfaced from the evidence.", evidenceIds: [] });
  return out;
}

function deriveAgentTasks(
  idea: string,
  opportunity: BuildBriefFinding[],
  risks: BuildBriefFinding[],
  topCompetitor: string | null,
  cautious: boolean,
): string[] {
  const tasks: string[] = [`Prototype the core flow for: ${idea}.`];
  const firstOpportunity = opportunity[0];
  if (firstOpportunity) tasks.push(`Build toward the strongest opportunity: ${firstOpportunity.message}.`);
  const firstRisk = risks[0];
  if (firstRisk) tasks.push(`De-risk early: ${firstRisk.message}.`);
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

  const opportunity: BuildBriefFinding[] = data.opportunities.map((o) => ({ message: o.message, evidenceIds: o.evidenceIds }));
  const risks: BuildBriefFinding[] = data.risks.map((r) => ({ message: r.message, evidenceIds: r.evidenceIds }));
  const competitors: BuildBriefCompetitor[] = data.competitors.map((c) => ({
    title: c.title,
    developer: c.developer,
    similarity: c.similarityClass,
    evidenceIds: c.evidenceIds,
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
    features: deriveFeatures(opportunity, data.likelyCategory, cautious),
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
    // A cautious/provisional brief is `partial`, even off a `status:"ok"` response —
    // so an agent branching on `status` (not `output.cautious`) doesn't treat it as final.
    status: cautious || response.status === "insufficient" ? "partial" : "complete",
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

function formatFinding(f: BuildBriefFinding): string {
  return f.evidenceIds.length > 0 ? `${f.message} [${f.evidenceIds.join(", ")}]` : f.message;
}

function findingList(items: BuildBriefFinding[], emptyText: string) {
  return items.length > 0
    ? ({ kind: "list", items: items.map(formatFinding) } as const)
    : ({ kind: "text", text: emptyText } as const);
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
    { heading: "Opportunity", blocks: [findingList(output.opportunity, "No standout opportunities surfaced.")] },
    {
      heading: "Competitors",
      blocks: [
        output.competitors.length > 0
          ? {
              kind: "list",
              items: output.competitors.map((c) =>
                formatFinding({ message: `${c.title} — ${c.developer} (${c.similarity})`, evidenceIds: c.evidenceIds }),
              ),
            }
          : { kind: "text", text: "No competitors matched." },
      ],
    },
    { heading: "Risks", blocks: [findingList(output.risks, "No risks surfaced.")] },
    // The next three are heuristic, not observed — labelled "(derived)" in the artifact.
    { heading: "Feature list (derived)", blocks: [findingList(output.features, "No features derived.")] },
    { heading: "Non-goals (derived)", blocks: [findingList(output.nonGoals, "No non-goals.")] },
    {
      heading: "Agent-ready tasks (derived)",
      blocks: [
        output.agentTasks.length > 0
          ? { kind: "list", items: output.agentTasks }
          : { kind: "text", text: "No tasks derived." },
      ],
    },
  ];

  return {
    title: contract.outputMetadata.title,
    summary: output.cautious ? "Provisional build brief (derived sections labelled) — evidence is thin." : "Build brief — feature list, non-goals, and tasks are derived.",
    sections,
  };
};
