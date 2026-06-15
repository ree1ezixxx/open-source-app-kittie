/* ============================================================
   Lane D — Settings. /settings
   Plan · Team · Export History.
   Auth/billing are stubs (owned by another lane) — rendered, not wired.
   ============================================================ */
import { useState } from "react";
import type { Theme } from "../lib/theme";
import { PageHeader } from "../components/reviews/primitives";
import { formatDate } from "../lib/format";
import {
  IconSettings, IconSun, IconMoon, IconCoin, IconUsers, IconDownload,
  IconExternal, IconInfo, IconStar,
} from "../icons";

/* Export history is genuinely empty — nothing in this lane writes to it yet. */
function readExports(): { id: string; label: string; rows: number; at: string }[] {
  try {
    const raw = localStorage.getItem("kittie.exports.v1");
    return raw ? (JSON.parse(raw) as ReturnType<typeof readExports>) : [];
  } catch {
    return [];
  }
}

export function SettingsPage({ theme, onToggleTheme }: { theme: Theme; onToggleTheme: () => void }) {
  const [stub, setStub] = useState<string | null>(null);
  const exports = readExports();

  function flagStub(what: string) {
    setStub(`${what} is handled by the auth & billing lane — not wired in this build.`);
    window.setTimeout(() => setStub(null), 2600);
  }

  return (
    <main className="main">
      <PageHeader
        icon={<IconSettings style={{ width: 18, height: 18 }} />}
        title="Settings"
        subtitle="Plan, team & export history"
        actions={
          <button className="icon-btn" onClick={onToggleTheme} aria-label="Toggle theme">
            {theme === "dark" ? <IconSun /> : <IconMoon />}
          </button>
        }
      />

      <div className="set-scroll">
        <div className="set-inner">
          {stub && <div className="set-toast"><IconInfo /> {stub}</div>}

          {/* ---- Plan ---- */}
          <section className="set-section">
            <div className="set-section-head">
              <div className="set-section-icon"><IconCoin style={{ width: 16, height: 16 }} /></div>
              <div>
                <div className="set-section-title">Plan</div>
                <div className="set-section-sub">Your subscription & billing</div>
              </div>
            </div>
            <div className="set-card set-plan">
              <div className="set-plan-row">
                <div>
                  <div className="set-plan-name">
                    Pro <span className="set-badge set-badge-active">Active</span>
                  </div>
                  <div className="set-plan-meta">Renews {formatDate("2026-07-07")}</div>
                </div>
                <div className="set-plan-price">
                  <span className="set-price-num">$49</span>
                  <span className="set-price-unit">/mo</span>
                </div>
              </div>
              <div className="set-plan-feats">
                <span><IconStar style={{ width: 12, height: 12, color: "var(--accent)" }} /> Unlimited app lookups</span>
                <span><IconStar style={{ width: 12, height: 12, color: "var(--accent)" }} /> Keyword difficulty & batches</span>
                <span><IconStar style={{ width: 12, height: 12, color: "var(--accent)" }} /> MCP server access</span>
              </div>
              <div className="set-actions">
                <button className="btn btn-accent" onClick={() => flagStub("Subscription & billing")}>
                  <IconExternal /> Subscription & billing
                </button>
              </div>
            </div>
          </section>

          {/* ---- Team ---- */}
          <section className="set-section">
            <div className="set-section-head">
              <div className="set-section-icon"><IconUsers style={{ width: 16, height: 16 }} /></div>
              <div>
                <div className="set-section-title">Team</div>
                <div className="set-section-sub">Share your workspace with up to 5 teammates</div>
              </div>
            </div>
            <div className="set-card">
              <div className="set-team-empty">
                <div className="set-team-avatars">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <span className="set-avatar" key={i} style={{ zIndex: 3 - i }}>{["A", "K", "+"][i]}</span>
                  ))}
                </div>
                <div className="set-team-copy">
                  <div className="set-team-title">No team yet</div>
                  <div className="set-team-sub">Create a team to share saved apps, exports and seats — up to 5 members.</div>
                </div>
                <button className="btn" onClick={() => flagStub("Team management")}>Create a Team</button>
              </div>
            </div>
          </section>

          {/* ---- Export History ---- */}
          <section className="set-section">
            <div className="set-section-head">
              <div className="set-section-icon"><IconDownload style={{ width: 16, height: 16 }} /></div>
              <div>
                <div className="set-section-title">Export History</div>
                <div className="set-section-sub">CSV exports you’ve generated from the database</div>
              </div>
            </div>
            <div className="set-card">
              {exports.length === 0 ? (
                <div className="set-export-empty">
                  <IconDownload style={{ width: 26, height: 26, opacity: 0.5 }} />
                  <div className="set-export-title">No exports yet</div>
                  <div className="set-export-sub">Export a filtered view from the database and it’ll show up here.</div>
                </div>
              ) : (
                <ul className="set-export-list">
                  {exports.map((e) => (
                    <li className="set-export-row" key={e.id}>
                      <IconDownload style={{ width: 15, height: 15, color: "var(--text-tertiary)" }} />
                      <span className="set-export-label">{e.label}</span>
                      <span className="set-export-rows">{e.rows.toLocaleString()} rows</span>
                      <span className="set-export-at">{formatDate(e.at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
