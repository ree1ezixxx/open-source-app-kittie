import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { RoadmapNode } from "@kittie/types";
import { IconUsers, IconSparkles, IconStar, IconCheck } from "../../icons";

export type TaskData = {
  node: RoadmapNode;
  dimmed: boolean;
  highlighted: boolean;
  faded: boolean;
  onOpen?: () => void;
};
export type LaneData = { label: string; total: number; done: number; width: number; height: number };

type TaskNodeType = Node<TaskData, "task">;
type LaneNodeType = Node<LaneData, "lane">;

const KIND_ICON: Record<RoadmapNode["kind"], React.ReactNode> = {
  you: <IconUsers />,
  agent: <IconSparkles />,
  kittie: <IconStar />,
};

/** Reference-style status sub-line: what this card is, by kind/mode. */
function statusLine(n: RoadmapNode): string {
  if (n.kind === "agent") return "Agent can do this";
  if (n.kind === "kittie") return "Open in Kittie";
  return n.mode === "manual" ? "Your task" : "Needs your input";
}

function IconLock() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function LaneNode({ data }: NodeProps<LaneNodeType>) {
  return (
    <div className="rm-lane" style={{ width: data.width, height: data.height }}>
      <div className="rm-lane-header">
        <span className="rm-lane-label">{data.label} stage</span>
        <span className="rm-lane-progress">
          {data.done}/{data.total}
        </span>
      </div>
    </div>
  );
}

function TaskNode({ data }: NodeProps<TaskNodeType>) {
  const { node, dimmed, highlighted, faded } = data;
  const cls = [
    "rm-card",
    `rm-kind-${node.kind}`,
    dimmed ? "rm-blocked" : "",
    highlighted ? "rm-hl" : "",
    faded ? "rm-faded" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={cls} role="button" tabIndex={0} onClick={() => data.onOpen?.()}>
      <Handle type="target" position={Position.Left} className="rm-handle" />
      <div className="rm-card-icon">{KIND_ICON[node.kind]}</div>
      <div className="rm-card-body">
        <div className="rm-card-title">{node.title}</div>
        <div className="rm-card-status">{statusLine(node)}</div>
      </div>
      <span className={`rm-card-mark rm-state-${node.state}`}>
        {dimmed ? (
          <IconLock />
        ) : node.state === "done" ? (
          <IconCheck />
        ) : (
          <span className="rm-dot" />
        )}
      </span>
      <Handle type="source" position={Position.Right} className="rm-handle" />
    </div>
  );
}

export const nodeTypes = { task: TaskNode, lane: LaneNode };
