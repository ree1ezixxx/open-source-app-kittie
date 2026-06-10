import type { AppIdea } from "../../lib/api/ideas";
import { blueprintLabel } from "../../lib/api/ideas";
import { IconStar } from "../../icons";
import { compact } from "./util";

/** A single hot-idea card: the generated concept plus its real provenance
    (source-app reviews + rating) and a build-effort preview, with a one-click
    path to the full PRD assembled from the stored blueprint. */
export function IdeaCard({ idea, onViewPrd }: { idea: AppIdea; onViewPrd?: () => void }) {
  return (
    <article className="idea-card">
      <div className="idea-card-top">
        <h3 className="idea-title">{idea.title}</h3>
        {idea.rating != null && (
          <span className="idea-rating">
            <IconStar /> {idea.rating.toFixed(1)}
          </span>
        )}
      </div>
      <p className="idea-desc">{idea.description}</p>

      <div className="idea-meta">
        <span className="idea-cat">{idea.sourceCategory}</span>
        <span>·</span>
        <span>{idea.ideaCategory}</span>
        <span>·</span>
        <span>{compact(idea.reviews)} reviews</span>
        {idea.difficulty && (
          <>
            <span>·</span>
            <span className={`idea-diff diff-${idea.difficulty.toLowerCase()}`}>{idea.difficulty}</span>
          </>
        )}
        {idea.timelineWeeks != null && (
          <>
            <span>·</span>
            <span>{idea.timelineWeeks}w build</span>
          </>
        )}
      </div>

      <div className="idea-blueprint">
        {idea.blueprint.map((tag) => (
          <span key={tag} className={`bp-tag bp-${tag}`}>
            <span className="dot" />
            {blueprintLabel(tag)}
          </span>
        ))}
      </div>

      {onViewPrd && (
        <button type="button" className="idea-prd-btn" onClick={onViewPrd}>
          View PRD →
        </button>
      )}
    </article>
  );
}
