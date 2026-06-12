import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { analyzeScreenshot, QA_SCORE_THRESHOLD } from "./visual-qa.js";

/* Fixtures are real headless-Chrome screenshots committed under test/fixtures:
   - blank.png   : near-solid dark page (no content)
   - content.png : header + cards + tab bar (top & bottom thirds populated)
   - error.png   : large saturated-red field (Metro red-box analogue)
   The rubric must (a) decode each PNG, (b) flag blank/error, (c) score a real
   content screen well above the patch threshold and a blank one well below. */

const fixtures = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../test/fixtures");

describe("analyzeScreenshot rubric", () => {
  it("decodes a content screen with sane dimensions", async () => {
    const r = await analyzeScreenshot(path.join(fixtures, "content.png"));
    expect(r.width).toBe(390);
    expect(r.height).toBe(844);
  });

  it("scores a content-rich screen well above the patch threshold", async () => {
    const r = await analyzeScreenshot(path.join(fixtures, "content.png"));
    expect(r.score).toBeGreaterThan(QA_SCORE_THRESHOLD);
    expect(r.contentFraction).toBeGreaterThan(0.04);
    expect(r.issues.find((i) => i.code === "blank")).toBeUndefined();
  });

  it("flags a near-blank screen and scores it below threshold", async () => {
    const r = await analyzeScreenshot(path.join(fixtures, "blank.png"));
    expect(r.score).toBeLessThan(QA_SCORE_THRESHOLD);
    expect(r.issues.some((i) => i.code === "blank")).toBe(true);
    expect(r.contentFraction).toBeLessThan(0.04);
  });

  it("scores blank strictly worse than content (direction check)", async () => {
    const blank = await analyzeScreenshot(path.join(fixtures, "blank.png"));
    const content = await analyzeScreenshot(path.join(fixtures, "content.png"));
    expect(content.score).toBeGreaterThan(blank.score);
  });

  it("detects an error-overlay style red field", async () => {
    const r = await analyzeScreenshot(path.join(fixtures, "error.png"));
    expect(r.issues.some((i) => i.code === "error_overlay")).toBe(true);
    expect(r.score).toBeLessThan(QA_SCORE_THRESHOLD);
  });
});
