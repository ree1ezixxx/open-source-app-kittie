import { useState, type ReactNode } from "react";
import { IconChevron } from "../icons";

/** Collapsible filter section. Collapsed sections show a one-line summary of what's set. */
export function FilterGroup({
  label,
  summary,
  active = false,
  defaultOpen = false,
  children,
}: {
  label: string;
  summary?: string;
  active?: boolean;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`fgroup ${open ? "open" : ""}`}>
      <button className="fgroup-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="fgroup-label">
          {label}
          {active && <span className="fgroup-dot" aria-hidden />}
        </span>
        {!open && summary ? <span className="fgroup-summary">{summary}</span> : null}
        <IconChevron className="fgroup-chev" />
      </button>
      {open && <div className="fgroup-body">{children}</div>}
    </div>
  );
}

/** Small label above a control inside a group (e.g. "Rating", "Window"). */
export function SubLabel({ children }: { children: ReactNode }) {
  return <div className="filter-sublabel">{children}</div>;
}
