import type { Scope } from "./scopes.js";
import type { BillableUnit } from "./units.js";

export type PrincipalKind = "user" | "org" | "service";

/** The authenticated account a key acts on behalf of (budgets attach here). */
export interface Principal {
  id: string;
  name: string;
  kind: PrincipalKind;
  createdAt: number;
}

/**
 * A credential. The raw secret is NEVER stored — only its SHA-256 hash (the
 * lookup key) and a short display prefix. ASC private keys and the like are
 * never represented here; they live in the operator's own secret store.
 */
export interface ApiKeyRecord {
  id: string;
  principalId: string;
  name?: string;
  prefix: string;
  hash: string;
  scopes: Scope[];
  createdAt: number;
  lastUsedAt?: number;
  revokedAt?: number;
}

export type BudgetPeriod = "monthly" | "total";

export interface Budget {
  principalId: string;
  period: BudgetPeriod;
  limitCredits: number;
  createdAt: number;
  updatedAt: number;
}

/** Immutable record of a charge — the `usage_receipt` returned to the caller. */
export interface Receipt {
  id: string;
  principalId: string;
  unit: BillableUnit;
  quantity: number;
  unitCredits: number;
  totalCredits: number;
  monthKey: string;
  idempotencyKey?: string;
  requestId?: string;
  status: "charged";
  createdAt: number;
}

export type AuditAction =
  | "authenticate"
  | "scope_check"
  | "charge"
  | "charge_denied"
  | "issue_key"
  | "revoke_key"
  | "create_principal"
  | "set_budget";

export type AuditOutcome = "allow" | "deny" | "charge" | "error";

export interface AuditEntry {
  id: string;
  createdAt: number;
  principalId?: string;
  apiKeyId?: string;
  requestId?: string;
  action: AuditAction;
  outcome: AuditOutcome;
  scope?: string;
  detail?: Record<string, unknown>;
}

export interface BudgetView {
  period: BudgetPeriod;
  limitCredits: number;
  spentCredits: number;
  remainingCredits: number;
}

/** The `estimated_cost` quote returned by dry-runs and before every charge. */
export interface Quote {
  unit: BillableUnit;
  quantity: number;
  unitCredits: number;
  estimatedCredits: number;
  maxCredits?: number;
  wouldExceedMax: boolean;
  budget?: BudgetView;
  wouldExceedBudget: boolean;
}

export interface ChargeResult {
  charged: boolean;
  replayed: boolean;
  quote: Quote;
  receipt?: Receipt;
}

export interface UsageSummary {
  monthKey: string;
  monthSpentCredits: number;
  totalSpentCredits: number;
  budget:
    | (BudgetView & { period: BudgetPeriod })
    | null;
}
