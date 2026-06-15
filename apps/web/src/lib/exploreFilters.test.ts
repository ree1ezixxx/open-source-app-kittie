import { describe, expect, it } from "vitest";
import { toApiParams, parseFilters, writeFilters } from "./exploreFilters.js";

describe("exploreFilters search scope", () => {
  it("maps scoped search to textSearchFields", () => {
    const sp = new URLSearchParams({ q: "duolingo", scope: "developer" });
    const filters = parseFilters(sp);
    expect(filters.scope).toBe("developer");
    expect(toApiParams(filters)).toEqual(
      expect.objectContaining({
        search: "duolingo",
        textSearchFields: "developer",
      }),
    );
  });

  it("omits textSearchFields when scope is all", () => {
    const params = toApiParams(parseFilters(new URLSearchParams({ q: "duolingo" })));
    expect(params.search).toBe("duolingo");
    expect(params.textSearchFields).toBeUndefined();
  });

  it("serializes scope in the URL when not all", () => {
    const sp = writeFilters({
      ...parseFilters(new URLSearchParams()),
      q: "test",
      scope: "description",
    });
    expect(sp.get("scope")).toBe("description");
    expect(sp.get("q")).toBe("test");
  });
});
