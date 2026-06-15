import { IconChevron } from "../icons";

/** Prev/Next pager with a range + "page x of y" readout. */
export function Pagination({
  page,
  totalPages,
  total,
  count,
  pageSize,
  loading,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
}: {
  page: number;
  totalPages: number;
  total: number;
  count: number;
  pageSize: number;
  loading: boolean;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  const start = total === 0 ? 0 : page * pageSize + 1;
  const end = page * pageSize + count;

  return (
    <div className="pager">
      <span className="pager-range">
        {loading
          ? "Loading…"
          : total === 0
            ? "No results"
            : `${start.toLocaleString()}–${end.toLocaleString()} of ${total.toLocaleString()}`}
      </span>
      <div className="pager-nav">
        <button className="pager-btn prev" onClick={onPrev} disabled={!hasPrev} aria-label="Previous page">
          <IconChevron />
        </button>
        <span className="pager-page">
          {(page + 1).toLocaleString()} / {totalPages.toLocaleString()}
        </span>
        <button className="pager-btn next" onClick={onNext} disabled={!hasNext} aria-label="Next page">
          <IconChevron />
        </button>
      </div>
    </div>
  );
}
