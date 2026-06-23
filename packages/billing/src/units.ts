/**
 * Billable units = the *useful outputs* an agent buys, never raw call count.
 * Agent loops over-call wildly; charging per result keeps spend legible and
 * aligns cost with value delivered. Prices are in integer "credits" (no floats
 * → no rounding drift); a credit's fiat value is set at the billing-account
 * layer (Stripe), out of scope for the metering core.
 */
export const BILLABLE_UNITS = {
  market_snapshot: { credits: 10, label: "Market snapshot" },
  decision_packet: { credits: 50, label: "Decision packet" },
  visual_teardown: { credits: 30, label: "Visual teardown" },
  blueprint: { credits: 100, label: "Implementation blueprint" },
  launch_audit: { credits: 75, label: "Launch audit" },
  scaffold: { credits: 60, label: "Scaffold generation" },
} as const;

export type BillableUnit = keyof typeof BILLABLE_UNITS;

export function isBillableUnit(x: string): x is BillableUnit {
  return Object.prototype.hasOwnProperty.call(BILLABLE_UNITS, x);
}

export function unitCredits(unit: BillableUnit): number {
  return BILLABLE_UNITS[unit].credits;
}

export interface UnitInfo {
  unit: BillableUnit;
  credits: number;
  label: string;
}

export function listUnits(): UnitInfo[] {
  return (Object.keys(BILLABLE_UNITS) as BillableUnit[]).map((unit) => ({
    unit,
    credits: BILLABLE_UNITS[unit].credits,
    label: BILLABLE_UNITS[unit].label,
  }));
}
