/* ============================================================
   On-add 5-stage progress modal. Streams the real SSE milestones from
   GET /apps/:id/sync-reviews/stream (start → fetch* → analyse → save → done)
   so the bar tracks actual backend work — no faked timers. On done it
   registers the app (onComplete) and the user lands on populated tabs.
   ============================================================ */
import { useEffect, useRef, useState } from "react";
import { streamSyncReviews, type ReviewSyncResult, type MonitoredApp } from "../../lib/api/reviews";
import { IconClose, IconCheck, IconApple, IconGooglePlay } from "../../icons";

type Phase = "connecting" | "fetch" | "analyse" | "save" | "done" | "error";
const ORDER: Phase[] = ["connecting", "fetch", "analyse", "save", "done"];

const STEPS: { phase: Phase; label: string }[] = [
  { phase: "connecting", label: "Connecting" },
  { phase: "fetch", label: "Fetching latest reviews" },
  { phase: "analyse", label: "Analysing sentiment & topics" },
  { phase: "save", label: "Saving new reviews" },
  { phase: "done", label: "Done" },
];

export function SyncProgress({
  app,
  onComplete,
  onClose,
}: {
  app: MonitoredApp;
  onComplete: (app: MonitoredApp, result: ReviewSyncResult) => void;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("connecting");
  const [fetched, setFetched] = useState(0);
  const [saved, setSaved] = useState<number | null>(null);
  const [result, setResult] = useState<ReviewSyncResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const completed = useRef(false);

  useEffect(() => {
    const cancel = streamSyncReviews(app.id, {
      onFetch: (n) => { setPhase("fetch"); setFetched(n); },
      onAnalyse: () => setPhase("analyse"),
      onSave: (n) => { setPhase("save"); setSaved(n); },
      onDone: (r) => {
        setPhase("done");
        setResult(r);
        if (!completed.current) { completed.current = true; onComplete(app, r); }
      },
      onError: (m) => { setPhase("error"); setErr(m); },
    });
    return cancel;
    // app.id is stable for the life of this modal
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.id]);

  const curIdx = ORDER.indexOf(phase === "error" ? "connecting" : phase);
  const detail = (p: Phase): string => {
    if (p === "fetch") return fetched ? `${fetched} pulled` : "";
    if (p === "save" && saved != null) return saved > 0 ? `${saved} new` : "up to date";
    if (p === "done" && result) return result.synced > 0 ? `+${result.synced} reviews` : "already current";
    return "";
  };

  return (
    <div className="rv-modal-backdrop" onClick={phase === "done" || phase === "error" ? onClose : undefined}>
      <div className="rv-sync" onClick={(e) => e.stopPropagation()}>
        <div className="rv-sync-head">
          {app.iconUrl ? (
            <img className="app-icon" src={app.iconUrl} alt="" referrerPolicy="no-referrer" />
          ) : (
            <div className="app-icon placeholder">{app.title.charAt(0)}</div>
          )}
          <div className="rv-sync-head-meta">
            <div className="rv-sync-title">
              {app.store === "apple" ? <IconApple style={{ width: 12, height: 12 }} /> : <IconGooglePlay style={{ width: 12, height: 12 }} />}
              {app.title}
            </div>
            <div className="rv-sync-sub">
              {phase === "done" ? "Now monitored" : phase === "error" ? "Couldn’t finish" : "Setting up monitoring…"}
            </div>
          </div>
          {(phase === "done" || phase === "error") && (
            <button className="drawer-close" style={{ position: "static" }} onClick={onClose} aria-label="Close">
              <IconClose />
            </button>
          )}
        </div>

        <ul className="rv-sync-steps">
          {STEPS.map((s, i) => {
            const state = curIdx > i || phase === "done" ? "done" : curIdx === i ? "active" : "pending";
            return (
              <li className={`rv-sync-step ${state}`} key={s.phase}>
                <span className="rv-sync-dot">
                  {state === "done" ? <IconCheck style={{ width: 12, height: 12 }} /> : state === "active" ? <span className="rv-sync-spin" /> : null}
                </span>
                <span className="rv-sync-label">{s.label}</span>
                <span className="rv-sync-detail">{detail(s.phase)}</span>
              </li>
            );
          })}
        </ul>

        {phase === "error" && <div className="rv-sync-err">{err}</div>}

        {phase === "done" && (
          <button className="btn btn-accent rv-sync-cta" onClick={onClose}>View reviews</button>
        )}
      </div>
    </div>
  );
}
