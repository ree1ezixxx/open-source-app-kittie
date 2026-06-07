import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { AppDetail, AppListItem } from "@kittie/types";
import { PageShell } from "../components/PageShell";
import { Tabs, type TabItem } from "../components/Tabs";
import { RankList } from "../components/RankList";
import { EmptyState } from "../components/EmptyState";
import { useFavorites } from "../lib/favorites";
import { getApp } from "../lib/api";
import { IconStar, IconHeart } from "../icons";
import type { Theme } from "../lib/theme";

type TabId = "apps" | "metaAds" | "appleAds" | "creators" | "ideas";

export function FavoritesPage({ theme, onToggleTheme }: { theme: Theme; onToggleTheme: () => void }) {
  const [active, setActive] = useState<TabId>("apps");
  const favApps = useFavorites("app");
  const favMeta = useFavorites("metaAd");
  const favApple = useFavorites("appleAd");
  const favCreators = useFavorites("creator");
  const favIdeas = useFavorites("idea");

  const [apps, setApps] = useState<AppListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const idsKey = favApps.ids.join(",");

  useEffect(() => {
    let cancelled = false;
    if (!favApps.ids.length) {
      setApps([]);
      return;
    }
    setLoading(true);
    Promise.all(favApps.ids.map((id) => getApp(id).catch(() => null)))
      .then((rs) => {
        if (!cancelled) setApps(rs.filter((r): r is AppDetail => r != null));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  const tabs: TabItem[] = [
    { id: "apps", label: "Apps", count: favApps.count },
    { id: "metaAds", label: "Meta ads", count: favMeta.count },
    { id: "appleAds", label: "Apple ads", count: favApple.count },
    { id: "creators", label: "Creators", count: favCreators.count },
    { id: "ideas", label: "Hot ideas", count: favIdeas.count },
  ];

  const browseCta = (
    <Link className="btn btn-accent" to="/dashboard/explore">
      Browse Apps
    </Link>
  );

  return (
    <PageShell
      icon={<IconStar />}
      title="Favorites"
      sub="Apps, ads, creators & saved ideas"
      theme={theme}
      onToggleTheme={onToggleTheme}
      toolbar={<div className="toolbar"><Tabs items={tabs} active={active} onChange={(id) => setActive(id as TabId)} /></div>}
    >
      {active === "apps" &&
        (favApps.count || loading ? (
          <div style={{ maxWidth: 720 }}>
            <RankList apps={apps} loading={loading} value="revenue" limit={100} />
          </div>
        ) : (
          <EmptyState
            icon={<IconHeart />}
            title="No favorite apps yet"
            sub="Go to the Explore page and click the heart icon on any app to add it here."
            action={browseCta}
          />
        ))}

      {active === "metaAds" && (
        <EmptyState icon={<IconHeart />} title="No saved Meta ads" sub="Save ad creatives from an app's detail page (ad ingestion is pending)." />
      )}
      {active === "appleAds" && (
        <EmptyState icon={<IconHeart />} title="No saved Apple ads" sub="Save Apple Search Ads from an app's detail page (ingestion is pending)." />
      )}
      {active === "creators" && (
        <EmptyState icon={<IconHeart />} title="No saved creators" sub="Save creator partnerships from an app's detail page (ingestion is pending)." />
      )}
      {active === "ideas" && (
        <EmptyState icon={<IconHeart />} title="No saved ideas" sub="Save ideas from the Hot ideas page." />
      )}
    </PageShell>
  );
}
