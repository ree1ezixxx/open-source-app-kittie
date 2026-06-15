import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { parseAppSearchParams } from "../lib/params.js";
import { getAppById, getAppHistoricals, searchApps } from "../services/app-service.js";
import { syncAppReviews } from "../services/review-sync-service.js";

export const appsRouter = new Hono();

appsRouter.get("/", async (c) => {
  const params = parseAppSearchParams(c.req.query());
  const result = await searchApps(params);
  return c.json(result);
});

appsRouter.get("/:id", async (c) => {
  const app = await getAppById(c.req.param("id"));
  if (!app) return c.json({ error: "App not found" }, 404);
  return c.json({ data: app });
});

appsRouter.get("/:id/historicals", async (c) => {
  const historicals = await getAppHistoricals(c.req.param("id"));
  if (!historicals) return c.json({ error: "App not found" }, 404);
  return c.json({ data: historicals });
});

/** Live review pull for one app — Refresh button (fire-and-wait, no stream). */
appsRouter.post("/:id/sync-reviews", async (c) => {
  const result = await syncAppReviews(c.req.param("id"));
  if (!result) return c.json({ error: "App not found" }, 404);
  return c.json({ data: result });
});

/**
 * Streaming review pull — the add-to-monitoring 5-stage modal. Emits real
 * milestones over SSE (start → fetch* → analyse → save → done), each tied to
 * an actual step in the sync, not a timer. Writes are serialized so stages
 * always arrive in order.
 */
appsRouter.get("/:id/sync-reviews/stream", (c) => {
  const id = c.req.param("id");
  return streamSSE(c, async (stream) => {
    let chain: Promise<void> = Promise.resolve();
    const send = (event: string, data: unknown): Promise<void> => {
      chain = chain.then(() => stream.writeSSE({ event, data: JSON.stringify(data) }));
      return chain;
    };

    await send("start", { stage: "start" });
    try {
      const result = await syncAppReviews(id, {
        onProgress: (fetched) => void send("fetch", { fetched }),
        onAnalyse: (total) => void send("analyse", { total }),
        onSave: (inserted) => void send("save", { inserted }),
      });
      await chain; // flush any in-flight stage writes
      if (!result) {
        await send("failed", { message: "App not found" });
        return;
      }
      await send("done", result);
    } catch (e) {
      await send("failed", { message: e instanceof Error ? e.message : "Sync failed" });
    }
  });
});
