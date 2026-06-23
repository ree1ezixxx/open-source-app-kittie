import type { Edge, Node } from "@xyflow/react";
import type { RoadmapNode, RoadmapStage, RoadmapTemplate } from "@kittie/types";

/** Card + column geometry (kept here so the layout is pure & testable). */
export const COL_W = 248;
export const COL_GAP = 56;
export const CARD_H = 84;
export const ROW_GAP = 22;
export const LANE_PAD_X = 24;
export const LANE_TOP = 56;
export const LANE_BOTTOM_PAD = 80;

export interface StageColumn {
  id: RoadmapStage;
  label: string;
  x: number;
  /** lane band geometry */
  laneX: number;
  laneW: number;
  total: number;
  done: number;
}

/**
 * Columnar layout: one vertical lane per stage in spine order, task cards
 * stacked top→down within their lane. `dimmed` is advisory only (a node whose
 * `dependsOn` aren't all `done`) and never blocks interaction. Pure: same input
 * → same output. Edge *styling* is applied by the canvas (so it can react to
 * focus); here edges carry only their graph shape + corner radius.
 */
export function roadmapLayout(template: RoadmapTemplate): {
  nodes: Node[];
  edges: Edge[];
  columns: StageColumn[];
  laneHeight: number;
} {
  const stageIndex = new Map(template.stages.map((s, i) => [s.id, i]));
  const colX = (stage: RoadmapStage) => (stageIndex.get(stage) ?? 0) * (COL_W + COL_GAP);

  const byKey = new Map(template.nodes.map((n) => [n.key, n]));
  const isDone = (key: string) => byKey.get(key)?.state === "done";
  const dimmed = (n: RoadmapNode) => n.dependsOn.length > 0 && !n.dependsOn.every(isDone);

  const rows = new Map<RoadmapStage, number>();
  const nodes: Node[] = template.nodes.map((n) => {
    const row = rows.get(n.stage) ?? 0;
    rows.set(n.stage, row + 1);
    return {
      id: n.key,
      type: "task",
      position: { x: colX(n.stage), y: LANE_TOP + row * (CARD_H + ROW_GAP) },
      width: COL_W,
      height: CARD_H,
      data: { node: n, dimmed: dimmed(n) },
    };
  });

  const maxRows = Math.max(0, ...template.stages.map((s) => template.nodes.filter((n) => n.stage === s.id).length));
  const laneHeight = LANE_TOP + maxRows * (CARD_H + ROW_GAP) + LANE_BOTTOM_PAD;

  const columns: StageColumn[] = template.stages.map((s) => {
    const inStage = template.nodes.filter((n) => n.stage === s.id);
    return {
      id: s.id,
      label: s.label,
      x: colX(s.id),
      laneX: colX(s.id) - LANE_PAD_X,
      laneW: COL_W + LANE_PAD_X * 2,
      total: inStage.length,
      done: inStage.filter((n) => n.state === "done").length,
    };
  });

  const edges: Edge[] = template.nodes.flatMap((n) =>
    n.dependsOn.map(
      (dep) =>
        ({
          id: `e-${dep}-${n.key}`,
          source: dep,
          target: n.key,
          type: "smoothstep",
          pathOptions: { borderRadius: 14 },
        }) as Edge,
    ),
  );

  return { nodes, edges, columns, laneHeight };
}

/**
 * A node's immediate connections: itself, the steps it directly depends on, and
 * the steps that directly depend on it (1 hop each way). Powers the hover/select
 * highlight — "what comes right before and right after this card" — without
 * flooding the board the way a full transitive walk would in a dense graph. Pure.
 */
export function directNeighbors(nodes: RoadmapNode[], key: string): Set<string> {
  const result = new Set<string>();
  const self = nodes.find((n) => n.key === key);
  if (!self) return result;
  result.add(key);
  for (const dep of self.dependsOn) result.add(dep);
  for (const n of nodes) {
    if (n.dependsOn.includes(key)) result.add(n.key);
  }
  return result;
}
