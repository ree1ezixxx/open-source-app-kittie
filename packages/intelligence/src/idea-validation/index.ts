/**
 * validate_app_idea — the PURE scoring + verdict core (§5.5 / §5.6).
 *
 * Given a competitor set (from find_similar_apps) and the recurring review themes
 * mined from those competitors, compute the four DETERMINISTIC scores, derive a
 * controlled verdict label, and write deterministic summaries. No DB, no LLM —
 * the LLM only phrases the narrative (angle/MVP/risks), in the API layer.
 *
 * The verdict is intentionally deterministic, not LLM-chosen: it is a
 * classification of honest, observed scores, so it never depends on an external
 * model being reachable. `not_enough_data` is the honest sink for thin evidence.
 */
import type {
  IdeaScore,
  IdeaScoreBreakdown,
  IdeaVerdict,
  SimilarApp,
} from "@kittie/types";

/** Competitor count at/above which a niche is treated as saturated (mirrors opportunity.ts). */
const SATURATED_AT = 20;
const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));
const round = (n: number): number => Number(n.toFixed(3));

export interface IdeaScoringInput {
  competitors: SimilarApp[];
  /** Head-on competitors (similarityClass === "direct"). */
  directCount: number;
  /** Recurring competitor improvement-area themes mined from reviews (the gaps). */
  reviewThemes: string[];
}

/** The four deterministic §5.5 sub-scores, each grounded in a real signal. */
export function scoreIdea(input: IdeaScoringInput): IdeaScoreBreakdown {
  const { competitors, directCount, reviewThemes } = input;
  const apps = competitors.map((c) => c.app);

  // marketSaturation — head-on competitor density vs the saturated threshold.
  const marketSaturation: IdeaScore = {
    score: round(clamp01(directCount / SATURATED_AT)),
    basis: `${directCount} direct competitor(s); ${SATURATED_AT}+ = saturated`,
  };

  // competitorQuality — incumbent strength: rating × review depth of the top 5.
  const top = [...apps].sort((a, b) => b.reviewCount - a.reviewCount).slice(0, 5);
  const rated = top.filter((a) => a.rating != null);
  const avgRating = rated.length
    ? rated.reduce((s, a) => s + (a.rating ?? 0), 0) / rated.length
    : 0;
  const avgReviews = top.length
    ? top.reduce((s, a) => s + a.reviewCount, 0) / top.length
    : 0;
  const reviewDepth = clamp01(Math.log10(avgReviews + 1) / 5); // ~100k reviews → ~1
  const competitorQuality: IdeaScore = {
    score: round(clamp01(0.5 * (avgRating / 5) + 0.5 * reviewDepth)),
    basis: top.length
      ? `top competitors avg ${avgRating.toFixed(1)}★, ~${Math.round(avgReviews).toLocaleString()} reviews`
      : "no competitors to assess",
  };

  // demandSignal — market size + momentum across the competitor set.
  const totalReviews = apps.reduce((s, a) => s + a.reviewCount, 0);
  const growths = apps
    .map((a) => a.growthScore)
    .filter((g): g is number => g != null);
  const avgGrowth = growths.length ? growths.reduce((s, g) => s + g, 0) / growths.length : 0;
  const demandSignal: IdeaScore = {
    score: round(
      clamp01(0.6 * clamp01(Math.log10(totalReviews + 1) / 6) + 0.4 * (avgGrowth / 100)),
    ),
    basis: `${totalReviews.toLocaleString()} total competitor reviews; avg growth ${avgGrowth.toFixed(0)}/100`,
  };

  // differentiation — unmet needs: recurring competitor complaints are gaps to win on.
  const differentiation: IdeaScore = {
    score: round(clamp01(reviewThemes.length / 6)),
    basis: reviewThemes.length
      ? `${reviewThemes.length} recurring complaint theme(s) to exploit: ${reviewThemes.slice(0, 4).join(", ")}`
      : "no review themes mined — differentiation room unknown",
  };

  return { marketSaturation, competitorQuality, demandSignal, differentiation };
}

/**
 * Map the deterministic scores onto the controlled §5.6 verdict vocabulary.
 * `unvalidated` = no competitors (demand unproven); `not_enough_data` = the
 * catalog has namesakes but no real signal to judge on.
 */
export function deriveVerdict(
  scores: IdeaScoreBreakdown,
  competitorCount: number,
  evidenceThin: boolean,
): IdeaVerdict {
  if (competitorCount === 0) return "unvalidated";
  if (evidenceThin) return "not_enough_data";
  const sat = scores.marketSaturation.score;
  const diff = scores.differentiation.score;
  const dem = scores.demandSignal.score;
  const qual = scores.competitorQuality.score;

  if (sat >= 0.75) return diff < 0.35 ? "saturated" : "crowded";
  if (sat >= 0.4) return qual >= 0.6 && diff < 0.4 ? "crowded" : "has_room";
  // Low saturation — competitors exist (the count===0 guard already returned),
  // so this is never "unvalidated"; low competition means there IS room, with
  // strong demand + differentiation marking the best case.
  if (dem >= 0.45 && diff >= 0.4) return "strong_opportunity";
  return "has_room";
}

/** Plain-language competitive-landscape summary. */
export function summarizeCompetitors(
  competitors: SimilarApp[],
  reviewThemes: string[],
): string {
  if (competitors.length === 0) return "No competitors surfaced in the catalog.";
  const direct = competitors.filter((c) => c.similarityClass === "direct").length;
  const top = [...competitors]
    .sort((a, b) => b.app.reviewCount - a.app.reviewCount)
    .slice(0, 3)
    .map(
      (c) =>
        `${c.app.title} (${c.app.reviewCount.toLocaleString()} reviews${
          c.app.rating != null ? `, ${c.app.rating.toFixed(1)}★` : ""
        })`,
    );
  const themes = reviewThemes.length
    ? ` Recurring complaints: ${reviewThemes.slice(0, 5).join(", ")}.`
    : "";
  return `${competitors.length} competitor(s) (${direct} direct). Top: ${top.join("; ")}.${themes}`;
}

const VERDICT_PHRASE: Record<IdeaVerdict, string> = {
  strong_opportunity: "a strong opportunity",
  has_room: "has room for a focused entrant",
  crowded: "crowded",
  saturated: "saturated",
  unvalidated: "unvalidated — no competitors found, demand unproven",
  not_enough_data: "not assessable — too little market data",
};

/** One-paragraph readout an external agent can act on without parsing the report. */
export function buildValidateAgentSummary(
  idea: string,
  verdict: IdeaVerdict,
  scores: IdeaScoreBreakdown,
  competitors: SimilarApp[],
  recommendedAngle: string | null,
): string {
  const angle = recommendedAngle ? ` Suggested angle: ${recommendedAngle}` : "";
  return (
    `Verdict: "${idea}" is ${VERDICT_PHRASE[verdict]}. ` +
    `${competitors.length} competitor(s); saturation ${scores.marketSaturation.score}, ` +
    `demand ${scores.demandSignal.score}, differentiation ${scores.differentiation.score}, ` +
    `incumbent strength ${scores.competitorQuality.score}.${angle}`
  );
}
