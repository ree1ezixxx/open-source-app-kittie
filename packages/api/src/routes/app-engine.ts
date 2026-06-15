import { Hono } from "hono";
import { z } from "zod";
import { getDb } from "../lib/db.js";
import { cloneableApps } from "@kittie/db";

export const appEngineRouter = new Hono();

const querySchema = z.object({
  platform: z.enum(["react-native", "ios-native", "android-native", "multi"]).optional(),
  reason: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).default(50),
  offset: z.coerce.number().int().nonnegative().default(0),
});

/** GET /api/v1/app-engine/cloneable
 * Fetch cloneable apps with optional filtering by platform or featured reason.
 */
appEngineRouter.get("/cloneable", async (c) => {
  const parsed = querySchema.safeParse({
    platform: c.req.query("platform"),
    reason: c.req.query("reason"),
    limit: c.req.query("limit"),
    offset: c.req.query("offset"),
  });

  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }

  const { platform, reason, limit, offset } = parsed.data;
  const db = getDb();

  try {
    const apps = await db.query.cloneableApps.findMany({
      where: (t, { and, eq }) =>
        and(
          platform ? eq(t.platform, platform) : undefined,
          reason ? eq(t.featuredReason, reason) : undefined,
        ),
      orderBy: (t, { desc }) => desc(t.createdAt),
      limit,
      offset,
    });

    const allApps = await db.query.cloneableApps.findMany({
      where: (t, { and, eq }) =>
        and(
          platform ? eq(t.platform, platform) : undefined,
          reason ? eq(t.featuredReason, reason) : undefined,
        ),
    });

    const total = allApps.length;

    return c.json({
      data: apps.map((app) => ({
        id: app.id,
        title: app.title,
        description: app.description,
        iconUrl: app.iconUrl,
        repoUrl: app.repoUrl,
        platform: app.platform,
        featuredReason: app.featuredReason,
        githubStars: app.githubStars,
        expoProjectId: app.expoProjectId,
        iosDeploymentTarget: app.iosDeploymentTarget,
      })),
      pagination: {
        total,
        offset,
        limit,
        hasMore: offset + limit < total,
      },
    });
  } catch (e) {
    console.error("Failed to fetch cloneable apps:", e);
    return c.json(
      { error: e instanceof Error ? e.message : "Failed to fetch cloneable apps" },
      500
    );
  }
});

/** GET /api/v1/app-engine/cloneable/:id
 * Fetch a single cloneable app with full details and clone instructions.
 */
appEngineRouter.get("/cloneable/:id", async (c) => {
  const id = c.req.param("id");
  if (!id) {
    return c.json({ error: "App ID required" }, 400);
  }

  const db = getDb();

  try {
    const app = await db.query.cloneableApps.findFirst({
      where: (t, { eq }) => eq(t.id, id),
    });

    if (!app) {
      return c.json({ error: "App not found" }, 404);
    }

    // Generate clone URLs based on platform
    const cloneUrl = app.repoUrl;
    let deepLink = "";

    if (app.platform === "react-native" && app.expoProjectId) {
      deepLink = `exp+${app.expoProjectId}`;
    } else if (app.platform === "ios-native") {
      deepLink = `xcode://clone?repo=${encodeURIComponent(app.repoUrl)}`;
    } else if (app.platform === "android-native") {
      deepLink = `android-studio://checkout?repo=${encodeURIComponent(app.repoUrl)}`;
    }

    return c.json({
      data: {
        ...app,
        cloneUrl,
        deepLink,
        instructions: generateCloneInstructions(app),
      },
    });
  } catch (e) {
    console.error("Failed to fetch app:", e);
    return c.json({ error: e instanceof Error ? e.message : "Failed to fetch app" }, 500);
  }
});

function generateCloneInstructions(app: {
  repoUrl: string;
  platform: string;
  expoProjectId?: string | null;
  iosDeploymentTarget?: string | null;
}): string {
  if (app.platform === "react-native") {
    return `# Clone React Native App\n\ngit clone ${app.repoUrl}\ncd $(basename ${app.repoUrl} .git)\nnpm install`;
  } else if (app.platform === "ios-native") {
    return `# Clone iOS Project\n\ngit clone ${app.repoUrl}\ncd $(basename ${app.repoUrl} .git)`;
  } else if (app.platform === "android-native") {
    return `# Clone Android Project\n\ngit clone ${app.repoUrl}\ncd $(basename ${app.repoUrl} .git)`;
  }

  return `# Clone Project\n\ngit clone ${app.repoUrl}`;
}
