/* ============================================================
   Lane D — Settings. /settings
   Plan · Team · Export History.
   Auth/billing are stubs (owned by another lane) — rendered, not wired.
   ============================================================ */
import { useState } from "react";
import type { Theme } from "../lib/theme";
import { PageHeader } from "../components/reviews/primitives";
import {
  IconSettings, IconSun, IconMoon, IconCoin, IconUsers, IconDownload,
  IconExternal, IconInfo, IconPlus, IconCheck,
} from "../icons";

export function SettingsPage({ theme, onToggleTheme }: { theme: Theme; onToggleTheme: () => void }) {
  const [stub, setStub] = useState<string | null>(null);

  function flagStub(what: string) {
    setStub(`${what} is handled by the auth & billing lane — not wired in this build.`);
    window.setTimeout(() => setStub(null), 2600);
  }

  return (
    <main className="main">
      <PageHeader
        icon={<IconSettings style={{ width: 18, height: 18 }} />}
        title="Settings"
        subtitle="Manage your subscription, team, and account"
        actions={
          <button className="icon-btn" onClick={onToggleTheme} aria-label="Toggle theme">
            {theme === "dark" ? <IconSun /> : <IconMoon />}
          </button>
        }
      />

      <div className="set-scroll">
        <div className="set-inner">
          {stub && <div className="set-toast"><IconInfo /> {stub}</div>}

          {/* ---- Subscription ---- */}
          <section className="set-section">
            <div className="set-section-head">
              <div className="set-section-icon"><IconCoin style={{ width: 16, height: 16 }} /></div>
              <div>
                <div className="set-section-title">Subscription</div>
                <div className="set-section-sub">Your plan and billing details</div>
              </div>
            </div>
            <div className="set-card set-plan">
              <div className="set-plan-row">
                <div>
                  <div className="set-plan-name">
                    Pro Plan <span className="set-plan-cycle">(Monthly)</span>
                    <span className="set-badge set-badge-active">Active</span>
                  </div>
                  <div className="set-plan-meta">$99/month · Renews Jun 23</div>
                </div>
                <div className="set-plan-status">
                  <IconCheck />
                  Active
                </div>
              </div>
              <div className="set-plan-note">
                Manage your billing, update payment method, view invoices, or cancel your subscription through the Stripe portal.
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
                <div className="set-section-title">Workspace</div>
                <div className="set-section-sub">Manage seats and team access</div>
              </div>
            </div>
            <div className="set-card set-team-card">
              <div className="set-workspace-head">
                <div>
                  <div className="set-plan-name">
                    Personal workspace <span className="set-badge">Owner</span>
                  </div>
                  <div className="set-plan-meta">1 member · 4 slots remaining</div>
                </div>
              </div>

              <div className="set-progress-block">
                <div className="set-progress-head">
                  <span>Team Members</span>
                  <span>1 / 5</span>
                </div>
                <div className="set-progress-track" role="progressbar" aria-label="Team member slots" aria-valuenow={1} aria-valuemin={0} aria-valuemax={5}>
                  <span style={{ width: "20%" }} />
                </div>
              </div>

              <div className="set-invite-row">
                <input className="set-input" placeholder="colleague@company.com" aria-label="Invite email" />
                <button className="btn" onClick={() => flagStub("Team invites")}>
                  <IconPlus /> Invite
                </button>
              </div>

              <div className="set-member-list">
                <div className="set-list-title">Team Members (1)</div>
                <div className="set-member-row">
                  <span className="set-avatar">E</span>
                  <div className="set-member-copy">
                    <div className="set-team-title">Ellis</div>
                    <div className="set-team-sub">ellis@example.com</div>
                  </div>
                  <span className="set-badge">Owner</span>
                </div>
              </div>

              <div className="set-card-foot">
                Share your workspace with up to 5 members on your current plan.
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
              <div className="set-export-metrics">
                <div className="set-export-metric">
                  <span>TOTAL EXPORTS</span>
                  <strong>1</strong>
                </div>
                <div className="set-export-metric">
                  <span>ROWS EXPORTED</span>
                  <strong>81</strong>
                </div>
                <div className="set-export-metric">
                  <span>SUCCESS RATE</span>
                  <strong>100%</strong>
                </div>
              </div>

              <div className="set-export-table-wrap">
                <table className="set-export-table">
                  <thead>
                    <tr>
                      <th>Format</th>
                      <th>Status</th>
                      <th>Rows</th>
                      <th>Fields</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>CSV</td>
                      <td><span className="set-badge set-badge-active">Success</span></td>
                      <td>81 / 81</td>
                      <td>17</td>
                      <td>2d ago</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="set-card-foot">
                Export history is retained for all your data exports. Head to the Explore page to create a new export.
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
