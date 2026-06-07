import { useCallback, useEffect, useState } from "react";

/**
 * Local favorites store (localStorage). Auth/user-store is Rhodri's lane;
 * until then the heart toggle persists per-browser. Same shape the API will use:
 * favorites are keyed by entity kind.
 */
export type FavKind = "app" | "metaAd" | "appleAd" | "creator" | "idea";

const KEY = "kittie-favorites";
const EVENT = "kittie-fav";
type Store = Record<FavKind, string[]>;
const empty: Store = { app: [], metaAd: [], appleAd: [], creator: [], idea: [] };

function read(): Store {
  try {
    return { ...empty, ...JSON.parse(localStorage.getItem(KEY) || "{}") };
  } catch {
    return { ...empty };
  }
}

function write(s: Store) {
  localStorage.setItem(KEY, JSON.stringify(s));
  window.dispatchEvent(new Event(EVENT));
}

export function useFavorites(kind: FavKind) {
  const [ids, setIds] = useState<string[]>(() => read()[kind]);

  useEffect(() => {
    const sync = () => setIds(read()[kind]);
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [kind]);

  const toggle = useCallback(
    (id: string) => {
      const s = read();
      const set = new Set(s[kind]);
      if (set.has(id)) set.delete(id);
      else set.add(id);
      s[kind] = [...set];
      write(s);
    },
    [kind],
  );

  const has = useCallback((id: string) => ids.includes(id), [ids]);

  return { ids, has, toggle, count: ids.length };
}
