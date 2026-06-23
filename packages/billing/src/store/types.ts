import type {
  ApiKeyRecord,
  AuditEntry,
  Budget,
  Principal,
  Receipt,
} from "../types.js";

/**
 * Persistence port. Domain services depend only on this interface, never on a
 * concrete database, so the metering/budget/scope logic is unit-tested against
 * the in-memory store and runs in production against the SQLite store. All
 * methods are async so a remote (Turso) backend drops in unchanged.
 */
export interface BillingStore {
  /** Idempotent: create tables/indexes if missing. */
  init(): Promise<void>;

  putPrincipal(p: Principal): Promise<void>;
  getPrincipal(id: string): Promise<Principal | undefined>;

  putApiKey(k: ApiKeyRecord): Promise<void>;
  getApiKey(id: string): Promise<ApiKeyRecord | undefined>;
  getApiKeyByHash(hash: string): Promise<ApiKeyRecord | undefined>;
  updateApiKey(
    id: string,
    patch: { lastUsedAt?: number; revokedAt?: number },
  ): Promise<void>;
  listApiKeys(principalId: string): Promise<ApiKeyRecord[]>;

  putBudget(b: Budget): Promise<void>;
  getBudget(principalId: string): Promise<Budget | undefined>;

  getReceiptByIdempotencyKey(
    principalId: string,
    key: string,
  ): Promise<Receipt | undefined>;
  insertReceipt(r: Receipt): Promise<void>;
  sumSpendForMonth(principalId: string, monthKey: string): Promise<number>;
  sumSpendTotal(principalId: string): Promise<number>;
  listReceipts(principalId: string, limit: number): Promise<Receipt[]>;

  appendAudit(e: AuditEntry): Promise<void>;
  listAudit(principalId: string, limit: number): Promise<AuditEntry[]>;
}
