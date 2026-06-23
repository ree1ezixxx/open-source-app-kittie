import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "../../styles/teardown.css";
import type { AppDetail, Review } from "@kittie/types";
import { formatCompact, formatMoney, formatDate, formatRating } from "../../lib/format";
import { nodeTypes, type ClusterData } from "./nodes";
import { edgeTypes } from "./edges";
import { verticalLayout } from "./layout";
import { TeardownDrawer } from "./TeardownDrawer";
import {
  IconApple,
  IconGooglePlay,
  IconChart,
  IconSpark,
  IconImage,
  IconStar,
  IconGlobe,
  IconUsers,
  IconMessage,
  IconInfo,
} from "../../icons";

const NODE = {
  root: { w: 256, h: 132 },
  cluster: { w: 232, h: 116 },
  signal: { w: 168, h: 76 },
} as const;

function buildGraph(
  app: AppDetail,
  onOpen: (kind: string) => void,
): { nodes: Node[]; edges: Edge[] } {
  const dl = formatCompact(app.downloadsEstimate30d);
  const mrr = formatMoney(app.revenueEstimate30d);
  const adsCount = app.metaAds.length;
  const asaCount = app.appleSearchAds.length;
  const lastRank = app.historicals.length
    ? app.historicals[app.historicals.length - 1]!.chartRank
    : null;
  const rankStr = lastRank != null ? `#${lastRank}` : "—";
  const langs = app.languages.length;
  const sizeMb = app.fileSizeBytes ? `${Math.round(app.fileSizeBytes / 1_048_576)}MB` : "—";
  const osStr = app.minOsVersion ? `${app.minOsVersion}+` : "—";
  const priceStr = app.price ? `$${app.price}` : "Free";

  const raw: Node[] = [
    {
      id: "app",
      type: "root",
      position: { x: 0, y: 0 },
      width: NODE.root.w,
      height: NODE.root.h,
      data: {
        icon: app.iconUrl ? (
          <img src={app.iconUrl} referrerPolicy="no-referrer" alt="" />
        ) : (
          app.title.charAt(0)
        ),
        title: app.title,
        subtitle: app.developer,
        storeLabel: app.store === "apple" ? "App Store" : "Google Play",
        storeIcon: app.store === "apple" ? <IconApple /> : <IconGooglePlay />,
        category: app.category,
        badge: app.isFirstMover ? "First mover" : undefined,
        status: app.isFirstMover ? "warn" : "ok",
      },
    },
    {
      id: "growth",
      type: "cluster",
      position: { x: 0, y: 0 },
      width: NODE.cluster.w,
      height: NODE.cluster.h,
      data: {
        kind: "growth",
        icon: <IconChart />,
        accent: "#18a957",
        title: "Growth",
        subtitle: "Momentum & scale",
        status: app.downloadsEstimate30d ? "ok" : "idle",
        metrics: [
          { icon: <IconChart />, value: dl, title: "Downloads 30d" },
          { icon: <span className="td-glyph">$</span>, value: mrr, title: "MRR estimate" },
          {
            icon: <IconSpark />,
            value: app.growthScore != null ? String(Math.round(app.growthScore)) : "—",
            title: "Growth score",
          },
        ],
      } satisfies ClusterData,
    },
    {
      id: "ads",
      type: "cluster",
      position: { x: 0, y: 0 },
      width: NODE.cluster.w,
      height: NODE.cluster.h,
      data: {
        kind: "ads",
        icon: <IconImage />,
        accent: "#f59e0b",
        title: "Acquisition",
        subtitle: "Paid reach",
        status: adsCount + asaCount > 0 ? "ok" : "idle",
        metrics: [
          { icon: <IconImage />, value: `${adsCount} Meta`, title: "Meta ad creatives" },
          { icon: <IconStar />, value: `${asaCount} ASA`, title: "Apple Search Ads" },
        ],
      } satisfies ClusterData,
    },
    {
      id: "discovery",
      type: "cluster",
      position: { x: 0, y: 0 },
      width: NODE.cluster.w,
      height: NODE.cluster.h,
      data: {
        kind: "discovery",
        icon: <IconGlobe />,
        accent: "#3b82f6",
        title: "Discovery",
        subtitle: "ASO & findability",
        status: langs > 0 ? "ok" : "idle",
        metrics: [
          { icon: <IconGlobe />, value: `${langs} langs`, title: "Localizations" },
          { icon: <span className="td-glyph">#</span>, value: rankStr, title: "Chart rank" },
        ],
      } satisfies ClusterData,
    },
    {
      id: "stack",
      type: "cluster",
      position: { x: 0, y: 0 },
      width: NODE.cluster.w,
      height: NODE.cluster.h,
      data: {
        kind: "stack",
        icon: <IconInfo />,
        accent: "#8b5cf6",
        title: "Stack",
        subtitle: "Build & monetization",
        status: "ok",
        metrics: [
          { icon: <span className="td-glyph">▣</span>, value: sizeMb, title: "App size" },
          { icon: <span className="td-glyph">⌖</span>, value: osStr, title: "Min OS" },
          { icon: <span className="td-glyph">$</span>, value: priceStr, title: "Price" },
        ],
      } satisfies ClusterData,
    },
    {
      id: "voice",
      type: "cluster",
      position: { x: 0, y: 0 },
      width: NODE.cluster.w,
      height: NODE.cluster.h,
      data: {
        kind: "voice",
        icon: <IconMessage />,
        accent: "#ec4899",
        title: "Voice",
        subtitle: "Sentiment & creators",
        status: (app.rating ?? 0) >= 4.5 ? "ok" : app.reviewCount > 0 ? "warn" : "idle",
        metrics: [
          { icon: <IconStar />, value: formatRating(app.rating), title: "Rating" },
          { icon: <IconMessage />, value: formatCompact(app.reviewCount), title: "Reviews" },
          { icon: <IconUsers />, value: String(app.creators.length), title: "Creators" },
        ],
      } satisfies ClusterData,
    },
    {
      id: "competitors",
      type: "cluster",
      position: { x: 0, y: 0 },
      width: NODE.cluster.w,
      height: NODE.cluster.h,
      data: {
        kind: "competitors",
        icon: <IconUsers />,
        accent: "#64748b",
        title: "Competitors",
        subtitle: "Similar apps",
        status: "ok",
        metrics: [{ icon: <span className="td-glyph">◇</span>, value: app.category ?? "—", title: "Category" }],
      } satisfies ClusterData,
    },
  ];

  // split spokes: first half fans right, second half fans left
  const spokes = raw.filter((n) => n.type !== "root");
  const half = Math.ceil(spokes.length / 2);
  spokes.forEach((n, i) => {
    (n.data as { side?: "left" | "right" }).side = i < half ? "right" : "left";
  });

  const signal = (
    id: string,
    parent: string,
    title: string,
    value: string,
    status: "ok" | "warn" | "down" | "idle",
  ): Node => {
    const parentNode = raw.find((n) => n.id === parent);
    const parentData = parentNode?.data as { side?: "left" | "right"; title?: string } | undefined;
    return {
      id,
      type: "signal",
      position: { x: 0, y: 0 },
      width: NODE.signal.w,
      height: NODE.signal.h,
      data: {
        parent,
        parentTitle: parentData?.title ?? parent,
        title,
        value,
        status,
        side: parentData?.side,
      },
    };
  };

  const childNodes: Node[] = [
    signal("growth-downloads", "growth", "Scale agent", `${dl} downloads`, app.downloadsEstimate30d ? "ok" : "idle"),
    signal("growth-revenue", "growth", "Revenue agent", mrr, app.revenueEstimate30d ? "ok" : "idle"),
    signal(
      "growth-momentum",
      "growth",
      "Momentum agent",
      app.growthScore != null ? `${Math.round(app.growthScore)}/100` : "No score",
      app.growthScore != null ? "ok" : "idle",
    ),
    signal("ads-meta", "ads", "Meta ads agent", `${adsCount} creatives`, adsCount > 0 ? "ok" : "idle"),
    signal("ads-asa", "ads", "ASA agent", `${asaCount} ads`, asaCount > 0 ? "ok" : "idle"),
    signal("discovery-locales", "discovery", "Locale agent", `${langs} languages`, langs > 0 ? "ok" : "idle"),
    signal("discovery-rank", "discovery", "Rank agent", rankStr, lastRank != null ? "ok" : "idle"),
    signal("stack-build", "stack", "Build agent", `${sizeMb} / ${osStr}`, "ok"),
    signal("stack-price", "stack", "Monetization agent", priceStr, app.price ? "ok" : "idle"),
    signal("voice-rating", "voice", "Rating agent", formatRating(app.rating), (app.rating ?? 0) >= 4.5 ? "ok" : "warn"),
    signal("voice-reviews", "voice", "Review agent", `${formatCompact(app.reviewCount)} reviews`, app.reviewCount > 0 ? "ok" : "idle"),
    signal("voice-creators", "voice", "Creator agent", `${app.creators.length} creators`, app.creators.length > 0 ? "ok" : "idle"),
    signal("competitors-category", "competitors", "Category agent", app.category ?? "Unknown", app.category ? "ok" : "idle"),
    signal("competitors-neighbors", "competitors", "Neighbor agent", "Open similar apps", "ok"),
  ];

  const allNodes = [...raw, ...childNodes];

  allNodes.forEach((n) => {
    const parent = (n.data as { parent?: string }).parent;
    (n.data as { onOpen?: () => void }).onOpen = () => onOpen(parent ?? n.id);
  });

  const edge = (id: string, target: string): Edge =>
    ({ id, source: "app", target, type: "beam", data: { child: false } }) as Edge;
  const edges: Edge[] = [
    edge("e-growth", "growth"),
    edge("e-ads", "ads"),
    edge("e-discovery", "discovery"),
    edge("e-stack", "stack"),
    edge("e-voice", "voice"),
    edge("e-competitors", "competitors"),
  ];
  childNodes.forEach((n) => {
    const parent = (n.data as { parent: string }).parent;
    edges.push({
      id: `e-${parent}-${n.id}`,
      source: parent,
      target: n.id,
      type: "beam",
      data: { child: true },
    } as Edge);
  });

  return { nodes: verticalLayout(allNodes), edges };
}

export function TeardownCanvas({ app, reviews }: { app: AppDetail; reviews: Review[] | null }) {
  const [open, setOpen] = useState<string | null>(null);
  const onOpen = useCallback((kind: string) => setOpen(kind), []);
  // re-root (navigating to a competitor) swaps `app` → close any open drawer
  useEffect(() => setOpen(null), [app.id]);
  const { nodes, edges } = useMemo(() => buildGraph(app, onOpen), [app, onOpen]);

  return (
    <div className="teardown-canvas">
      <div className="td-chrome">
        <nav className="td-crumb">
          <span className="td-crumb-cube" />
          <span>Apps</span>
          <span className="td-crumb-sep">/</span>
          <span>{app.category ?? "All"}</span>
          <span className="td-crumb-sep">/</span>
          <span className="td-crumb-cur">{app.title}</span>
        </nav>
        <div className="td-pills">
          <span className="td-cpill">
            {app.store === "apple" ? <IconApple /> : <IconGooglePlay />}
            {app.store === "apple" ? "App Store" : "Google Play"}
          </span>
          {app.category && <span className="td-cpill">◇ {app.category}</span>}
          <span className="td-cpill">◷ {formatDate(app.updatedAt)}</span>
        </div>
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.28 }}
        minZoom={0.4}
        maxZoom={1.6}
        nodesConnectable={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={26} size={1} color="var(--td-dot)" />
        <Controls showInteractive={false} position="bottom-left" />
      </ReactFlow>

      {/* sr-only semantic mirror — agents & SEO read the structure the canvas hides */}
      <div className="sr-only">
        <h2>{app.title} — teardown</h2>
        <ul>
          {nodes
            .filter((n) => n.type === "cluster")
            .map((n) => {
              const d = n.data as ClusterData;
              return (
                <li key={n.id}>
                  <strong>{d.title}</strong>: {d.subtitle}. {d.metrics.map((m) => m.value).join(", ")}
                </li>
              );
            })}
        </ul>
      </div>

      <TeardownDrawer app={app} reviews={reviews} kind={open} onClose={() => setOpen(null)} />
    </div>
  );
}
