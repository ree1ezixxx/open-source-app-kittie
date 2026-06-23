import { describe, expect, it } from "vitest";
import { RateLimiter } from "./rate-limit.js";

describe("RateLimiter", () => {
  it("allows up to the limit, then denies within the window", () => {
    let now = 0;
    const rl = new RateLimiter(2, 1000, () => now);
    expect(rl.check("k").allowed).toBe(true);
    expect(rl.check("k").allowed).toBe(true);
    const third = rl.check("k");
    expect(third.allowed).toBe(false);
    expect(third.remaining).toBe(0);
  });

  it("resets after the window elapses", () => {
    let now = 0;
    const rl = new RateLimiter(1, 1000, () => now);
    expect(rl.check("k").allowed).toBe(true);
    expect(rl.check("k").allowed).toBe(false);
    now = 1000;
    expect(rl.check("k").allowed).toBe(true);
  });

  it("tracks keys independently", () => {
    let now = 0;
    const rl = new RateLimiter(1, 1000, () => now);
    expect(rl.check("a").allowed).toBe(true);
    expect(rl.check("b").allowed).toBe(true);
    expect(rl.check("a").allowed).toBe(false);
  });
});
