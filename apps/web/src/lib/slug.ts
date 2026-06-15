/**
 * Live-parity app URLs:
 * - mobile legacy: /app/app-<title-slug>-id<storeAppId>
 * - explicit Distribution stores: /app/app-<title-slug>-store-<store>-id<encodedStoreAppId>
 *
 * Internal ids stay canonical "store:storeAppId". Legacy mobile slugs keep
 * working: all-digits resolves to Apple, dotted package names to Google.
 */

import type { DistributionStore } from "@kittie/types";

const EXPLICIT_STORES = new Set<DistributionStore>(["apple", "google", "steam", "itch"]);

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

function splitAppId(id: string): { store: DistributionStore | null; storeAppId: string } {
  const separator = id.indexOf(":");
  if (separator < 0) return { store: null, storeAppId: id };
  const maybeStore = id.slice(0, separator);
  return {
    store: EXPLICIT_STORES.has(maybeStore as DistributionStore)
      ? (maybeStore as DistributionStore)
      : null,
    storeAppId: id.slice(separator + 1),
  };
}

function encodeStoreAppId(storeAppId: string): string {
  return encodeURIComponent(storeAppId).replace(/~/g, "%7E").replace(/%/g, "~");
}

function decodeStoreAppId(encoded: string): string {
  return decodeURIComponent(encoded.replace(/~/g, "%"));
}

export function appSlug(app: { id: string; title: string }): string {
  const { store, storeAppId } = splitAppId(app.id);
  const slug = slugifyTitle(app.title) || "app";
  if (store === "steam" || store === "itch") {
    return `app-${slug}-store-${store}-id${encodeStoreAppId(storeAppId)}`;
  }
  return `app-${slug}-id${storeAppId}`;
}

export function appHref(app: { id: string; title: string }): string {
  return `/app/${encodeURIComponent(appSlug(app))}`;
}

/** Resolve a live-format slug back to a canonical "store:storeAppId" id. */
export function parseAppSlug(slug: string): string | null {
  const decodedSlug = decodeURIComponent(slug);
  const explicit = decodedSlug.match(/-store-(apple|google|steam|itch)-id(.+)$/);
  if (explicit?.[1] && explicit[2]) return `${explicit[1]}:${decodeStoreAppId(explicit[2])}`;

  const storeAppId = decodedSlug.match(/-id([^/]+)$/)?.[1];
  if (!storeAppId) return null;
  if (/^\d+$/.test(storeAppId)) return `apple:${storeAppId}`;
  return `google:${storeAppId}`;
}
