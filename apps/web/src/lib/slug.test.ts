import { describe, expect, it } from "vitest";
import { appSlug, parseAppSlug } from "./slug.js";

describe("parseAppSlug", () => {
  it("resolves an Apple slug to a canonical id", () => {
    expect(parseAppSlug("app-kalshi-trade-the-cup-id1632713844")).toBe("apple:1632713844");
  });

  it("resolves a Google slug to a canonical id", () => {
    expect(parseAppSlug("app-some-game-idcom.foo.bar")).toBe("google:com.foo.bar");
  });

  // Regression: titles can contain their own "-id" once slugified ("Aprenda
  // idiomas" → …-idiomas-, "Idle Miner" → …-idle-). The parser must latch onto
  // the LAST "-id" (the builder-appended id), not the first — else app-detail 404s.
  it("ignores an in-title '-id' and uses the trailing storeAppId", () => {
    expect(parseAppSlug("app-duolingo-aprenda-idiomas-id570060128")).toBe("apple:570060128");
    expect(parseAppSlug("app-idle-miner-tycoon-id1239572033")).toBe("apple:1239572033");
    expect(parseAppSlug("app-video-editor-id6446669987")).toBe("apple:6446669987");
  });

  it("round-trips appSlug → parseAppSlug for id-containing titles", () => {
    for (const app of [
      { id: "apple:570060128", title: "Duolingo – Aprenda idiomas" },
      { id: "apple:1239572033", title: "Idle Miner Tycoon" },
      { id: "google:com.foo.bar", title: "Some Game" },
    ]) {
      expect(parseAppSlug(appSlug(app))).toBe(app.id);
    }
  });

  it("returns null for a slug with no id segment", () => {
    expect(parseAppSlug("not-an-app-slug")).toBeNull();
  });
});
