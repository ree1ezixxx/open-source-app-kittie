/**
 * `teardown_app` routes (Lane B) — compute-on-request product blueprint.
 *   GET  /api/v1/app-intelligence/apps/:id/teardown[?depth=quick|standard|deep]
 *   POST /api/v1/app-intelligence/teardown          { appId, depth? }
 *
 * Backend synthesis only (Lane C owns the canvas). `quick` is deterministic and
 * LLM-free; `standard`/`deep` enrichment lands in later loops. Never fabricates —
 * blocked sources surface in `decisionPacket.coverage.missing`.
 */
import { Hono } from "hono";
import { z } from "zod";
import { buildTeardownApp, TEARDOWN_DEPTHS, type TeardownDepth } from "@kittie/intelligence";
import { getAppById, getAppReviews } from "../../services/app-service.js";

export const teardownRouter = new Hono();

function parseDepth(raw: string | undefined): TeardownDepth {
  return (TEARDOWN_DEPTHS as readonly string[]).includes(raw ?? "")
    ? (raw as TeardownDepth)
    : "quick";
}

/** Reviews are best-effort — a teardown is honest without them (reviewInsights → missing). */
async function safeReviews(id: string) {
  try {
    return await getAppReviews(id);
  } catch {
    return [];
  }
}

async function teardown(id: string, depth: TeardownDepth) {
  const app = await getAppById(id);
  if (!app) return null;
  const reviews = await safeReviews(id);
  return buildTeardownApp({ app, reviews, depth, observedAt: new Date().toISOString() });
}

teardownRouter.get("/apps/:id/teardown", async (c) => {
  const result = await teardown(c.req.param("id"), parseDepth(c.req.query("depth")));
  if (!result) return c.json({ error: "App not found" }, 404);
  return c.json({ data: result });
});

const teardownRequestSchema = z.object({
  appId: z.string().min(1),
  depth: z.enum(["quick", "standard", "deep"]).optional(),
});

teardownRouter.post("/teardown", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = teardownRequestSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const result = await teardown(parsed.data.appId, parsed.data.depth ?? "quick");
  if (!result) return c.json({ error: "App not found" }, 404);
  return c.json({ data: result });
});
