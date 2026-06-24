import type { DecisionPacket } from "@kittie/types";
import { IconBulb, IconExternal, IconInfo } from "../icons";
import { ConfidenceBadge, CoverageBadge } from "./DecisionBadges";

/** Humanise a recommended-tool id into a next-step label. */
const TOOL_LABEL: Record<string, string> = {
  start_mobile_build: "Start build context",
  get_app_reviews: "Pull competitor reviews",
  get_related_keywords: "Find ASO keywords",
  search_apps: "Broaden the search",
  batch_keyword_difficulty: "Score keyword difficulty",
};
const toolLabel = (t: string) => TOOL_LABEL[t] ?? t.replace(/_/g, " ");
const costLabel = (c: number) => (c === 0 ? "free" : `$${c.toFixed(2)}`);

/**
 * The decision-first block: a single dominant verdict ("why this app's market
 * matters") above the metric wall, backed by observed evidence, an honest
 * confidence/coverage read, and the recommended next actions. Renders only when
 * the API served a packet (category-less apps omit it — no invented decision).
 */
export function DecisionPacketCard({
  packet,
  category,
}: {
  packet: DecisionPacket;
  category: string | null;
}) {
  const evidence = packet.evidence.slice(0, 3);
  return (
    <section className="decision" aria-label="Opportunity decision">
      <div className="decision-head">
        <span className="decision-tag">
          <IconBulb /> Opportunity{category ? ` · ${category}` : ""}
        </span>
        <div className="decision-badges">
          <ConfidenceBadge confidence={packet.confidence} />
          <CoverageBadge coverage={packet.coverage} />
        </div>
      </div>

      <h2 className="decision-headline">{packet.decision}</h2>

      {evidence.length > 0 && (
        <ul className="decision-evidence">
          {evidence.map((e, i) => (
            <li key={i}>
              <span className="ev-kind">{e.valueType}</span>
              <span className="ev-claim">{e.claim}</span>
              {e.sourceUrl && (
                <a
                  className="ev-src"
                  href={e.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="View source"
                >
                  <IconExternal />
                </a>
              )}
            </li>
          ))}
        </ul>
      )}

      {packet.recommendedActions.length > 0 && (
        <div className="decision-actions">
          <span className="decision-actions-label">Next</span>
          {packet.recommendedActions.map((a, i) => (
            <span className="action-chip" key={i} title={a.reason}>
              {toolLabel(a.tool)}
              <span className="action-cost">{costLabel(a.estimatedCost)}</span>
            </span>
          ))}
        </div>
      )}

      {packet.coverage.missing.length > 0 && (
        <div className="decision-missing">
          <IconInfo />
          <span>Not yet in this decision: {packet.coverage.missing.join(", ")}.</span>
        </div>
      )}
    </section>
  );
}
