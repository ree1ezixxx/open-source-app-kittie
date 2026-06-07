import { useMemo, useState } from "react";
import "../styles/aistudio.css";
import pppData from "../datasets/ppp-index.json";
import { StudioHeader } from "../components/aistudio/StudioHeader";
import { StudioEmptyState } from "../components/aistudio/StudioEmptyState";
import { IconCoin, IconSearch, IconDownload } from "../icons";
import { IconPlus, IconTrash, IconCopy, IconCheck } from "../components/aistudio/icons";

interface Country {
  country: string;
  code: string;
  currency: string;
  symbol: string;
  pli: number;
  fx: number;
}
const COUNTRIES = (pppData.countries as Country[]);

// Currencies conventionally shown without minor units (for charm display).
const ZERO_DECIMAL = new Set([
  "JPY", "KRW", "VND", "IDR", "CLP", "COP", "PYG", "HUF", "ISK", "RWF", "UGX",
  "TZS", "LBP", "IRR", "IQD", "KHR", "LAK", "MMK", "MNT", "UZS", "GNF", "KMF",
  "XOF", "XAF", "BIF", "DJF", "VUV", "MGA", "STN", "SOS", "SSP", "KZT", "AMD",
]);
const MAX_PRICES = 4;

/** Charm-rounded local price (e.g. $2.99, ₹229, ¥980). */
function charm(value: number, currency: string): number {
  if (ZERO_DECIMAL.has(currency)) {
    if (value >= 1000) return Math.round(value / 100) * 100;
    if (value >= 100) return Math.round(value / 10) * 10;
    return Math.max(1, Math.round(value));
  }
  if (value < 100) return Math.max(0.99, Math.round(value) - 0.01);
  return Math.round(value);
}

function fmt(value: number, currency: string): string {
  const min = ZERO_DECIMAL.has(currency) ? 0 : 2;
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: min, maximumFractionDigits: min }).format(value);
}

function flagEmoji(cc: string): string {
  if (!/^[A-Z]{2}$/.test(cc)) return "🏳️";
  const A = 0x1f1e6;
  return String.fromCodePoint(A + cc.charCodeAt(0) - 65, A + cc.charCodeAt(1) - 65);
}

function localize(baseUSD: number, c: Country) {
  const usdEquivalent = baseUSD * c.pli;
  const raw = usdEquivalent * c.fx;
  return { usdEquivalent, local: charm(raw, c.currency) };
}

export function PricingCalculatorPage() {
  const [prices, setPrices] = useState<number[]>([9.99]);
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState(false);

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const list = needle
      ? COUNTRIES.filter((c) => c.country.toLowerCase().includes(needle) || c.code.toLowerCase() === needle || c.currency.toLowerCase() === needle)
      : COUNTRIES;
    return list;
  }, [search]);

  const validPrices = prices.filter((p) => p > 0);

  function setPrice(i: number, raw: string) {
    const v = parseFloat(raw);
    setPrices((p) => p.map((old, idx) => (idx === i ? (Number.isFinite(v) ? v : 0) : old)));
  }
  function addPrice() {
    setPrices((p) => (p.length >= MAX_PRICES ? p : [...p, 0]));
  }
  function removePrice(i: number) {
    setPrices((p) => (p.length <= 1 ? p : p.filter((_, idx) => idx !== i)));
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
        purchasingPowerIndex: c.pli,
        prices: validPrices.map((base) => {
          const { usdEquivalent, local } = localize(base, c);
          return { baseUSD: base, localPrice: local, currency: c.currency, usdEquivalent: Math.round(usdEquivalent * 100) / 100 };
        }),
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
      <StudioHeader
        icon={<IconCoin style={{ width: 18, height: 18 }} />}
        title="Pricing Calculator"
        subtitle={`Purchasing-power-adjusted prices across ${COUNTRIES.length} countries · works offline`}
        count={COUNTRIES.length}
      />

      <div className="ppp-wrap">
        <div className="ppp-inner">
          {/* ---------------- controls ---------------- */}
          <div className="ppp-controls">
            <div className="ppp-prices">
              {prices.map((p, i) => (
                <div className="ppp-price" key={i}>
                  <label>Base price {prices.length > 1 ? i + 1 : ""}</label>
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
                  <IconPlus /> Add price
                </button>
              )}
            </div>

            <div className="ppp-controls-foot">
              <div className="search" style={{ flex: "0 1 260px" }}>
                <IconSearch />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter countries…" spellCheck={false} />
              </div>
              <div className="spacer" />
              <button className="btn" onClick={copyJson} disabled={!validPrices.length}>
                {copied ? <IconCheck /> : <IconCopy />} {copied ? "Copied" : "Copy JSON"}
              </button>
              <button className="btn btn-accent" onClick={exportJson} disabled={!validPrices.length}>
                <IconDownload /> Export JSON
              </button>
            </div>
          </div>

          {/* ---------------- table ---------------- */}
          {validPrices.length === 0 ? (
            <StudioEmptyState
              icon={<IconCoin />}
              title="Enter a base price"
              sub="Add a USD price above to see purchasing-power-adjusted prices for every country."
            />
          ) : rows.length === 0 ? (
            <StudioEmptyState title="No countries match" sub="Try a different country name, ISO code, or currency." />
          ) : (
            <div className="ppp-table-scroll">
              <table className="ppp-table">
                <thead>
                  <tr>
                    <th>Country</th>
                    <th>Currency</th>
                    <th className="num">Purchasing power</th>
                    {validPrices.map((base, i) => (
                      <th className="num" key={i}>${base.toFixed(2)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => (
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
                      <td className="num">
                        <span className="ppp-pli">
                          <span className="ppp-pli-bar">
                            <span className="ppp-pli-fill" style={{ width: `${Math.min(100, c.pli * 100)}%` }} />
                          </span>
                          {Math.round(c.pli * 100)}%
                        </span>
                      </td>
                      {validPrices.map((base, i) => {
                        const { usdEquivalent, local } = localize(base, c);
                        return (
                          <td className="num" key={i}>
                            <div className="ppp-local">
                              {c.symbol}
                              {fmt(local, c.currency)}
                            </div>
                            <div className="ppp-usd cell-sub">≈ ${usdEquivalent.toFixed(2)}</div>
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
              Local prices = base USD × purchasing-power index × FX, charm-rounded. Dataset is approximate World Bank ICP
              ratios + rough FX — fully offline, no backend. Swap <code>data/ppp-index.json</code> for fresh ICP data anytime.
            </span>
          </div>
        </div>
      </div>
    </main>
  );
}
