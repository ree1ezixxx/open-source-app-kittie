/* ============================================================
   Additive lane — Tracked Apps. /dashboard/monitor/tracked
   The durable server-side watch-list (Tracked app, CONTEXT.md):
   track a competitor, the capture sweep diffs its live listing
   against the stored baseline, and the change timeline accrues
   here. All data REAL (routes/monitor.ts). Distinct from
   Favorites (client-only bookmark) by design.
   ============================================================ */
import { useEffect, useRef, useState } from "react";
import { PageShell } from "../../components/PageShell";
import {
  IconChevron,
  IconClose,
  IconPlus,
  IconRefresh,
  IconSearch,
} from "../../icons";
import { searchPickerApps, type PickerApp } from "../../lib/api/compare";
import {
  fetchAppChanges,
  fetchTrackedApps,
  fieldLabel,
  formatChangeValue,
  runSweep,
  trackApp,
  untrackApp,
  updateTrackedNote,
  type AppChangeEntry,
  type SweepResult,
  type TrackedAppEntry,
} from "../../lib/api/monitor";
import { formatDate } from "../../lib/format";
import type { Theme } from "../../lib/theme";
import "../../styles/monitor.css";

function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.floor(ms / 3600_000);
  if (h < 1) return "just now";
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

/* ------------------------------------------------ add-app picker */

function TrackPicker({ onTracked }: { onTracked: () => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PickerApp[]>([]);
  const [busy, setBusy] = useState(false);
  const ctrl = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    ctrl.current?.abort();
    const ac = new AbortController();
    ctrl.current = ac;
    const t = window.setTimeout(() => {
      searchPickerApps(query, ac.signal)
        .then(setResults)
        .catch(() => {});
    }, 250);
    return () => {
      window.clearTimeout(t);
      ac.abort();
    };
  }, [query]);

  async function add(app: PickerApp) {
    setBusy(true);
    try {
      await trackApp(app.id);
      setOpen(false);
      setQuery("");
      setResults([]);
      onTracked();
    } catch {
      /* surface stays; retry is one click */
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button className="btn btn-accent" onClick={() => setOpen(true)}>
        <IconPlus /> Track an app
      </button>
    );
  }

  return (
    <div className="mon-picker">
      <div className="mon-picker-input">
        <IconSearch style={{ width: 14, height: 14 }} />
        <input
          autoFocus
          placeholder="Search apps to track…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="icon-btn" onClick={() => setOpen(false)} aria-label="Close">
          <IconClose />
        </button>
      </div>
      {results.length > 0 && (
        <div className="mon-picker-results">
          {results.map((r) => (
            <button key={r.id} className="mon-picker-row" disabled={busy} onClick={() => add(r)}>
              {r.iconUrl ? <img src={r.iconUrl} alt="" /> : <span className="mon-picker-fallback" />}
              <span className="mon-picker-title">{r.title}</span>
              <span className="mon-picker-dev">{r.developer}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------- change timeline */

function ChangeTimeline({ appId }: { appId: string }) {
  const [changes, setChanges] = useState<AppChangeEntry[] | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    fetchAppChanges(appId, 200, ac.signal)
      .then(setChanges)
      .catch(() => setChanges([]));
    return () => ac.abort();
  }, [appId]);

  if (changes === null) return <div className="mon-timeline-empty">Loading…</div>;
  if (changes.length === 0)
    return (
      <div className="mon-timeline-empty">
        No changes recorded yet — the diff starts after the second capture.
      </div>
    );

  return (
    <div className="mon-timeline">
      {changes.map((c) => (
        <div className="mon-change" key={c.id}>
          <span className="mon-change-field">{fieldLabel(c.field)}</span>
          <span className="mon-change-old">{formatChangeValue(c.field, c.oldValue)}</span>
          <span className="mon-change-arrow">→</span>
          <span className="mon-change-new">{formatChangeValue(c.field, c.newValue)}</span>
          <span className="mon-change-when">{formatDate(c.capturedAt)}</span>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------- main page */

export function TrackedAppsPage({
  theme,
  onToggleTheme,
}: {
  theme: Theme;
  onToggleTheme: () => void;
}) {
  const [entries, setEntries] = useState<TrackedAppEntry[] | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState<Record<string, string>>({});
  const [sweeping, setSweeping] = useState(false);
  const [sweepResult, setSweepResult] = useState<SweepResult | null>(null);

  function reload() {
    fetchTrackedApps()
      .then(setEntries)
      .catch(() => setEntries([]));
  }

  useEffect(() => {
    reload();
  }, []);

  async function remove(appId: string) {
    await untrackApp(appId).catch(() => {});
    reload();
  }

  async function saveNote(appId: string) {
    const note = (noteDraft[appId] ?? "").trim();
    await updateTrackedNote(appId, note === "" ? null : note).catch(() => {});
    reload();
  }

  async function captureNow() {
    setSweeping(true);
    setSweepResult(null);
    try {
      const r = await runSweep();
      setSweepResult(r);
      reload();
    } catch {
      /* sweep button stays usable */
    } finally {
      setSweeping(false);
    }
  }

  return (
    <PageShell
      title="Tracked Apps"
      sub="Server-side watch-list — every change to a tracked app's listing is recorded"
      count={entries ? entries.length : undefined}
      theme={theme}
      onToggleTheme={onToggleTheme}
      actions={
        <>
          <button className="btn" onClick={captureNow} disabled={sweeping}>
            <IconRefresh /> {sweeping ? "Capturing…" : "Capture now"}
          </button>
          <TrackPicker onTracked={reload} />
        </>
      }
    >
      <div className="mon-wrap">
        {sweepResult && (
          <div className="mon-sweep-note">
            Captured {sweepResult.captured}/{sweepResult.scanned} apps · +{sweepResult.changes}{" "}
            changes · +{sweepResult.alerts} alerts
          </div>
        )}

        {entries === null && <div className="mon-empty">Loading…</div>}

        {entries !== null && entries.length === 0 && (
          <div className="mon-empty">
            <div className="mon-empty-title">Track your first competitor</div>
            <p>
              Changes start accruing from the first capture — price moves, metadata edits,
              screenshot swaps, rating drops. The longer an app is tracked, the deeper its history.
            </p>
          </div>
        )}

        {entries !== null && entries.length > 0 && (
          <div className="mon-list">
            {entries.map((e) => {
              const isOpen = expanded === e.appId;
              return (
                <div className={`mon-card${isOpen ? " open" : ""}`} key={e.id}>
                  <button
                    className="mon-card-head"
                    onClick={() => setExpanded(isOpen ? null : e.appId)}
                  >
                    {e.app.iconUrl ? (
                      <img className="mon-card-icon" src={e.app.iconUrl} alt="" />
                    ) : (
                      <span className="mon-card-icon mon-picker-fallback" />
                    )}
                    <span className="mon-card-main">
                      <span className="mon-card-title">{e.app.title}</span>
                      <span className="mon-card-dev">
                        {e.app.developer}
                        {e.app.category ? ` · ${e.app.category}` : ""}
                      </span>
                    </span>
                    <span className="mon-card-meta">
                      <span className="mon-card-cap">captured {timeAgo(e.lastCapturedAt)}</span>
                      <IconChevron
                        style={{
                          width: 14,
                          height: 14,
                          transform: isOpen ? "rotate(180deg)" : undefined,
                        }}
                      />
                    </span>
                  </button>

                  {isOpen && (
                    <div className="mon-card-body">
                      <div className="mon-note-row">
                        <input
                          className="mon-note-input"
                          placeholder="Add a note (why you're watching this app)…"
                          value={noteDraft[e.appId] ?? e.note ?? ""}
                          onChange={(ev) =>
                            setNoteDraft((d) => ({ ...d, [e.appId]: ev.target.value }))
                          }
                          onBlur={() => saveNote(e.appId)}
                        />
                        <button className="btn mon-untrack" onClick={() => remove(e.appId)}>
                          <IconClose /> Untrack
                        </button>
                      </div>
                      <ChangeTimeline appId={e.appId} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </PageShell>
  );
}
