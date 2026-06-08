import { IconClose } from "../icons";
import type { Chip } from "../lib/exploreFilters";

/** Removable chip bar above the table — mirrors what's set in the rail. */
export function ActiveFilters({
  chips,
  query,
  onClearChip,
  onClearSearch,
  onClearAll,
}: {
  chips: Chip[];
  query: string;
  onClearChip: (chip: Chip) => void;
  onClearSearch: () => void;
  onClearAll: () => void;
}) {
  if (!chips.length && !query) return null;
  return (
    <div className="active-filters">
      {query && (
        <button className="achip achip-search" onClick={onClearSearch}>
          Search: <strong>“{query}”</strong>
          <IconClose />
        </button>
      )}
      {chips.map((c) => (
        <button key={c.id} className="achip" onClick={() => onClearChip(c)}>
          {c.label}
          <IconClose />
        </button>
      ))}
      <button className="achip-clear" onClick={onClearAll}>
        Clear all
      </button>
    </div>
  );
}
