import { describe, expect, it } from "vitest";
import { EXAMPLE_PROMPTS, planQuery } from "./planner";

describe("planQuery — intents", () => {
  it("plans a lone app id as app_detail", () => {
    expect(planQuery("tell me about apple:6446901002")).toEqual({ intent: "app_detail", appId: "apple:6446901002" });
    expect(planQuery("apple:6446901002")).toEqual({ intent: "app_detail", appId: "apple:6446901002" });
  });

  it("plans two ids (or 'compare') as compare", () => {
    expect(planQuery("compare apple:1 and apple:2")).toEqual({ intent: "compare", apps: ["apple:1", "apple:2"] });
    expect(planQuery("apple:1 vs google:com.x")).toEqual({ intent: "compare", apps: ["apple:1", "google:com.x"] });
  });

  it("plans compare-by-name when no ids given", () => {
    const p = planQuery("compare Focus Timer and Deep Focus");
    expect(p.intent).toBe("compare");
    expect(p.intent === "compare" && p.apps).toEqual(["Focus Timer", "Deep Focus"]);
  });

  it("plans trending with category / country / period", () => {
    expect(planQuery("what's trending in Productivity in the US this week?")).toEqual({
      intent: "trends",
      category: "Productivity",
      country: "US",
      period: "7d",
    });
    expect(planQuery("top apps over 30d")).toMatchObject({ intent: "trends", country: "US", period: "30d" });
  });

  it("plans validation and strips the trigger phrase from the idea", () => {
    expect(planQuery("validate a focus timer for students")).toEqual({ intent: "validate", idea: "a focus timer for students" });
    expect(planQuery("is there room for a sleep app for shift workers")).toEqual({
      intent: "validate",
      idea: "a sleep app for shift workers",
    });
  });

  it("falls back to unsupported for unparseable questions", () => {
    expect(planQuery("what's the weather today").intent).toBe("unsupported");
    expect(planQuery("").intent).toBe("unsupported");
  });

  it("asks for a second app when compare has only one", () => {
    const p = planQuery("compare apple:1");
    expect(p.intent).toBe("unsupported");
  });
});

describe("example prompts all plan to a supported intent", () => {
  it("every example resolves to a non-unsupported intent", () => {
    for (const ex of EXAMPLE_PROMPTS) {
      expect(planQuery(ex.query).intent, `${ex.label}: ${ex.query}`).not.toBe("unsupported");
    }
  });
});
