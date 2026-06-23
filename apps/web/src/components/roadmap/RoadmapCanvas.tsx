import { useCallback, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "../../styles/roadmap.css";
import type { RoadmapNode, RoadmapTemplate } from "@kittie/types";
import { nodeTypes } from "./nodes";
import { roadmapLayout, directNeighbors } from "./layout";
import { RoadmapDrawer } from "./RoadmapDrawer";

/**
 * The founder-journey canvas: 7 vertical stage lanes, task cards stacked within
 * each, faint dependency edges that light up — along with the connected journey
 * (ancestors + descendants) — when a card is hovered or selected. Click a card to
 * open its side panel. Slice 1 = template only (no persistence yet).
 */
export function RoadmapCanvas({ template }: { template: RoadmapTemplate }) {
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const base = useMemo(() => roadmapLayout(template), [template]);
  const activeKey = focusedKey ?? selectedKey;
  const journey = useMemo(
    () => (activeKey ? directNeighbors(template.nodes, activeKey) : null),
    [activeKey, template.nodes],
  );

  const onOpen = useCallback((key: string) => setSelectedKey(key), []);

  const nodes: Node[] = useMemo(() => {
    const lanes: Node[] = base.columns.map((c) => ({
      id: `lane-${c.id}`,
      type: "lane",
      position: { x: c.laneX, y: 0 },
      width: c.laneW,
      height: base.laneHeight,
      draggable: false,
      selectable: false,
      zIndex: 0,
      data: { label: c.label, total: c.total, done: c.done, width: c.laneW, height: base.laneHeight },
    }));
    const cards: Node[] = base.nodes.map((n) => ({
      ...n,
      zIndex: 1,
      data: {
        ...(n.data as object),
        highlighted: journey ? journey.has(n.id) : false,
        faded: journey ? !journey.has(n.id) : false,
        onOpen: () => onOpen(n.id),
      },
    }));
    return [...lanes, ...cards];
  }, [base, journey, onOpen]);

  // Edges are drawn ONLY for the focused card's direct connections — keeps the
  // board clean (no permanent tangle) and shows the step-before / step-after.
  const edges: Edge[] = useMemo(() => {
    if (!activeKey) return [];
    return base.edges
      .filter((e) => e.source === activeKey || e.target === activeKey)
      .map((e) => ({
        ...e,
        zIndex: 2,
        style: { stroke: "var(--rm-active)", strokeWidth: 2 },
      }));
  }, [base.edges, activeKey]);

  const selectedNode: RoadmapNode | null =
    (selectedKey && template.nodes.find((n) => n.key === selectedKey)) || null;

  return (
    <div className="roadmap-canvas">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.14 }}
        minZoom={0.3}
        maxZoom={1.5}
        nodesConnectable={false}
        nodesDraggable={false}
        elementsSelectable={false}
        proOptions={{ hideAttribution: true }}
        onNodeMouseEnter={(_, n) => n.type === "task" && setFocusedKey(n.id)}
        onNodeMouseLeave={() => setFocusedKey(null)}
        onNodeClick={(_, n) => n.type === "task" && onOpen(n.id)}
        onPaneClick={() => setSelectedKey(null)}
      >
        <Background variant={BackgroundVariant.Dots} gap={26} size={1} color="var(--rm-dot)" />
        <Controls showInteractive={false} position="bottom-left" />
      </ReactFlow>

      <div className="rm-legend">
        <span className="rm-legend-group">
          <b>Who</b>
          <span className="rm-kind rm-kind-tag-you">You</span>
          <span className="rm-kind rm-kind-tag-agent">Agent</span>
          <span className="rm-kind rm-kind-tag-kittie">Kittie</span>
        </span>
      </div>

      {/* sr-only semantic mirror — agents/SEO read the journey the canvas draws */}
      <div className="sr-only">
        <h2>Founder journey</h2>
        {template.stages.map((s) => (
          <section key={s.id}>
            <h3>{s.label}</h3>
            <ul>
              {template.nodes
                .filter((n) => n.stage === s.id)
                .map((n) => (
                  <li key={n.key}>
                    <strong>{n.title}</strong> ({n.kind}, {n.state})
                    {n.subtitle ? ` — ${n.subtitle}` : ""}
                  </li>
                ))}
            </ul>
          </section>
        ))}
      </div>

      <RoadmapDrawer node={selectedNode} template={template} onClose={() => setSelectedKey(null)} />
    </div>
  );
}
