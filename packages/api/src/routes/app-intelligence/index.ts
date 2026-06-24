/**
 * App-Intelligence router — mounts the P0 intelligence tools under
 * `/api/v1/app-intelligence`. Lane B ships `teardown` here; Lane A extends this
 * aggregator with `find_similar_apps` + `validate_app_idea` on its foundation
 * merge (expected rebase seam — keep this thin to merge cleanly).
 */
import { Hono } from "hono";
import { teardownRouter } from "./teardown.js";

export const appIntelligenceRouter = new Hono();
appIntelligenceRouter.route("/", teardownRouter);
