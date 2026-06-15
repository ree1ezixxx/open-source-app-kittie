export type TabItem = { id: string; label: string; count?: number };

/** Underline-style sub-navigation tabs (Reviews, Favorites, Keyword Explorer …). */
export function Tabs({
  items,
  active,
  onChange,
}: {
  items: TabItem[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="tabs" role="tablist">
      {items.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={active === t.id}
          className={`tab ${active === t.id ? "on" : ""}`}
          onClick={() => onChange(t.id)}
        >
          <span>{t.label}</span>
          {typeof t.count === "number" && <span className="tab-count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}
