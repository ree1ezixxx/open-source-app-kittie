import { Hono } from "hono";
import { similarRouter } from "./similar.js";
import { validateRouter } from "./validate.js";
import { teardownRouter } from "./teardown.js";
import { trendsRouter } from "./trends.js";

/**
 * App-Intelligence router — mounts the per-module sub-routers under
 * `/api/v1/app-intelligence`. One file per module avoids cross-lane contention:
 * `similar` + `validate` are Lane A; `teardown` is Lane B (mounted at "/" since
 * its router declares the full `/teardown` + `/apps/:id/teardown` paths).
 */
export const appIntelligenceRouter = new Hono();

appIntelligenceRouter.route("/similar", similarRouter);
appIntelligenceRouter.route("/trends", trendsRouter);
appIntelligenceRouter.route("/validate", validateRouter);
appIntelligenceRouter.route("/", teardownRouter);
