import { getAppRowById, getSnapshotContext } from "@kittie/db";

import { getDb } from "../lib/db.js";
import {
  cachedGenerate,
  GeminiDailyQuotaError,
  GEMINI_BATCH_MODEL,
  generate,
  isGeminiConfigured,
} from "../lib/gemini.js";

/* ============================================================
   AI "About" narrative (App Detail parity): lazy-on-view — the first
   open of a detail page costs ONE Gemini call, the result is cached
   forever (descriptive, not time-sensitive; ADR 0005's one allowed
   exception to batch generation). Only apps actually viewed cost a call.
   ============================================================ */

export async function getAppAbout(
  appId: string,
): Promise<{ about: string; cached: boolean } | null> {
  if (!isGeminiConfigured()) return null;

  const db = getDb();
  const app = await getAppRowById(db, appId);
  if (!app) return null;

  const ctx = await getSnapshotContext(db, appId, "7d");
  const latest = ctx?.latest;

  const prompt = [
    "Write a SHORT analyst note (1-2 sentences, ≤40 words) about this app for an",
    "app-intelligence dashboard. Plain, factual, third person — NO hype or filler words",
    "(seamless, powerful, comprehensive, cutting-edge). Say only: what it does, who it's for,",
    "and how it monetizes. Metrics are estimates ('an estimated…'), never reported figures.",
    "One short paragraph, no headings, no lists.",
    "",
    `App: ${app.title} (${app.store === "apple" ? "App Store" : "Google Play"})`,
    `Developer: ${app.developer}`,
    `Category: ${app.category ?? "Unknown"}`,
    `Price: ${app.price ? `$${app.price}` : "free"}`,
    latest ? `Rating: ${latest.rating ?? "n/a"} from ${latest.reviewCount} reviews` : "",
    latest?.revenueEstimate ? `Estimated monthly revenue: $${latest.revenueEstimate}` : "",
    latest?.downloadsEstimate ? `Estimated downloads: ${latest.downloadsEstimate}` : "",
    app.description ? `Listing description: ${app.description.slice(0, 500)}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  // Input key is a version tag, not the prompt: About never regenerates.
  // Falls back to the batch model when flash's daily bucket is dry — a
  // slightly plainer narrative beats an empty block.
  const { output, cached } = await cachedGenerate("app_about", appId, "v2-concise", async () => {
    try {
      return await generate(prompt);
    } catch (e) {
      if (e instanceof GeminiDailyQuotaError) {
        return generate(prompt, { model: GEMINI_BATCH_MODEL });
      }
      throw e;
    }
  });
  return { about: output.trim(), cached };
}
