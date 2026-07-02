/**
 * `teardown_app` routes (Lane B) — compute-on-request product blueprint.
 *   GET  /api/v1/app-intelligence/apps/:id/teardown[?depth=quick|standard|deep]
 *   POST /api/v1/app-intelligence/teardown          { appId, depth? }
 *
 * Backend synthesis only (Lane C owns the canvas). `quick` is deterministic and
 * LLM-free; `standard` adds a cached local-LLM narrative (degrades to quick if
 * the model is down). Never fabricates — blocked sources surface in
 * `decisionPacket.coverage.missing`. Orchestration lives in the service.
 *
 * Response is the canonical #180 `IntelligenceResponseEnvelope`, wrapped as
 * `{ data: envelope }` (see docs/contracts/intelligence-responses.md). The
 * untouched teardown blueprint is `envelope.data`; the DecisionPacket keeps its
 * own confidence/evidence verbatim inside it, while the envelope surfaces the
 * shared confidence/evidence/caveats/status fields.
 */
import { Hono } from "hono";
import { z } from "zod";
import {
  TEARDOWN_DEPTHS,
  buildIntelligenceResponse,
  type TeardownAppOutput,
  type TeardownDepth,
} from "@kittie/intelligence";
import { getAppTeardown } from "../../services/teardown-service.js";
import {
  missingToSources,
  packetEvidenceToIntelligence,
  toIntelligenceConfidence,
} from "../../services/intelligence-envelope.js";

export const teardownRouter = new Hono();

function parseDepth(raw: string | undefined): TeardownDepth {
  return (TEARDOWN_DEPTHS as readonly string[]).includes(raw ?? "") ? (raw as TeardownDepth) : "quick";
}

/** Lift a raw teardown blueprint into the shared intelligence envelope. */
function toTeardownEnvelope(appId: string, depth: TeardownDepth, result: TeardownAppOutput) {
  const packet = result.decisionPacket;
  return buildIntelligenceResponse({
    responseType: "teardown",
    data: result,
    evidence: packetEvidenceToIntelligence(packet.evidence, result.identity.store),
    confidence: toIntelligenceConfidence(packet.confidence),
    missingSources: missingToSources(packet.coverage.missing),
    metadata: {
      generatedAt: new Date().toISOString(),
      sourceQuery: { appId, depth },
      snapshotId: packet.snapshotId,
      chartCountry: null,
      growthPeriod: null,
      modelVersion: null,
    },
  });
}

teardownRouter.get("/apps/:id/teardown", async (c) => {
  const appId = c.req.param("id");
  const depth = parseDepth(c.req.query("depth"));
  const result = await getAppTeardown(appId, depth);
  if (!result) return c.json({ error: "App not found" }, 404);
  return c.json({ data: toTeardownEnvelope(appId, depth, result) });
});

const teardownRequestSchema = z.object({
  appId: z.string().min(1),
  depth: z.enum(["quick", "standard", "deep"]).optional(),
});

teardownRouter.post("/teardown", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = teardownRequestSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const depth = parsed.data.depth ?? "quick";
  const result = await getAppTeardown(parsed.data.appId, depth);
  if (!result) return c.json({ error: "App not found" }, 404);
  return c.json({ data: toTeardownEnvelope(parsed.data.appId, depth, result) });
});
