import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildValidateIdeaResponse } from "@kittie/intelligence";

const mocks = vi.hoisted(() => ({
  getValidateIdeaIntelligence: vi.fn(),
}));

vi.mock("../../services/validate-idea-intelligence-service.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../services/validate-idea-intelligence-service.js")>();
  return {
    ...actual,
    getValidateIdeaIntelligence: mocks.getValidateIdeaIntelligence,
  };
});

const { validateIdeaRouter } = await import("./validate-idea.js");
const { ValidateIdeaIntelligenceError } = await import(
  "../../services/validate-idea-intelligence-service.js"
);

describe("validate-idea intelligence route", () => {
  beforeEach(() => {
    mocks.getValidateIdeaIntelligence.mockReset();
  });

  it("exposes POST /validate-idea", async () => {
    mocks.getValidateIdeaIntelligence.mockResolvedValue(
      buildValidateIdeaResponse({
        idea: "sober coach",
        interpreted: {
          summary: "a sobriety coaching app",
          categories: [],
          keywords: ["sobriety", "coach"],
          kind: "inferred",
        },
        competitors: [],
        generatedAt: "2026-07-02T12:00:00.000Z",
        sourceQuery: { idea: "sober coach" },
      }),
    );

    const res = await validateIdeaRouter.request("/", {
      method: "POST",
      body: JSON.stringify({ idea: "sober coach" }),
      headers: { "content-type": "application/json" },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { responseType: string } };
    expect(body.data.responseType).toBe("idea_validation");
    expect(mocks.getValidateIdeaIntelligence).toHaveBeenCalledWith({ idea: "sober coach" });
  });

  it("maps caller errors to their status", async () => {
    mocks.getValidateIdeaIntelligence.mockRejectedValue(
      new ValidateIdeaIntelligenceError("provide an `idea` (plain language) to validate", 400),
    );

    const res = await validateIdeaRouter.request("/", {
      method: "POST",
      body: JSON.stringify({ idea: "" }),
      headers: { "content-type": "application/json" },
    });

    expect(res.status).toBe(400);
  });

  it("rejects invalid JSON", async () => {
    const res = await validateIdeaRouter.request("/", {
      method: "POST",
      body: "not json",
      headers: { "content-type": "application/json" },
    });
    expect(res.status).toBe(400);
    expect(mocks.getValidateIdeaIntelligence).not.toHaveBeenCalled();
  });
});
