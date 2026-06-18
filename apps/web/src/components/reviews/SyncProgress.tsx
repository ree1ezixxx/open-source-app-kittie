/* ============================================================
   On-add sync modal — truth parity. 5 stages over the real SSE
   milestones from GET /apps/:id/sync-reviews/stream (no faked timers):
     Validating URL → Fetching App Info → Extracting Reviews (live X/500)
     → Analyzing Reviews → Preparing Dashboard
   Overall % bar. Cancel aborts the stream (app not registered). Minimize
   collapses to a background pill while the sync keeps running; on done the
   app registers either way (no forced navigation when minimized).
   ============================================================ */
import { useEffect, useRef, useState } from "react";
import { streamSyncReviews, type ReviewSyncResult, type MonitoredApp } from "../../lib/api/reviews";
import { IconClose, IconCheck, IconApple, IconGooglePlay } from "../../icons";

type Phase = "appinfo" | "extracting" | "analyzing" | "preparing" | "done" | "error";

const STAGES = [
  "Validating URL",
  "Fetching App Info",
  "Extracting Reviews",
  "Analyzing Reviews",
  "Preparing Dashboard",
];
// phase → index of the *active* stage (earlier stages are done). 5 = all done.
const PHASE_INDEX: Record<Phase, number> = { appinfo: 1, extracting: 2, analyzing: 3, preparing: 4, done: 5, error: -1 };
const EXPECTED = 500; // truth indexes the latest 500 on add

export function SyncProgress({
  app,
  onComplete,
  onClose,
}: {
  app: MonitoredApp;
  onComplete: (app: MonitoredApp, result: ReviewSyncResult, background: boolean) => void;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("appinfo");
  const [fetched, setFetched] = useState(0);
  const [result, setResult] = useState<ReviewSyncResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [minimized, setMinimized] = useState(false);
  const completed = useRef(false);
  const cancelRef = useRef<(() => void) | null>(null);
  const minRef = useRef(false); // read current minimized state inside the stream callbacks

  useEffect(() => {
    cancelRef.current = streamSyncReviews(app.id, {
      onFetch: (n) => { setPhase("extracting"); setFetched(n); },
      onAnalyse: () => setPhase("analyzing"),
      onSave: () => setPhase("preparing"),
      onDone: (r) => {
        setPhase("done");
        setResult(r);
        if (!completed.current) { completed.current = true; onComplete(app, r, minRef.current); }
      },
      onError: (m) => { setPhase("error"); setErr(m); },
    });
    return () => cancelRef.current?.();
    // app.id is stable for the life of this modal
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.id]);

  const active = phase === "extracting" || phase === "analyzing" || phase === "preparing" || phase === "appinfo";
  const idx = PHASE_INDEX[phase];
  const pct =
    phase === "done" ? 100
    : phase === "error" ? 0
    : phase === "extracting" ? Math.round(12 + Math.min(fetched / EXPECTED, 1) * 60)
    : phase === "analyzing" ? 84
    : phase === "preparing" ? 94
    : 12; // appinfo

  const cancel = () => { cancelRef.current?.(); onClose(); };
  const minimize = () => { minRef.current = true; setMinimized(true); };

  const AppIcon = () => app.iconUrl
    ? <img className="app-icon" src={app.iconUrl} alt="" referrerPolicy="no-referrer" />
    : <div className="app-icon placeholder">{app.title.charAt(0)}</div>;

  // ---- minimized background pill ----
  if (minimized) {
    return (
      <div className="rv-sync-pill" role="status">
        <AppIcon />
        <div className="rv-sync-pill-meta">
          <div className="rv-sync-pill-title">{app.title}</div>
          <div className="rv-sync-pill-sub">
            {phase === "done" ? "Added ✓" : phase === "error" ? "Sync failed" : `${STAGES[Math.min(idx, 4)]}… ${pct}%`}
          </div>
          {phase !== "done" && phase !== "error" && (
            <div className="rv-sync-pill-bar"><span style={{ width: `${pct}%` }} /></div>
          )}
        </div>
        {phase === "done" || phase === "error"
          ? <button className="drawer-close" style={{ position: "static" }} onClick={onClose} aria-label="Dismiss"><IconClose /></button>
          : <button className="rv-sync-pill-expand" onClick={() => setMinimized(false)}>Show</button>}
      </div>
    );
  }

  // ---- full modal ----
  return (
    <div className="rv-modal-backdrop" onClick={phase === "done" || phase === "error" ? onClose : undefined}>
      <div className="rv-sync" onClick={(e) => e.stopPropagation()}>
        <div className="rv-sync-head">
          <AppIcon />
          <div className="rv-sync-head-meta">
            <div className="rv-sync-title">
              {app.store === "apple" ? <IconApple style={{ width: 12, height: 12 }} /> : <IconGooglePlay style={{ width: 12, height: 12 }} />}
              {app.title}
            </div>
            <div className="rv-sync-sub">
              {phase === "done" ? "Now monitored" : phase === "error" ? "Couldn’t finish" : "Adding app…"}
            </div>
          </div>
          {(phase === "done" || phase === "error") && (
            <button className="drawer-close" style={{ position: "static" }} onClick={onClose} aria-label="Close"><IconClose /></button>
          )}
        </div>

        {/* overall progress */}
        {phase !== "error" && (
          <div className="rv-sync-progress">
            <div className="rv-sync-progress-head">
              <span>{phase === "done" ? "Complete" : STAGES[Math.min(idx, 4)]}</span>
              <span className="rv-num">{pct}%</span>
            </div>
            <div className="rv-sync-bar"><span style={{ width: `${pct}%` }} /></div>
          </div>
        )}

        <ul className="rv-sync-steps">
          {STAGES.map((label, i) => {
            const state = phase === "done" || idx > i ? "done" : idx === i ? "active" : "pending";
            const detail = label === "Extracting Reviews" && (state === "active" || state === "done")
              ? `${Math.min(fetched, EXPECTED)} / ${EXPECTED}` : "";
            return (
              <li className={`rv-sync-step ${state}`} key={label}>
                <span className="rv-sync-dot">
                  {state === "done" ? <IconCheck style={{ width: 12, height: 12 }} /> : state === "active" ? <span className="rv-sync-spin" /> : null}
                </span>
                <span className="rv-sync-label">{label}</span>
                <span className="rv-sync-detail rv-num">{detail}</span>
              </li>
            );
          })}
        </ul>

        {phase === "error" && <div className="rv-sync-err">{err}</div>}

        {active && (
          <>
            <div className="rv-sync-actions">
              <button className="btn" onClick={cancel}>Cancel</button>
              <button className="btn" onClick={minimize}>Minimize</button>
            </div>
            <p className="rv-sync-hint">You can minimize this — the sync keeps running in the background. Apps with more reviews take longer to finish.</p>
          </>
        )}
        {phase === "done" && <button className="btn btn-accent rv-sync-cta" onClick={onClose}>View reviews</button>}
        {phase === "error" && <button className="btn rv-sync-cta" onClick={onClose}>Close</button>}
      </div>
    </div>
  );
}
