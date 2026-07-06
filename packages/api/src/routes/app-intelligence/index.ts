import { Hono } from "hono";
import { similarRouter } from "./similar.js";
import { teardownRouter } from "./teardown.js";
import { trendsRouter } from "./trends.js";
import { appDetailRouter } from "./app-detail.js";
import { compareAppsRouter } from "./compare-apps.js";
import { validateIdeaRouter } from "./validate-idea.js";
import { clusterReviewsRouter } from "./cluster-reviews.js";
import { featureGapsRouter } from "./feature-gaps.js";
import { whitespaceIdeasRouter } from "./whitespace-ideas.js";

/**
 * App-Intelligence router — mounts the per-module sub-routers under
 * `/api/v1/app-intelligence`. One file per module avoids cross-lane contention:
 * `similar` + `validate-idea` are Lane A; `teardown` is Lane B (mounted at "/"
 * since its router declares the full `/teardown` + `/apps/:id/teardown` paths).
 *
 * `validate-idea` is the CANONICAL idea-validation path (coordinator ruling on
 * #184, per PRD #179 + ADR 0012): #180-envelope, deterministic, no LLM. The
 * legacy DecisionPacket `/validate` route it superseded has been retired.
 */
export const appIntelligenceRouter = new Hono();

appIntelligenceRouter.route("/similar", similarRouter);
appIntelligenceRouter.route("/compare-apps", compareAppsRouter);
appIntelligenceRouter.route("/trends", trendsRouter);
appIntelligenceRouter.route("/validate-idea", validateIdeaRouter);
appIntelligenceRouter.route("/cluster-reviews", clusterReviewsRouter);
appIntelligenceRouter.route("/feature-gaps", featureGapsRouter);
appIntelligenceRouter.route("/whitespace-ideas", whitespaceIdeasRouter);
appIntelligenceRouter.route("/", appDetailRouter);
appIntelligenceRouter.route("/", teardownRouter);
