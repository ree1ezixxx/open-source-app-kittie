import { type Clock, type IdGen, systemClock, uuidGen } from "./clock.js";
import type { BillingStore } from "./store/types.js";
import type { AuditEntry } from "./types.js";

/** Append-only audit trail for auth + spend decisions (L9 accountability). */
export class AuditLog {
  constructor(
    private store: BillingStore,
    private clock: Clock = systemClock,
    private idGen: IdGen = uuidGen,
  ) {}

  async record(entry: Omit<AuditEntry, "id" | "createdAt">): Promise<void> {
    await this.store.appendAudit({
      id: this.idGen(),
      createdAt: this.clock(),
      ...entry,
    });
  }

  async list(principalId: string, limit = 100): Promise<AuditEntry[]> {
    return this.store.listAudit(principalId, Math.min(Math.max(1, limit), 500));
  }
}
