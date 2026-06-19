/**
 * Live-parity app URLs: /app/app-<title-slug>-id<storeAppId>
 * (matches appkittie.com's detail-route format). Internal ids stay
 * canonical "store:storeAppId"; the slug embeds only the storeAppId —
 * all-digits resolves to apple, dotted package names to google.
 */

export function slugifyTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

export function appSlug(app: { id: string; title: string }): string {
  const storeAppId = app.id.includes(":") ? app.id.slice(app.id.indexOf(":") + 1) : app.id;
  const slug = slugifyTitle(app.title) || "app";
  return `app-${slug}-id${storeAppId}`;
}

export function appHref(app: { id: string; title: string }): string {
  return `/app/${encodeURIComponent(appSlug(app))}`;
}

/** Resolve a live-format slug back to a canonical "store:storeAppId" id. */
export function parseAppSlug(slug: string): string | null {
  // Greedy prefix forces the LAST "-id" to be the separator: a title can contain
  // its own "-id" once slugified (e.g. "Aprenda idiomas" → …-idiomas-, "Idle …"),
  // and only the trailing "-id<storeAppId>" the builder appended is the real id.
  const storeAppId = decodeURIComponent(slug).match(/^.*-id([^/]+)$/)?.[1];
  if (!storeAppId) return null;
  if (/^\d+$/.test(storeAppId)) return `apple:${storeAppId}`;
  return `google:${storeAppId}`;
}
