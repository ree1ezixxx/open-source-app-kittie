import { beforeEach, describe, expect, it, vi } from "vitest";

const addCustomKeywordToTrackedApp = vi.fn();
const removeKeywordFromTrackedApp = vi.fn();
const findSimilarTrackedAppKeywords = vi.fn();

vi.mock("../services/tracked-app-service.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/tracked-app-service.js")>();
  return {
    ...actual,
    addCustomKeywordToTrackedApp,
    removeKeywordFromTrackedApp,
    findSimilarTrackedAppKeywords,
  };
});

const { keywordsRouter } = await import("./keywords.js");
const { InvalidKeywordError } = await import("../services/tracked-app-service.js");

describe("tracked app keyword routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when add keyword normalization fails", async () => {
    addCustomKeywordToTrackedApp.mockRejectedValue(new InvalidKeywordError());

    const res = await keywordsRouter.request("/tracked-apps/ta_1/keywords", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyword: "!!!", country: "US" }),
    });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "keyword is invalid" });
  });

  it("returns 400 when remove keyword normalization fails", async () => {
    removeKeywordFromTrackedApp.mockRejectedValue(new InvalidKeywordError());

    const res = await keywordsRouter.request("/tracked-apps/ta_1/keywords?keyword=!!!&country=US", {
      method: "DELETE",
    });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "keyword is invalid" });
  });

  it("returns 404 when tracked app is missing on similar lookup", async () => {
    findSimilarTrackedAppKeywords.mockResolvedValue(null);

    const res = await keywordsRouter.request(
      "/tracked-apps/ta_1/keywords/similar?keyword=habit%20tracker&country=US",
    );

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "tracked app not found" });
  });
});
