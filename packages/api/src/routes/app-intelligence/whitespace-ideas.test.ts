import { describe, expect, it } from "vitest";
import { whitespaceIdeasRouter } from "./whitespace-ideas.js";

/**
 * Route-level wiring tests. Both paths short-circuit inside the router / the
 * service's argument validation BEFORE any DB or network call, so they run
 * without a seeded database — they prove the route is mounted, delegates, maps
 * `WhitespaceIdeasError.status`, and guards the JSON body. Full funnel behaviour
 * is covered by the service DI test + the intelligence unit tests.
 */
describe("whitespace-ideas intelligence route", () => {
  it("exposes POST /whitespace-ideas and maps the 'needs category' error to 400", async () => {
    const res = await whitespaceIdeasRouter.request("/", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "content-type": "application/json" },
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/category/i);
  });

  it("rejects an invalid JSON body with 400", async () => {
    const res = await whitespaceIdeasRouter.request("/", {
      method: "POST",
      body: "not json",
      headers: { "content-type": "application/json" },
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/json/i);
  });
});
