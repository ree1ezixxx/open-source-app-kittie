/* ============================================================
   API Keys. /settings/api-keys
   Truth-style credits, rate limits, keys, and request logs.
   Billing, checkout, auth, and real key persistence are not wired.
   ============================================================ */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { Theme } from "../lib/theme";
import { PageHeader } from "../components/reviews/primitives";
import {
  IconArrowLeft, IconCheck, IconCoin, IconInfo, IconKey, IconMoon, IconPlus, IconSun,
} from "../icons";

interface CreditBundle {
  label: string;
  credits: number;
  total: number;
  rateLimit: string;
}

interface RateLimitRow {
  name: string;
  method: "GET" | "POST";
  path: string;
  cost: string;
  limit: string;
}

const creditBundles: CreditBundle[] = [
  { label: "10k", credits: 10_000, total: 100, rateLimit: "244/min" },
  { label: "50k", credits: 50_000, total: 500, rateLimit: "249/min" },
  { label: "250k", credits: 250_000, total: 2_500, rateLimit: "300/min" },
  { label: "500k", credits: 500_000, total: 5_000, rateLimit: "360/min" },
  { label: "1M", credits: 1_000_000, total: 10_000, rateLimit: "480/min" },
  { label: "2M", credits: 2_000_000, total: 20_000, rateLimit: "600/min" },
];
const defaultBundle = creditBundles[1] as CreditBundle;

const rateLimitRows: RateLimitRow[] = [
  { name: "App Search", method: "GET", path: "/api/v1/apps", cost: "1 credit per app", limit: "120/min" },
  { name: "App Detail", method: "GET", path: "/api/v1/apps/:appId", cost: "1 credit", limit: "240/min" },
  { name: "App Historicals", method: "GET", path: "/api/v1/apps/:appId/historicals", cost: "1 credit", limit: "120/min" },
  { name: "Ad Search", method: "GET", path: "/api/v1/ads", cost: "1 credit per ad", limit: "120/min" },
  { name: "Ad Detail", method: "GET", path: "/api/v1/ads/:adId", cost: "1 credit", limit: "240/min" },
  { name: "Creators", method: "GET", path: "/api/v1/creators", cost: "1 credit per creator", limit: "120/min" },
  { name: "Organic Content", method: "GET", path: "/api/v1/organic", cost: "1 credit per organic content item", limit: "120/min" },
  { name: "Keyword Difficulty", method: "GET", path: "/api/v1/keywords/difficulty", cost: "10 credits", limit: "60/min" },
  { name: "Keyword Batch", method: "POST", path: "/api/v1/keywords/difficulty", cost: "10 credits per keyword", limit: "30/min" },
  { name: "Reviews", method: "POST", path: "/api/v1/reviews", cost: "1 credit per review", limit: "60/min" },
];

const numberFormatter = new Intl.NumberFormat("en-US");

export function ApiKeysPage({ theme, onToggleTheme }: { theme: Theme; onToggleTheme: () => void }) {
  const [selectedBundle, setSelectedBundle] = useState<CreditBundle>(defaultBundle);
  const [stub, setStub] = useState<string | null>(null);

  const averagePerThousand = useMemo(
    () => selectedBundle.total / (selectedBundle.credits / 1_000),
    [selectedBundle],
  );

  function flagStub(action: "Checkout" | "Create Key") {
    setStub(`${action} is a stub in this open-source build.`);
    window.setTimeout(() => setStub(null), 2600);
  }

  return (
    <main className="main">
      <PageHeader
        icon={<IconKey style={{ width: 18, height: 18 }} />}
        title="API Keys"
        subtitle="Manage API keys and monitor credit usage for programmatic access"
        actions={
          <button className="icon-btn" onClick={onToggleTheme} aria-label="Toggle theme">
            {theme === "dark" ? <IconSun /> : <IconMoon />}
          </button>
        }
      />

      <div className="set-scroll">
        <div className="set-inner api-keys-inner">
          <Link className="api-back-link" to="/settings">
            <IconArrowLeft />
            Back to Settings
          </Link>

          {stub && <div className="set-toast"><IconInfo /> {stub}</div>}

          <section className="set-section">
            <div className="set-section-head">
              <div className="set-section-icon"><IconCoin style={{ width: 16, height: 16 }} /></div>
              <div>
                <div className="set-section-title">API Credits</div>
                <div className="set-section-sub">
                  Balance, granted limit, and rate-limit unlocks for this team. Every user gets 25k API credits automatically each month.
                </div>
              </div>
            </div>
            <div className="set-card">
              <div className="api-credit-grid">
                <div className="api-metric api-metric-primary">
                  <span>Current</span>
                  <strong>5,000</strong>
                </div>
                <div className="api-metric">
                  <span>Credit limit</span>
                  <strong>5,000 / 5,000</strong>
                </div>
                <div className="api-metric">
                  <span>Granted</span>
                  <strong>5,000</strong>
                </div>
                <div className="api-metric">
                  <span>Top limit</span>
                  <strong>240/min</strong>
                </div>
                <div className="api-metric">
                  <span>Purchased</span>
                  <strong>0</strong>
                </div>
              </div>
            </div>
          </section>

          <section className="set-section">
            <div className="set-section-head">
              <div className="set-section-icon"><IconCoin style={{ width: 16, height: 16 }} /></div>
              <div>
                <div className="set-section-title">Buy Credits</div>
                <div className="set-section-sub">Larger bundles unlock higher request ceilings.</div>
              </div>
            </div>
            <div className="set-card">
              <div className="api-bundle-buttons" aria-label="Credit bundles">
                {creditBundles.map((bundle) => (
                  <button
                    key={bundle.label}
                    className={`api-bundle-btn ${bundle.label === selectedBundle.label ? "on" : ""}`}
                    onClick={() => setSelectedBundle(bundle)}
                  >
                    {bundle.label}
                  </button>
                ))}
              </div>

              <div className="api-buy-summary">
                <div className="api-metric">
                  <span>Credits</span>
                  <strong>{numberFormatter.format(selectedBundle.credits)}</strong>
                </div>
                <div className="api-metric">
                  <span>Total</span>
                  <strong>${numberFormatter.format(selectedBundle.total)}</strong>
                </div>
                <div className="api-metric">
                  <span>Avg / 1k</span>
                  <strong>${numberFormatter.format(averagePerThousand)}</strong>
                </div>
                <div className="api-metric">
                  <span>Unlock up to</span>
                  <strong>{selectedBundle.rateLimit}</strong>
                </div>
              </div>

              <div className="set-actions api-actions">
                <button className="btn btn-accent" onClick={() => flagStub("Checkout")}>
                  <IconCheck /> Checkout
                </button>
              </div>
            </div>
          </section>

          <section className="set-section">
            <div className="set-section-head">
              <div className="set-section-icon"><IconInfo style={{ width: 16, height: 16 }} /></div>
              <div>
                <div className="set-section-title">Rate Limits</div>
                <div className="set-section-sub">Credit cost and request ceiling by endpoint.</div>
              </div>
            </div>
            <div className="set-card">
              <div className="set-export-table-wrap api-rate-table-wrap">
                <table className="set-export-table api-rate-table">
                  <thead>
                    <tr>
                      <th>Endpoint</th>
                      <th>Method</th>
                      <th>Path</th>
                      <th>Cost</th>
                      <th>Limit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rateLimitRows.map((row) => (
                      <tr key={`${row.name}-${row.method}`}>
                        <td>{row.name}</td>
                        <td><span className={`api-method api-method-${row.method.toLowerCase()}`}>{row.method}</span></td>
                        <td><code>{row.path}</code></td>
                        <td>{row.cost}</td>
                        <td>{row.limit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section className="set-section">
            <div className="set-section-head">
              <div className="set-section-icon"><IconKey style={{ width: 16, height: 16 }} /></div>
              <div style={{ flex: 1 }}>
                <div className="set-section-title">Keys</div>
                <div className="set-section-sub">0 active keys</div>
              </div>
              <button className="btn btn-accent" onClick={() => flagStub("Create Key")}>
                <IconPlus /> Create Key
              </button>
            </div>
            <div className="set-card">
              <div className="set-export-empty">
                <IconKey style={{ width: 26, height: 26, opacity: 0.5 }} />
                <div className="set-export-title">No API keys yet. Create one to get started.</div>
                <div className="set-export-sub">
                  Use your API key in the Authorization header: <code>Authorization: Bearer appkittie_...</code>
                </div>
              </div>
            </div>
          </section>

          <section className="set-section">
            <div className="set-section-head">
              <div className="set-section-icon"><IconInfo style={{ width: 16, height: 16 }} /></div>
              <div>
                <div className="set-section-title">Recent API Requests</div>
                <div className="set-section-sub">Request logs for this team.</div>
              </div>
            </div>
            <div className="set-card">
              <div className="set-export-empty">
                <IconInfo style={{ width: 26, height: 26, opacity: 0.5 }} />
                <div className="set-export-title">No API requests yet. Logs will appear here once you start using the API.</div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
