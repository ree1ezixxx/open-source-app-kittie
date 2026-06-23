import type {
  ApiKeyRecord,
  AuditEntry,
  Budget,
  Principal,
  Receipt,
} from "../types.js";
import type { BillingStore } from "./types.js";

/** Returns copies so callers can't mutate stored records by reference. */
function clone<T>(v: T): T {
  return structuredClone(v);
}

/**
 * In-memory store: the default backend and the one the domain tests run
 * against. Holds no I/O, so metering/budget/scope behaviour is verified with
 * zero database setup.
 */
export class MemoryBillingStore implements BillingStore {
  private principals = new Map<string, Principal>();
  private apiKeys = new Map<string, ApiKeyRecord>();
  private apiKeyIdByHash = new Map<string, string>();
  private budgets = new Map<string, Budget>();
  private receipts: Receipt[] = [];
  private receiptIdByIdem = new Map<string, string>();
  private audit: AuditEntry[] = [];

  async init(): Promise<void> {}

  async putPrincipal(p: Principal): Promise<void> {
    this.principals.set(p.id, clone(p));
  }
  async getPrincipal(id: string): Promise<Principal | undefined> {
    const p = this.principals.get(id);
    return p ? clone(p) : undefined;
  }

  async putApiKey(k: ApiKeyRecord): Promise<void> {
    this.apiKeys.set(k.id, clone(k));
    this.apiKeyIdByHash.set(k.hash, k.id);
  }
  async getApiKey(id: string): Promise<ApiKeyRecord | undefined> {
    const k = this.apiKeys.get(id);
    return k ? clone(k) : undefined;
  }
  async getApiKeyByHash(hash: string): Promise<ApiKeyRecord | undefined> {
    const id = this.apiKeyIdByHash.get(hash);
    return id ? this.getApiKey(id) : undefined;
  }
  async updateApiKey(
    id: string,
    patch: { lastUsedAt?: number; revokedAt?: number },
  ): Promise<void> {
    const k = this.apiKeys.get(id);
    if (!k) return;
    if (patch.lastUsedAt !== undefined) k.lastUsedAt = patch.lastUsedAt;
    if (patch.revokedAt !== undefined) k.revokedAt = patch.revokedAt;
  }
  async listApiKeys(principalId: string): Promise<ApiKeyRecord[]> {
    return [...this.apiKeys.values()]
      .filter((k) => k.principalId === principalId)
      .map(clone);
  }

  async putBudget(b: Budget): Promise<void> {
    this.budgets.set(b.principalId, clone(b));
  }
  async getBudget(principalId: string): Promise<Budget | undefined> {
    const b = this.budgets.get(principalId);
    return b ? clone(b) : undefined;
  }

  async getReceiptByIdempotencyKey(
    principalId: string,
    key: string,
  ): Promise<Receipt | undefined> {
    const id = this.receiptIdByIdem.get(`${principalId}:${key}`);
    if (!id) return undefined;
    const r = this.receipts.find((x) => x.id === id);
    return r ? clone(r) : undefined;
  }
  async insertReceipt(r: Receipt): Promise<void> {
    this.receipts.push(clone(r));
    if (r.idempotencyKey) {
      this.receiptIdByIdem.set(`${r.principalId}:${r.idempotencyKey}`, r.id);
    }
  }
  async sumSpendForMonth(principalId: string, monthKey: string): Promise<number> {
    return this.receipts
      .filter((r) => r.principalId === principalId && r.monthKey === monthKey)
      .reduce((acc, r) => acc + r.totalCredits, 0);
  }
  async sumSpendTotal(principalId: string): Promise<number> {
    return this.receipts
      .filter((r) => r.principalId === principalId)
      .reduce((acc, r) => acc + r.totalCredits, 0);
  }
  async listReceipts(principalId: string, limit: number): Promise<Receipt[]> {
    return this.receipts
      .filter((r) => r.principalId === principalId)
      .slice(-limit)
      .reverse()
      .map(clone);
  }

  async appendAudit(e: AuditEntry): Promise<void> {
    this.audit.push(clone(e));
  }
  async listAudit(principalId: string, limit: number): Promise<AuditEntry[]> {
    return this.audit
      .filter((a) => a.principalId === principalId)
      .slice(-limit)
      .reverse()
      .map(clone);
  }
}
