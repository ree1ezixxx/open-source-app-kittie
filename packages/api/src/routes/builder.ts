import {
  buildBlueprintFromPrompt,
  fromBlueprintExpo,
  heuristicRevise,
  reviseBlueprint,
  type AppBlueprint,
} from "@kittie/clone-engine";
import {
  addBuilderMessage,
  createBuilderProject,
  deleteBuilderProject,
  getBuilderProject,
  listBuilderMessages,
  listBuilderProjects,
  updateBuilderProjectBlueprint,
} from "@kittie/db";
import { zipSync } from "fflate";
import { Hono } from "hono";
import { z } from "zod";

import { getDb } from "../lib/db.js";
import { generateJson, isGeminiConfigured } from "../lib/gemini.js";

/* ============================================================
   App Builder (Rork-style) endpoints.

   POST   /api/v1/builder/projects               { prompt } -> new project
   GET    /api/v1/builder/projects               -> project list
   GET    /api/v1/builder/projects/:id           -> project + messages + files
   DELETE /api/v1/builder/projects/:id
   POST   /api/v1/builder/projects/:id/messages  { content } -> revised app

   Blueprints persist; files are regenerated deterministically on read.
   With no Gemini key everything still works via the heuristic engine, and
   no-op revisions are SURFACED, never silently swallowed.
   ============================================================ */

export const builderRouter = new Hono();

const gen = isGeminiConfigured()
  ? (prompt: string, schema: Record<string, unknown>) =>
      generateJson<unknown>(prompt, { responseSchema: schema, priority: "user" })
  : undefined;

const engine = (): "gemini" | "heuristic" => (isGeminiConfigured() ? "gemini" : "heuristic");

function projectPayload(project: { id: string; name: string; prompt: string; blueprintJson: string; engine: string; createdAt: Date; updatedAt: Date }) {
  const blueprint = JSON.parse(project.blueprintJson) as AppBlueprint;
  const result = fromBlueprintExpo(blueprint);
  return {
    id: project.id,
    name: project.name,
    prompt: project.prompt,
    engine: project.engine,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    blueprint,
    projectName: result.projectName,
    files: result.files,
    buildCommands: result.buildCommands,
  };
}

const createSchema = z.object({ prompt: z.string().trim().min(3).max(2000) });

builderRouter.post("/projects", async (c) => {
  const parsed = createSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const { prompt } = parsed.data;

  const blueprint = await buildBlueprintFromPrompt(prompt, gen);
  const db = getDb();
  const project = await createBuilderProject(db, {
    name: blueprint.appName,
    prompt,
    blueprintJson: JSON.stringify(blueprint),
    engine: engine(),
  });
  await addBuilderMessage(db, { projectId: project.id, role: "user", content: prompt });
  await addBuilderMessage(db, {
    projectId: project.id,
    role: "assistant",
    content: assistantSummary(blueprint, null),
    blueprintJson: JSON.stringify(blueprint),
  });
  return c.json({ data: projectPayload(project) }, 201);
});

builderRouter.get("/projects", async (c) => {
  const rows = await listBuilderProjects(getDb());
  return c.json({
    data: rows.map((p) => ({
      id: p.id,
      name: p.name,
      prompt: p.prompt,
      engine: p.engine,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    })),
  });
});

builderRouter.get("/projects/:id", async (c) => {
  const db = getDb();
  const project = await getBuilderProject(db, c.req.param("id"));
  if (!project) return c.json({ error: "Project not found" }, 404);
  const messages = await listBuilderMessages(db, project.id);
  return c.json({
    data: {
      ...projectPayload(project),
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        createdAt: m.createdAt,
      })),
      aiConfigured: isGeminiConfigured(),
    },
  });
});

builderRouter.delete("/projects/:id", async (c) => {
  const db = getDb();
  const project = await getBuilderProject(db, c.req.param("id"));
  if (!project) return c.json({ error: "Project not found" }, 404);
  await deleteBuilderProject(db, project.id);
  return c.json({ data: { deleted: project.id } });
});

const messageSchema = z.object({ content: z.string().trim().min(2).max(1000) });

builderRouter.post("/projects/:id/messages", async (c) => {
  const db = getDb();
  const project = await getBuilderProject(db, c.req.param("id"));
  if (!project) return c.json({ error: "Project not found" }, 404);

  const parsed = messageSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const { content } = parsed.data;

  const current = JSON.parse(project.blueprintJson) as AppBlueprint;
  const revised = gen
    ? await reviseBlueprint(current, content, gen)
    : heuristicRevise(current, content);

  const changed = JSON.stringify(revised) !== JSON.stringify(current);
  await addBuilderMessage(db, { projectId: project.id, role: "user", content });

  let reply: string;
  if (changed) {
    await updateBuilderProjectBlueprint(db, project.id, {
      name: revised.appName,
      blueprintJson: JSON.stringify(revised),
      engine: engine(),
    });
    reply = assistantSummary(revised, current);
  } else {
    // Honest no-op: never pretend a change landed.
    reply = gen
      ? "I couldn't map that instruction to a change in the app. Try being more specific — e.g. \"add a stats tab\", \"make the accent #FF375F\", or \"rename it to Pulse\"."
      : "Offline mode handles: add/remove a tab, rename the app, and accent color changes (named or #RRGGBB). For free-form changes, configure GEMINI_API_KEY.";
  }
  const assistant = await addBuilderMessage(db, {
    projectId: project.id,
    role: "assistant",
    content: reply,
    blueprintJson: changed ? JSON.stringify(revised) : undefined,
  });

  const fresh = await getBuilderProject(db, project.id);
  return c.json({
    data: {
      ...projectPayload(fresh ?? project),
      changed,
      reply: { id: assistant.id, role: "assistant", content: reply, createdAt: assistant.createdAt },
    },
  });
});

/** Human summary of what the app now is / what changed. */
function assistantSummary(b: AppBlueprint, prev: AppBlueprint | null): string {
  if (!prev) {
    const tabList = b.tabs.map((t) => `${t.title} (${t.kind})`).join(", ");
    return `Generated **${b.appName}** — ${b.tagline}. Screens: ${tabList}. Accent ${b.accentHex}. Preview it on the right, or open the Code tab to see the Expo project.`;
  }
  const changes: string[] = [];
  if (prev.appName !== b.appName) changes.push(`renamed to **${b.appName}**`);
  if (prev.accentHex !== b.accentHex) changes.push(`accent → ${b.accentHex}`);
  const prevTitles = new Set(prev.tabs.map((t) => t.title));
  const nextTitles = new Set(b.tabs.map((t) => t.title));
  for (const t of b.tabs) if (!prevTitles.has(t.title)) changes.push(`added **${t.title}** (${t.kind})`);
  for (const t of prev.tabs) if (!nextTitles.has(t.title)) changes.push(`removed **${t.title}**`);
  if (!changes.length) changes.push("updated the app");
  return `Done — ${changes.join(", ")}. The preview and code are updated.`;
}

/* Real project export: a zip of the regenerated files. */
builderRouter.get("/projects/:id/zip", async (c) => {
  const project = await getBuilderProject(getDb(), c.req.param("id"));
  if (!project) return c.json({ error: "Project not found" }, 404);
  const blueprint = JSON.parse(project.blueprintJson) as AppBlueprint;
  const result = fromBlueprintExpo(blueprint);
  const entries: Record<string, Uint8Array> = {};
  for (const f of result.files) {
    entries[`${result.projectName}/${f.path}`] = new TextEncoder().encode(f.contents);
  }
  const zip = zipSync(entries, { level: 6 });
  return new Response(new Uint8Array(zip), {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${result.projectName}.zip"`,
    },
  });
});
