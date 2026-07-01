import { randomUUID } from "node:crypto";

/** Injectable time + id sources so services are deterministic under test. */
export type Clock = () => number;
export type IdGen = () => string;

export const systemClock: Clock = () => Date.now();
export const uuidGen: IdGen = () => randomUUID();

/** UTC month bucket (YYYY-MM) used for monthly budget accounting. */
export function monthKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
