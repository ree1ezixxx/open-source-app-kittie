import { describe, expect, it } from "vitest";
import type { ApiKeyRecord, Budget, Principal, Receipt } from "../types.js";
import { MemoryBillingStore } from "./memory.js";
import { SqliteBillingStore } from "./sqlite.js";
import type { BillingStore } from "./types.js";

// Both store implementations must satisfy the same contract — the domain
// services depend only on this interface, so a green run here means the SQLite
// backend behaves identically to the in-memory one used by the unit tests.
const stores: Array<[string, () => BillingStore]> = [
  ["memory", () => new MemoryBillingStore()],
  ["sqlite(:memory:)", () => new SqliteBillingStore({ url: ":memory:" })],
];

const principal: Principal = {
  id: "p1",
  name: "Acme",
  kind: "org",
  createdAt: 1000,
};

function receipt(over: Partial<Receipt>): Receipt {
  return {
    id: "r1",
    principalId: "p1",
    unit: "market_snapshot",
    quantity: 1,
    unitCredits: 10,
    totalCredits: 10,
    monthKey: "2026-01",
    status: "charged",
    createdAt: 2000,
    ...over,
  };
}

describe.each(stores)("BillingStore contract: %s", (_name, make) => {
  it("round-trips a principal", async () => {
    const store = make();
    await store.init();
    await store.putPrincipal(principal);
    expect(await store.getPrincipal("p1")).toEqual(principal);
    expect(await store.getPrincipal("missing")).toBeUndefined();
  });

  it("looks up api keys by hash and applies revocation", async () => {
    const store = make();
    await store.putPrincipal(principal);
    const key: ApiKeyRecord = {
      id: "k1",
      principalId: "p1",
      name: "ci",
      prefix: "kit_abc12345",
      hash: "deadbeef",
      scopes: ["market.read", "billing.spend"],
      createdAt: 1500,
    };
    await store.putApiKey(key);

    const byHash = await store.getApiKeyByHash("deadbeef");
    expect(byHash?.id).toBe("k1");
    expect(byHash?.scopes).toEqual(["market.read", "billing.spend"]);

    await store.updateApiKey("k1", { revokedAt: 9999 });
    expect((await store.getApiKey("k1"))?.revokedAt).toBe(9999);
    expect((await store.listApiKeys("p1")).length).toBe(1);
  });

  it("upserts a budget", async () => {
    const store = make();
    await store.putPrincipal(principal);
    const budget: Budget = {
      principalId: "p1",
      period: "monthly",
      limitCredits: 100,
      createdAt: 1,
      updatedAt: 1,
    };
    await store.putBudget(budget);
    expect((await store.getBudget("p1"))?.limitCredits).toBe(100);

    await store.putBudget({ ...budget, limitCredits: 250, updatedAt: 2 });
    expect((await store.getBudget("p1"))?.limitCredits).toBe(250);
  });

  it("sums spend by month and total, and finds receipts by idempotency key", async () => {
    const store = make();
    await store.putPrincipal(principal);
    await store.insertReceipt(receipt({ id: "r1", totalCredits: 10, monthKey: "2026-01" }));
    await store.insertReceipt(receipt({ id: "r2", totalCredits: 30, monthKey: "2026-01" }));
    await store.insertReceipt(receipt({ id: "r3", totalCredits: 50, monthKey: "2026-02" }));
    await store.insertReceipt(
      receipt({ id: "r4", totalCredits: 60, monthKey: "2026-02", idempotencyKey: "idem-1" }),
    );

    expect(await store.sumSpendForMonth("p1", "2026-01")).toBe(40);
    expect(await store.sumSpendForMonth("p1", "2026-02")).toBe(110);
    expect(await store.sumSpendTotal("p1")).toBe(150);
    expect(await store.sumSpendTotal("other")).toBe(0);

    const found = await store.getReceiptByIdempotencyKey("p1", "idem-1");
    expect(found?.id).toBe("r4");
    expect(await store.getReceiptByIdempotencyKey("p1", "nope")).toBeUndefined();

    const list = await store.listReceipts("p1", 10);
    expect(list.length).toBe(4);
  });

  it("appends and lists audit entries newest-first", async () => {
    const store = make();
    await store.appendAudit({
      id: "a1",
      createdAt: 100,
      principalId: "p1",
      action: "charge",
      outcome: "charge",
    });
    await store.appendAudit({
      id: "a2",
      createdAt: 200,
      principalId: "p1",
      action: "scope_check",
      outcome: "deny",
      scope: "billing.spend",
      detail: { reason: "missing" },
    });
    const list = await store.listAudit("p1", 10);
    expect(list.length).toBe(2);
    expect(list[0]?.id).toBe("a2");
    expect(list[0]?.detail).toEqual({ reason: "missing" });
  });
});
