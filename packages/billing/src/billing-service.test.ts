import { beforeEach, describe, expect, it } from "vitest";
import { BillingService } from "./billing-service.js";
import { BillingError } from "./errors.js";
import { MemoryBillingStore } from "./store/memory.js";

// Fixed clock (Jan 2026) + deterministic ids so receipts are reproducible.
const NOW = Date.UTC(2026, 0, 15, 12, 0, 0);

function makeService() {
  let n = 0;
  const store = new MemoryBillingStore();
  const svc = new BillingService(store, () => NOW, () => `id-${++n}`);
  return { store, svc };
}

const PRINCIPAL = "org-1";

describe("BillingService.quote", () => {
  it("prices per useful unit × quantity", async () => {
    const { svc } = makeService();
    const q = await svc.quote(PRINCIPAL, { unit: "market_snapshot", quantity: 3 });
    expect(q.unitCredits).toBe(10);
    expect(q.estimatedCredits).toBe(30);
    expect(q.wouldExceedBudget).toBe(false);
    expect(q.wouldExceedMax).toBe(false);
  });

  it("rejects an unknown unit", async () => {
    const { svc } = makeService();
    await expect(svc.quote(PRINCIPAL, { unit: "nope" })).rejects.toMatchObject({
      code: "unknown_unit",
    });
  });

  it("rejects a non-positive quantity", async () => {
    const { svc } = makeService();
    await expect(
      svc.quote(PRINCIPAL, { unit: "blueprint", quantity: 0 }),
    ).rejects.toMatchObject({ code: "invalid_request" });
  });
});

describe("BillingService.charge — metering", () => {
  it("writes a receipt and accumulates spend", async () => {
    const { svc } = makeService();
    const res = await svc.charge(PRINCIPAL, { unit: "decision_packet" });
    expect(res.charged).toBe(true);
    expect(res.receipt?.totalCredits).toBe(50);

    const usage = await svc.usage(PRINCIPAL);
    expect(usage.monthSpentCredits).toBe(50);
    expect(usage.totalSpentCredits).toBe(50);
  });

  it("dry_run returns a quote without charging", async () => {
    const { svc } = makeService();
    const res = await svc.charge(PRINCIPAL, { unit: "blueprint", dryRun: true });
    expect(res.charged).toBe(false);
    expect(res.receipt).toBeUndefined();
    expect(res.quote.estimatedCredits).toBe(100);

    const usage = await svc.usage(PRINCIPAL);
    expect(usage.totalSpentCredits).toBe(0);
  });
});

describe("BillingService.charge — max_cost", () => {
  it("blocks when the estimate exceeds max_cost", async () => {
    const { svc } = makeService();
    await expect(
      svc.charge(PRINCIPAL, { unit: "blueprint", maxCredits: 50 }),
    ).rejects.toMatchObject({ code: "cost_exceeds_max" });
  });

  it("allows when within max_cost", async () => {
    const { svc } = makeService();
    const res = await svc.charge(PRINCIPAL, { unit: "blueprint", maxCredits: 100 });
    expect(res.charged).toBe(true);
  });

  it("flags wouldExceedMax in a dry run without throwing", async () => {
    const { svc } = makeService();
    const res = await svc.charge(PRINCIPAL, {
      unit: "blueprint",
      maxCredits: 10,
      dryRun: true,
    });
    expect(res.charged).toBe(false);
    expect(res.quote.wouldExceedMax).toBe(true);
  });
});

describe("BillingService.charge — budget enforcement", () => {
  it("blocks the charge that would cross the monthly spend limit", async () => {
    const { svc } = makeService();
    await svc.setBudget(PRINCIPAL, { period: "monthly", limitCredits: 25 });

    await svc.charge(PRINCIPAL, { unit: "market_snapshot" }); // 10 → spent 10
    await svc.charge(PRINCIPAL, { unit: "market_snapshot" }); // 10 → spent 20

    await expect(
      svc.charge(PRINCIPAL, { unit: "market_snapshot" }), // 30 > 25
    ).rejects.toMatchObject({ code: "spend_limit_exceeded" });

    const usage = await svc.usage(PRINCIPAL);
    expect(usage.monthSpentCredits).toBe(20);
    expect(usage.budget?.remainingCredits).toBe(5);
  });

  it("reports remaining budget in the quote", async () => {
    const { svc } = makeService();
    await svc.setBudget(PRINCIPAL, { period: "total", limitCredits: 100 });
    await svc.charge(PRINCIPAL, { unit: "visual_teardown" }); // 30
    const q = await svc.quote(PRINCIPAL, { unit: "visual_teardown" });
    expect(q.budget?.spentCredits).toBe(30);
    expect(q.budget?.remainingCredits).toBe(70);
    expect(q.wouldExceedBudget).toBe(false);
  });
});

describe("BillingService.charge — idempotency", () => {
  it("replays the original receipt and charges once", async () => {
    const { svc } = makeService();
    const first = await svc.charge(PRINCIPAL, {
      unit: "scaffold",
      idempotencyKey: "abc",
    });
    const second = await svc.charge(PRINCIPAL, {
      unit: "scaffold",
      idempotencyKey: "abc",
    });

    expect(first.charged).toBe(true);
    expect(second.charged).toBe(false);
    expect(second.replayed).toBe(true);
    expect(second.receipt?.id).toBe(first.receipt?.id);

    const usage = await svc.usage(PRINCIPAL);
    expect(usage.totalSpentCredits).toBe(60); // charged once, not twice
  });

  it("rejects a reused key with different parameters", async () => {
    const { svc } = makeService();
    await svc.charge(PRINCIPAL, { unit: "scaffold", idempotencyKey: "k" });
    await expect(
      svc.charge(PRINCIPAL, { unit: "blueprint", idempotencyKey: "k" }),
    ).rejects.toMatchObject({ code: "idempotency_conflict" });
  });

  it("surfaces a typed BillingError instance", async () => {
    const { svc } = makeService();
    const err = await svc
      .charge(PRINCIPAL, { unit: "nope" })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BillingError);
  });
});
