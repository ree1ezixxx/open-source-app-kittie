export type BillingErrorCode =
  | "unauthorized"
  | "insufficient_scope"
  | "unknown_unit"
  | "invalid_request"
  | "cost_exceeds_max"
  | "spend_limit_exceeded"
  | "idempotency_conflict"
  | "not_found"
  | "rate_limited"
  | "admin_not_configured";

/**
 * Typed, transport-agnostic billing error. Carries an HTTP status + a stable
 * machine code so the API layer can serialise it without a switch statement
 * (`err.toJSON()` → response body, `err.status` → response code).
 */
export class BillingError extends Error {
  readonly code: BillingErrorCode;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(
    code: BillingErrorCode,
    message: string,
    status: number,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "BillingError";
    this.code = code;
    this.status = status;
    this.details = details;
  }

  toJSON(): Record<string, unknown> {
    return { error: this.code, message: this.message, ...(this.details ?? {}) };
  }
}

export const errUnauthorized = (message = "authentication required") =>
  new BillingError("unauthorized", message, 401);

export const errInsufficientScope = (required: string) =>
  new BillingError("insufficient_scope", `missing required scope: ${required}`, 403, {
    required,
  });

export const errUnknownUnit = (unit: string) =>
  new BillingError("unknown_unit", `unknown billable unit: ${unit}`, 400, { unit });

export const errInvalid = (message: string, details?: Record<string, unknown>) =>
  new BillingError("invalid_request", message, 400, details);

export const errCostExceedsMax = (estimated: number, max: number) =>
  new BillingError(
    "cost_exceeds_max",
    `estimated cost ${estimated} exceeds max_cost ${max}`,
    402,
    { estimated, max },
  );

export const errSpendLimit = (attempted: number, spent: number, limit: number) =>
  new BillingError(
    "spend_limit_exceeded",
    `charge of ${attempted} would exceed budget (spent ${spent} of ${limit})`,
    402,
    { attempted, spent, limit, remaining: Math.max(0, limit - spent) },
  );

export const errIdempotencyConflict = (key: string) =>
  new BillingError(
    "idempotency_conflict",
    `idempotency key reused with different parameters: ${key}`,
    409,
    { idempotencyKey: key },
  );

export const errNotFound = (what: string) =>
  new BillingError("not_found", `${what} not found`, 404);

export const errRateLimited = (resetAt: number) =>
  new BillingError("rate_limited", "rate limit exceeded", 429, { resetAt });

export const errAdminNotConfigured = () =>
  new BillingError(
    "admin_not_configured",
    "admin operations are disabled (set BILLING_ADMIN_TOKEN)",
    503,
  );
