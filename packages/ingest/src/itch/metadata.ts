/**
 * itch.io collector — EXPERIMENTAL and metadata-thin BY DESIGN.
 *
 * itch.io has NO public per-game JSON API: the server-side API only covers
 * games owned by the holder of the API key. The only stable public surface
 * is the RSS/XML feeds (browse pages with `.xml` appended, plus the global
 * /feed/new.xml firehose). This module parses those feeds with plain string
 * handling — no new dependencies.
 *
 * LIMITATIONS — read before extending:
 * - Browse feeds (games/newest.xml, verified live) carry per-item extras
 *   beyond the RSS spec: <plainTitle> (undecorated title), <imageurl>
 *   (cover image), <price>/<currency>, <createDate>/<updateDate>. These are
 *   mapped when present and fall back to null on the generic /feed/new.xml
 *   fallback, which may not carry them.
 * - `developer` is inferred from the URL's `user` subdomain — it is the
 *   account slug, not a display name.
 * - <title> on browse feeds is decorated with bracketed tags, e.g.
 *   "Game [Free] [Action]" — <plainTitle> is preferred when present; the
 *   decorated title is kept verbatim otherwise (never heuristically
 *   stripped, since titles can legitimately contain brackets).
 * - price is null whenever the feed omits it or quotes a non-USD currency —
 *   null means UNKNOWN, not "free".
 * - screenshots → always []. rating → always null. reviewCount → always 0.
 *   The feeds do not expose these and we never fabricate values.
 * - The global /feed/new.xml fallback may include non-game projects (asset
 *   packs, tools); the feed exposes no type field to filter on.
 */

export interface ItchGameMetadata {
  /** The `user/game` path slug — apps.id becomes `itch:${storeAppId}`. */
  storeAppId: string;
  /** <plainTitle> when present; otherwise the verbatim (decorated) <title>. */
  title: string;
  /** The `user` subdomain of the game URL — an account slug, not a name. */
  developer: string;
  /** Canonical game page, e.g. https://user.itch.io/game */
  gameUrl: string;
  /** Feed <imageurl> cover image. Null when the feed omits it. */
  iconUrl: string | null;
  /** Feed description with HTML stripped. Null when the feed sends none. */
  description: string | null;
  /** <createDate> when present, else pubDate. Approximate publication date. */
  releasedAt: Date | null;
  /** Feed <updateDate>. Null when the feed omits it. */
  updatedAt: Date | null;
  /** USD from feed <price> (only when <currency> is USD/absent). Null = UNKNOWN, not free. */
  price: number | null;
  /** Always empty — the feeds expose no screenshots. */
  screenshotUrls: string[];
  /** Always null — the feeds expose no rating. */
  rating: null;
  /** Always 0 — the feeds expose no review counts. */
  reviewCount: number;
}

/**
 * Tried in order; first response that actually contains RSS <item> blocks
 * wins. games/newest.xml is preferred (games only); /feed/new.xml is the
 * global firehose fallback.
 */
const ITCH_FEED_CANDIDATES = [
  "https://itch.io/games/newest.xml",
  "https://itch.io/feed/new.xml",
] as const;

function stripCdata(value: string): string {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
}

function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_m, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/** Raw inner content of the first <tag>…</tag> in the block, CDATA unwrapped. */
function tagContent(block: string, tag: string): string | null {
  const match = block.match(
    new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i"),
  );
  if (!match || match[1] === undefined) return null;
  const inner = stripCdata(match[1]).trim();
  return inner.length > 0 ? inner : null;
}

/** Strip HTML tags, decode entities, collapse whitespace. */
function plainText(raw: string): string {
  return decodeEntities(raw.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

/** `https://user.itch.io/game` → { slug: "user/game", developer: "user" }. */
function parseGameUrl(link: string): { slug: string; developer: string } | null {
  try {
    const url = new URL(link);
    const host = url.hostname.toLowerCase();
    if (!host.endsWith(".itch.io")) return null;

    const user = host.slice(0, -".itch.io".length);
    const game = url.pathname.replace(/^\/+|\/+$/g, "").split("/")[0] ?? "";
    if (user.length === 0 || user.includes(".") || game.length === 0) return null;

    return { slug: `${user}/${game}`, developer: user };
  } catch {
    return null;
  }
}

function parseFeedDate(raw: string | null): Date | null {
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "$0.00" → 0, "$4.99" → 4.99. Null when absent, non-USD, or unparseable. */
function parseFeedPrice(block: string): number | null {
  const rawPrice = tagContent(block, "price");
  if (!rawPrice) return null;

  const currency = tagContent(block, "currency");
  if (currency && currency.toUpperCase() !== "USD") return null;

  const numeric = Number(decodeEntities(rawPrice).replace(/[$,\s]/g, ""));
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
}

async function fetchFirstWorkingFeed(): Promise<string> {
  let lastFailure = "no candidates tried";

  for (const url of ITCH_FEED_CANDIDATES) {
    try {
      const res = await fetch(url, {
        headers: { accept: "application/rss+xml, application/xml, text/xml" },
      });
      if (!res.ok) {
        lastFailure = `${url} → HTTP ${res.status}`;
        continue;
      }
      const body = await res.text();
      if (!/<item\b/i.test(body)) {
        lastFailure = `${url} → no <item> blocks in response`;
        continue;
      }
      return body;
    } catch (error) {
      lastFailure = `${url} → ${String(error)}`;
    }
  }

  throw new Error(`No itch.io feed candidate returned RSS items (last: ${lastFailure})`);
}

/**
 * Fetch the newest games published on itch.io via the public RSS feed.
 *
 * EXPERIMENTAL: see the module JSDoc for what this can and cannot return.
 * One feed request per call (plus at most one fallback request). Items that
 * fail to parse are skipped, never fabricated.
 */
export async function fetchItchNewGames(opts?: {
  limit?: number;
}): Promise<ItchGameMetadata[]> {
  const limit = opts?.limit ?? 25;
  if (limit <= 0) return [];

  const xml = await fetchFirstWorkingFeed();
  const itemBlocks = xml.match(/<item\b[^>]*>[\s\S]*?<\/item>/gi) ?? [];

  const games: ItchGameMetadata[] = [];
  const seen = new Set<string>();

  for (const block of itemBlocks) {
    if (games.length >= limit) break;

    const rawPlainTitle = tagContent(block, "plainTitle");
    const rawTitle = rawPlainTitle ?? tagContent(block, "title");
    const rawLink = tagContent(block, "link");
    if (!rawTitle || !rawLink) continue;

    const title = plainText(rawTitle);
    const gameUrl = decodeEntities(rawLink).trim();
    if (title.length === 0) continue;

    const parsed = parseGameUrl(gameUrl);
    if (!parsed || seen.has(parsed.slug)) continue;
    seen.add(parsed.slug);

    const rawDescription = tagContent(block, "description");
    const description = rawDescription ? plainText(rawDescription) : null;

    const rawIconUrl = tagContent(block, "imageurl");
    const iconUrl = rawIconUrl ? decodeEntities(rawIconUrl).trim() : null;

    const releasedAt =
      parseFeedDate(tagContent(block, "createDate")) ??
      parseFeedDate(tagContent(block, "pubDate"));

    games.push({
      storeAppId: parsed.slug,
      title,
      developer: parsed.developer,
      gameUrl,
      iconUrl: iconUrl && iconUrl.length > 0 ? iconUrl : null,
      description: description && description.length > 0 ? description : null,
      releasedAt,
      updatedAt: parseFeedDate(tagContent(block, "updateDate")),
      price: parseFeedPrice(block),
      screenshotUrls: [],
      rating: null,
      reviewCount: 0,
    });
  }

  return games;
}
