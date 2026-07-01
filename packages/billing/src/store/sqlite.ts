import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient, type Client, type InValue, type Row } from "@libsql/client";
import type { Scope } from "../scopes.js";
import type {
  ApiKeyRecord,
  AuditAction,
  AuditEntry,
  AuditOutcome,
  Budget,
  BudgetPeriod,
  Principal,
  PrincipalKind,
  Receipt,
} from "../types.js";
import type { BillingStore } from "./types.js";

/** Walk up from this file until the pnpm workspace root, to locate data/. */
function findRepoRoot(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

/**
 * Resolve the same database the rest of Kittie uses (Turso wins, then
 * DATABASE_URL, then the repo-local file) so billing tables live alongside the
 * catalog without importing @kittie/db. Relative file: URLs resolve against the
 * repo root, matching @kittie/db's client.
 */
export function resolveBillingDbUrl(): string {
  const repoRoot = findRepoRoot();
  const raw =
    process.env.TURSO_DATABASE_URL ??
    process.env.DATABASE_URL ??
    `file:${path.join(repoRoot, "data", "kittie.db")}`;
  if (!raw.startsWith("file:")) return raw;
  const p = raw.slice("file:".length);
  return `file:${path.isAbsolute(p) ? p : path.resolve(repoRoot, p)}`;
}

function nz(v: number | string | undefined | null): InValue {
  return v === undefined ? null : v;
}

function str(v: unknown): string {
  return String(v);
}
function optStr(v: unknown): string | undefined {
  return v == null ? undefined : String(v);
}
function num(v: unknown): number {
  return Number(v);
}
function optNum(v: unknown): number | undefined {
  return v == null ? undefined : Number(v);
}

function toApiKey(r: Row): ApiKeyRecord {
  return {
    id: str(r.id),
    principalId: str(r.principal_id),
    name: optStr(r.name),
    prefix: str(r.prefix),
    hash: str(r.hash),
    scopes: JSON.parse(str(r.scopes_json)) as Scope[],
    createdAt: num(r.created_at),
    lastUsedAt: optNum(r.last_used_at),
    revokedAt: optNum(r.revoked_at),
  };
}

function toReceipt(r: Row): Receipt {
  return {
    id: str(r.id),
    principalId: str(r.principal_id),
    unit: str(r.unit) as Receipt["unit"],
    quantity: num(r.quantity),
    unitCredits: num(r.unit_credits),
    totalCredits: num(r.total_credits),
    monthKey: str(r.month_key),
    idempotencyKey: optStr(r.idempotency_key),
    requestId: optStr(r.request_id),
    status: "charged",
    createdAt: num(r.created_at),
  };
}

/**
 * libsql-backed store. Self-bootstrapping: tables are created with
 * CREATE TABLE IF NOT EXISTS on first use (billing-namespaced, additive), so
 * the lane needs no drizzle-kit migration and never conflicts with the
 * foundation lanes' schema. Pass `{ url: ":memory:" }` for tests.
 */
export class SqliteBillingStore implements BillingStore {
  private client: Client;
  private isFile: boolean;
  private ready: Promise<void> | null = null;

  constructor(opts?: { url?: string; client?: Client; authToken?: string }) {
    if (opts?.client) {
      this.client = opts.client;
      this.isFile = false;
    } else {
      const url = opts?.url ?? resolveBillingDbUrl();
      this.client = createClient({
        url,
        authToken: opts?.authToken ?? process.env.TURSO_AUTH_TOKEN,
      });
      this.isFile = url.startsWith("file:");
    }
  }

  async init(): Promise<void> {
    if (!this.ready) this.ready = this.bootstrap();
    return this.ready;
  }

  private async ensure(): Promise<void> {
    await this.init();
  }

  private async bootstrap(): Promise<void> {
    if (this.isFile) {
      await this.client.execute("PRAGMA foreign_keys = ON").catch(() => {});
      await this.client.execute("PRAGMA busy_timeout = 15000").catch(() => {});
    }
    const ddl = [
      `CREATE TABLE IF NOT EXISTS billing_principals (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        kind TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS billing_api_keys (
        id TEXT PRIMARY KEY,
        principal_id TEXT NOT NULL,
        name TEXT,
        prefix TEXT NOT NULL,
        hash TEXT NOT NULL UNIQUE,
        scopes_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        last_used_at INTEGER,
        revoked_at INTEGER
      )`,
      `CREATE INDEX IF NOT EXISTS billing_api_keys_principal_idx ON billing_api_keys(principal_id)`,
      `CREATE TABLE IF NOT EXISTS billing_budgets (
        principal_id TEXT PRIMARY KEY,
        period TEXT NOT NULL,
        limit_credits INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS billing_receipts (
        id TEXT PRIMARY KEY,
        principal_id TEXT NOT NULL,
        unit TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        unit_credits INTEGER NOT NULL,
        total_credits INTEGER NOT NULL,
        month_key TEXT NOT NULL,
        idempotency_key TEXT,
        request_id TEXT,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS billing_receipts_idem_idx
        ON billing_receipts(principal_id, idempotency_key)
        WHERE idempotency_key IS NOT NULL`,
      `CREATE INDEX IF NOT EXISTS billing_receipts_month_idx
        ON billing_receipts(principal_id, month_key)`,
      `CREATE TABLE IF NOT EXISTS billing_audit (
        id TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL,
        principal_id TEXT,
        api_key_id TEXT,
        request_id TEXT,
        action TEXT NOT NULL,
        outcome TEXT NOT NULL,
        scope TEXT,
        detail_json TEXT
      )`,
      `CREATE INDEX IF NOT EXISTS billing_audit_principal_idx
        ON billing_audit(principal_id, created_at)`,
    ];
    for (const sql of ddl) await this.client.execute(sql);
  }

  async putPrincipal(p: Principal): Promise<void> {
    await this.ensure();
    await this.client.execute({
      sql: `INSERT INTO billing_principals (id, name, kind, created_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET name = excluded.name, kind = excluded.kind`,
      args: [p.id, p.name, p.kind, p.createdAt],
    });
  }
  async getPrincipal(id: string): Promise<Principal | undefined> {
    await this.ensure();
    const rs = await this.client.execute({
      sql: `SELECT * FROM billing_principals WHERE id = ?`,
      args: [id],
    });
    const r = rs.rows[0];
    if (!r) return undefined;
    return {
      id: str(r.id),
      name: str(r.name),
      kind: str(r.kind) as PrincipalKind,
      createdAt: num(r.created_at),
    };
  }

  async putApiKey(k: ApiKeyRecord): Promise<void> {
    await this.ensure();
    await this.client.execute({
      sql: `INSERT INTO billing_api_keys
              (id, principal_id, name, prefix, hash, scopes_json, created_at, last_used_at, revoked_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        k.id,
        k.principalId,
        nz(k.name),
        k.prefix,
        k.hash,
        JSON.stringify(k.scopes),
        k.createdAt,
        nz(k.lastUsedAt),
        nz(k.revokedAt),
      ],
    });
  }
  async getApiKey(id: string): Promise<ApiKeyRecord | undefined> {
    await this.ensure();
    const rs = await this.client.execute({
      sql: `SELECT * FROM billing_api_keys WHERE id = ?`,
      args: [id],
    });
    return rs.rows[0] ? toApiKey(rs.rows[0]) : undefined;
  }
  async getApiKeyByHash(hash: string): Promise<ApiKeyRecord | undefined> {
    await this.ensure();
    const rs = await this.client.execute({
      sql: `SELECT * FROM billing_api_keys WHERE hash = ?`,
      args: [hash],
    });
    return rs.rows[0] ? toApiKey(rs.rows[0]) : undefined;
  }
  async updateApiKey(
    id: string,
    patch: { lastUsedAt?: number; revokedAt?: number },
  ): Promise<void> {
    await this.ensure();
    const sets: string[] = [];
    const args: InValue[] = [];
    if (patch.lastUsedAt !== undefined) {
      sets.push("last_used_at = ?");
      args.push(patch.lastUsedAt);
    }
    if (patch.revokedAt !== undefined) {
      sets.push("revoked_at = ?");
      args.push(patch.revokedAt);
    }
    if (sets.length === 0) return;
    args.push(id);
    await this.client.execute({
      sql: `UPDATE billing_api_keys SET ${sets.join(", ")} WHERE id = ?`,
      args,
    });
  }
  async listApiKeys(principalId: string): Promise<ApiKeyRecord[]> {
    await this.ensure();
    const rs = await this.client.execute({
      sql: `SELECT * FROM billing_api_keys WHERE principal_id = ? ORDER BY created_at DESC`,
      args: [principalId],
    });
    return rs.rows.map(toApiKey);
  }

  async putBudget(b: Budget): Promise<void> {
    await this.ensure();
    await this.client.execute({
      sql: `INSERT INTO billing_budgets (principal_id, period, limit_credits, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(principal_id) DO UPDATE SET
              period = excluded.period,
              limit_credits = excluded.limit_credits,
              updated_at = excluded.updated_at`,
      args: [b.principalId, b.period, b.limitCredits, b.createdAt, b.updatedAt],
    });
  }
  async getBudget(principalId: string): Promise<Budget | undefined> {
    await this.ensure();
    const rs = await this.client.execute({
      sql: `SELECT * FROM billing_budgets WHERE principal_id = ?`,
      args: [principalId],
    });
    const r = rs.rows[0];
    if (!r) return undefined;
    return {
      principalId: str(r.principal_id),
      period: str(r.period) as BudgetPeriod,
      limitCredits: num(r.limit_credits),
      createdAt: num(r.created_at),
      updatedAt: num(r.updated_at),
    };
  }

  async getReceiptByIdempotencyKey(
    principalId: string,
    key: string,
  ): Promise<Receipt | undefined> {
    await this.ensure();
    const rs = await this.client.execute({
      sql: `SELECT * FROM billing_receipts WHERE principal_id = ? AND idempotency_key = ?`,
      args: [principalId, key],
    });
    return rs.rows[0] ? toReceipt(rs.rows[0]) : undefined;
  }
  async insertReceipt(r: Receipt): Promise<void> {
    await this.ensure();
    await this.client.execute({
      sql: `INSERT INTO billing_receipts
              (id, principal_id, unit, quantity, unit_credits, total_credits, month_key, idempotency_key, request_id, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        r.id,
        r.principalId,
        r.unit,
        r.quantity,
        r.unitCredits,
        r.totalCredits,
        r.monthKey,
        nz(r.idempotencyKey),
        nz(r.requestId),
        r.status,
        r.createdAt,
      ],
    });
  }
  async sumSpendForMonth(principalId: string, monthKey: string): Promise<number> {
    await this.ensure();
    const rs = await this.client.execute({
      sql: `SELECT COALESCE(SUM(total_credits), 0) AS s
            FROM billing_receipts WHERE principal_id = ? AND month_key = ?`,
      args: [principalId, monthKey],
    });
    return Number(rs.rows[0]?.s ?? 0);
  }
  async sumSpendTotal(principalId: string): Promise<number> {
    await this.ensure();
    const rs = await this.client.execute({
      sql: `SELECT COALESCE(SUM(total_credits), 0) AS s
            FROM billing_receipts WHERE principal_id = ?`,
      args: [principalId],
    });
    return Number(rs.rows[0]?.s ?? 0);
  }
  async listReceipts(principalId: string, limit: number): Promise<Receipt[]> {
    await this.ensure();
    const rs = await this.client.execute({
      sql: `SELECT * FROM billing_receipts WHERE principal_id = ?
            ORDER BY created_at DESC LIMIT ?`,
      args: [principalId, limit],
    });
    return rs.rows.map(toReceipt);
  }

  async appendAudit(e: AuditEntry): Promise<void> {
    await this.ensure();
    await this.client.execute({
      sql: `INSERT INTO billing_audit
              (id, created_at, principal_id, api_key_id, request_id, action, outcome, scope, detail_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        e.id,
        e.createdAt,
        nz(e.principalId),
        nz(e.apiKeyId),
        nz(e.requestId),
        e.action,
        e.outcome,
        nz(e.scope),
        e.detail ? JSON.stringify(e.detail) : null,
      ],
    });
  }
  async listAudit(principalId: string, limit: number): Promise<AuditEntry[]> {
    await this.ensure();
    const rs = await this.client.execute({
      sql: `SELECT * FROM billing_audit WHERE principal_id = ?
            ORDER BY created_at DESC LIMIT ?`,
      args: [principalId, limit],
    });
    return rs.rows.map((r) => ({
      id: str(r.id),
      createdAt: num(r.created_at),
      principalId: optStr(r.principal_id),
      apiKeyId: optStr(r.api_key_id),
      requestId: optStr(r.request_id),
      action: str(r.action) as AuditAction,
      outcome: str(r.outcome) as AuditOutcome,
      scope: optStr(r.scope),
      detail: r.detail_json
        ? (JSON.parse(str(r.detail_json)) as Record<string, unknown>)
        : undefined,
    }));
  }
}
