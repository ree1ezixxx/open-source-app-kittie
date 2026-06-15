import { eq } from "drizzle-orm";
import type { Db } from "../client.js";
import { sweepState, type SweepState } from "../schema.js";

export async function listSweepStates(db: Db): Promise<SweepState[]> {
  return db.select().from(sweepState);
}

export async function recordSweepRun(
  db: Db,
  name: string,
  summary: string | null,
): Promise<void> {
  const lastRunAt = new Date();
  await db
    .insert(sweepState)
    .values({ name, lastRunAt, lastSummary: summary })
    .onConflictDoUpdate({
      target: sweepState.name,
      set: { lastRunAt, lastSummary: summary },
    });
}

export async function getSweepState(db: Db, name: string): Promise<SweepState | null> {
  const [row] = await db.select().from(sweepState).where(eq(sweepState.name, name)).limit(1);
  return row ?? null;
}
