import { useMemo, useState } from "react";
import { IconChevron } from "../icons";

export type DateMode = "after" | "before" | "range";

/** Days between `date` (local midnight) and today (local midnight). today = 0. */
function daysAgo(date: Date): number {
  const d0 = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const t0 = new Date().setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((t0 - d0) / 86_400_000));
}
const fromDaysAgo = (n: number): Date => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d;
};
const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

/**
 * Truth-parity Custom date dialog for the Explore Time filter. Modes After / Before /
 * Range over a month grid, committed with Apply. Emits days-ago bounds:
 *  - `within`  = released within N days (after-bound / most recent)
 *  - `atLeast` = released at least N days ago (before-bound / oldest)
 */
export function DatePickerDialog({
  within,
  atLeast,
  onApply,
  onClose,
}: {
  within?: number;
  atLeast?: number;
  onApply: (next: { within?: number; atLeast?: number }) => void;
  onClose: () => void;
}) {
  const initMode: DateMode =
    within != null && atLeast != null ? "range" : atLeast != null ? "before" : "after";
  const [mode, setMode] = useState<DateMode>(initMode);
  const [start, setStart] = useState<Date | null>(within != null ? fromDaysAgo(within) : null);
  const [end, setEnd] = useState<Date | null>(atLeast != null ? fromDaysAgo(atLeast) : null);
  const [view, setView] = useState<Date>(() => {
    const seed = within != null ? fromDaysAgo(within) : atLeast != null ? fromDaysAgo(atLeast) : new Date();
    return new Date(seed.getFullYear(), seed.getMonth(), 1);
  });

  const grid = useMemo(() => {
    const first = new Date(view.getFullYear(), view.getMonth(), 1);
    const lead = first.getDay();
    const cells: Date[] = [];
    for (let i = 0; i < 42; i++) cells.push(new Date(view.getFullYear(), view.getMonth(), 1 - lead + i));
    return cells;
  }, [view]);

  const today = new Date();
  const pick = (d: Date) => {
    if (mode === "range") {
      if (!start || (start && end)) {
        setStart(d);
        setEnd(null);
      } else {
        if (d < start) {
          setEnd(start);
          setStart(d);
        } else setEnd(d);
      }
    } else {
      setStart(d);
      setEnd(null);
    }
  };

  const isSelected = (d: Date) =>
    (start && sameDay(d, start)) || (end && sameDay(d, end));
  const inRange = (d: Date) => mode === "range" && start && end && d > start && d < end;

  const apply = () => {
    if (mode === "after") onApply({ within: start ? daysAgo(start) : undefined, atLeast: undefined });
    else if (mode === "before") onApply({ within: undefined, atLeast: start ? daysAgo(start) : undefined });
    else
      onApply({
        within: start ? daysAgo(start) : undefined,
        atLeast: end ? daysAgo(end) : undefined,
      });
    onClose();
  };

  return (
    <>
      <div style={{ position: "fixed", inset: 0, zIndex: 39 }} onClick={onClose} />
      <div className="datepick" role="dialog" aria-label="Custom date range">
        <div className="datepick-modes seg-mini">
          {(["after", "before", "range"] as DateMode[]).map((m) => (
            <button
              key={m}
              type="button"
              className={mode === m ? "on" : ""}
              onClick={() => {
                setMode(m);
                setEnd(null);
              }}
            >
              {m === "after" ? "After" : m === "before" ? "Before" : "Range"}
            </button>
          ))}
        </div>

        <div className="datepick-head">
          <button
            type="button"
            className="datepick-nav"
            aria-label="Previous month"
            onClick={() => setView((v) => new Date(v.getFullYear(), v.getMonth() - 1, 1))}
          >
            <IconChevron style={{ transform: "rotate(90deg)" }} />
          </button>
          <span className="datepick-month">
            {MONTHS[view.getMonth()]} {view.getFullYear()}
          </span>
          <button
            type="button"
            className="datepick-nav"
            aria-label="Next month"
            onClick={() => setView((v) => new Date(v.getFullYear(), v.getMonth() + 1, 1))}
          >
            <IconChevron style={{ transform: "rotate(-90deg)" }} />
          </button>
        </div>

        <div className="datepick-grid">
          {WEEKDAYS.map((w) => (
            <span key={w} className="datepick-wd">{w}</span>
          ))}
          {grid.map((d, i) => {
            const muted = d.getMonth() !== view.getMonth();
            const future = d > today;
            return (
              <button
                key={i}
                type="button"
                disabled={future}
                className={[
                  "datepick-day",
                  muted ? "muted" : "",
                  isSelected(d) ? "sel" : "",
                  inRange(d) ? "inrange" : "",
                ].filter(Boolean).join(" ")}
                onClick={() => pick(d)}
              >
                {d.getDate()}
              </button>
            );
          })}
        </div>

        <div className="datepick-foot">
          <button type="button" className="link-btn" onClick={() => { setStart(null); setEnd(null); }}>
            Clear
          </button>
          <button type="button" className="btn btn-accent" onClick={apply}>
            Apply
          </button>
        </div>
      </div>
    </>
  );
}
