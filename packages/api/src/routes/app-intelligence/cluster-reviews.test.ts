import { describe, expect, it } from "vitest";
import { clusterReviewsRouter } from "./cluster-reviews.js";

/**
 * Route-level wiring tests. Both paths short-circuit inside the router / the
 * service's argument validation BEFORE any DB or network call, so they run
 * without a seeded database — they prove the route is mounted, delegates, maps
 * `ReviewClustersError.status`, and guards the JSON body. The full clustering
 * behaviour is covered by the service DI test + the intelligence unit tests.
 */
describe("cluster-reviews intelligence route", () => {
  it("exposes POST /cluster-reviews and maps the 'needs query or appIds' error to 400", async () => {
    const res = await clusterReviewsRouter.request("/", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "content-type": "application/json" },
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/query|appIds/i);
  });

  it("rejects an invalid JSON body with 400", async () => {
    const res = await clusterReviewsRouter.request("/", {
      method: "POST",
      body: "not json",
      headers: { "content-type": "application/json" },
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/json/i);
  });
});
