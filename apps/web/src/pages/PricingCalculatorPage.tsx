import { useState } from "react";
import "../styles/aistudio.css";
import pppData from "../datasets/truth-ppp.json";
import { StudioHeader } from "../components/aistudio/StudioHeader";
import { StudioEmptyState } from "../components/aistudio/StudioEmptyState";
import { IconCoin, IconDownload } from "../icons";
import { IconPlus, IconTrash, IconCopy, IconCheck } from "../components/aistudio/icons";

interface Country {
  country: string;
  code: string;
  currency: string;
  symbol: string;
  /** Local-currency amount per $1 of base — appkittie's global purchasing-power index (FX × PPP, baked in). */
  factor: number;
}
const COUNTRIES = (pppData.countries as Country[]);

// Currencies conventionally shown without minor units (for charm display).
const ZERO_DECIMAL = new Set([
  "JPY", "KRW", "VND", "IDR", "CLP", "COP", "PYG", "HUF", "ISK", "RWF", "UGX",
  "TZS", "LBP", "IRR", "IQD", "KHR", "LAK", "MMK", "MNT", "UZS", "GNF", "KMF",
  "XOF", "XAF", "BIF", "DJF", "VUV", "MGA", "STN", "SOS", "SSP", "KZT", "AMD",
]);
const MAX_PRICES = 4;
const FEATURES = [
  "Calculate multiple pricing tiers simultaneously",
  "Export localized pricing data to JSON",
  "Copy pricing data directly to clipboard",
  "Based on real-world purchasing power parity (PPP)",
];

/** Charm-rounded local price (e.g. $2.99, ₹229, ¥980). */
function charm(value: number, currency: string): number {
  if (ZERO_DECIMAL.has(currency)) {
    if (value >= 100) return Math.round(value / 10) * 10; // nearest 10 (¥1,090, not ¥1,100)
    return Math.max(1, Math.round(value));
  }
  if (value < 100) return Math.max(0.99, Math.round(value) - 0.01);
  return Math.round(value);
}

function fmt(value: number, currency: string): string {
  // truth omits ".00" on whole charm-rounded prices (₹369, $109) but keeps cents on .99 prices
  const dec = ZERO_DECIMAL.has(currency) || Number.isInteger(value) ? 0 : 2;
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(value);
}

function flagEmoji(cc: string): string {
  if (!/^[A-Z]{2}$/.test(cc)) return "🏳️";
  const A = 0x1f1e6;
  return String.fromCodePoint(A + cc.charCodeAt(0) - 65, A + cc.charCodeAt(1) - 65);
}

/** appkittie-parity local price: base × the country's purchasing-power factor, charm-rounded. */
function localize(baseUSD: number, c: Country) {
  return { local: charm(baseUSD * c.factor, c.currency) };
}

export function PricingCalculatorPage() {
  const [prices, setPrices] = useState<number[]>([9.99]);
  const [copied, setCopied] = useState(false);
  const [view, setView] = useState<"all" | "tabs">("all");
  const [activePriceIndex, setActivePriceIndex] = useState(0);

  const validPrices = prices.filter((p) => p > 0);
  const activePrice = validPrices[Math.min(activePriceIndex, Math.max(validPrices.length - 1, 0))];
  const visiblePrices = view === "tabs" && activePrice ? [activePrice] : validPrices;

  function setPrice(i: number, raw: string) {
    const v = parseFloat(raw);
    setPrices((p) => p.map((old, idx) => (idx === i ? (Number.isFinite(v) ? v : 0) : old)));
  }
  function addPrice() {
    setPrices((p) => (p.length >= MAX_PRICES ? p : [...p, 0]));
  }
  function removePrice(i: number) {
    setPrices((p) => (p.length <= 1 ? p : p.filter((_, idx) => idx !== i)));
    setActivePriceIndex((idx) => Math.max(0, Math.min(idx, prices.length - 2)));
  }

  function buildExport() {
    return {
      generatedBy: "Kittie Pricing Calculator (offline · PPP-adjusted)",
      basePricesUSD: validPrices,
      countryCount: COUNTRIES.length,
      countries: COUNTRIES.map((c) => ({
        country: c.country,
        code: c.code,
        currency: c.currency,
        prices: validPrices.map((base) => ({ baseUSD: base, localPrice: localize(base, c).local, currency: c.currency })),
      })),
    };
  }

  async function copyJson() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(buildExport(), null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked — Export JSON still works */
    }
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(buildExport(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "kittie-localized-pricing.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="main">
      <div className="ppp-wrap">
        <div className="ppp-inner">
          <section className="ppp-hero">
            <h1>App Pricing Calculator for Global Markets</h1>
            <p>
              Use our free App Pricing Calculator to determine the perfect localized price for your mobile app or SaaS
              product across 190+ countries. We use a global purchasing power index based on real-world digital product
              pricing to ensure your app remains affordable and competitive globally. Stop guessing your App Store and
              Google Play pricing tiers. Input your base US dollar (USD) price, and instantly get proportional, fair
              pricing for international markets.
            </p>
            <div className="ppp-feature-grid" aria-label="Pricing calculator features">
              {FEATURES.map((feature) => (
                <div className="ppp-feature" key={feature}>
                  <IconCheck />
                  <span>{feature}</span>
                </div>
              ))}
            </div>
          </section>

          <StudioHeader
            icon={<IconCoin style={{ width: 18, height: 18 }} />}
            title="Pricing Calculator"
            subtitle="Calculate localized prices based on global purchasing power"
            count={COUNTRIES.length}
          />

          {/* ---------------- controls ---------------- */}
          <div className="ppp-controls">
            <div className="ppp-explain">
              <strong>How is this calculated?</strong> We use a global purchasing power index based on real-world
              digital product pricing across different countries. By inputting your standard US price, we calculate a
              proportionally fair price for every other country and convert it to the local currency.
            </div>
            <div className="ppp-section-label">Base Prices (USD)</div>
            <div className="ppp-prices">
              {prices.map((p, i) => (
                <div className="ppp-price" key={i}>
                  <label>{prices.length > 1 ? `Price ${i + 1}` : "USD price"}</label>
                  <div className="ppp-price-input">
                    <span className="pre">$</span>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={p === 0 ? "" : p}
                      placeholder="0.00"
                      onChange={(e) => setPrice(i, e.target.value)}
                    />
                    {prices.length > 1 && (
                      <button className="ppp-price-x" aria-label="Remove price" onClick={() => removePrice(i)}>
                        <IconTrash />
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {prices.length < MAX_PRICES && (
                <button className="btn" onClick={addPrice} style={{ height: 38 }}>
                  <IconPlus /> Add Price
                </button>
              )}
            </div>
          </div>

          {/* ---------------- table ---------------- */}
          <div className="ppp-results-head">
            <div>
              <div className="ppp-results-title">Localized Prices</div>
            </div>
            <div className="ppp-results-tools">
              <div className="ppp-view-toggle" aria-label="Price view">
                <button className={view === "all" ? "on" : ""} onClick={() => setView("all")}>All</button>
                <button className={view === "tabs" ? "on" : ""} onClick={() => setView("tabs")}>Tabs</button>
              </div>
              <button className="btn" onClick={copyJson} disabled={!validPrices.length}>
                {copied ? <IconCheck /> : <IconCopy />} {copied ? "Copied" : "Copy JSON"}
              </button>
              <button className="btn btn-accent" onClick={exportJson} disabled={!validPrices.length}>
                <IconDownload /> Export JSON
              </button>
            </div>
          </div>
          {view === "tabs" && validPrices.length > 1 && (
            <div className="ppp-price-tabs" aria-label="Base price tabs">
              {validPrices.map((base, i) => (
                <button
                  key={`${base}-${i}`}
                  className={i === Math.min(activePriceIndex, validPrices.length - 1) ? "on" : ""}
                  onClick={() => setActivePriceIndex(i)}
                >
                  ${base.toFixed(2)} USD
                </button>
              ))}
            </div>
          )}
          {validPrices.length === 0 ? (
            <StudioEmptyState
              icon={<IconCoin />}
              title="Enter a base price"
              sub="Add a USD price above to see purchasing-power-adjusted prices for every country."
            />
          ) : (
            <div className="ppp-table-scroll">
              <table className="ppp-table">
                <thead>
                  <tr>
                    <th>COUNTRY</th>
                    <th>CURRENCY</th>
                    {visiblePrices.map((base, i) => (
                      <th className="num" key={i}>${base.toFixed(2)} USD</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {COUNTRIES.map((c) => (
                    <tr key={c.code + c.country}>
                      <td>
                        <div className="ppp-country">
                          <span className="ppp-flag">{flagEmoji(c.code)}</span>
                          <span>{c.country}</span>
                        </div>
                      </td>
                      <td>
                        <span className="ppp-cc">{c.currency}</span>
                      </td>
                      {visiblePrices.map((base, i) => {
                        const { local } = localize(base, c);
                        return (
                          <td className="num" key={i}>
                            <div className="ppp-local">
                              {c.symbol}
                              {fmt(local, c.currency)}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="notice" style={{ marginTop: 16 }}>
            <IconCoin style={{ width: 14, height: 14 }} />
            <span>
              Local prices use a global purchasing-power index (FX × PPP) calibrated to real-world digital-product pricing,
              charm-rounded to local conventions. Fully offline, no backend. Index in <code>datasets/truth-ppp.json</code>.
            </span>
          </div>
        </div>
      </div>
    </main>
  );
}
