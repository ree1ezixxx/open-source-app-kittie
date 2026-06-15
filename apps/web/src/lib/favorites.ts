import { useCallback, useMemo, useSyncExternalStore } from "react";

/**
 * Local favorites store (localStorage). Auth/user-store is Rhodri's lane;
 * until then the heart toggle persists per-browser. Favorites are keyed by
 * entity type and carry a small display snapshot so the Favorites page can
 * render saved items without refetching.
 */
export type FavoriteType = "app" | "metaAd" | "appleAd" | "creator" | "hotIdea";

/** @deprecated old name — kept so stragglers keep compiling; prefer FavoriteType. */
export type FavKind = FavoriteType;

export type FavoriteSnapshot = {
  /** Display name. Empty string = migrated legacy entry awaiting hydration. */
  title: string;
  subtitle?: string;
  /** Image URL (app icon etc.). */
  icon?: string;
  /** Internal link to the source entity (e.g. /apps/:id). */
  href?: string;
};

export type FavoriteEntry = {
  id: string;
  snapshot: FavoriteSnapshot;
  savedAt: number;
};

const KEY = "kittie-favorites";
const TYPES: FavoriteType[] = ["app", "metaAd", "appleAd", "creator", "hotIdea"];

type Store = { v: 2; types: Record<FavoriteType, FavoriteEntry[]> };

function emptyStore(): Store {
  return { v: 2, types: { app: [], metaAd: [], appleAd: [], creator: [], hotIdea: [] } };
}

/** Legacy v1 shape: plain Record<kind, string[]> with "idea" instead of "hotIdea". */
function migrateV1(raw: Record<string, unknown>): Store {
  const s = emptyStore();
  const kindMap: Record<string, FavoriteType> = {
    app: "app",
    metaAd: "metaAd",
    appleAd: "appleAd",
    creator: "creator",
    idea: "hotIdea",
    hotIdea: "hotIdea",
  };
  const now = Date.now();
  for (const [oldKind, type] of Object.entries(kindMap)) {
    const ids = raw[oldKind];
    if (!Array.isArray(ids)) continue;
    for (const id of ids) {
      if (typeof id !== "string" || s.types[type].some((e) => e.id === id)) continue;
      s.types[type].push({
        id,
        // Empty title marks the entry for hydration (FavoritesPage backfills via the API).
        snapshot: { title: "", href: type === "app" ? `/apps/${id}` : undefined },
        savedAt: now,
      });
    }
  }
  return s;
}

function load(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return emptyStore();
    if ((parsed as { v?: unknown }).v === 2) {
      const incoming = (parsed as Store).types ?? {};
      const s = emptyStore();
      for (const t of TYPES) {
        const list = (incoming as Partial<Record<FavoriteType, FavoriteEntry[]>>)[t];
        if (Array.isArray(list)) s.types[t] = list.filter((e) => e && typeof e.id === "string");
      }
      return s;
    }
    // v1 → v2 migration: persist immediately so nothing saved is lost.
    const migrated = migrateV1(parsed as Record<string, unknown>);
    try {
      localStorage.setItem(KEY, JSON.stringify(migrated));
    } catch {
      /* best-effort */
    }
    return migrated;
  } catch {
    return emptyStore();
  }
}

let store: Store | null = null;
const listeners = new Set<() => void>();

function getStore(): Store {
  if (!store) store = load();
  return store;
}

function persist(next: Store) {
  store = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* quota / private mode — keep the in-memory copy */
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Cross-tab sync: another tab wrote the key → drop cache and notify.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key !== KEY) return;
    store = null;
    listeners.forEach((l) => l());
  });
}

export function listFavorites(type: FavoriteType): FavoriteEntry[] {
  return getStore().types[type];
}

export function isFavorite(type: FavoriteType, id: string): boolean {
  return getStore().types[type].some((e) => e.id === id);
}

/** Add/remove a favorite. Returns the new saved-state. */
export function toggleFavorite(type: FavoriteType, id: string, snapshot: FavoriteSnapshot): boolean {
  const s = getStore();
  const list = s.types[type];
  const exists = list.some((e) => e.id === id);
  const nextList = exists
    ? list.filter((e) => e.id !== id)
    : [...list, { id, snapshot, savedAt: Date.now() }];
  persist({ ...s, types: { ...s.types, [type]: nextList } });
  return !exists;
}

/** Backfill/refresh the display snapshot of an already-saved favorite (e.g. migrated v1 ids). */
export function updateFavoriteSnapshot(type: FavoriteType, id: string, snapshot: FavoriteSnapshot) {
  const s = getStore();
  const list = s.types[type];
  if (!list.some((e) => e.id === id)) return;
  const nextList = list.map((e) => (e.id === id ? { ...e, snapshot } : e));
  persist({ ...s, types: { ...s.types, [type]: nextList } });
}

/** Reactive favorites for one entity type — updates across components and tabs. */
export function useFavorites(type: FavoriteType) {
  const entries = useSyncExternalStore(subscribe, () => getStore().types[type]);
  const ids = useMemo(() => entries.map((e) => e.id), [entries]);
  const has = useCallback((id: string) => entries.some((e) => e.id === id), [entries]);
  const toggle = useCallback(
    (id: string, snapshot: FavoriteSnapshot) => toggleFavorite(type, id, snapshot),
    [type],
  );
  return { entries, ids, has, toggle, count: entries.length };
}
