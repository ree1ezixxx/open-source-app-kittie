/**
 * `advise_next_build_decision` — the recommendation engine. It does NOT crawl
 * the stores; it consumes the L4 demand signal (a set of scored
 * `DemandCandidate`s, injected by the caller) and ranks it through the user's
 * Standing preferences, returning a `DecisionPacket` (evidence + assumptions +
 * confidence). `dislike`/`never` preferences exclude candidates; `like`/`always`
 * boost them. With no eligible candidate it returns an honest "no recommendation"
 * packet, never a guess.
 */
import type { DecisionPacket, Evidence, RecommendedAction } from "@kittie/types";
import type { BuildContext, DemandCandidate, Preference } from "./types.js";

export interface AdviseOptions {
  /** Current time in epoch ms (for evidence timestamps). */
  now: number;
  /** Pins the resulting packet to a market snapshot when known. */
  snapshotId?: string;
}

interface ScoredCandidate {
  candidate: DemandCandidate;
  score: number;
  reasons: string[];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** A preference matches a candidate when a meaningful word of it appears in the
 *  candidate's label/category/platform. Deliberately simple and deterministic. */
function preferenceMatches(pref: Preference, c: DemandCandidate): boolean {
  const haystack = `${c.label} ${c.category ?? ""} ${c.platform ?? ""}`.toLowerCase();
  const needles = pref.text
    .toLowerCase()
    .split(/\W+/)
    .filter((word) => word.length >= 4);
  return needles.some((needle) => haystack.includes(needle));
}

function nextAction(phase: BuildContext["phase"]): RecommendedAction {
  switch (phase) {
    case "ideation":
    case "validation":
      return {
        tool: "compute_demand_signal",
        reason: "Confirm live demand before committing scope.",
        estimatedCost: 10,
      };
    case "scoping":
      return {
        tool: "generate_build_plan",
        reason: "Scope is converging — draft the build plan.",
        estimatedCost: 100,
      };
    case "blueprint":
      return {
        tool: "generate_launch_plan",
        reason: "Build plan exists — plan the launch.",
        estimatedCost: 75,
      };
    case "launch":
    case "shipped":
      return {
        tool: "advise_next_build_decision",
        reason: "Re-evaluate against fresh demand.",
        estimatedCost: 10,
      };
  }
}

export function adviseNextBuildDecision(
  ctx: BuildContext,
  effectivePreferences: Preference[],
  candidates: DemandCandidate[],
  opts: AdviseOptions,
): DecisionPacket {
  const nowIso = new Date(opts.now).toISOString();
  const blocking = effectivePreferences.filter((p) => p.kind === "dislike" || p.kind === "never");
  const boosting = effectivePreferences.filter((p) => p.kind === "like" || p.kind === "always");
  const openUnknowns = ctx.unknowns.map((u) => u.question);

  const scored: ScoredCandidate[] = [];
  for (const candidate of candidates) {
    if (blocking.some((pref) => preferenceMatches(pref, candidate))) continue;
    let score = candidate.demandScore;
    const reasons = [`demand score ${candidate.demandScore}/100`];
    for (const pref of boosting) {
      if (preferenceMatches(pref, candidate)) {
        score += 5;
        reasons.push(`matches preference "${pref.text}"`);
      }
    }
    scored.push({ candidate, score, reasons });
  }
  scored.sort((a, b) => b.score - a.score);

  const top = scored[0];
  if (!top) {
    const noCandidates = candidates.length === 0;
    return {
      decision: noCandidates
        ? "No build recommendation — no demand candidates were supplied."
        : "No build recommendation — every candidate was excluded by a standing preference.",
      evidence: [],
      confidence: { score: 0, reasons: ["no eligible candidates"] },
      coverage: {
        status: "none",
        missing: [noCandidates ? "live demand signal" : "candidates compatible with preferences"],
      },
      assumptions: [],
      unknowns: openUnknowns,
      recommendedActions: [
        noCandidates
          ? {
              tool: "compute_demand_signal",
              reason: "Gather live market demand before deciding.",
              estimatedCost: 10,
            }
          : {
              tool: "update_build_context",
              reason: "Relax or revise the blocking preference to surface candidates.",
              estimatedCost: 0,
            },
      ],
      snapshotId: opts.snapshotId ?? "unpinned",
    };
  }

  const clamped = Math.max(0, Math.min(100, top.score));
  const evidence: Evidence[] = [
    {
      claim: `${top.candidate.label} shows a demand score of ${top.candidate.demandScore}/100`,
      valueType: "modelled",
      sourceId: "kittie:demand-signal",
      sourceUrl: null,
      observedAt: nowIso,
    },
    ...(top.candidate.evidence ?? []),
  ];

  const assumptions = ["The live demand signal reflects the current market."];
  if (boosting.length > 0) assumptions.push(`Applied ${boosting.length} preference boost(s).`);
  if (blocking.length > 0) {
    assumptions.push(`Excluded candidates matching ${blocking.length} preference(s).`);
  }

  return {
    decision: `Build "${top.candidate.label}"`,
    evidence,
    confidence: { score: round2(clamped / 100), reasons: top.reasons },
    coverage: {
      status: (top.candidate.evidence?.length ?? 0) > 0 ? "partial" : "none",
      missing: openUnknowns,
    },
    assumptions,
    unknowns: openUnknowns,
    recommendedActions: [nextAction(ctx.phase)],
    snapshotId: opts.snapshotId ?? top.candidate.snapshotId ?? "unpinned",
  };
}
