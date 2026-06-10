import { Hono } from "hono";
import { z } from "zod";
import { ideasTableExists } from "@kittie/db";

import { getDb } from "../lib/db.js";
import { answerResearchQuestion } from "../services/chat-service.js";
import { buildPrd, listIdeas } from "../services/idea-prd-service.js";
import { seamStatus } from "../services/llm-seam.js";

/* ============================================================
   Assist routes — the LLM-seam consumers (research chat,
   Idea → PRD bridge) plus seam status for honest UI gating.
   ============================================================ */

export const assistRouter = new Hono();

assistRouter.get("/status", async (c) => {
  const ideasAvailable = await ideasTableExists(getDb());
  return c.json({ data: { ...seamStatus(), ideasAvailable } });
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
  const result = await listIdeas(search);
  return c.json({ data: result });
});

const prdSchema = z.object({ ideaId: z.string().min(1) });

assistRouter.post("/idea-prd", async (c) => {
  const parsed = prdSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const result = await buildPrd(parsed.data.ideaId);
  if (!result.available) return c.json({ error: "Idea not found" }, 404);
  return c.json({ data: result });
});
