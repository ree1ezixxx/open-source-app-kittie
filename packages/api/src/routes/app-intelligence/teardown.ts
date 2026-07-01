/**
 * `teardown_app` routes (Lane B) — compute-on-request product blueprint.
 *   GET  /api/v1/app-intelligence/apps/:id/teardown[?depth=quick|standard|deep]
 *   POST /api/v1/app-intelligence/teardown          { appId, depth? }
 *
 * Backend synthesis only (Lane C owns the canvas). `quick` is deterministic and
 * LLM-free; `standard` adds a cached local-LLM narrative (degrades to quick if
 * the model is down). Never fabricates — blocked sources surface in
 * `decisionPacket.coverage.missing`. Orchestration lives in the service.
 */
import { Hono } from "hono";
import { z } from "zod";
import { TEARDOWN_DEPTHS, type TeardownDepth } from "@kittie/intelligence";
import { getAppTeardown } from "../../services/teardown-service.js";

export const teardownRouter = new Hono();

function parseDepth(raw: string | undefined): TeardownDepth {
  return (TEARDOWN_DEPTHS as readonly string[]).includes(raw ?? "") ? (raw as TeardownDepth) : "quick";
}

teardownRouter.get("/apps/:id/teardown", async (c) => {
  const result = await getAppTeardown(c.req.param("id"), parseDepth(c.req.query("depth")));
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
  const result = await getAppTeardown(parsed.data.appId, parsed.data.depth ?? "quick");
  if (!result) return c.json({ error: "App not found" }, 404);
  return c.json({ data: result });
});
