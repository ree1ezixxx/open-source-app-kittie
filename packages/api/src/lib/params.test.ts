import { describe, expect, it } from "vitest";
import { parseAppSearchParams } from "./params.js";

describe("parseAppSearchParams textSearchFields", () => {
  it("normalizes and filters valid search fields", () => {
    expect(
      parseAppSearchParams({
        search: "hello",
        textSearchFields: "Title,developer,unknown",
      }),
    ).toEqual({
      search: "hello",
      textSearchFields: "title,developer",
    });
  });

  it("drops textSearchFields when no valid fields remain", () => {
    expect(parseAppSearchParams({ textSearchFields: "bogus" })).toEqual({});
  });
});
