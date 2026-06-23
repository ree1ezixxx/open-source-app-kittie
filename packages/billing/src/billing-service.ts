import { type Clock, type IdGen, monthKey, systemClock, uuidGen } from "./clock.js";
import {
  errCostExceedsMax,
  errIdempotencyConflict,
  errInvalid,
  errSpendLimit,
  errUnknownUnit,
} from "./errors.js";
import type { BillingStore } from "./store/types.js";
import type {
  Budget,
  BudgetPeriod,
  BudgetView,
  ChargeResult,
  Quote,
  Receipt,
  UsageSummary,
} from "./types.js";
import { type BillableUnit, isBillableUnit, unitCredits } from "./units.js";

export interface ChargeRequest {
  unit: string;
  quantity?: number;
  /** Reuse → returns the original receipt instead of double-charging. */
  idempotencyKey?: string;
  /** Caller's hard ceiling; charge is refused if the estimate exceeds it. */
  maxCredits?: number;
  /** Quote only — never writes a receipt or moves spend. */
  dryRun?: boolean;
  requestId?: string;
}

/**
 * L8 metering + budget enforcement. Every charge first produces a quote
 * (estimated_cost), then enforces max_cost, idempotency, and the principal's
 * spend limit before writing an immutable receipt.
 */
export class BillingService {
  constructor(
    private store: BillingStore,
    private clock: Clock = systemClock,
    private idGen: IdGen = uuidGen,
  ) {}

  private async spendForBudget(
    principalId: string,
    budget: Budget,
    mk: string,
  ): Promise<number> {
    return budget.period === "monthly"
      ? this.store.sumSpendForMonth(principalId, mk)
      : this.store.sumSpendTotal(principalId);
  }

  /** Pure pricing + budget check; no writes. Reused by charge(). */
  async quote(principalId: string, req: ChargeRequest): Promise<Quote> {
    if (!isBillableUnit(req.unit)) throw errUnknownUnit(req.unit);
    const quantity = req.quantity ?? 1;
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw errInvalid("quantity must be a positive integer", { quantity });
    }
    if (
      req.maxCredits !== undefined &&
      (!Number.isInteger(req.maxCredits) || req.maxCredits < 0)
    ) {
      throw errInvalid("maxCredits must be a non-negative integer", {
        maxCredits: req.maxCredits,
      });
    }

    const uc = unitCredits(req.unit);
    const estimatedCredits = uc * quantity;
    const mk = monthKey(this.clock());

    let view: BudgetView | undefined;
    let wouldExceedBudget = false;
    const budget = await this.store.getBudget(principalId);
    if (budget) {
      const spent = await this.spendForBudget(principalId, budget, mk);
      view = {
        period: budget.period,
        limitCredits: budget.limitCredits,
        spentCredits: spent,
        remainingCredits: Math.max(0, budget.limitCredits - spent),
      };
      wouldExceedBudget = spent + estimatedCredits > budget.limitCredits;
    }

    const wouldExceedMax =
      req.maxCredits !== undefined && estimatedCredits > req.maxCredits;

    return {
      unit: req.unit,
      quantity,
      unitCredits: uc,
      estimatedCredits,
      maxCredits: req.maxCredits,
      wouldExceedMax,
      budget: view,
      wouldExceedBudget,
    };
  }

  async charge(principalId: string, req: ChargeRequest): Promise<ChargeResult> {
    const quote = await this.quote(principalId, req);

    if (req.dryRun) {
      return { charged: false, replayed: false, quote };
    }

    // Idempotent replay: same key → original receipt, no second charge.
    if (req.idempotencyKey) {
      const existing = await this.store.getReceiptByIdempotencyKey(
        principalId,
        req.idempotencyKey,
      );
      if (existing) {
        if (existing.unit !== quote.unit || existing.quantity !== quote.quantity) {
          throw errIdempotencyConflict(req.idempotencyKey);
        }
        return { charged: false, replayed: true, quote, receipt: existing };
      }
    }

    if (quote.wouldExceedMax && req.maxCredits !== undefined) {
      throw errCostExceedsMax(quote.estimatedCredits, req.maxCredits);
    }
    if (quote.wouldExceedBudget && quote.budget) {
      throw errSpendLimit(
        quote.estimatedCredits,
        quote.budget.spentCredits,
        quote.budget.limitCredits,
      );
    }

    const now = this.clock();
    const receipt: Receipt = {
      id: this.idGen(),
      principalId,
      unit: quote.unit as BillableUnit,
      quantity: quote.quantity,
      unitCredits: quote.unitCredits,
      totalCredits: quote.estimatedCredits,
      monthKey: monthKey(now),
      idempotencyKey: req.idempotencyKey,
      requestId: req.requestId,
      status: "charged",
      createdAt: now,
    };
    await this.store.insertReceipt(receipt);
    return { charged: true, replayed: false, quote, receipt };
  }

  async setBudget(
    principalId: string,
    input: { period: BudgetPeriod; limitCredits: number },
  ): Promise<Budget> {
    if (input.period !== "monthly" && input.period !== "total") {
      throw errInvalid("period must be 'monthly' or 'total'", { period: input.period });
    }
    if (!Number.isInteger(input.limitCredits) || input.limitCredits < 0) {
      throw errInvalid("limitCredits must be a non-negative integer", {
        limitCredits: input.limitCredits,
      });
    }
    const now = this.clock();
    const existing = await this.store.getBudget(principalId);
    const budget: Budget = {
      principalId,
      period: input.period,
      limitCredits: input.limitCredits,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await this.store.putBudget(budget);
    return budget;
  }

  async getBudget(principalId: string): Promise<Budget | undefined> {
    return this.store.getBudget(principalId);
  }

  async usage(principalId: string): Promise<UsageSummary> {
    const mk = monthKey(this.clock());
    const monthSpent = await this.store.sumSpendForMonth(principalId, mk);
    const totalSpent = await this.store.sumSpendTotal(principalId);
    const budget = await this.store.getBudget(principalId);
    const basis = budget?.period === "total" ? totalSpent : monthSpent;
    return {
      monthKey: mk,
      monthSpentCredits: monthSpent,
      totalSpentCredits: totalSpent,
      budget: budget
        ? {
            period: budget.period,
            limitCredits: budget.limitCredits,
            spentCredits: basis,
            remainingCredits: Math.max(0, budget.limitCredits - basis),
          }
        : null,
    };
  }

  async listReceipts(principalId: string, limit = 50): Promise<Receipt[]> {
    return this.store.listReceipts(principalId, Math.min(Math.max(1, limit), 200));
  }
}
