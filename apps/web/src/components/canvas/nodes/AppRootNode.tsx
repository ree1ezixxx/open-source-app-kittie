import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { AppRootNodeData } from "../../../lib/buildAppCanvasGraph";
import { StatChip } from "../../ui/StatChip";
import { formatCompact, formatMoney } from "../../../lib/format";
import { categoryColor, pillStyle } from "../../../lib/palette";

export function AppRootNode({ data }: NodeProps & { data: AppRootNodeData }) {
  const { app } = data;
  return (
    <div className="canvas-node canvas-node--root">
      <Handle type="target" position={Position.Bottom} className="canvas-handle" />
      <div className="canvas-node-inner">
        <div className="canvas-root-head">
          {app.iconUrl ? (
            <img src={app.iconUrl} alt="" className="canvas-root-icon" width={56} height={56} />
          ) : (
            <div className="canvas-root-icon skel" />
          )}
          <div>
            <div className="canvas-root-title">{app.title}</div>
            {app.category && (
              <span className="pill" style={pillStyle(categoryColor(app.category))}>
                {app.category}
              </span>
            )}
          </div>
        </div>
        <div className="canvas-root-metrics">
          <StatChip label="DL (est.)" value={formatCompact(app.downloadsEstimate30d)} />
          <StatChip label="MRR (est.)" value={formatMoney(app.revenueEstimate30d)} tone="accent" />
        </div>
      </div>
    </div>
  );
}
