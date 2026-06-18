/**
 * Retry a DB op on SQLITE_BUSY with jittered backoff.
 *
 * libsql's local driver does NOT honor `busy_timeout` across its connections, so under
 * concurrent writers (catalog drainers, snapshot backfill, the API) any write can fail
 * instantly with "SQLITE_BUSY: database is locked". BUSY is always transient — the lock
 * or checkpoint releases — so we wait our turn instead of dying. Mirrors the catalog
 * lane's helper (packages/ingest/src/db/queue.ts) so every lane writes the same way.
 */
export async function retryBusy<T>(fn: () => Promise<T>, tries = 1000): Promise<T> {
  let delay = 40;
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const s = `${(err as { code?: string })?.code ?? ""} ${(err as Error)?.message ?? ""} ${
        (err as { cause?: { code?: string } })?.cause?.code ?? ""
      } ${(err as { cause?: { cause?: { code?: string } } })?.cause?.cause?.code ?? ""}`;
      if (attempt < tries && /SQLITE_BUSY|database is locked|database table is locked|locked/i.test(s)) {
        await new Promise((r) => setTimeout(r, delay + Math.floor(Math.random() * delay)));
        delay = Math.min(Math.floor(delay * 1.5), 4000);
        continue;
      }
      throw err;
    }
  }
}
