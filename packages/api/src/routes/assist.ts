import { Hono } from "hono";
import { z } from "zod";
import { ideasTableExists } from "@kittie/db";

import { getDb } from "../lib/db.js";
import { answerResearchQuestion } from "../services/chat-service.js";
import { buildPrd, listIdeaCards } from "../services/idea-prd-service.js";
import { ideaGenStatus, runIdeaGeneration } from "../services/idea-generator-service.js";
import { seamStatus } from "../services/llm-seam.js";

/* ============================================================
   Assist routes — the LLM-seam consumers (research chat,
   Idea → PRD bridge, autonomous Hot Ideas generator) plus seam
   status for honest UI gating.
   ============================================================ */

export const assistRouter = new Hono();

assistRouter.get("/status", async (c) => {
  const ideasAvailable = await ideasTableExists(getDb());
  const generator = await ideaGenStatus();
  return c.json({ data: { ...seamStatus(), ideasAvailable, generator } });
});

const chatSchema = z.object({ question: z.string().min(3).max(2000) });

assistRouter.post("/chat", async (c) => {
  const parsed = chatSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const answer = await answerResearchQuestion(parsed.data.question);
  return c.json({ data: answer });
});

assistRouter.get("/ideas", async (c) => {
  const search = c.req.query("search") ?? undefined;
  const [result, generator] = await Promise.all([listIdeaCards(search), ideaGenStatus()]);
  return c.json({ data: { ...result, generator } });
});

const prdSchema = z.object({ ideaId: z.string().min(1) });

assistRouter.post("/idea-prd", async (c) => {
  const parsed = prdSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const result = await buildPrd(parsed.data.ideaId);
  if (!result.available) return c.json({ error: "Idea not found" }, 404);
  return c.json({ data: result });
});

/** Manual trigger for the autonomous generator — same path the daily sweep
    runs, exposed so a fresh batch can be pulled on demand. Dormant (no-op)
    when GEMINI_API_KEY is unset; the response says so honestly. */
const generateSchema = z.object({ limit: z.number().int().min(1).max(20).optional() });

assistRouter.post("/generate-ideas", async (c) => {
  let body: unknown = {};
  try {
    body = await c.req.json();
  } catch {
    /* empty body is fine */
  }
  const parsed = generateSchema.safeParse(body ?? {});
  const limit = parsed.success ? parsed.data.limit : undefined;
  const result = await runIdeaGeneration({ limit });
  return c.json({ data: result });
});
