import { useState } from "react";
import type { Store } from "@kittie/types";
import { MARKETS } from "../../lib/markets";
import { IconApple, IconGooglePlay } from "../../icons";

/**
 * Store + Markets modal (live-parity Explore flow): pick the store, tick the
 * markets to analyse, "Explore N countries" runs the async per-market
 * analysis. More markets = longer analysis — said right on the tin.
 */
export function MarketsModal({
  terms,
  initialStore,
  initialCountry,
  onConfirm,
  onClose,
}: {
  terms: string[];
  initialStore: Store;
  initialCountry: string;
  onConfirm: (store: Store, countries: string[]) => void;
  onClose: () => void;
}) {
  const [store, setStore] = useState<Store>(initialStore);
  const [selected, setSelected] = useState<Set<string>>(new Set([initialCountry]));

  const allSelected = selected.size === MARKETS.length;
  const toggle = (code: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) {
        if (next.size > 1) next.delete(code); // at least one market stays selected
      } else {
        next.add(code);
      }
      return next;
    });
  };

  return (
    <div className="rv-modal-backdrop" onClick={onClose}>
      <div className="rv-modal km-modal" onClick={(e) => e.stopPropagation()}>
        <div className="rv-modal-head">
          <div className="rv-modal-title">
            Explore {terms.length === 1 ? `“${terms[0]}”` : `${terms.length} keywords`}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="km-store-row">
          <button
            className={`km-store${store === "apple" ? " on" : ""}`}
            onClick={() => setStore("apple")}
          >
            <IconApple /> App Store
          </button>
          <button
            className={`km-store${store === "google" ? " on" : ""}`}
            onClick={() => setStore("google")}
          >
            <IconGooglePlay /> Google Play
          </button>
        </div>

        <div className="km-markets-head">
          <span>{selected.size} of {MARKETS.length} markets</span>
          <button
            className="km-selectall"
            onClick={() =>
              setSelected(allSelected ? new Set([initialCountry]) : new Set(MARKETS.map((m) => m.code)))
            }
          >
            {allSelected ? "Clear all" : "Select all"}
          </button>
        </div>

        <div className="km-markets-grid">
          {MARKETS.map((m) => (
            <button
              key={m.code}
              className={`km-market${selected.has(m.code) ? " on" : ""}`}
              onClick={() => toggle(m.code)}
            >
              <span className="km-flag">{m.flag}</span>
              <span className="km-name">{m.name}</span>
            </button>
          ))}
        </div>

        <div className="km-foot">
          <span className="km-hint">More markets = longer analysis</span>
          <button
            className="btn btn-accent"
            onClick={() => onConfirm(store, [...selected])}
          >
            Explore {selected.size} {selected.size === 1 ? "country" : "countries"}
          </button>
        </div>
      </div>
    </div>
  );
}
