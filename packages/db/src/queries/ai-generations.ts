import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { Db } from "../client.js";
import { aiGenerations, type AiGeneration } from "../schema.js";

/**
 * Cache reads/writes for AI-generated artifacts. Generated once, read forever
 * (ADR 0005): a row is keyed by kind + subject + input hash, so the same input
 * never costs a second model call, and a changed input naturally misses.
 */
export async function getAiGeneration(
  db: Db,
  kind: string,
  subjectId: string,
  inputHash: string,
): Promise<AiGeneration | null> {
  const [row] = await db
    .select()
    .from(aiGenerations)
    .where(
      and(
        eq(aiGenerations.kind, kind),
        eq(aiGenerations.subjectId, subjectId),
        eq(aiGenerations.inputHash, inputHash),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function saveAiGeneration(
  db: Db,
  entry: { kind: string; subjectId: string; inputHash: string; output: string; model: string },
): Promise<AiGeneration> {
  const row: AiGeneration = {
    id: randomUUID(),
    ...entry,
    createdAt: new Date(),
  };
  await db
    .insert(aiGenerations)
    .values(row)
    .onConflictDoUpdate({
      target: [aiGenerations.kind, aiGenerations.subjectId, aiGenerations.inputHash],
      set: { output: entry.output, model: entry.model, createdAt: row.createdAt },
    });
  return row;
}
