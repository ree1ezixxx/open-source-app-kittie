import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Store } from "@kittie/types";
import { IconApple, IconCheck, IconChevron, IconGooglePlay, IconSearch } from "../icons";

export type FilterSelectItem = {
  id: string;
  label: string;
  /** Stores this item appears in — renders Apple / Google glyphs on the row (truth parity). */
  stores?: Store[];
};

/** Dropdown trigger + scrollable multi-select popover (Explore category / language filters). */
export function FilterSelectPopover({
  label,
  items,
  selected,
  onToggle,
  header,
  emptyHint = "Loading…",
  searchable = false,
  searchPlaceholder = "Search…",
}: {
  label: string;
  items: FilterSelectItem[];
  selected: string[];
  onToggle: (id: string) => void;
  header?: ReactNode;
  emptyHint?: string;
  /** Show a type-to-filter box at the top of the popover (truth category behaviour). */
  searchable?: boolean;
  searchPlaceholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
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

  // Reset the filter each time the popover closes so it reopens clean.
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const shown = useMemo(() => {
    if (!searchable || !query.trim()) return items;
    const q = query.trim().toLowerCase();
    return items.filter((it) => it.label.toLowerCase().includes(q));
  }, [items, query, searchable]);

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
            {searchable && (
              <div className="fselect-search">
                <IconSearch className="fselect-search-icon" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={searchPlaceholder}
                  aria-label={searchPlaceholder}
                  spellCheck={false}
                  autoFocus
                />
              </div>
            )}
            {items.length === 0 ? (
              <div className="filter-hint">{emptyHint}</div>
            ) : shown.length === 0 ? (
              <div className="filter-hint">No matches</div>
            ) : (
              <div className="fselect-list">
                {shown.map((it) => {
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
                      <span className={`fselect-radio ${on ? "on" : ""}`}>
                        {on && <IconCheck className="fselect-radio-check" />}
                      </span>
                      <span className="fselect-item-label">{it.label}</span>
                      {it.stores && it.stores.length > 0 && (
                        <span className="fselect-item-stores">
                          {it.stores.includes("apple") && <IconApple />}
                          {it.stores.includes("google") && <IconGooglePlay />}
                        </span>
                      )}
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
