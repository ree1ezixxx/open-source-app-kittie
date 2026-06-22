/* ============================================================
   App selector — truth-parity "All Apps {N}" dropdown.
   Replaces the old left rail. Rows: All Apps (aggregate; Overview
   only) · per-app (icon + name + indexed count + refresh + remove)
   · Add App footer. Click-away / Escape to close.
   ============================================================ */
import { useEffect, useRef, useState } from "react";
import type { MonitoredApp } from "../../lib/api/reviews";
import { formatCompact } from "../../lib/format";
import { IconChevron, IconCheck, IconGrid, IconRefresh, IconClose, IconPlus } from "../../icons";

const ALL_APPS = "__all__";

export function AppSelector({
  monitored,
  selectedId,
  isAll,
  allowAll,
  indexed,
  busyId,
  onSelect,
  onRefreshApp,
  onRemoveApp,
  onAddApp,
}: {
  monitored: MonitoredApp[];
  selectedId: string | null;
  isAll: boolean;
  allowAll: boolean;
  indexed: Record<string, number>;
  busyId: string | null;
  onSelect: (id: string) => void;
  onRefreshApp: (id: string) => void;
  onRemoveApp: (id: string) => void;
  onAddApp: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const selected = monitored.find((a) => a.id === selectedId) || null;
  const showAll = isAll && allowAll;
  const showEmptyAll = allowAll && monitored.length === 0;
  const label = showAll || showEmptyAll ? "All Apps" : selected ? selected.title : "Select an app";

  const appIcon = (a: MonitoredApp | null, size: number) =>
    a?.iconUrl
      ? <img className="rv-appsel-img" src={a.iconUrl} alt="" referrerPolicy="no-referrer" />
      : a
        ? <span className="rv-appsel-ph">{a.title.charAt(0)}</span>
        : <IconGrid style={{ width: size, height: size }} />;

  return (
    <div className="rv-appsel" ref={ref}>
      <button
        className="rv-appsel-btn"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="rv-appsel-ic">{appIcon(showAll || showEmptyAll ? null : selected, 15)}</span>
        <span className="rv-appsel-label">{label}</span>
        {(showEmptyAll || monitored.length > 0) && <span className="rv-appsel-count">{monitored.length}</span>}
        <IconChevron className={`rv-appsel-chev ${open ? "up" : ""}`} style={{ width: 15, height: 15 }} />
      </button>

      {open && (
        <div className="rv-appsel-menu" role="listbox">
          {allowAll && monitored.length > 0 && (
            <button className="rv-appsel-row rv-appsel-all" onClick={() => { onSelect(ALL_APPS); setOpen(false); }}>
              <span className="rv-appsel-ic"><IconGrid style={{ width: 16, height: 16 }} /></span>
              <span className="rv-appsel-rowmeta">
                <span className="rv-appsel-rowname">All Apps</span>
                <span className="rv-appsel-rowsub">View aggregate data across all monitored apps</span>
              </span>
              {showAll && <IconCheck className="rv-appsel-check" style={{ width: 16, height: 16 }} />}
            </button>
          )}

          {monitored.map((a) => {
            const isSel = !showAll && selectedId === a.id;
            return (
              <div className={`rv-appsel-row ${isSel ? "on" : ""}`} key={a.id}>
                <button className="rv-appsel-pick" onClick={() => { onSelect(a.id); setOpen(false); }}>
                  <span className="rv-appsel-ic">{appIcon(a, 16)}</span>
                  <span className="rv-appsel-rowmeta">
                    <span className="rv-appsel-rowname">{a.title}</span>
                    <span className="rv-appsel-rowsub">
                      {indexed[a.id] != null ? `${formatCompact(indexed[a.id]!)} reviews` : "…"}
                    </span>
                  </span>
                  {isSel && <IconCheck className="rv-appsel-check" style={{ width: 16, height: 16 }} />}
                </button>
                <button
                  className="rv-appsel-act rv-appsel-refresh"
                  disabled={busyId === a.id}
                  title={`Refresh ${a.title}`}
                  aria-label={`Refresh ${a.title}`}
                  onClick={() => onRefreshApp(a.id)}
                >
                  <IconRefresh className={busyId === a.id ? "rv-spin" : ""} style={{ width: 15, height: 15 }} />
                </button>
                <button
                  className="rv-appsel-act rv-appsel-remove"
                  title={`Stop monitoring ${a.title}`}
                  aria-label={`Stop monitoring ${a.title}`}
                  onClick={() => onRemoveApp(a.id)}
                >
                  <IconClose style={{ width: 14, height: 14 }} />
                </button>
              </div>
            );
          })}

          <button className="rv-appsel-add" onClick={() => { onAddApp(); setOpen(false); }}>
            <IconPlus style={{ width: 15, height: 15 }} /> Add App
          </button>
        </div>
      )}
    </div>
  );
}
