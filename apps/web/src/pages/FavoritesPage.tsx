import { useEffect, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { PageShell } from "../components/PageShell";
import { Tabs, type TabItem } from "../components/Tabs";
import { EmptyState } from "../components/EmptyState";
import { FavoriteToggle } from "../components/FavoriteToggle";
import {
  useFavorites,
  updateFavoriteSnapshot,
  type FavoriteEntry,
  type FavoriteType,
} from "../lib/favorites";
import { getApp } from "../lib/api";
import { IconStar, IconHeart } from "../icons";
import type { Theme } from "../lib/theme";

const TAB_IDS = ["apps", "meta-ads", "apple-ads", "creators", "hot-ideas"] as const;
type TabId = (typeof TAB_IDS)[number];

const TAB_TYPE: Record<TabId, FavoriteType> = {
  apps: "app",
  "meta-ads": "metaAd",
  "apple-ads": "appleAd",
  creators: "creator",
  "hot-ideas": "hotIdea",
};

function isTabId(v: string | null): v is TabId {
  return !!v && (TAB_IDS as readonly string[]).includes(v);
}

/** One saved entity rendered from its stored snapshot — no refetch needed. */
function SnapshotRow({ type, entry, rank }: { type: FavoriteType; entry: FavoriteEntry; rank: number }) {
  const navigate = useNavigate();
  const s = entry.snapshot;
  const title = s.title || entry.id;
  return (
    <div
      className="rank-row"
      onClick={s.href ? () => navigate(s.href!) : undefined}
      style={s.href ? undefined : { cursor: "default" }}
    >
      <span className="rk">{rank}</span>
      {s.icon ? (
        <img className="app-icon" src={s.icon} alt="" loading="lazy" referrerPolicy="no-referrer" />
      ) : (
        <div className="app-icon placeholder">{title.charAt(0)}</div>
      )}
      <div className="rr-meta">
        <div className="rr-name" title={title}>
          {s.title || <span className="skel" style={{ display: "inline-block", width: 120, height: 10 }} />}
        </div>
        {s.subtitle && <div className="rr-sub">{s.subtitle}</div>}
      </div>
      <FavoriteToggle type={type} id={entry.id} snapshot={s} />
    </div>
  );
}

function SnapshotList({ type, entries }: { type: FavoriteType; entries: FavoriteEntry[] }) {
  return (
    <div style={{ maxWidth: 720 }}>
      {entries.map((e, i) => (
        <SnapshotRow key={e.id} type={type} entry={e} rank={i + 1} />
      ))}
    </div>
  );
}

export function FavoritesPage({ theme, onToggleTheme }: { theme: Theme; onToggleTheme: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  // /dashboard/favorites/apps pins the Apps tab; otherwise ?tab= drives selection.
  const fromQuery = searchParams.get("tab");
  const active: TabId = location.pathname.endsWith("/apps")
    ? "apps"
    : isTabId(fromQuery)
      ? fromQuery
      : "apps";

  const setActive = (id: TabId) =>
    navigate(id === "apps" ? "/dashboard/favorites" : `/dashboard/favorites?tab=${id}`, { replace: true });

  const favApps = useFavorites("app");
  const favMeta = useFavorites("metaAd");
  const favApple = useFavorites("appleAd");
  const favCreators = useFavorites("creator");
  const favIdeas = useFavorites("hotIdea");

  // Hydrate migrated v1 app favorites (id-only, empty title) into full snapshots.
  const appEntries = favApps.entries;
  useEffect(() => {
    const stale = appEntries.filter((e) => !e.snapshot.title);
    if (!stale.length) return;
    let cancelled = false;
    for (const e of stale) {
      getApp(e.id)
        .then((d) => {
          if (cancelled) return;
          updateFavoriteSnapshot("app", e.id, {
            title: d.title,
            subtitle: d.developer,
            icon: d.iconUrl ?? undefined,
            href: `/apps/${d.id}`,
          });
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [appEntries]);

  const tabs: TabItem[] = [
    { id: "apps", label: "Apps", count: favApps.count },
    { id: "meta-ads", label: "Meta ads", count: favMeta.count },
    { id: "apple-ads", label: "Apple ads", count: favApple.count },
    { id: "creators", label: "Creators", count: favCreators.count },
    { id: "hot-ideas", label: "Hot ideas", count: favIdeas.count },
  ];

  const sections: Record<TabId, { entries: FavoriteEntry[]; empty: ReactNode }> = {
    apps: {
      entries: favApps.entries,
      empty: (
        <EmptyState
          icon={<IconHeart />}
          title="No favorite apps yet"
          sub="Click the heart on any app in Explore to save it here."
          action={
            <Link className="btn btn-accent" to="/dashboard/explore">
              Browse Apps
            </Link>
          }
        />
      ),
    },
    "meta-ads": {
      entries: favMeta.entries,
      empty: (
        <EmptyState
          icon={<IconHeart />}
          title="No saved Meta ads yet"
          sub="Saving Meta ad creatives isn't wired up in this clone yet — saved ads will appear here once it is."
        />
      ),
    },
    "apple-ads": {
      entries: favApple.entries,
      empty: (
        <EmptyState
          icon={<IconHeart />}
          title="No saved Apple ads yet"
          sub="Saving Apple Search Ads isn't wired up in this clone yet — saved ads will appear here once it is."
        />
      ),
    },
    creators: {
      entries: favCreators.entries,
      empty: (
        <EmptyState
          icon={<IconHeart />}
          title="No saved creators yet"
          sub="Saving creators isn't wired up in this clone yet — saved creators will appear here once it is."
        />
      ),
    },
    "hot-ideas": {
      entries: favIdeas.entries,
      empty: (
        <EmptyState
          icon={<IconHeart />}
          title="No saved ideas yet"
          sub="Save ideas from Hot Ideas — click the heart on any idea card."
          action={
            <Link className="btn btn-accent" to="/dashboard/hot-ideas">
              Browse Hot Ideas
            </Link>
          }
        />
      ),
    },
  };

  const section = sections[active];

  return (
    <PageShell
      icon={<IconStar />}
      title="Favorites"
      sub="Apps, ads, creators, and saved ideas"
      theme={theme}
      onToggleTheme={onToggleTheme}
      toolbar={
        <div className="toolbar">
          <Tabs items={tabs} active={active} onChange={(id) => setActive(id as TabId)} />
        </div>
      }
    >
      {section.entries.length ? (
        <SnapshotList type={TAB_TYPE[active]} entries={section.entries} />
      ) : (
        section.empty
      )}
    </PageShell>
  );
}
