/** Tiny in-memory stale-while-revalidate cache for client fetches. */
type Entry<T> = { value: T; at: number };

export function createQueryCache<T>(ttlMs: number, max = 64) {
  const map = new Map<string, Entry<T>>();

  return {
    get(key: string): T | undefined {
      const hit = map.get(key);
      if (!hit) return undefined;
      if (Date.now() - hit.at > ttlMs) {
        map.delete(key);
        return undefined;
      }
      return hit.value;
    },
    set(key: string, value: T) {
      map.set(key, { value, at: Date.now() });
      if (map.size > max) {
        const oldest = map.keys().next().value;
        if (oldest) map.delete(oldest);
      }
    },
    clear() {
      map.clear();
    },
  };
}
