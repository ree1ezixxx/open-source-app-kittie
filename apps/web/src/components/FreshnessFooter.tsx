import { useEffect, useState } from "react";

interface FreshnessData {
  dataAsOf: string | null;
  running: string | null;
}

/**
 * Sidebar status footer for the freshness scheduler: "data as of <date>",
 * with a pulse + sweep name while a background sweep is running.
 */
export function FreshnessFooter() {
  const [status, setStatus] = useState<FreshnessData | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/v1/freshness");
        if (!res.ok) return;
        const body = (await res.json()) as { data: FreshnessData };
        if (alive) setStatus(body.data);
      } catch {
        /* API down — footer simply stays quiet */
      }
    };
    void load();
    const timer = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  if (!status) return null;

  const asOf = status.dataAsOf
    ? new Date(status.dataAsOf).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      })
    : null;

  return (
    <div className="sidebar-foot freshness-foot" title={status.running ? `Sweep running: ${status.running}` : undefined}>
      {status.running ? (
        <span className="freshness-line">
          <span className="freshness-pulse" aria-hidden />
          updating · {status.running}
        </span>
      ) : asOf ? (
        <span className="freshness-line">data as of {asOf}</span>
      ) : (
        <span className="freshness-line">data syncing soon</span>
      )}
    </div>
  );
}
