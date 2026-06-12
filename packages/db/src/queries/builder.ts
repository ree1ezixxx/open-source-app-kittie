import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import type { Db } from "../client.js";
import {
  builderMessages,
  builderProjects,
  type BuilderMessage,
  type BuilderProject,
} from "../schema.js";

/* Builder project + chat persistence. Blueprints are stored as JSON on the
   project (current) and on each assistant message (history); generated files
   are always re-derived from the blueprint, never stored. */

export async function createBuilderProject(
  db: Db,
  input: { name: string; prompt: string; blueprintJson: string; engine: "ollama" | "gemini" | "heuristic" },
): Promise<BuilderProject> {
  const now = new Date();
  const row = {
    id: randomUUID(),
    name: input.name,
    prompt: input.prompt,
    blueprintJson: input.blueprintJson,
    engine: input.engine,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(builderProjects).values(row);
  return row;
}

export async function listBuilderProjects(db: Db): Promise<BuilderProject[]> {
  return db.select().from(builderProjects).orderBy(desc(builderProjects.updatedAt));
}

export async function getBuilderProject(db: Db, id: string): Promise<BuilderProject | null> {
  const [row] = await db.select().from(builderProjects).where(eq(builderProjects.id, id)).limit(1);
  return row ?? null;
}

export async function updateBuilderProjectBlueprint(
  db: Db,
  id: string,
  input: { name: string; blueprintJson: string; engine: "ollama" | "gemini" | "heuristic" },
): Promise<void> {
  await db
    .update(builderProjects)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(builderProjects.id, id));
}

export async function deleteBuilderProject(db: Db, id: string): Promise<void> {
  await db.delete(builderProjects).where(eq(builderProjects.id, id));
}

export async function addBuilderMessage(
  db: Db,
  input: { projectId: string; role: "user" | "assistant"; content: string; blueprintJson?: string },
): Promise<BuilderMessage> {
  const row = {
    id: randomUUID(),
    projectId: input.projectId,
    role: input.role,
    content: input.content,
    blueprintJson: input.blueprintJson ?? null,
    createdAt: new Date(),
  };
  await db.insert(builderMessages).values(row);
  return row;
}

export async function listBuilderMessages(db: Db, projectId: string): Promise<BuilderMessage[]> {
  return db
    .select()
    .from(builderMessages)
    .where(eq(builderMessages.projectId, projectId))
    .orderBy(builderMessages.createdAt);
}
