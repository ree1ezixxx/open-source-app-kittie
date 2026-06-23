// Public contract for @kittie/billing. The API auth/billing slices and the
// MCP layer (later) consume only what is exported here.
export * from "./units.js";
export * from "./scopes.js";
export * from "./errors.js";
export * from "./types.js";
export * from "./clock.js";
export { AuthService, hashKey, safeEqual } from "./auth-service.js";
export { BillingService, type ChargeRequest } from "./billing-service.js";
export { AuditLog } from "./audit.js";
export { RateLimiter, type RateLimitResult } from "./rate-limit.js";
export { createBilling, type Billing, type CreateBillingOptions } from "./create.js";
export type { BillingStore } from "./store/types.js";
export { MemoryBillingStore } from "./store/memory.js";
export { SqliteBillingStore, resolveBillingDbUrl } from "./store/sqlite.js";
