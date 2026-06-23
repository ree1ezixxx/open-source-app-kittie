import type {
  AppDetail,
  AppListItem,
  AppleSearchAd,
  CreatorPartnership,
  MetaAdCreative,
  Review,
} from "@kittie/types";
import { Position, type Edge, type Node } from "@xyflow/react";
import { formatCompact, formatMoney, formatRating } from "./format";

export type SpokeKind =
  | "metrics"
  | "listing"
  | "reviews"
  | "similar"
  | "ads"
  | "creators"
  | "keywords";

export type SpokeFact = { label: string; value: string };

export type AppRootNodeData = {
  kind: "app-root";
  app: AppDetail;
};

export type SpokeNodeData = {
  kind: SpokeKind;
  title: string;
  empty?: boolean;
  emptyTitle?: string;
  emptySub?: string;
  lines?: string[];
  facts?: SpokeFact[];
  screenshots?: string[];
  adPreviews?: { copy: string; imageUrl?: string | null }[];
  reviews?: Review[];
  similar?: AppListItem[];
  sparkline?: number[];
};

export type CanvasNodeData = AppRootNodeData | SpokeNodeData;

const SPOKES: { id: SpokeKind; title: string; emptyTitle: string; emptySub: string }[] = [
  { id: "metrics", title: "Metrics & trend", emptyTitle: "", emptySub: "" },
  { id: "listing", title: "Listing media", emptyTitle: "No screenshots", emptySub: "Store listing images not available yet." },
  { id: "reviews", title: "Reviews", emptyTitle: "No reviews ingested", emptySub: "Review feed not populated for this app yet." },
  { id: "similar", title: "Similar apps", emptyTitle: "No peers", emptySub: "Category peers appear when catalog data is available." },
  { id: "ads", title: "Meta ads", emptyTitle: "Ads not ingested", emptySub: "Meta Ad Library data pending verification." },
  { id: "creators", title: "Creators", emptyTitle: "Organic not ingested", emptySub: "Creator partnerships not collected yet." },
  { id: "keywords", title: "Apple Search Ads", emptyTitle: "No ASO keywords", emptySub: "Search ad keywords not ingested for this app yet." },
];

const SPOKE_W = 240;
const SPOKE_GAP = 32;
const ROOT_W = 320;
const ROW_Y = 380;

function metaAdLines(ads: MetaAdCreative[]): SpokeFact[] {
  return ads.slice(0, 3).map((ad, i) => ({
    label: ad.status ?? `Ad ${i + 1}`,
    value: (ad.adCopy ?? "—").slice(0, 72),
  }));
}

function creatorLines(creators: CreatorPartnership[]): SpokeFact[] {
  return creators.slice(0, 4).map((c) => ({
    label: c.platform,
    value: c.followerCount != null ? `${c.handle} · ${formatCompact(c.followerCount)}` : c.handle,
  }));
}

function keywordLines(ads: AppleSearchAd[]): SpokeFact[] {
  return ads.slice(0, 5).map((ad) => ({
    label: ad.keyword,
    value: `${ad.country}${ad.rank != null ? ` · #${ad.rank}` : ""}`,
  }));
}

export function buildAppCanvasGraph(
  app: AppDetail,
  reviews: Review[],
  similar: AppListItem[],
): { nodes: Node<CanvasNodeData>[]; edges: Edge[] } {
  const spokeCount = SPOKES.length;
  const totalW = spokeCount * SPOKE_W + (spokeCount - 1) * SPOKE_GAP;
  const rootX = totalW / 2 - ROOT_W / 2;

  const latestRank = app.historicals.length
    ? app.historicals[app.historicals.length - 1]!.chartRank
    : null;

  const spokePayload: Record<SpokeKind, Partial<SpokeNodeData>> = {
    metrics: {
      lines: [
        `Downloads (est.) ${formatCompact(app.downloadsEstimate30d)}`,
        `Revenue (est.) ${formatMoney(app.revenueEstimate30d)}`,
      ],
      facts: [
        { label: "Growth score", value: app.growthScore != null ? String(Math.round(app.growthScore)) : "—" },
        {
          label: "Growth 7d",
          value: app.growthPct != null ? `${app.growthPct > 0 ? "+" : ""}${app.growthPct.toFixed(1)}%` : "—",
        },
        { label: "Rank Δ", value: app.rankDelta != null ? (app.rankDelta > 0 ? `+${app.rankDelta}` : String(app.rankDelta)) : "—" },
        { label: "Chart rank", value: latestRank != null ? `#${latestRank}` : "—" },
        { label: "Rating", value: `${formatRating(app.rating)} · ${formatCompact(app.reviewCount)} reviews` },
      ],
      sparkline:
        app.sparkline?.length
          ? app.sparkline
          : app.historicals.length > 1
            ? app.historicals.slice(-7).map((h) => h.reviewCount ?? 0)
            : undefined,
      empty: false,
    },
    listing: {
      screenshots: app.screenshotUrls?.slice(0, 5) ?? [],
      facts: [
        { label: "Developer", value: app.developer || "—" },
        { label: "Price", value: app.price != null && app.price > 0 ? formatMoney(app.price) : "Free" },
        { label: "Updated", value: app.updatedAt ? new Date(app.updatedAt).toLocaleDateString() : "—" },
      ],
      empty: !(app.screenshotUrls?.length || app.developer || app.updatedAt),
    },
    reviews: {
      reviews: reviews.slice(0, 3),
      facts:
        reviews.length > 0
          ? [{ label: "In catalog", value: formatCompact(reviews.length) }]
          : app.reviewCount > 0
            ? [{ label: "Store total", value: formatCompact(app.reviewCount) }]
            : undefined,
      empty: reviews.length === 0 && !app.reviewCount,
    },
    similar: {
      similar: similar.slice(0, 4),
      empty: similar.length === 0,
    },
    ads: {
      empty: !app.metaAds.length,
      facts: metaAdLines(app.metaAds),
      adPreviews: app.metaAds.slice(0, 2).map((ad) => ({
        copy: (ad.adCopy ?? ad.status ?? "Ad").slice(0, 80),
        imageUrl: ad.imageUrl,
      })),
    },
    creators: {
      empty: !app.creators.length,
      facts: creatorLines(app.creators),
    },
    keywords: {
      empty: !app.appleSearchAds.length,
      facts: keywordLines(app.appleSearchAds),
    },
  };

  const nodes: Node<CanvasNodeData>[] = [
    {
      id: "app",
      type: "appRoot",
      position: { x: rootX, y: 0 },
      data: { kind: "app-root", app },
      draggable: true,
      targetPosition: Position.Bottom,
      style: { width: ROOT_W },
    },
  ];

  SPOKES.forEach((spoke, i) => {
    const x = i * (SPOKE_W + SPOKE_GAP);
    const extra = spokePayload[spoke.id];
    const empty = extra.empty ?? false;
    nodes.push({
      id: spoke.id,
      type: "spoke",
      position: { x, y: ROW_Y },
      data: {
        kind: spoke.id,
        title: spoke.title,
        empty,
        emptyTitle: spoke.emptyTitle,
        emptySub: spoke.emptySub,
        ...extra,
      },
      draggable: true,
      sourcePosition: Position.Top,
      style: { width: SPOKE_W },
    });
  });

  const edges: Edge[] = SPOKES.map((spoke) => {
    const filled = !spokePayload[spoke.id].empty;
    return {
      id: `e-${spoke.id}-app`,
      source: spoke.id,
      target: "app",
      type: "default",
      sourceHandle: null,
      targetHandle: null,
      animated: filled,
      style: {
        stroke: filled ? "var(--accent)" : "var(--border)",
        strokeWidth: filled ? 2 : 1.5,
        strokeDasharray: filled ? undefined : "6 4",
      },
    };
  });

  return { nodes, edges };
}
