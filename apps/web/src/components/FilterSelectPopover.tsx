import { useEffect, useRef, useState, type ReactNode } from "react";
import { IconCheck, IconChevron } from "../icons";

export type FilterSelectItem = { id: string; label: string };

/** Dropdown trigger + scrollable multi-select popover (Explore category / language filters). */
export function FilterSelectPopover({
  label,
  items,
  selected,
  onToggle,
  header,
  emptyHint = "Loading…",
}: {
  label: string;
  items: FilterSelectItem[];
  selected: string[];
  onToggle: (id: string) => void;
  header?: ReactNode;
  emptyHint?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="fselect-wrap" ref={wrapRef}>
      <button
        type="button"
        className={`fselect-trigger ${open ? "open" : ""} ${selected.length > 0 ? "active" : ""}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="fselect-trigger-label">{label}</span>
        <IconChevron className="fselect-trigger-chev" />
      </button>
      {open && (
        <>
          <div className="fselect-backdrop" onClick={() => setOpen(false)} aria-hidden />
          <div className="fselect-popover" role="listbox" aria-label={label}>
            {header}
            {items.length === 0 ? (
              <div className="filter-hint">{emptyHint}</div>
            ) : (
              <div className="fselect-list">
                {items.map((it) => {
                  const on = selected.includes(it.id);
                  return (
                    <button
                      key={it.id}
                      type="button"
                      role="option"
                      aria-selected={on}
                      className={`fselect-item ${on ? "on" : ""}`}
                      onClick={() => onToggle(it.id)}
                    >
                      <span className="fselect-item-label">{it.label}</span>
                      {on && <IconCheck className="fselect-item-check" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
