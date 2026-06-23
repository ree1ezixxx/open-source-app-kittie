import { describe, expect, it } from "vitest";
import { AuthService, hashKey } from "./auth-service.js";
import { MemoryBillingStore } from "./store/memory.js";

const NOW = Date.UTC(2026, 0, 15);

function makeAuth() {
  let n = 0;
  const store = new MemoryBillingStore();
  const auth = new AuthService(store, () => NOW, () => `id-${++n}`);
  return { store, auth };
}

describe("AuthService", () => {
  it("issues a key, stores only its hash, and authenticates it", async () => {
    const { store, auth } = makeAuth();
    const p = await auth.createPrincipal({ name: "Acme", kind: "org" });
    const { key, record } = await auth.issueApiKey(p.id, {
      scopes: ["market.read", "billing.spend"],
    });

    expect(key.startsWith("kit_")).toBe(true);
    expect(record.prefix.startsWith("kit_")).toBe(true);

    // The raw secret is never persisted — only its hash.
    const stored = await store.getApiKey(record.id);
    expect(stored?.hash).toBe(hashKey(key));
    expect(stored?.hash).not.toBe(key);

    const { principal, apiKey } = await auth.authenticate(key);
    expect(principal.id).toBe(p.id);
    expect(apiKey.scopes).toContain("billing.spend");
    expect(apiKey.lastUsedAt).toBe(NOW);
  });

  it("rejects a missing or unknown key", async () => {
    const { auth } = makeAuth();
    await expect(auth.authenticate(undefined)).rejects.toMatchObject({
      code: "unauthorized",
    });
    await expect(auth.authenticate("kit_bogus")).rejects.toMatchObject({
      code: "unauthorized",
    });
  });

  it("rejects a revoked key", async () => {
    const { auth } = makeAuth();
    const p = await auth.createPrincipal({ name: "Acme" });
    const { key, record } = await auth.issueApiKey(p.id, { scopes: ["market.read"] });
    await auth.revokeKey(record.id);
    await expect(auth.authenticate(key)).rejects.toMatchObject({
      code: "unauthorized",
    });
  });

  it("enforces least-privilege scopes", async () => {
    const { auth } = makeAuth();
    const p = await auth.createPrincipal({ name: "Acme" });
    const { record } = await auth.issueApiKey(p.id, { scopes: ["market.read"] });

    expect(auth.hasScope(record, "market.read")).toBe(true);
    expect(auth.hasScope(record, "billing.spend")).toBe(false);
    expect(() => auth.requireScope(record, "market.read")).not.toThrow();
    expect(() => auth.requireScope(record, "billing.spend")).toThrowError(
      /missing required scope/,
    );
  });

  it("refuses to issue a key for an unknown principal", async () => {
    const { auth } = makeAuth();
    await expect(
      auth.issueApiKey("ghost", { scopes: ["market.read"] }),
    ).rejects.toMatchObject({ code: "not_found" });
  });
});
