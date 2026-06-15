import {
  fromBlueprint,
  generateBlueprint,
  type CloneSource,
  validateBlueprint,
} from "@kittie/clone-engine";
import { Hono } from "hono";
import { z } from "zod";

import { cachedGenerate, generateJson, hashInput, isGeminiConfigured } from "../lib/gemini.js";
import { getAppById } from "../services/app-service.js";

/* ============================================================
   iOS Clone Engine endpoint.

   POST /api/v1/clone/ios  { appId }
     -> fetch the trending app's listing
     -> Gemini designs a validated blueprint (cached per app+listing hash)
     -> deterministic SwiftUI codegen renders a buildable xcodegen project
     -> returns { blueprint, projectName, files[], buildCommands }

   The agent/CLI writes `files` to disk and runs `buildCommands`. Degrades
   cleanly: with no Gemini key it still returns a valid fallback scaffold.
   ============================================================ */

export const cloneRouter = new Hono();

const bodySchema = z.object({ appId: z.string().min(1) });

/** The Gemini JSON call the engine needs, shaped to its GenerateJson type. */
const gen = (prompt: string, schema: Record<string, unknown>) =>
  generateJson<unknown>(prompt, { responseSchema: schema, priority: "user" });

cloneRouter.post("/ios", async (c) => {
  const parsed = bodySchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const app = await getAppById(parsed.data.appId);
  if (!app) return c.json({ error: "App not found" }, 404);

  const src: CloneSource = {
    id: app.id,
    title: app.title,
    developer: app.developer,
    category: app.category,
    description: app.description,
    screenshotUrls: app.screenshotUrls,
  };

  try {
    // Cache the (expensive) blueprint per app + listing fingerprint. Codegen is
    // deterministic, so re-rendering from a cached blueprint is free.
    const { output, cached } = await cachedGenerate(
      "ios_clone",
      app.id,
      hashInput(JSON.stringify({ t: src.title, d: src.description, c: src.category })),
      async () => JSON.stringify(await generateBlueprint(src, gen)),
    );
    const blueprint = validateBlueprint(JSON.parse(output), src);
    const result = fromBlueprint(blueprint);
    return c.json({
      data: {
        appId: app.id,
        sourceTitle: app.title,
        projectName: result.projectName,
        blueprint: result.blueprint,
        files: result.files,
        buildCommands: result.buildCommands,
        aiGenerated: isGeminiConfigured(),
        cached,
      },
    });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : "clone generation failed" }, 500);
  }
});
