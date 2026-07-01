import dagre from "dagre";
import type { Edge, Node } from "@xyflow/react";

/**
 * Balanced fan: root centred, spokes split into a right column and a left
 * column (by `data.side`), each block centred vertically on the root. Fills
 * 2D space symmetrically instead of stacking everything on one side.
 */
export function fanLayout(nodes: Node[]): Node[] {
  const root = nodes.find((n) => n.type === "root");
  if (!root) return nodes;
  const spokes = nodes.filter((n) => n.type === "cluster");
  const signals = nodes.filter((n) => n.type === "signal");
  const rootW = root.width ?? 256;
  const rootH = root.height ?? 132;
  const CARD_W = 232;
  const CARD_H = 116;
  const SIGNAL_W = 168;
  const SIGNAL_H = 76;
  const COL_GAP = 150;
  const ROW_GAP = 30;
  const SIGNAL_GAP = 46;
  const SIGNAL_ROW = 10;

  const isLeft = (n: Node) => (n.data as { side?: string }).side === "left";
  const right = spokes.filter((n) => !isLeft(n));
  const left = spokes.filter((n) => isLeft(n));

  const placedSignals: Node[] = [];

  const place = (arr: Node[], x: number): Node[] => {
    const blockH = arr.length * CARD_H + Math.max(0, arr.length - 1) * ROW_GAP;
    const startY = rootH / 2 - blockH / 2;
    return arr.map((n, i) => {
      const y = startY + i * (CARD_H + ROW_GAP);
      const children = signals.filter((s) => (s.data as { parent?: string }).parent === n.id);
      const childX = isLeft(n) ? x - SIGNAL_GAP - SIGNAL_W : x + CARD_W + SIGNAL_GAP;
      const childBlockH = children.length * SIGNAL_H + Math.max(0, children.length - 1) * SIGNAL_ROW;
      const childStartY = y + CARD_H / 2 - childBlockH / 2;
      children.forEach((child, childIndex) => {
        placedSignals.push({
          ...child,
          position: { x: childX, y: childStartY + childIndex * (SIGNAL_H + SIGNAL_ROW) },
        });
      });
      return { ...n, position: { x, y } };
    });
  };

  return [
    { ...root, position: { x: 0, y: 0 } },
    ...place(right, rootW + COL_GAP),
    ...place(left, -COL_GAP - CARD_W),
    ...placedSignals,
  ];
}

/**
 * Vertical org-chart: root at the top, clusters in one row beneath it, each
 * cluster's signal children stacked straight down in its own column. Columns
 * are wider than the signal cards, so nothing can overlap.
 */
export function verticalLayout(nodes: Node[]): Node[] {
  const root = nodes.find((n) => n.type === "root");
  if (!root) return nodes;
  const clusters = nodes.filter((n) => n.type === "cluster");
  const signals = nodes.filter((n) => n.type === "signal");

  const ROOT_W = root.width ?? 256;
  const ROOT_H = root.height ?? 132;
  const CARD_W = 232;
  const CARD_H = 116;
  const SIGNAL_W = 168;
  const SIGNAL_H = 76;
  const COL_GAP = 44;
  const ROOT_GAP = 88;
  const SIGNAL_GAP = 46;
  const SIGNAL_ROW = 20;

  const n = clusters.length;
  const totalW = n * CARD_W + Math.max(0, n - 1) * COL_GAP;
  const clusterY = ROOT_H + ROOT_GAP;
  const signalY0 = clusterY + CARD_H + SIGNAL_GAP;

  const placed: Node[] = [
    { ...root, position: { x: totalW / 2 - ROOT_W / 2, y: 0 } },
  ];

  clusters.forEach((c, i) => {
    const colX = i * (CARD_W + COL_GAP);
    placed.push({ ...c, position: { x: colX, y: clusterY } });
    const kids = signals.filter((s) => (s.data as { parent?: string }).parent === c.id);
    kids.forEach((kid, k) => {
      placed.push({
        ...kid,
        position: {
          x: colX + (CARD_W - SIGNAL_W) / 2,
          y: signalY0 + k * (SIGNAL_H + SIGNAL_ROW),
        },
      });
    });
  });

  return placed;
}

/**
 * Tree layout via dagre. Each node must carry `width`/`height` (seeds dagre's
 * sizing AND React Flow's initial measurement). Returns nodes with positions.
 */
export function layout(nodes: Node[], edges: Edge[], dir: "LR" | "TB" = "LR"): Node[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: dir, nodesep: 30, ranksep: 96, marginx: 28, marginy: 28 });

  nodes.forEach((n) => g.setNode(n.id, { width: n.width ?? 232, height: n.height ?? 116 }));
  edges.forEach((e) => g.setEdge(e.source, e.target));
  dagre.layout(g);

  return nodes.map((n) => {
    const p = g.node(n.id);
    const w = n.width ?? 232;
    const h = n.height ?? 116;
    return { ...n, position: { x: p.x - w / 2, y: p.y - h / 2 } };
  });
}
