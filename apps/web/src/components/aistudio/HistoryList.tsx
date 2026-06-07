import type { ScreenshotGeneration } from "../../lib/aiService";
import { timeAgo } from "./util";

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
      {items.map((g) => (
        <button
          key={g.id}
          className={`studio-histitem${activeId === g.id ? " active" : ""}`}
          onClick={() => onSelect(g.id)}
        >
          <div className="swatch">
            {g.shots[0] && <img src={g.shots[0].imageUrl} alt="" />}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="h-name">{g.appName}</div>
            <div className="h-sub">
              {g.shots.length} frames · {timeAgo(g.createdAt)}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
