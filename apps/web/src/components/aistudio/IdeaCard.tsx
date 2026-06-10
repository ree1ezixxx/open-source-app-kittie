import type { AppIdea } from "../../lib/api/ideas";
import { blueprintLabel } from "../../lib/api/ideas";
import { IconStar } from "../../icons";
import { compact } from "./util";

/** A single hot-idea card: title, description, source category, reviews, rating, blueprint tags. */
export function IdeaCard({ idea }: { idea: AppIdea }) {
  return (
    <article className="idea-card">
      <div className="idea-card-top">
        <h3 className="idea-title">{idea.title}</h3>
        <span className="idea-rating">
          <IconStar /> {idea.rating.toFixed(1)}
        </span>
      </div>
      <p className="idea-desc">{idea.description}</p>
      <div className="idea-meta">
        <span className="idea-cat">{idea.sourceCategory}</span>
        <span>·</span>
        <span>{idea.ideaCategory}</span>
        <span>·</span>
        <span>{compact(idea.reviews)} reviews</span>
      </div>
      <div className="idea-blueprint">
        {idea.blueprint.map((tag) => (
          <span key={tag} className={`bp-tag bp-${tag}`}>
            <span className="dot" />
            {blueprintLabel(tag)}
          </span>
        ))}
      </div>
    </article>
  );
}
