import type { ReactNode } from "react";

/** Single-select pill row (Source, Price, Time window, Growth direction…). */
export function Pills<T extends string | number>({
  value,
  options,
  onSelect,
}: {
  value: T;
  options: { id: T; label: string; icon?: ReactNode }[];
  onSelect: (v: T) => void;
}) {
  return (
    <div className="pill-row">
      {options.map((o) => (
        <button
          key={String(o.id)}
          className={`fpill ${value === o.id ? "on" : ""}`}
          onClick={() => onSelect(o.id)}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Multi-toggle pill (Marketing signals, Contacts). `disabled` greys it out and
 *  blocks toggling — used for presence filters whose source data isn't ingested
 *  yet (honest-data: don't offer a filter that can never match). `title` is the
 *  hover tooltip explaining why. */
export function TogglePill({
  on,
  onToggle,
  icon,
  children,
  disabled = false,
  title,
}: {
  on: boolean;
  onToggle: () => void;
  icon?: ReactNode;
  children: ReactNode;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      className={`fpill ${on ? "on" : ""}`}
      onClick={onToggle}
      aria-pressed={on}
      disabled={disabled}
      title={title}
    >
      {icon}
      {children}
    </button>
  );
}
