/**
 * App finder client — search the App Store or resolve a pasted store URL into a
 * real listing, and import its screenshots as source frames. Backed by the
 * API's iTunes-proxy endpoints (no key, no catalog scan). Used by the AI Studio
 * Screenshot Generator + Translation surfaces, mirroring appkittie's "Find app
 * details" / "Find App Screenshots" intake.
 */
import type { UploadedImage } from "../aiService";

const BASE = "/api/v1";

export interface StoreApp {
  storeAppId: string;
  title: string;
  developer: string;
  category: string | null;
  iconUrl: string | null;
  description: string | null;
  rating: number | null;
  reviewCount: number;
  screenshotUrls: string[];
}

export async function searchStoreApps(q: string, signal?: AbortSignal): Promise<StoreApp[]> {
  const res = await fetch(`${BASE}/ai/app-search?q=${encodeURIComponent(q)}`, { signal });
  if (!res.ok) throw new Error(`Store search failed (${res.status})`);
  return ((await res.json()) as { data: StoreApp[] }).data;
}

export async function lookupStoreApp(idOrUrl: string, signal?: AbortSignal): Promise<StoreApp> {
  const res = await fetch(`${BASE}/ai/app-lookup?id=${encodeURIComponent(idOrUrl)}`, { signal });
  if (!res.ok) {
    const msg = res.status === 404 ? "App not found" : `Lookup failed (${res.status})`;
    throw new Error(msg);
  }
  return ((await res.json()) as { data: StoreApp }).data;
}

/** Fetch one store asset through the same-origin proxy and return a data URL. */
async function assetToDataUrl(url: string, signal?: AbortSignal): Promise<string | null> {
  try {
    const res = await fetch(`${BASE}/ai/store-asset?url=${encodeURIComponent(url)}`, { signal });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** Import an app's store icon as a data URL (export-safe, via the proxy). */
export async function importStoreIcon(app: StoreApp, signal?: AbortSignal): Promise<string | null> {
  return app.iconUrl ? assetToDataUrl(app.iconUrl, signal) : null;
}

/** Import up to `max` of an app's store screenshots as uploader frames. */
export async function importStoreScreenshots(
  app: StoreApp,
  max = 10,
  signal?: AbortSignal,
): Promise<UploadedImage[]> {
  const urls = app.screenshotUrls.slice(0, max);
  const frames = await Promise.all(
    urls.map(async (url, i): Promise<UploadedImage | null> => {
      const dataUrl = await assetToDataUrl(url, signal);
      if (!dataUrl) return null;
      return { id: `store-${app.storeAppId}-${i}`, name: `${app.title} ${i + 1}`, dataUrl };
    }),
  );
  return frames.filter((f): f is UploadedImage => f !== null);
}
