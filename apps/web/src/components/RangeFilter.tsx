import { useState } from "react";

export interface RangeQuick {
  label: string;
  min?: number;
  max?: number;
}

/** Quick-select pills + custom min/max inputs (behind a "Custom" pill, or always
    visible with `alwaysOpen` — the live Explore rail shows the "–" range inline). */
export function RangeFilter({
  quick,
  min,
  max,
  onChange,
  prefix,
  suffix,
  alwaysOpen = false,
}: {
  quick: RangeQuick[];
  min?: number;
  max?: number;
  onChange: (next: { min?: number; max?: number }) => void;
  prefix?: string;
  suffix?: string;
  alwaysOpen?: boolean;
}) {
  const matches = (q: RangeQuick) => q.min === min && q.max === max;
  const hasValue = min != null || max != null;
  const matchedQuick = quick.some(matches);
  const [customOpen, setCustomOpen] = useState(hasValue && !matchedQuick);
  const custom = alwaysOpen || customOpen;

  return (
    <div className="frange">
      <div className="pill-row">
        {quick.map((q) => (
          <button
            key={q.label}
            className={`fpill ${matches(q) ? "on" : ""}`}
            onClick={() => onChange(matches(q) ? {} : { min: q.min, max: q.max })}
          >
            {q.label}
          </button>
        ))}
        {!alwaysOpen && (
          <button
            className={`fpill ghost ${customOpen ? "on" : ""}`}
            onClick={() => setCustomOpen((c) => !c)}
          >
            Custom
          </button>
        )}
      </div>
      {custom && (
        <div className="frange-inputs">
          {prefix && <span className="frange-affix">{prefix}</span>}
          <input
            type="number"
            inputMode="numeric"
            placeholder="Min"
            aria-label="Minimum value"
            value={min ?? ""}
            onChange={(e) => onChange({ min: e.target.value ? Number(e.target.value) : undefined, max })}
          />
          <span className="frange-dash">–</span>
          <input
            type="number"
            inputMode="numeric"
            placeholder="Max"
            aria-label="Maximum value"
            value={max ?? ""}
            onChange={(e) => onChange({ min, max: e.target.value ? Number(e.target.value) : undefined })}
          />
          {suffix && <span className="frange-affix">{suffix}</span>}
        </div>
      )}
    </div>
  );
}
