/* ============================================================
   API Keys. /api-keys
   Programmatic access to the Kittie API — local stub of the
   team-gated key management in the live product.
   Keys are generated client-side and live in localStorage only;
   real key auth is owned by the auth & billing lane (not wired).
   ============================================================ */
import { useState } from "react";
import type { CSSProperties } from "react";
import type { Theme } from "../lib/theme";
import { PageHeader } from "../components/reviews/primitives";
import { formatDate, relativeTime } from "../lib/format";
import {
  IconKey, IconSun, IconMoon, IconCoin, IconPlus, IconInfo, IconCheck, IconClose,
} from "../icons";

/* ---- Local key store (this build only — never sent anywhere) ---- */
const STORAGE_KEY = "kittie.apikeys.v1";

interface ApiKeyRecord {
  id: string;
  name: string;
  key: string; // full key; rendered masked after the one-time reveal
  createdAt: string;
  lastUsedAt: string | null;
}

function readKeys(): ApiKeyRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ApiKeyRecord[]) : [];
  } catch {
    return [];
  }
}

function writeKeys(keys: ApiKeyRecord[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
  } catch {
    /* storage unavailable — keys live for the session only */
  }
}

function generateKey(): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let body = "";
  for (const b of bytes) body += alphabet[b % alphabet.length];
  return `kit_${body}`;
}

function maskKey(key: string): string {
  return `kit_…${key.slice(-4)}`;
}

const MONTHLY_ALLOWANCE = 25_000;
const CREDITS_USED = 0; // nothing bills against the stub keys in this build

function nextRenewalIso(): string {
  const d = new Date();
  d.setMonth(d.getMonth() + 1, 1);
  return d.toISOString();
}

const mono: CSSProperties = {
  fontFamily: '"SF Mono", "JetBrains Mono", ui-monospace, monospace',
};

export function ApiKeysPage({ theme, onToggleTheme }: { theme: Theme; onToggleTheme: () => void }) {
  const [keys, setKeys] = useState<ApiKeyRecord[]>(readKeys);
  const [creating, setCreating] = useState(false);
  const [draftName, setDraftName] = useState("");
  /* One-time reveal: the full key is shown exactly once, right after create. */
  const [freshKey, setFreshKey] = useState<{ name: string; key: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const usedPct = Math.min(100, Math.round((CREDITS_USED / MONTHLY_ALLOWANCE) * 100));

  function createKey() {
    const name = draftName.trim() || `Key ${keys.length + 1}`;
    const record: ApiKeyRecord = {
      id: crypto.randomUUID(),
      name,
      key: generateKey(),
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
    };
    const next = [record, ...keys];
    setKeys(next);
    writeKeys(next);
    setFreshKey({ name: record.name, key: record.key });
    setCopied(false);
    setCreating(false);
    setDraftName("");
  }

  function revokeKey(id: string) {
    const next = keys.filter((k) => k.id !== id);
    setKeys(next);
    writeKeys(next);
    if (freshKey && !next.some((k) => k.key === freshKey.key)) setFreshKey(null);
  }

  function copyFreshKey() {
    if (!freshKey) return;
    void navigator.clipboard?.writeText(freshKey.key).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    });
  }

  return (
    <main className="main">
      <PageHeader
        icon={<IconKey style={{ width: 18, height: 18 }} />}
        title="API Keys"
        subtitle="Programmatic access to the Kittie API"
        actions={
          <button className="icon-btn" onClick={onToggleTheme} aria-label="Toggle theme">
            {theme === "dark" ? <IconSun /> : <IconMoon />}
          </button>
        }
      />

      <div className="set-scroll">
        <div className="set-inner">
          {/* ---- Credits ---- */}
          <section className="set-section">
            <div className="set-section-head">
              <div className="set-section-icon"><IconCoin style={{ width: 16, height: 16 }} /></div>
              <div>
                <div className="set-section-title">Credits</div>
                <div className="set-section-sub">Monthly allowance for API calls</div>
              </div>
            </div>
            <div className="set-card">
              <div className="set-plan-row" style={{ marginBottom: 12 }}>
                <div>
                  <div className="set-plan-name">
                    25,000 credits <span className="set-badge set-badge-active">Included</span>
                  </div>
                  <div className="set-plan-meta">Renews {formatDate(nextRenewalIso())}</div>
                </div>
                <div className="set-plan-price">
                  <span className="set-price-num">{CREDITS_USED.toLocaleString()}</span>
                  <span className="set-price-unit"> used</span>
                </div>
              </div>
              <div
                role="progressbar"
                aria-valuenow={CREDITS_USED}
                aria-valuemin={0}
                aria-valuemax={MONTHLY_ALLOWANCE}
                aria-label="Monthly credit usage"
                style={{
                  height: 8, borderRadius: 99, overflow: "hidden",
                  background: "var(--surface-2)", border: "1px solid var(--border-soft)",
                }}
              >
                <div style={{ width: `${usedPct}%`, height: "100%", background: "var(--accent)", borderRadius: 99 }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 12, color: "var(--text-tertiary)" }}>
                <span>{CREDITS_USED.toLocaleString()} / {MONTHLY_ALLOWANCE.toLocaleString()} credits this month</span>
                <span>Unused credits don’t roll over</span>
              </div>
            </div>
          </section>

          {/* ---- Keys ---- */}
          <section className="set-section">
            <div className="set-section-head">
              <div className="set-section-icon"><IconKey style={{ width: 16, height: 16 }} /></div>
              <div style={{ flex: 1 }}>
                <div className="set-section-title">Keys</div>
                <div className="set-section-sub">Send as <span style={mono}>Authorization: Bearer kit_…</span></div>
              </div>
              {!creating && (
                <button className="btn btn-accent" onClick={() => setCreating(true)}>
                  <IconPlus /> Create key
                </button>
              )}
            </div>

            {/* One-time full-key reveal — gone once dismissed. */}
            {freshKey && (
              <div
                className="set-toast"
                style={{ alignItems: "flex-start", flexDirection: "column", gap: 6 }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <IconCheck style={{ width: 15, height: 15, color: "var(--accent)" }} />
                  <strong style={{ fontWeight: 650 }}>“{freshKey.name}” created.</strong>
                  <span style={{ color: "var(--text-secondary)" }}>Copy it now — it won’t be shown again.</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, width: "100%" }}>
                  <code
                    style={{
                      ...mono, fontSize: 12, flex: 1, minWidth: 0,
                      overflowX: "auto", whiteSpace: "nowrap",
                      background: "var(--surface)", border: "1px solid var(--border-soft)",
                      borderRadius: 8, padding: "7px 10px",
                    }}
                  >
                    {freshKey.key}
                  </code>
                  <button className="btn" onClick={copyFreshKey} style={{ flexShrink: 0 }}>
                    {copied ? <><IconCheck /> Copied</> : "Copy"}
                  </button>
                  <button className="icon-btn" onClick={() => setFreshKey(null)} aria-label="Dismiss" style={{ flexShrink: 0 }}>
                    <IconClose />
                  </button>
                </div>
              </div>
            )}

            <div className="set-card">
              {creating && (
                <div style={{ display: "flex", gap: 9, marginBottom: keys.length > 0 ? 16 : 14 }}>
                  <input
                    autoFocus
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") createKey();
                      if (e.key === "Escape") { setCreating(false); setDraftName(""); }
                    }}
                    placeholder="Key name — e.g. “CI exports”"
                    style={{
                      flex: 1, height: 34, padding: "0 11px", fontSize: 12.5,
                      color: "var(--text)", background: "var(--surface-2)",
                      border: "1px solid var(--border)", borderRadius: 9, outline: "none",
                    }}
                  />
                  <button className="btn btn-accent" onClick={createKey}><IconCheck /> Create</button>
                  <button className="btn" onClick={() => { setCreating(false); setDraftName(""); }}>Cancel</button>
                </div>
              )}

              {keys.length === 0 ? (
                !creating && (
                  <div className="set-export-empty">
                    <IconKey style={{ width: 26, height: 26, opacity: 0.5 }} />
                    <div className="set-export-title">No API keys yet</div>
                    <div className="set-export-sub">Create one to call the API.</div>
                  </div>
                )
              ) : (
                <div role="table" aria-label="API keys">
                  <div
                    role="row"
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(0, 1.3fr) minmax(0, 1.1fr) 108px 96px 72px",
                      gap: 10, padding: "0 0 9px",
                      borderBottom: "1px solid var(--border-soft)",
                      fontSize: 10.5, fontWeight: 650, textTransform: "uppercase",
                      letterSpacing: "0.05em", color: "var(--text-tertiary)",
                    }}
                  >
                    <span>Name</span><span>Key</span><span>Created</span><span>Last used</span><span />
                  </div>
                  {keys.map((k) => (
                    <div
                      key={k.id}
                      role="row"
                      style={{
                        display: "grid",
                        gridTemplateColumns: "minmax(0, 1.3fr) minmax(0, 1.1fr) 108px 96px 72px",
                        gap: 10, alignItems: "center", padding: "11px 0",
                        borderBottom: "1px solid var(--border-soft)", fontSize: 12.5,
                      }}
                    >
                      <span style={{ fontWeight: 560, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {k.name}
                      </span>
                      <span style={{ ...mono, fontSize: 12, color: "var(--text-secondary)" }}>{maskKey(k.key)}</span>
                      <span style={{ color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>
                        {formatDate(k.createdAt)}
                      </span>
                      <span style={{ color: "var(--text-tertiary)" }}>
                        {k.lastUsedAt ? relativeTime(k.lastUsedAt) : "Never"}
                      </span>
                      <span style={{ textAlign: "right" }}>
                        <button
                          className="btn"
                          onClick={() => revokeKey(k.id)}
                          style={{ height: 26, padding: "0 10px", fontSize: 11.5, color: "var(--negative)" }}
                        >
                          Revoke
                        </button>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* ---- Honesty note ---- */}
          <section className="set-section">
            <div className="set-card" style={{ display: "flex", gap: 11, alignItems: "flex-start" }}>
              <IconInfo style={{ width: 16, height: 16, color: "var(--accent)", flexShrink: 0, marginTop: 1 }} />
              <div style={{ fontSize: 12.5, lineHeight: 1.55, color: "var(--text-secondary)" }}>
                <strong style={{ color: "var(--text)", fontWeight: 620 }}>Local stubs.</strong>{" "}
                Keys on this page are generated in your browser and stored in localStorage —
                they never leave this machine. Real key authentication isn’t wired in this
                open-source build; the local API is open and ignores the{" "}
                <span style={mono}>Authorization</span> header.
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
