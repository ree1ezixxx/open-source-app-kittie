import type { ScreenshotGeneration } from "../../lib/aiService";
import { IconDownload } from "../../icons";
import { IconWand } from "./icons";
import { timeAgo } from "./util";

/** Renders one screenshot generation as a card with a poster strip. Shared. */
export function GenerationResult({ generation }: { generation: ScreenshotGeneration }) {
  function downloadShot(url: string, idx: number) {
    const a = document.createElement("a");
    a.href = url;
    a.download = `${generation.appName.replace(/\s+/g, "-").toLowerCase()}-shot-${idx + 1}.svg`;
    a.click();
  }

  return (
    <div className="gencard">
      <div className="gencard-head">
        <IconWand style={{ width: 16, height: 16, color: "var(--accent)" }} />
        <div className="title">{generation.appName}</div>
        <div className="meta">
          {generation.style} · {generation.shots.length} frames · {timeAgo(generation.createdAt)}
        </div>
      </div>
      <div className="studio-shots">
        {generation.shots.map((s, i) => (
          <div className="studio-shot" key={s.id}>
            <img src={s.imageUrl} alt={s.headline} />
            <div className="cap" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.headline}</span>
              <button
                className="icon-btn"
                style={{ width: 26, height: 26 }}
                title="Download frame"
                aria-label="Download frame"
                onClick={() => downloadShot(s.imageUrl, i)}
              >
                <IconDownload style={{ width: 13, height: 13 }} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
