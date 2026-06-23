import { type Clock, systemClock } from "./clock.js";

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
}

/**
 * Fixed-window in-memory rate limiter, keyed per principal/key. Rate state is
 * ephemeral by design (it lives with the process, not the billing store).
 */
export class RateLimiter {
  private windows = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private limit: number,
    private windowMs: number,
    private clock: Clock = systemClock,
  ) {}

  check(key: string): RateLimitResult {
    const now = this.clock();
    let w = this.windows.get(key);
    if (!w || now >= w.resetAt) {
      w = { count: 0, resetAt: now + this.windowMs };
      this.windows.set(key, w);
    }
    w.count += 1;
    return {
      allowed: w.count <= this.limit,
      limit: this.limit,
      remaining: Math.max(0, this.limit - w.count),
      resetAt: w.resetAt,
    };
  }
}
