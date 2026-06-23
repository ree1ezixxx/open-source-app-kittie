import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Link } from "react-router-dom";
import type { SpokeNodeData } from "../../../lib/buildAppCanvasGraph";
import { appSlug } from "../../../lib/slug";
import { formatCompact, formatMoney } from "../../../lib/format";

function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(...values, 1);
  return (
    <div className="canvas-sparkline" aria-hidden>
      {values.map((v, i) => (
        <span key={i} className="canvas-sparkline-bar" style={{ height: `${Math.max(8, (v / max) * 100)}%` }} />
      ))}
    </div>
  );
}

export function SpokeNode({ data }: NodeProps & { data: SpokeNodeData }) {
  return (
    <div className={`canvas-node canvas-node--spoke${data.empty ? " canvas-node--empty" : ""}`}>
      <Handle type="source" position={Position.Top} className="canvas-handle" />
      <div className="canvas-spoke-title">{data.title}</div>
      {data.empty ? (
        <div className="canvas-node-inner">
          <div className="canvas-spoke-empty">
            <strong>{data.emptyTitle}</strong>
            <span>{data.emptySub}</span>
          </div>
        </div>
      ) : (
        <div className="canvas-node-inner canvas-spoke-body">
          {data.sparkline && data.sparkline.length > 1 && <Sparkline values={data.sparkline} />}
          {data.lines?.map((line) => (
            <div key={line} className="canvas-spoke-line">
              {line}
            </div>
          ))}
          {data.facts && data.facts.length > 0 && (
            <dl className="canvas-facts">
              {data.facts.map((f) => (
                <div key={`${f.label}-${f.value}`} className="canvas-fact">
                  <dt>{f.label}</dt>
                  <dd>{f.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {data.adPreviews && data.adPreviews.length > 0 && (
            <div className="canvas-ad-previews">
              {data.adPreviews.map((ad, i) => (
                <div key={i} className="canvas-ad-preview">
                  {ad.imageUrl && <img src={ad.imageUrl} alt="" loading="lazy" />}
                  <span>{ad.copy}</span>
                </div>
              ))}
            </div>
          )}
          {data.reviews && data.reviews.length > 0 && (
            <ul className="canvas-review-list">
              {data.reviews.map((r) => (
                <li key={r.id}>
                  <span className="canvas-review-stars">{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span>
                  <span>{(r.title || r.body || "").slice(0, 80)}</span>
                </li>
              ))}
            </ul>
          )}
          {data.screenshots && data.screenshots.length > 0 && (
            <div className="canvas-shot-strip">
              {data.screenshots.map((url) => (
                <img key={url} src={url} alt="" loading="lazy" />
              ))}
            </div>
          )}
          {data.similar && data.similar.length > 0 && (
            <ul className="canvas-similar-list">
              {data.similar.map((a) => (
                <li key={a.id}>
                  <Link to={`/app/${encodeURIComponent(appSlug(a))}`}>{a.title}</Link>
                  <span className="canvas-similar-meta">{formatMoney(a.revenueEstimate30d)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
