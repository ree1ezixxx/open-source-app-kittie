/**
 * Pure cursor state machine for the Keyword corpus sweep. Models a resumable
 * two-phase crawl — expand seed terms into candidate Keywords per market, then
 * score each (keyword, market) — with strike-based retirement so one bad term
 * can never wedge the sweep. No I/O: persistence and pacing live in the job.
 */

export interface CorpusItem {
  keyword: string;
  country: string;
}

export interface CorpusCursor {
  store: "apple" | "google";
  seeds: string[];
  markets: string[];
  phase: "expanding" | "scoring" | "done";
  expandQueue: Array<{ seed: string; country: string }>;
  queue: CorpusItem[];
  doneKeys: string[];
  failures: Record<string, number>;
  startedAt: string;
}

/** Strikes before a failing item retires to doneKeys instead of retrying. */
const MAX_FAILURES = 3;

const BACKOFF_CAP_MS = 60_000;

/**
 * Canonical identity of a (keyword, market) pair — mirrors makeKeywordId minus
 * the store (a cursor is already store-scoped).
 */
export function itemKey(item: CorpusItem): string {
  return `${item.country.trim().toUpperCase()}:${item.keyword.trim().toLowerCase()}`;
}

/**
 * Fresh cursor for a sweep: every seed crossed with every market lands on the
 * expand queue; the scoring queue fills as expansion runs. `startedAt` is an
 * ISO timestamp supplied by the caller so this module stays clock-free.
 */
export function createCursor(
  store: "apple" | "google",
  seeds: string[],
  markets: string[],
  startedAt: string,
): CorpusCursor {
  const cleanSeeds: string[] = [];
  const seenSeeds = new Set<string>();
  for (const seed of seeds) {
    const trimmed = seed.trim();
    const key = trimmed.toLowerCase();
    if (!trimmed || seenSeeds.has(key)) continue;
    seenSeeds.add(key);
    cleanSeeds.push(trimmed);
  }

  const cleanMarkets: string[] = [];
  const seenMarkets = new Set<string>();
  for (const market of markets) {
    const upper = market.trim().toUpperCase();
    if (!upper || seenMarkets.has(upper)) continue;
    seenMarkets.add(upper);
    cleanMarkets.push(upper);
  }

  const expandQueue: Array<{ seed: string; country: string }> = [];
  for (const seed of cleanSeeds) {
    for (const country of cleanMarkets) {
      expandQueue.push({ seed, country });
    }
  }

  return {
    store,
    seeds: cleanSeeds,
    markets: cleanMarkets,
    phase: "expanding",
    expandQueue,
    queue: [],
    doneKeys: [],
    failures: {},
    startedAt,
  };
}

/**
 * Add candidate Keywords for one market, deduplicated against everything the
 * sweep has queued or finished — re-discovering a term from another seed must
 * never score it twice. Returns a new cursor; the input is untouched.
 */
export function enqueueKeywords(
  cursor: CorpusCursor,
  keywords: string[],
  country: string,
): CorpusCursor {
  const known = new Set<string>([...cursor.queue.map(itemKey), ...cursor.doneKeys]);
  const added: CorpusItem[] = [];

  for (const keyword of keywords) {
    const item: CorpusItem = {
      keyword: keyword.trim(),
      country: country.trim().toUpperCase(),
    };
    if (!item.keyword) continue;
    const key = itemKey(item);
    if (known.has(key)) continue;
    known.add(key);
    added.push(item);
  }

  if (added.length === 0) return { ...cursor, queue: [...cursor.queue] };
  return { ...cursor, queue: [...cursor.queue, ...added] };
}

/** Next up-to-n scoreable items, skipping anything already at three strikes. */
export function nextItems(cursor: CorpusCursor, n: number): CorpusItem[] {
  const out: CorpusItem[] = [];
  for (const item of cursor.queue) {
    if (out.length >= n) break;
    if ((cursor.failures[itemKey(item)] ?? 0) >= MAX_FAILURES) continue;
    out.push(item);
  }
  return out;
}

/** Retire a scored item: off the queue, key recorded in doneKeys. */
export function markDone(cursor: CorpusCursor, item: CorpusItem): CorpusCursor {
  const key = itemKey(item);
  return {
    ...cursor,
    queue: cursor.queue.filter((q) => itemKey(q) !== key),
    doneKeys: cursor.doneKeys.includes(key) ? [...cursor.doneKeys] : [...cursor.doneKeys, key],
  };
}

/**
 * Record one strike. The item stays queued for retry until the third strike,
 * then retires to doneKeys with its failure count preserved as the audit trail.
 */
export function markFailed(cursor: CorpusCursor, item: CorpusItem): CorpusCursor {
  const key = itemKey(item);
  const count = (cursor.failures[key] ?? 0) + 1;
  const failures = { ...cursor.failures, [key]: count };

  if (count < MAX_FAILURES) {
    return { ...cursor, queue: [...cursor.queue], failures };
  }
  return {
    ...cursor,
    queue: cursor.queue.filter((q) => itemKey(q) !== key),
    doneKeys: cursor.doneKeys.includes(key) ? [...cursor.doneKeys] : [...cursor.doneKeys, key],
    failures,
  };
}

/**
 * Exponential backoff: base × 2^attempt, capped at 60s. Deterministic — no
 * jitter, since a single polite client gains nothing from it and reproducible
 * pacing is worth more.
 */
export function backoffMs(attempt: number, baseMs = 1000): number {
  return Math.min(baseMs * 2 ** Math.max(0, attempt), BACKOFF_CAP_MS);
}

export function serializeCursor(cursor: CorpusCursor): string {
  return JSON.stringify(cursor);
}

const STORES = new Set(["apple", "google"]);
const PHASES = new Set(["expanding", "scoring", "done"]);

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((x) => typeof x === "string");
}

function isItem(value: unknown): value is CorpusItem {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as CorpusItem).keyword === "string" &&
    typeof (value as CorpusItem).country === "string"
  );
}

function isExpandEntry(value: unknown): value is { seed: string; country: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { seed: unknown }).seed === "string" &&
    typeof (value as { country: unknown }).country === "string"
  );
}

/** Rehydrate a persisted cursor, refusing anything that isn't the real shape. */
export function deserializeCursor(raw: string): CorpusCursor {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Corpus cursor state is not valid JSON");
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Corpus cursor state is not an object");
  }
  const c = parsed as Record<string, unknown>;

  if (typeof c.store !== "string" || !STORES.has(c.store)) {
    throw new Error("Corpus cursor has an invalid store");
  }
  if (typeof c.phase !== "string" || !PHASES.has(c.phase)) {
    throw new Error("Corpus cursor has an invalid phase");
  }
  if (!isStringArray(c.seeds) || !isStringArray(c.markets) || !isStringArray(c.doneKeys)) {
    throw new Error("Corpus cursor seeds/markets/doneKeys must be string arrays");
  }
  if (!Array.isArray(c.expandQueue) || !c.expandQueue.every(isExpandEntry)) {
    throw new Error("Corpus cursor expandQueue is malformed");
  }
  if (!Array.isArray(c.queue) || !c.queue.every(isItem)) {
    throw new Error("Corpus cursor queue is malformed");
  }
  if (
    typeof c.failures !== "object" ||
    c.failures === null ||
    Array.isArray(c.failures) ||
    !Object.values(c.failures).every((v) => typeof v === "number")
  ) {
    throw new Error("Corpus cursor failures map is malformed");
  }
  if (typeof c.startedAt !== "string") {
    throw new Error("Corpus cursor startedAt must be an ISO string");
  }

  return {
    store: c.store as CorpusCursor["store"],
    seeds: [...c.seeds],
    markets: [...c.markets],
    phase: c.phase as CorpusCursor["phase"],
    expandQueue: c.expandQueue.map((e) => ({ seed: e.seed, country: e.country })),
    queue: c.queue.map((q) => ({ keyword: q.keyword, country: q.country })),
    doneKeys: [...c.doneKeys],
    failures: { ...(c.failures as Record<string, number>) },
    startedAt: c.startedAt,
  };
}
