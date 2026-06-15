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
    parentProjectId: null,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(builderProjects).values(row);
  return row;
}

/**
 * Clone a project (PRD §4.4): new project row (smart "copy" suffix, same
 * prompt/engine, deep-copied blueprint, parentProjectId set) plus a verbatim
 * copy of every message (fresh ids, preserved order/roles/blueprint/runJson).
 * Workspace + node_modules are handled by the caller; this is pure DB.
 */
export async function cloneBuilderProject(db: Db, sourceId: string): Promise<BuilderProject | null> {
  const source = await getBuilderProject(db, sourceId);
  if (!source) return null;

  const existing = await listBuilderProjects(db);
  const name = nextCopyName(source.name, existing.map((p) => p.name));

  const now = new Date();
  const cloned: BuilderProject = {
    id: randomUUID(),
    name,
    prompt: source.prompt,
    // Deep copy via JSON round-trip so the clone never shares the blueprint object.
    blueprintJson: JSON.stringify(JSON.parse(source.blueprintJson)),
    engine: source.engine,
    parentProjectId: source.id,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(builderProjects).values(cloned);

  // Copy the chat history verbatim (fresh ids, original timestamps preserved so
  // ordering travels). Insert in createdAt order.
  const messages = await listBuilderMessages(db, source.id);
  for (const m of messages) {
    await db.insert(builderMessages).values({
      id: randomUUID(),
      projectId: cloned.id,
      role: m.role,
      content: m.content,
      blueprintJson: m.blueprintJson,
      runJson: m.runJson,
      createdAt: m.createdAt,
    });
  }
  return cloned;
}

/** "Pulse" -> "Pulse copy"; "Pulse copy" -> "Pulse copy 2"; avoids collisions. */
function nextCopyName(baseName: string, existing: string[]): string {
  const stem = baseName.replace(/ copy(?: \d+)?$/, "");
  const taken = new Set(existing);
  const first = `${stem} copy`;
  if (!taken.has(first)) return first;
  for (let n = 2; ; n++) {
    const candidate = `${stem} copy ${n}`;
    if (!taken.has(candidate)) return candidate;
  }
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
  input: { projectId: string; role: "user" | "assistant"; content: string; blueprintJson?: string; runJson?: string },
): Promise<BuilderMessage> {
  const row = {
    id: randomUUID(),
    projectId: input.projectId,
    role: input.role,
    content: input.content,
    blueprintJson: input.blueprintJson ?? null,
    runJson: input.runJson ?? null,
    createdAt: new Date(),
  };
  await db.insert(builderMessages).values(row);
  return row;
}

/** Patch an assistant message's content in place (used to note self-repairs). */
export async function updateBuilderMessageContent(db: Db, id: string, content: string): Promise<void> {
  await db.update(builderMessages).set({ content }).where(eq(builderMessages.id, id));
}

/** Patch an assistant message's run transcript in place (e.g. append a Visual
 *  QA step once the post-message QA phase finishes). */
export async function updateBuilderMessageRun(db: Db, id: string, runJson: string): Promise<void> {
  await db.update(builderMessages).set({ runJson }).where(eq(builderMessages.id, id));
}

export async function listBuilderMessages(db: Db, projectId: string): Promise<BuilderMessage[]> {
  return db
    .select()
    .from(builderMessages)
    .where(eq(builderMessages.projectId, projectId))
    .orderBy(builderMessages.createdAt);
}
