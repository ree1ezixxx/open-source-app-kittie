import type { ScreenshotGeneration } from "../../lib/aiService";
import { timeAgo } from "./util";
import { SlidePreview, themeById } from "./screenshot-engine";

/** "Previous Generations" history. Shared shape — reusable for any job history. */
export function HistoryList({
  items,
  activeId,
  onSelect,
}: {
  items: ScreenshotGeneration[];
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="studio-history">
      {items.map((g) => {
        const first = g.slides[0];
        return (
          <button
            key={g.id}
            className={`studio-histitem${activeId === g.id ? " active" : ""}`}
            onClick={() => onSelect(g.id)}
          >
            <div className="swatch" style={{ overflow: "hidden" }}>
              {first && <SlidePreview slide={first} theme={themeById(g.themeId)} device={g.device} design={g.design} width={40} radius={8} />}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="h-name">{g.appName}</div>
              <div className="h-sub">
                {g.slides.length} frames · {timeAgo(g.createdAt)}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
