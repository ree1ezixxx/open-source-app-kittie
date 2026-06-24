import { Hono } from "hono";
import { similarRouter } from "./similar.js";
import { validateRouter } from "./validate.js";

/**
 * App-Intelligence router — mounts the per-module sub-routers under
 * `/api/v1/app-intelligence`. One file per module avoids cross-lane contention:
 * `similar` + `validate` are Lane A; `teardown` mounts here too once Lane B lands
 * `./teardown.js` (add the import + `.route("/teardown", teardownRouter)` then).
 */
export const appIntelligenceRouter = new Hono();

appIntelligenceRouter.route("/similar", similarRouter);
appIntelligenceRouter.route("/validate", validateRouter);
