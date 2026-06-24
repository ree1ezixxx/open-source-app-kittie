import { Link } from "react-router-dom";
import type { AppIdea } from "../../lib/api/ideas";
import { blueprintLabel, ideaHref } from "../../lib/api/ideas";
import { IconStar } from "../../icons";
import { compact } from "./util";
import { IdeaMockup } from "./IdeaMockup";

/** A single hot-idea card: mockup, title, description, source category, reviews, rating, blueprint tags. */
export function IdeaCard({ idea }: { idea: AppIdea }) {
  const href = idea.storeAppId ? ideaHref(idea) : null;

  return (
    <article
      className={`idea-card${href ? " idea-card-link" : ""}`}
      data-idea
      data-idea-id={idea.id}
      data-idea-slug={idea.slug}
      data-source-app-id={idea.storeAppId ?? undefined}
    >
      <IdeaMockup idea={idea} />
      <div className="idea-card-top">
        {/* Title is the one real link; .idea-card-stretch::after makes the whole card clickable
            (replaces the prior role="link" article hack) — keyboard-focusable and agent-followable. */}
        <h3 className="idea-title" data-field="name">
          {href ? (
            <Link className="idea-card-stretch" to={href}>
              {idea.title}
            </Link>
          ) : (
            idea.title
          )}
        </h3>
        <span className="idea-rating" data-field="rating" data-value={idea.rating}>
          <IconStar /> {idea.rating.toFixed(1)}
        </span>
      </div>
      <p className="idea-desc" data-field="description">
        {idea.description}
      </p>
      <div className="idea-meta">
        <span className="idea-cat" data-field="source-category">
          {idea.sourceCategory}
        </span>
        <span>·</span>
        <span data-field="idea-category">{idea.ideaCategory}</span>
        <span>·</span>
        <span data-field="reviews" data-value={idea.reviews}>
          {compact(idea.reviews)} reviews
        </span>
      </div>
      <div className="idea-blueprint" data-field="blueprint">
        {idea.blueprint.map((tag) => (
          <span key={tag} className={`bp-tag bp-${tag}`} data-value={tag}>
            <span className="dot" />
            {blueprintLabel(tag)}
          </span>
        ))}
      </div>
    </article>
  );
}
