/**
 * Injectable clock + id generator. The real implementations use the system
 * clock and UUIDs; tests inject deterministic stubs so persisted state is
 * byte-stable and round-trips can be asserted.
 */
import { randomUUID } from "node:crypto";

/** Returns the current time in epoch milliseconds. */
export type Clock = () => number;

/** Returns a fresh unique id. */
export type IdGen = () => string;

export const systemClock: Clock = () => Date.now();
export const uuidGen: IdGen = () => randomUUID();

/** ISO-8601 string for an epoch-ms instant. */
export function isoFrom(ms: number): string {
  return new Date(ms).toISOString();
}
