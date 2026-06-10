/* ============================================================
   Additive lane — Alerts. /dashboard/monitor/alerts
   The Alert feed (CONTEXT.md): notable trust-gated changes on
   Tracked apps. Tabs: Feed (unread-first cards), Digest (grouped
   by day), Rules (thresholds / channels). All data REAL.
   ============================================================ */
import { useEffect, useMemo, useState } from "react";
import { PageShell } from "../../components/PageShell";
import { IconCheck, IconInfo } from "../../icons";
import {
  fetchAlertRules,
  fetchAlerts,
  fieldLabel,
  formatChangeValue,
  markAlertsRead,
  updateAlertRule,
  type AlertChannel,
  type AlertFeedEntry,
  type AlertRuleEntry,
} from "../../lib/api/monitor";
import { formatDate } from "../../lib/format";
import type { Theme } from "../../lib/theme";
import "../../styles/monitor.css";

type Tab = "feed" | "digest" | "rules";

const RULE_LABELS: Record<string, { label: string; hint: string; unit: string | null }> = {
  rank_shift: {
    label: "Rank shift",
    hint: "Chart rank moved by at least this many places (both days ranked).",
    unit: "places",
  },
  price_change: {
    label: "Price change",
    hint: "Any price move, including became-paid / became-free.",
    unit: null,
  },
  metadata_change: {
    label: "Metadata change",
    hint: "Title, description, screenshots, category or content rating edited.",
    unit: null,
  },
  rating_drop: {
    label: "Rating drop",
    hint: "Average rating fell by at least this many stars.",
    unit: "stars",
  },
  revenue_swing: {
    label: "Revenue swing",
    hint: "Estimated revenue moved by at least this percent (needs scored snapshots).",
    unit: "%",
  },
  new_ad_creative: {
    label: "New ad creative",
    hint: "Dormant — fires once Meta Ad Library ingestion is unblocked.",
    unit: null,
  },
};

function AlertCard({ a, onRead }: { a: AlertFeedEntry; onRead: (id: string) => void }) {
  const unread = a.readAt === null;
  return (
    <div className={`mon-alert${unread ? " unread" : ""}`}>
      {a.appIconUrl ? (
        <img className="mon-alert-icon" src={a.appIconUrl} alt="" />
      ) : (
        <span className="mon-alert-icon mon-picker-fallback" />
      )}
      <div className="mon-alert-main">
        <div className="mon-alert-top">
          <span className="mon-alert-app">{a.appTitle}</span>
          <span className="mon-rule-chip">{RULE_LABELS[a.rule]?.label ?? a.rule}</span>
        </div>
        <div className="mon-alert-change">
          {fieldLabel(a.field)}: {formatChangeValue(a.field, a.oldValue)} →{" "}
          {formatChangeValue(a.field, a.newValue)}
        </div>
      </div>
      <div className="mon-alert-side">
        <span className="mon-alert-when">{formatDate(a.createdAt)}</span>
        {unread && (
          <button className="btn mon-read-btn" onClick={() => onRead(a.id)}>
            <IconCheck /> Read
          </button>
        )}
      </div>
    </div>
  );
}

export function AlertsPage({
  theme,
  onToggleTheme,
}: {
  theme: Theme;
  onToggleTheme: () => void;
}) {
  const [tab, setTab] = useState<Tab>("feed");
  const [alerts, setAlerts] = useState<AlertFeedEntry[] | null>(null);
  const [rules, setRules] = useState<AlertRuleEntry[]>([]);

  function reload() {
    fetchAlerts()
      .then(setAlerts)
      .catch(() => setAlerts([]));
    fetchAlertRules()
      .then(setRules)
      .catch(() => {});
  }

  useEffect(() => {
    reload();
  }, []);

  const unreadCount = useMemo(
    () => (alerts ?? []).filter((a) => a.readAt === null).length,
    [alerts],
  );

  async function readOne(id: string) {
    await markAlertsRead([id]).catch(() => {});
    reload();
  }

  async function readAll() {
    await markAlertsRead().catch(() => {});
    reload();
  }

  async function patchRule(
    id: string,
    patch: { threshold?: number | null; enabled?: boolean; channels?: AlertChannel[] },
  ) {
    await updateAlertRule(id, patch).catch(() => {});
    reload();
  }

  const byDay = useMemo(() => {
    const groups = new Map<string, AlertFeedEntry[]>();
    for (const a of alerts ?? []) {
      const day = a.createdAt.slice(0, 10);
      const g = groups.get(day) ?? [];
      g.push(a);
      groups.set(day, g);
    }
    return [...groups.entries()].sort((x, y) => (x[0] < y[0] ? 1 : -1));
  }, [alerts]);

  return (
    <PageShell
      title="Alerts"
      sub="Trust-gated changes on your tracked apps — no floods, no phantom deltas"
      count={unreadCount > 0 ? `${unreadCount} unread` : undefined}
      theme={theme}
      onToggleTheme={onToggleTheme}
      actions={
        unreadCount > 0 ? (
          <button className="btn" onClick={readAll}>
            <IconCheck /> Mark all read
          </button>
        ) : undefined
      }
    >
      <div className="mon-wrap">
        <div className="mon-tabs">
          {(["feed", "digest", "rules"] as const).map((t) => (
            <button
              key={t}
              className={`mon-tab${tab === t ? " active" : ""}`}
              onClick={() => setTab(t)}
            >
              {t === "feed" ? "Feed" : t === "digest" ? "Daily digest" : "Rules"}
            </button>
          ))}
        </div>

        {tab !== "rules" && alerts !== null && alerts.length === 0 && (
          <div className="mon-empty">
            <div className="mon-empty-title">No alerts yet</div>
            <p>
              Alerts fire when a tracked app makes a notable move — rank shift, price or metadata
              change, rating drop. Track apps and let captures accrue; the trust gate never fires
              on a single gappy capture.
            </p>
          </div>
        )}

        {tab === "feed" && alerts !== null && alerts.length > 0 && (
          <div className="mon-alert-list">
            {alerts.map((a) => (
              <AlertCard key={a.id} a={a} onRead={readOne} />
            ))}
          </div>
        )}

        {tab === "digest" && alerts !== null && alerts.length > 0 && (
          <div className="mon-digest">
            {byDay.map(([day, list]) => (
              <section key={day} className="mon-digest-day">
                <h3 className="mon-digest-head">
                  {day} <span className="mon-digest-count">{list.length}</span>
                </h3>
                {list.map((a) => (
                  <AlertCard key={a.id} a={a} onRead={readOne} />
                ))}
              </section>
            ))}
          </div>
        )}

        {tab === "rules" && (
          <div className="mon-rules">
            <p className="mon-rules-note">
              <IconInfo style={{ width: 13, height: 13 }} /> The in-app feed is always on. The
              banner channel additionally fires a macOS notification from the local API (set{" "}
              <code>ALERT_BANNERS=1</code>) — it works with the tab closed, while the API runs.
            </p>
            {rules.map((r) => {
              const meta = RULE_LABELS[r.rule] ?? { label: r.rule, hint: "", unit: null };
              const dormant = r.rule === "new_ad_creative";
              return (
                <div className={`mon-rule${dormant ? " dormant" : ""}`} key={r.id}>
                  <label className="mon-rule-toggle">
                    <input
                      type="checkbox"
                      checked={r.enabled}
                      disabled={dormant}
                      onChange={(e) => patchRule(r.id, { enabled: e.target.checked })}
                    />
                    <span className="mon-rule-name">{meta.label}</span>
                  </label>
                  <span className="mon-rule-hint">{meta.hint}</span>
                  {r.threshold !== null && meta.unit && (
                    <span className="mon-rule-threshold">
                      <input
                        type="number"
                        defaultValue={r.threshold}
                        min={0}
                        step={meta.unit === "stars" ? 0.1 : 1}
                        onBlur={(e) => {
                          const v = Number(e.target.value);
                          if (!Number.isNaN(v) && v !== r.threshold)
                            patchRule(r.id, { threshold: v });
                        }}
                      />
                      <span>{meta.unit}</span>
                    </span>
                  )}
                  <span className="mon-rule-channels">
                    {(["feed", "banner"] as const).map((ch) => (
                      <label key={ch} className="mon-rule-ch">
                        <input
                          type="checkbox"
                          checked={r.channels.includes(ch)}
                          disabled={ch === "feed" || dormant}
                          onChange={(e) => {
                            const next = e.target.checked
                              ? [...r.channels.filter((c) => c !== ch), ch]
                              : r.channels.filter((c) => c !== ch);
                            patchRule(r.id, { channels: next as AlertChannel[] });
                          }}
                        />
                        {ch}
                      </label>
                    ))}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </PageShell>
  );
}
