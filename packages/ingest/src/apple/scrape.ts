/**
 * Scrape App Store screenshots from the public web listing (apps.apple.com).
 *
 * Apple's iTunes Lookup/Search API returns empty `screenshotUrls` for a large
 * minority of apps (newer screenshot formats — e.g. HelloChinese, Duolingo).
 * The web listing still embeds them as mzstatic template URLs. This is the same
 * source AppKittie surfaces. We parse the templates and render them at a fixed
 * portrait size for display.
 */

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

const TEMPLATE_RE =
  /https:\/\/is[0-9]-ssl\.mzstatic\.com\/image\/thumb\/[^"\\ )]+\/\{w\}x\{h\}\{c\}\.\{f\}/g;

/** The image's basename, e.g. "ios6-5_08.jpg" — used to dedup the same shot across device servers. */
const BASENAME_RE = /\/([^/]+)\/\{w\}x\{h\}\{c\}\.\{f\}$/;

export async function scrapeAppStoreScreenshots(storeAppId: string, country = "us"): Promise<string[]> {
  const url = `https://apps.apple.com/${country}/app/id${storeAppId}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
  if (!res.ok) return [];

  const html = (await res.text()).replace(/\\\//g, "/");
  const seen = new Set<string>();
  const shots: string[] = [];

  for (const tmpl of html.match(TEMPLATE_RE) ?? []) {
    // Screenshots live under PurpleSource*. Skip AppIcon / Features banners (not PurpleSource)
    // and Placeholder.mill (app-preview video poster frames, not screenshots).
    if (!tmpl.includes("PurpleSource")) continue;
    const base = tmpl.match(BASENAME_RE)?.[1] ?? "";
    if (!base || /placeholder\.mill/i.test(base) || /appicon/i.test(base)) continue;
    if (seen.has(base)) continue; // same screenshot mirrored across PurpleSource211/221
    seen.add(base);
    shots.push(
      tmpl.replace("{w}", "392").replace("{h}", "696").replace("{c}", "bb").replace("{f}", "jpg"),
    );
  }
  return shots.slice(0, 12);
}
