import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildCategoryPulseResponse } from "@kittie/intelligence";

const getCategoryPulse = vi.fn();

vi.mock("../../services/trends-service.js", () => ({ getCategoryPulse }));

const { trendsRouter } = await import("./trends.js");

describe("app intelligence trends route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes normalized category pulse params to the service", async () => {
    const response = buildCategoryPulseResponse({
      category: "Productivity",
      country: "GB",
      growthPeriod: "14d",
      limit: 5,
      apps: [],
      snapshotDate: null,
      generatedAt: "2026-07-01T12:00:00Z",
    });
    getCategoryPulse.mockResolvedValue(response);

    const res = await trendsRouter.request("/?category=Productivity&country=gb&growthPeriod=14d&limit=5");

    expect(res.status).toBe(200);
    expect(getCategoryPulse).toHaveBeenCalledWith({
      category: "Productivity",
      country: "GB",
      growthPeriod: "14d",
      limit: 5,
    });
    await expect(res.json()).resolves.toMatchObject({
      responseType: "trends",
      data: { category: "Productivity", country: "GB", growthPeriod: "14d", limit: 5 },
    });
  });

  it("rejects invalid inputs", async () => {
    const res = await trendsRouter.request("/?country=usa&growthPeriod=3d&limit=0");

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Invalid query parameters",
      invalid: ["country", "growthPeriod", "limit"],
    });
    expect(getCategoryPulse).not.toHaveBeenCalled();
  });
});
