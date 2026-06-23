import { AuditLog } from "./audit.js";
import { AuthService } from "./auth-service.js";
import { BillingService } from "./billing-service.js";
import { type Clock, type IdGen, systemClock, uuidGen } from "./clock.js";
import { MemoryBillingStore } from "./store/memory.js";
import type { BillingStore } from "./store/types.js";

/** The wired billing layer: one store, three services sharing the same clock. */
export interface Billing {
  store: BillingStore;
  auth: AuthService;
  billing: BillingService;
  audit: AuditLog;
}

export interface CreateBillingOptions {
  store?: BillingStore;
  clock?: Clock;
  idGen?: IdGen;
}

export function createBilling(opts: CreateBillingOptions = {}): Billing {
  const store = opts.store ?? new MemoryBillingStore();
  const clock = opts.clock ?? systemClock;
  const idGen = opts.idGen ?? uuidGen;
  return {
    store,
    auth: new AuthService(store, clock, idGen),
    billing: new BillingService(store, clock, idGen),
    audit: new AuditLog(store, clock, idGen),
  };
}
