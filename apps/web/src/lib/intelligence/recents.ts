/**
 * Session-scoped "recent reports" — the user's OWN actions this session, read
 * back on the hub. Not persisted data and not invented: it's sessionStorage, so
 * it honestly reflects what was run, and clears with the tab.
 */
export interface IntelRecent {
  kind: "validate" | "similar";
  label: string;
  href: string;
  at: number;
}

const KEY = "kittie-intel-recents";
const LIMIT = 6;

export function readRecents(): IntelRecent[] {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as IntelRecent[]) : [];
  } catch {
    return [];
  }
}

export function pushRecent(entry: Omit<IntelRecent, "at">): void {
  try {
    const next = [{ ...entry, at: Date.now() }, ...readRecents().filter((r) => r.href !== entry.href)].slice(0, LIMIT);
    sessionStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage blocked — recents are a nicety, never load-bearing */
  }
}
