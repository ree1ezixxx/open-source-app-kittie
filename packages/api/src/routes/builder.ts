import {
  buildBlueprintFromPrompt,
  fromBlueprintExpo,
  fromBlueprintXcode,
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
import { streamSSE } from "hono/streaming";
import { randomUUID } from "node:crypto";
import { z } from "zod";

import { getDb } from "../lib/db.js";
import { generateJson, isGeminiConfigured } from "../lib/gemini.js";
import { generateJsonOllama, isOllamaAvailable, OLLAMA_MODEL } from "../lib/ollama.js";
import { getPreview, startPreview, stopPreview, toView } from "../lib/preview.js";
import {
  bufferedEvents,
  emitRunEvent,
  isRunEnded,
  subscribe,
  type RunEvent,
} from "../lib/run-events.js";
import { pruneRuns, readWorkspaceTree, syncWorkspace, workspaceRoot } from "../lib/workspace.js";

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

/* Engine resolution per request: local Ollama first, then Gemini, then the
   deterministic heuristic. Resolved lazily so Ollama coming up/down mid-
   session is picked up (the probe is cached ~30s). */
type EngineKind = "ollama" | "gemini" | "heuristic";
type Gen = (prompt: string, schema: Record<string, unknown>) => Promise<unknown>;

async function resolveEngine(): Promise<{ kind: EngineKind; gen?: Gen }> {
  if (await isOllamaAvailable()) return { kind: "ollama", gen: generateJsonOllama };
  if (isGeminiConfigured()) {
    return {
      kind: "gemini",
      gen: (prompt, schema) => generateJson<unknown>(prompt, { responseSchema: schema, priority: "user" }),
    };
  }
  return { kind: "heuristic" };
}

function projectPayload(project: { id: string; name: string; prompt: string; blueprintJson: string; engine: string; createdAt: Date; updatedAt: Date }) {
  const blueprint = JSON.parse(project.blueprintJson) as AppBlueprint;
  const result = fromBlueprintExpo(blueprint);
  const xcode = fromBlueprintXcode(blueprint);
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
    swiftProjectName: xcode.projectName,
    swiftFiles: xcode.files,
  };
}

/* ---- agent run: the structured transcript behind each assistant turn ---- */

interface AgentRun {
  engine: string;
  plan: string;
  todos: { label: string; done: boolean }[];
  steps: { label: string }[];
  changedFiles: string[];
}

/** Human-readable change list between two blueprints. */
function blueprintChanges(prev: AppBlueprint, next: AppBlueprint): string[] {
  const changes: string[] = [];
  if (prev.appName !== next.appName) changes.push(`renamed to **${next.appName}**`);
  if (prev.accentHex !== next.accentHex) changes.push(`accent → ${next.accentHex}`);
  if (prev.tagline !== next.tagline) changes.push(`tagline → “${next.tagline}”`);
  const prevTitles = new Set(prev.tabs.map((t) => t.title));
  const nextTitles = new Set(next.tabs.map((t) => t.title));
  for (const t of next.tabs) if (!prevTitles.has(t.title)) changes.push(`added **${t.title}** (${t.kind})`);
  for (const t of prev.tabs) if (!nextTitles.has(t.title)) changes.push(`removed **${t.title}**`);
  for (const t of next.tabs) {
    const p = prev.tabs.find((x) => x.title === t.title);
    if (!p) continue;
    if (p.headline !== t.headline) changes.push(`**${t.title}** headline → “${t.headline}”`);
    else if (p.subhead !== t.subhead) changes.push(`**${t.title}** subhead → “${t.subhead}”`);
    else if (JSON.stringify(p.items) !== JSON.stringify(t.items)) changes.push(`updated **${t.title}** content`);
  }
  return changes;
}

/** Which generated files differ between two blueprints' codegen output. */
function changedFilePaths(prev: AppBlueprint | null, next: AppBlueprint): string[] {
  const nextFiles = fromBlueprintExpo(next).files;
  if (!prev) return nextFiles.map((f) => f.path);
  const prevByPath = new Map(fromBlueprintExpo(prev).files.map((f) => [f.path, f.contents]));
  return nextFiles.filter((f) => prevByPath.get(f.path) !== f.contents).map((f) => f.path);
}

function buildRun(kind: EngineKind, prev: AppBlueprint | null, next: AppBlueprint, changed: boolean): AgentRun {
  const engine = kind === "ollama" ? `Ollama · ${OLLAMA_MODEL}` : kind === "gemini" ? "Gemini" : "Offline engine";
  if (!prev) {
    const files = changedFilePaths(null, next);
    return {
      engine,
      plan: `Design **${next.appName}** — ${next.tagline}`,
      todos: next.tabs.map((t) => ({ label: `${t.title} screen (${t.kind})`, done: true })),
      steps: [
        { label: "Created plan" },
        { label: `Designed ${next.tabs.length} screens` },
        { label: `Generated ${files.length} files` },
        { label: "Validated blueprint" },
      ],
      changedFiles: files,
    };
  }
  const changes = blueprintChanges(prev, next);
  const files = changed ? changedFilePaths(prev, next) : [];
  return {
    engine,
    plan: changed ? `Apply: ${changes.join(", ")}` : "No change required",
    todos: changes.map((c) => ({ label: c.replace(/\*\*/g, ""), done: true })),
    steps: changed
      ? [
          { label: "Read current blueprint" },
          { label: `Applied ${changes.length} change${changes.length === 1 ? "" : "s"}` },
          { label: `Regenerated ${files.length} file${files.length === 1 ? "" : "s"}` },
          { label: "Validated blueprint" },
        ]
      : [{ label: "Read current blueprint" }, { label: "No applicable change found" }],
    changedFiles: files,
  };
}

const createSchema = z.object({ prompt: z.string().trim().min(3).max(2000) });

builderRouter.post("/projects", async (c) => {
  const parsed = createSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const { prompt } = parsed.data;

  const { kind, gen } = await resolveEngine();
  const blueprint = await buildBlueprintFromPrompt(prompt, gen);
  const db = getDb();
  const project = await createBuilderProject(db, {
    name: blueprint.appName,
    prompt,
    blueprintJson: JSON.stringify(blueprint),
    engine: kind,
  });
  await addBuilderMessage(db, { projectId: project.id, role: "user", content: prompt });
  await addBuilderMessage(db, {
    projectId: project.id,
    role: "assistant",
    content: assistantSummary(blueprint, null),
    blueprintJson: JSON.stringify(blueprint),
    runJson: JSON.stringify(buildRun(kind, null, blueprint, true)),
  });
  // Materialise the generated Expo project to disk. Never let a workspace
  // failure 500 the create — log and carry on.
  try {
    await syncWorkspace(project.id, fromBlueprintExpo(blueprint).files);
  } catch (err) {
    console.warn(`[builder] workspace sync failed for ${project.id}:`, err);
  }
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
        run: m.runJson ? (JSON.parse(m.runJson) as AgentRun) : undefined,
        createdAt: m.createdAt,
      })),
      aiConfigured: (await isOllamaAvailable()) || isGeminiConfigured(),
      aiEngine: (await isOllamaAvailable()) ? `ollama:${OLLAMA_MODEL}` : isGeminiConfigured() ? "gemini" : "heuristic",
    },
  });
});

builderRouter.get("/projects/:id/workspace", async (c) => {
  const project = await getBuilderProject(getDb(), c.req.param("id"));
  if (!project) return c.json({ error: "Project not found" }, 404);
  const [root, files] = await Promise.all([workspaceRoot(), readWorkspaceTree(project.id)]);
  return c.json({ data: { root: `${root}/${project.id}/current`, files } });
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

  // runId is generated up-front so events can be emitted DURING synchronous
  // processing. The client only learns runId from the response below (which
  // resolves after processing), so it would miss every live event — the
  // run-events replay buffer closes that gap: the SSE endpoint replays all
  // buffered events for the run, then streams any remainder.
  const runId = randomUUID();

  const phase = async <T>(name: string, fn: () => Promise<T> | T): Promise<T> => {
    emitRunEvent(runId, { type: "phase_started", phase: name });
    const out = await fn();
    emitRunEvent(runId, { type: "phase_completed", phase: name });
    return out;
  };

  try {
    const current = await phase("Reading blueprint", () => JSON.parse(project.blueprintJson) as AppBlueprint);
    const { kind, gen } = await resolveEngine();
    emitRunEvent(runId, { type: "log", level: "info", line: `Engine: ${kind}` });

    const revised = await phase("Applying changes", () =>
      gen ? reviseBlueprint(current, content, gen) : heuristicRevise(current, content),
    );

    const changed = JSON.stringify(revised) !== JSON.stringify(current);
    await addBuilderMessage(db, { projectId: project.id, role: "user", content });

    let reply: string;
    if (changed) {
      await updateBuilderProjectBlueprint(db, project.id, {
        name: revised.appName,
        blueprintJson: JSON.stringify(revised),
        engine: kind,
      });
      reply = assistantSummary(revised, current);
    } else {
      // Honest no-op: never pretend a change landed.
      reply = gen
        ? "I couldn't map that instruction to a change in the app. Try being more specific — e.g. \"add a stats tab\", \"make the accent #FF375F\", or \"rename it to Pulse\"."
        : "Offline mode handles: add/remove a tab, rename the app, and accent color changes (named or #RRGGBB). For free-form changes, start Ollama (or configure GEMINI_API_KEY).";
    }

    const run = buildRun(kind, current, revised, changed);

    await phase("Regenerating files", () => {
      for (const f of run.changedFiles) emitRunEvent(runId, { type: "file_changed", path: f });
    });

    const assistant = await addBuilderMessage(db, {
      projectId: project.id,
      role: "assistant",
      content: reply,
      blueprintJson: changed ? JSON.stringify(revised) : undefined,
      runJson: JSON.stringify(run),
    });

    if (changed) {
      // Snapshot before/after into runs/<assistant message id>/ then prune.
      await phase("Syncing workspace", async () => {
        try {
          await syncWorkspace(project.id, fromBlueprintExpo(revised).files, assistant.id);
          await pruneRuns(project.id);
        } catch (err) {
          console.warn(`[builder] workspace sync failed for ${project.id}:`, err);
          emitRunEvent(runId, {
            type: "error_detected",
            line: `workspace sync failed: ${err instanceof Error ? err.message : String(err)}`,
          });
        }
      });
    }

    await phase("Validating", () => {
      /* blueprint already validated by the engine; placeholder for build hook */
    });

    emitRunEvent(runId, {
      type: "run_success",
      changed,
      messageId: assistant.id,
      changedFiles: run.changedFiles,
    });

    const fresh = await getBuilderProject(db, project.id);
    return c.json({
      data: {
        ...projectPayload(fresh ?? project),
        changed,
        runId,
        reply: { id: assistant.id, role: "assistant", content: reply, run, createdAt: assistant.createdAt },
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    emitRunEvent(runId, { type: "run_failed", error: message });
    return c.json({ error: message, runId }, 500);
  }
});

/* ---- live run events over SSE -----------------------------------------
   GET /api/v1/builder/runs/:runId/events
   Replays the buffered event sequence (so a client connecting after the
   synchronous POST resolved still sees every phase), then streams new ones,
   with a heartbeat comment every 15s. Closes once the run ends. */

builderRouter.get("/runs/:runId/events", (c) => {
  const runId = c.req.param("runId");
  return streamSSE(c, async (stream) => {
    let nextIndex = 0;
    const queue: RunEvent[] = [];
    let resolveWait: (() => void) | null = null;

    const flush = async () => {
      // Replay anything buffered we haven't sent, then drain the live queue.
      const buffered = bufferedEvents(runId);
      while (nextIndex < buffered.length) {
        const ev = buffered[nextIndex++];
        if (!ev) break;
        await stream.writeSSE({ event: ev.type, data: JSON.stringify(ev) });
      }
      while (queue.length) {
        const ev = queue.shift()!;
        await stream.writeSSE({ event: ev.type, data: JSON.stringify(ev) });
        nextIndex = bufferedEvents(runId).length; // keep replay index past live ones
      }
    };

    const unsub = subscribe(runId, (ev) => {
      queue.push(ev);
      resolveWait?.();
    });

    const heartbeat = setInterval(() => {
      void stream.write(": heartbeat\n\n").catch(() => {});
    }, 15000);

    try {
      await flush();
      // If the run already finished before we connected, replay was enough.
      while (!isRunEnded(runId) || queue.length) {
        await new Promise<void>((resolve) => {
          resolveWait = resolve;
          // wake periodically so an already-ended run doesn't hang
          setTimeout(resolve, 1000);
        });
        resolveWait = null;
        await flush();
        if (isRunEnded(runId) && queue.length === 0) break;
      }
      // Final drain.
      await flush();
    } finally {
      clearInterval(heartbeat);
      unsub();
    }
  });
});

/** Human summary of what the app now is / what changed. */
function assistantSummary(b: AppBlueprint, prev: AppBlueprint | null): string {
  if (!prev) {
    const tabList = b.tabs.map((t) => `${t.title} (${t.kind})`).join(", ");
    return `Generated **${b.appName}** — ${b.tagline}. Screens: ${tabList}. Accent ${b.accentHex}. Preview it on the right, or open the Code tab to see the Expo project.`;
  }
  const changes = blueprintChanges(prev, b);
  if (!changes.length) changes.push("updated the app");
  return `Done — ${changes.join(", ")}. The preview and code are updated.`;
}

/* ---- live web preview --------------------------------------------------
   The generated Expo app runs as a web dev server (expo start --web) so it
   can be iframed into the phone simulator. Start is async: it returns the
   session immediately (status installing/starting) and the UI polls status. */

builderRouter.post("/projects/:id/preview/start", async (c) => {
  const project = await getBuilderProject(getDb(), c.req.param("id"));
  if (!project) return c.json({ error: "Project not found" }, 404);
  try {
    const session = await startPreview(project.id);
    return c.json({ data: toView(session) }, 202);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message === "workspace not synced" ? 409 : 500;
    return c.json({ error: message }, status);
  }
});

builderRouter.post("/projects/:id/preview/stop", async (c) => {
  const project = await getBuilderProject(getDb(), c.req.param("id"));
  if (!project) return c.json({ error: "Project not found" }, 404);
  const session = stopPreview(project.id);
  if (!session) return c.json({ error: "No preview running" }, 404);
  return c.json({ data: toView(session) });
});

builderRouter.get("/projects/:id/preview/status", async (c) => {
  const project = await getBuilderProject(getDb(), c.req.param("id"));
  if (!project) return c.json({ error: "Project not found" }, 404);
  const session = getPreview(project.id);
  if (!session) return c.json({ data: null });
  return c.json({ data: toView(session) });
});

/* Real project export: a zip of the regenerated files.
   ?target=xcode -> native SwiftUI Xcode project; default -> Expo. */
builderRouter.get("/projects/:id/zip", async (c) => {
  const project = await getBuilderProject(getDb(), c.req.param("id"));
  if (!project) return c.json({ error: "Project not found" }, 404);
  const blueprint = JSON.parse(project.blueprintJson) as AppBlueprint;
  const result =
    c.req.query("target") === "xcode" ? fromBlueprintXcode(blueprint) : fromBlueprintExpo(blueprint);
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
