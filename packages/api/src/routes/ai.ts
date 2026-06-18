import { Hono } from "hono";
import { z } from "zod";

import {
  cachedGenerate,
  GeminiDailyQuotaError,
  GEMINI_BATCH_MODEL,
  generate,
  generateVisionRaw,
  hashInput,
  isGeminiConfigured,
} from "../lib/gemini.js";

/* ============================================================
   AI Studio endpoints — user-triggered, cache-through (ADR 0005's
   user-triggered exception): the same input never costs a second call.
   Both degrade cleanly: clients fall back to their deterministic path
   when these return 502/404.
   ============================================================ */

export const aiRouter = new Hono();

const artDirectionSchema = z.object({
  appId: z.string().nullish(),
  appName: z.string().min(1),
  category: z.string().nullish(),
  description: z.string().nullish(),
  prompt: z.string().nullish(),
  targetAudience: z.string().nullish(),
  brandKeywords: z.array(z.string()).default([]),
  appStoreKeywords: z.array(z.string()).default([]),
  style: z
    .enum([
      "modern",
      "editorial",
      "ios-native",
      "premium",
      "feature-focused",
      "minimal",
      "playful",
      "professional",
      "bold",
      "elegant",
    ])
    .default("modern"),
  count: z.number().int().min(1).max(10).default(6),
});

/**
 * Real art direction: Gemini writes the screenshot copy (headline + kicker
 * label per slide) from the listing intake. The deterministic engine still
 * does ALL rendering — this only replaces the derived-phrase copy heuristics.
 */
aiRouter.post("/art-direction", async (c) => {
  if (!isGeminiConfigured()) return c.json({ error: "AI not configured" }, 404);
  const parsed = artDirectionSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const input = parsed.data;

  const prompt = [
    `Write App Store screenshot copy for "${input.appName}" (${input.category ?? "app"}).`,
    `Style: ${input.style}. Audience: ${input.targetAudience || "general"}.`,
    input.description ? `Listing description: ${input.description.slice(0, 400)}` : "",
    input.prompt ? `Creative brief: ${input.prompt.slice(0, 200)}` : "",
    input.brandKeywords.length ? `Brand words to feature: ${input.brandKeywords.join(", ")}` : "",
    input.appStoreKeywords.length ? `ASO keywords: ${input.appStoreKeywords.join(", ")}` : "",
    "",
    `Return JSON: {"slides":[{"headline":"…","label":"…"}]} with exactly ${input.count} slides.`,
    "Headlines: max 6 words, punchy, benefit-led, no quotes/emoji. May contain \\n for an",
    "intentional two-line break. Labels: 1-2 word uppercase-friendly kickers.",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const subject = input.appId ?? input.appName.toLowerCase();
    const { output, cached } = await cachedGenerate(
      "art_direction",
      subject,
      hashInput(JSON.stringify(input)),
      async () => {
        try {
          return await generate(prompt, { json: true });
        } catch (e) {
          if (e instanceof GeminiDailyQuotaError) {
            return generate(prompt, { json: true, model: GEMINI_BATCH_MODEL });
          }
          throw e;
        }
      },
    );
    const body = JSON.parse(output.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")) as {
      slides: Array<{ headline: string; label: string }>;
    };
    return c.json({ data: { slides: body.slides.slice(0, input.count), cached } });
  } catch (e) {
    const status = e instanceof GeminiDailyQuotaError ? 502 : 500;
    return c.json({ error: e instanceof Error ? e.message : "generation failed" }, status);
  }
});

const translateSchema = z.object({
  /** base64 data URL of one source frame. */
  imageDataUrl: z.string().startsWith("data:image/"),
  /** Target language name, e.g. "German". */
  language: z.string().min(2),
  /** App-Store language/locale code, e.g. "DE" or "ZH-CN" — cache-key only. */
  countryCode: z.string().min(2).max(8),
});

/**
 * Real screenshot translation: Gemini vision reads the marketing text off the
 * frame and translates it. Returns text pairs — we never fake a re-rendered
 * image. Cached by image-hash + language, so re-runs are free.
 */
aiRouter.post("/translate-screenshot", async (c) => {
  if (!isGeminiConfigured()) return c.json({ error: "AI not configured" }, 404);
  const parsed = translateSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const { imageDataUrl, language, countryCode } = parsed.data;

  const match = /^data:(image\/[a-z+.-]+);base64,(.+)$/i.exec(imageDataUrl);
  if (!match) return c.json({ error: "invalid data URL" }, 400);
  const [, mimeType, base64] = match as unknown as [string, string, string];

  const instruction =
    `Extract every piece of visible marketing text from this app screenshot and translate it to ${language}. ` +
    `Return JSON: {"lines":[{"source":"…","translated":"…"}]} in reading order. ` +
    `Skip device UI chrome (clock, battery); include headlines, captions and button labels.`;

  try {
    const { output, cached } = await cachedGenerate(
      "translation",
      `${countryCode.toLowerCase()}:${language.toLowerCase()}`,
      hashInput(base64.slice(0, 4096) + language),
      () =>
        generateVision(instruction, { mimeType, base64 }),
    );
    const body = JSON.parse(output.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")) as {
      lines: Array<{ source: string; translated: string }>;
    };
    return c.json({ data: { lines: body.lines, cached } });
  } catch (e) {
    const status = e instanceof GeminiDailyQuotaError ? 502 : 500;
    return c.json({ error: e instanceof Error ? e.message : "translation failed" }, status);
  }
});

/* ============================================================
   App finder — Search the App Store / paste a store URL to pull a real
   listing into the AI Studio (autofill + import screenshots). Backed by the
   public iTunes Search/Lookup APIs; no key, no catalog scan.
   ============================================================ */

interface ItunesApp {
  trackId: number;
  trackName: string;
  artistName?: string;
  primaryGenreName?: string;
  artworkUrl512?: string;
  artworkUrl100?: string;
  description?: string;
  screenshotUrls?: string[];
  ipadScreenshotUrls?: string[];
  averageUserRating?: number;
  userRatingCount?: number;
}

function mapItunesApp(a: ItunesApp) {
  return {
    storeAppId: String(a.trackId),
    title: a.trackName,
    developer: a.artistName ?? "",
    category: a.primaryGenreName ?? null,
    iconUrl: a.artworkUrl512 ?? a.artworkUrl100 ?? null,
    description: a.description ?? null,
    rating: a.averageUserRating ?? null,
    reviewCount: a.userRatingCount ?? 0,
    screenshotUrls: [...(a.screenshotUrls ?? []), ...(a.ipadScreenshotUrls ?? [])],
  };
}

const appSearchSchema = z.object({
  q: z.string().trim().min(1).max(120),
  country: z.string().min(2).max(2).default("us"),
  limit: z.coerce.number().int().min(1).max(20).default(8),
});

/** App Store search by term (public iTunes Search API). */
aiRouter.get("/app-search", async (c) => {
  const parsed = appSearchSchema.safeParse(c.req.query());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const { q, country, limit } = parsed.data;
  const url = new URL("https://itunes.apple.com/search");
  url.searchParams.set("term", q);
  url.searchParams.set("entity", "software");
  url.searchParams.set("country", country.toLowerCase());
  url.searchParams.set("limit", String(limit));
  try {
    const res = await fetch(url);
    if (!res.ok) return c.json({ error: `store search failed (${res.status})` }, 502);
    const body = (await res.json()) as { results?: ItunesApp[] };
    return c.json({ data: (body.results ?? []).map(mapItunesApp) });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : "store search failed" }, 502);
  }
});

const appLookupSchema = z.object({
  /** A numeric App Store id, or a full App Store URL to extract it from. */
  id: z.string().trim().min(1).max(400),
  country: z.string().min(2).max(2).default("us"),
});

/** Full listing by id or pasted App Store URL (public iTunes Lookup API). */
aiRouter.get("/app-lookup", async (c) => {
  const parsed = appLookupSchema.safeParse(c.req.query());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const { id, country } = parsed.data;
  // Accept a raw id or any App Store URL containing /id<digits>.
  const storeId = (/\/id(\d+)/.exec(id)?.[1]) ?? (/^\d+$/.test(id) ? id : null);
  if (!storeId) return c.json({ error: "no App Store id found in input" }, 400);
  const url = `https://itunes.apple.com/lookup?id=${storeId}&country=${country.toLowerCase()}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return c.json({ error: `store lookup failed (${res.status})` }, 502);
    const body = (await res.json()) as { results?: ItunesApp[] };
    const app = body.results?.[0];
    if (!app) return c.json({ error: "app not found" }, 404);
    return c.json({ data: mapItunesApp(app) });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : "store lookup failed" }, 502);
  }
});

// Allow-list of store CDN hosts the asset proxy may fetch (prevents SSRF).
const ASSET_HOSTS = /(^|\.)mzstatic\.com$|(^|\.)apple\.com$|(^|\.)googleusercontent\.com$/i;

/**
 * Same-origin proxy for store screenshot/icon assets so the client can import
 * them as data URLs without CORS. Host-allow-listed to store CDNs only.
 */
aiRouter.get("/store-asset", async (c) => {
  const raw = c.req.query("url");
  if (!raw) return c.json({ error: "url required" }, 400);
  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return c.json({ error: "invalid url" }, 400);
  }
  if (target.protocol !== "https:" || !ASSET_HOSTS.test(target.hostname)) {
    return c.json({ error: "host not allowed" }, 403);
  }
  try {
    const res = await fetch(target);
    if (!res.ok) return c.json({ error: `asset fetch failed (${res.status})` }, 502);
    const type = res.headers.get("content-type") ?? "image/png";
    if (!type.startsWith("image/")) return c.json({ error: "not an image" }, 415);
    const buf = await res.arrayBuffer();
    return c.body(buf, 200, { "content-type": type, "cache-control": "public, max-age=86400" });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : "asset fetch failed" }, 502);
  }
});

/* Vision variant — batch-model fallback mirrors the About endpoint. */
async function generateVision(
  instruction: string,
  image: { mimeType: string; base64: string },
): Promise<string> {
  try {
    return await generateVisionRaw(instruction, image);
  } catch (e) {
    if (e instanceof GeminiDailyQuotaError) {
      return generateVisionRaw(instruction, image, GEMINI_BATCH_MODEL);
    }
    throw e;
  }
}
