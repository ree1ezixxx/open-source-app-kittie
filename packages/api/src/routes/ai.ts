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
  style: z.enum(["bold", "minimal", "playful", "premium"]).default("minimal"),
  count: z.number().int().min(1).max(10).default(5),
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
  countryCode: z.string().min(2).max(2),
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
