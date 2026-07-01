import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { ReactNode } from "react";

export type NodeStatus = "ok" | "warn" | "down" | "idle";
export type Metric = { icon: ReactNode; value: string; title?: string };

export type ClusterData = {
  kind: string;
  icon: ReactNode;
  title: string;
  subtitle: string;
  status: NodeStatus;
  metrics: Metric[];
  side?: "left" | "right";
  onOpen?: () => void;
};

export type SignalData = {
  parent: string;
  parentTitle: string;
  title: string;
  value: string;
  status: NodeStatus;
  side?: "left" | "right";
  onOpen?: () => void;
};

export type RootData = {
  icon: ReactNode;
  title: string;
  subtitle: string;
  storeLabel: string;
  storeIcon: ReactNode;
  category: string | null;
  badge?: string;
  status: NodeStatus;
  onOpen?: () => void;
};

export type ClusterNodeType = Node<ClusterData, "cluster">;
export type SignalNodeType = Node<SignalData, "signal">;
export type RootNodeType = Node<RootData, "root">;

function RootNode({ data }: NodeProps<RootNodeType>) {
  return (
    <div className="td-node td-root" onClick={() => data.onOpen?.()}>
      <div className="td-root-head">
        <div className="td-icon td-app-icon">{data.icon}</div>
        <div className="td-root-meta">
          <div className="td-title">{data.title}</div>
          <div className="td-sub">{data.subtitle}</div>
        </div>
        <span className={`td-status td-status-${data.status}`} />
      </div>
      <div className="td-root-foot">
        <span className="td-pill">
          {data.storeIcon}
          {data.storeLabel}
        </span>
        {data.category && <span className="td-pill td-pill-soft">{data.category}</span>}
        {data.badge && <span className="td-pill td-pill-accent">{data.badge}</span>}
      </div>
      <Handle type="source" position={Position.Bottom} className="td-handle" />
    </div>
  );
}

function ClusterNode({ data }: NodeProps<ClusterNodeType>) {
  return (
    <div className="td-node td-cluster" role="button" tabIndex={0} data-kind={data.kind} data-status={data.status} onClick={() => data.onOpen?.()}>
      <Handle type="target" position={Position.Top} className="td-handle" />
      <div className="td-head">
        <div className="td-icon">{data.icon}</div>
        <div className="td-head-meta">
          <div className="td-title">{data.title}</div>
          <div className="td-sub">{data.subtitle}</div>
        </div>
        <span className={`td-status td-status-${data.status}`} />
      </div>
      <div className="td-foot">
        {data.metrics.map((m, i) => (
          <span className="td-metric" key={i} title={m.title}>
            <span className="td-metric-val">
              {m.icon}
              {m.value}
            </span>
            {m.title && <span className="td-metric-label">{m.title}</span>}
          </span>
        ))}
      </div>
      <Handle type="source" position={Position.Bottom} className="td-handle td-handle-hidden" />
    </div>
  );
}

function SignalNode({ data }: NodeProps<SignalNodeType>) {
  return (
    <div className="td-node td-signal" role="button" tabIndex={0} data-status={data.status} onClick={() => data.onOpen?.()}>
      <Handle type="target" position={Position.Top} className="td-handle" />
      <div className="td-signal-top">
        <span className={`td-status td-status-${data.status}`} />
        <span className="td-signal-parent">{data.parentTitle}</span>
      </div>
      <div className="td-signal-title">{data.title}</div>
      <div className="td-signal-value">{data.value}</div>
    </div>
  );
}

export const nodeTypes = { root: RootNode, cluster: ClusterNode, signal: SignalNode };
