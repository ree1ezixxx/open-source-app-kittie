import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { AppDetail, AppListItem, Review } from "@kittie/types";
import { AppCanvasFlow } from "../components/canvas/AppCanvasFlow";
import { PageShell } from "../components/PageShell";
import { IconGrid } from "../icons";
import { getApp, getReviews, listApps } from "../lib/api";
import { appSlug } from "../lib/slug";
import type { Theme } from "../lib/theme";

export function AppCanvasTreePage({ theme, onToggleTheme }: { theme: Theme; onToggleTheme: () => void }) {
  const { appId: rawId } = useParams();
  const appId = rawId ? decodeURIComponent(rawId) : undefined;

  const [app, setApp] = useState<AppDetail | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [similar, setSimilar] = useState<AppListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!appId) return;
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    setApp(null);

    getApp(appId, ac.signal)
      .then(async (detail) => {
        if (ac.signal.aborted) return;
        setApp(detail);
        const [rev, peers] = await Promise.all([
          getReviews(appId, ac.signal).catch(() => [] as Review[]),
          detail.category
            ? listApps(
                { categories: detail.category, sortBy: "revenue", sortOrder: "desc", limit: 8 },
                ac.signal,
              )
                .then((r) => r.data.filter((a) => a.id !== appId).slice(0, 6))
                .catch(() => [] as AppListItem[])
            : Promise.resolve([] as AppListItem[]),
        ]);
        if (ac.signal.aborted) return;
        setReviews(rev);
        setSimilar(peers);
      })
      .catch((e: unknown) => {
        if (!ac.signal.aborted) setError(e instanceof Error ? e.message : "Failed to load");
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });

    return () => ac.abort();
  }, [appId]);

  return (
    <PageShell
      icon={<IconGrid />}
      title={app?.title ?? "App Canvas"}
      sub={app ? "Drag nodes · scroll to pan · spokes feed the app at the top." : "Loading…"}
      theme={theme}
      onToggleTheme={onToggleTheme}
      bodyClass="canvas-tree-page"
      toolbar={
        <div className="canvas-tree-toolbar">
          <Link className="btn" to="/dashboard/canvas" style={{ height: 28, padding: "0 10px", fontSize: 12 }}>
            ← All apps
          </Link>
          {app && (
            <Link
              className="btn"
              to={`/app/${encodeURIComponent(appSlug(app))}`}
              style={{ height: 28, padding: "0 10px", fontSize: 12 }}
            >
              Classic detail
            </Link>
          )}
        </div>
      }
    >
      {loading && <div className="canvas-flow-wrap skel" />}
      {error && <div className="error-banner">{error}</div>}
      {!loading && app && <AppCanvasFlow app={app} reviews={reviews} similar={similar} />}
    </PageShell>
  );
}
