import { useState } from "react";

export interface RangeQuick {
  label: string;
  min?: number;
  max?: number;
}

/** Quick-select pills + an optional custom min/max reveal. One control per metric. */
export function RangeFilter({
  quick,
  min,
  max,
  onChange,
  prefix,
  suffix,
}: {
  quick: RangeQuick[];
  min?: number;
  max?: number;
  onChange: (next: { min?: number; max?: number }) => void;
  prefix?: string;
  suffix?: string;
}) {
  const matches = (q: RangeQuick) => q.min === min && q.max === max;
  const hasValue = min != null || max != null;
  const matchedQuick = quick.some(matches);
  const [custom, setCustom] = useState(hasValue && !matchedQuick);

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
        <button
          className={`fpill ghost ${custom ? "on" : ""}`}
          onClick={() => setCustom((c) => !c)}
        >
          Custom
        </button>
      </div>
      {custom && (
        <div className="frange-inputs">
          {prefix && <span className="frange-affix">{prefix}</span>}
          <input
            type="number"
            inputMode="numeric"
            placeholder="Min"
            value={min ?? ""}
            onChange={(e) => onChange({ min: e.target.value ? Number(e.target.value) : undefined, max })}
          />
          <span className="frange-dash">–</span>
          <input
            type="number"
            inputMode="numeric"
            placeholder="Max"
            value={max ?? ""}
            onChange={(e) => onChange({ min, max: e.target.value ? Number(e.target.value) : undefined })}
          />
          {suffix && <span className="frange-affix">{suffix}</span>}
        </div>
      )}
    </div>
  );
}
