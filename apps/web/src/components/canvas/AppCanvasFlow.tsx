import { useMemo } from "react";
import { ReactFlow, Background, type NodeTypes } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { AppDetail, AppListItem, Review } from "@kittie/types";
import { buildAppCanvasGraph } from "../../lib/buildAppCanvasGraph";
import { AppRootNode } from "./nodes/AppRootNode";
import { SpokeNode } from "./nodes/SpokeNode";

const nodeTypes: NodeTypes = {
  appRoot: AppRootNode,
  spoke: SpokeNode,
};

export function AppCanvasFlow({
  app,
  reviews,
  similar,
}: {
  app: AppDetail;
  reviews: Review[];
  similar: AppListItem[];
}) {
  const { nodes, edges } = useMemo(
    () => buildAppCanvasGraph(app, reviews, similar),
    [app, reviews, similar],
  );

  return (
    <div className="canvas-flow-wrap">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.25, maxZoom: 1 }}
        minZoom={0.35}
        maxZoom={1.25}
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable
        panOnScroll
        zoomOnScroll
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={20} size={1.5} color="var(--border)" />
      </ReactFlow>
    </div>
  );
}
