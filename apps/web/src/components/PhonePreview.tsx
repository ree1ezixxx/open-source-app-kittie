import { useEffect, useState, type ReactNode } from "react";
import "../styles/phone.css";

/* ============================================================
   PhonePreview — an iOS-native render of a builder blueprint.

   Design system is derived entirely from blueprint.accentHex so any
   generated app looks deliberately art-directed: gradient pairs come
   from hue rotation, glows from alpha ramps, and every layout kind
   maps to a real iOS pattern (widgets, inset grouped lists, Settings
   rows, compose forms) instead of flat placeholder blocks.
   ============================================================ */

interface BlueprintItem {
  title: string;
  subtitle: string;
  detail: string;
}
interface BlueprintTab {
  title: string;
  symbol: string;
  kind: "feed" | "list" | "grid" | "form" | "profile";
  headline: string;
  subhead: string;
  items: BlueprintItem[];
}
interface Blueprint {
  appName: string;
  bundleId: string;
  tagline: string;
  accentHex: string;
  primaryEntity: string;
  tabs: BlueprintTab[];
}

/* ---- color math --------------------------------------------------------- */

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function rgbToHex([r, g, b]: [number, number, number]): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}
function rotateHue(hex: string, deg: number): string {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  h = (h + deg + 360) % 360;
  const c2 = (1 - Math.abs(2 * l - 1)) * s;
  const x = c2 * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c2 / 2;
  let rgb: [number, number, number];
  if (h < 60) rgb = [c2, x, 0];
  else if (h < 120) rgb = [x, c2, 0];
  else if (h < 180) rgb = [0, c2, x];
  else if (h < 240) rgb = [0, x, c2];
  else if (h < 300) rgb = [x, 0, c2];
  else rgb = [c2, 0, x];
  return rgbToHex(rgb.map((v) => (v + m) * 255) as [number, number, number]);
}
function alpha(hex: string, a: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/** "8/12 days" | "7 of 10" -> 0..1, else null. */
function progressOf(detail: string): number | null {
  const m = detail.match(/(\d+)\s*(?:\/|of)\s*(\d+)/i);
  if (!m) return null;
  const n = Number(m[1]);
  const d = Number(m[2]);
  return d > 0 && n <= d ? n / d : null;
}

/* ---- SF-symbol-ish icon set --------------------------------------------- */

const ICON_PATHS: Record<string, ReactNode> = {
  house: <path d="M3 11.2 12 4l9 7.2M5.5 9.8V20h13V9.8" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />,
  list: (
    <>
      <circle cx="4.5" cy="6" r="1.2" />
      <circle cx="4.5" cy="12" r="1.2" />
      <circle cx="4.5" cy="18" r="1.2" />
      <path d="M9 6h11M9 12h11M9 18h11" fill="none" strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  chart: <path d="M5 20V12M10 20V6M15 20v-5M20 20V9" fill="none" strokeWidth="2.4" strokeLinecap="round" />,
  plus: (
    <>
      <circle cx="12" cy="12" r="9" fill="none" strokeWidth="1.8" />
      <path d="M12 8.5v7M8.5 12h7" fill="none" strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  person: (
    <>
      <circle cx="12" cy="8.6" r="3.6" fill="none" strokeWidth="1.8" />
      <path d="M5 20c1.4-3.4 4-5 7-5s5.6 1.6 7 5" fill="none" strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  check: (
    <>
      <circle cx="12" cy="12" r="9" fill="none" strokeWidth="1.8" />
      <path d="m8.2 12.4 2.6 2.6 5-5.6" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  book: <path d="M12 6.5C10.5 5 8.4 4.5 5 4.5v13c3.4 0 5.5.5 7 2 1.5-1.5 3.6-2 7-2v-13c-3.4 0-5.5.5-7 2Zm0 0v13" fill="none" strokeWidth="1.8" strokeLinejoin="round" />,
  fork: <path d="M7 4v6c0 1.4 1 2.4 2.4 2.4H10V20M7 4v4.5M10 4v4.5M16.5 4c-1.7 1-2.5 3-2.5 5.4 0 1.6.8 2.6 2 2.6h.5V20M16.5 4V20" fill="none" strokeWidth="1.7" strokeLinecap="round" />,
  grid: (
    <>
      <rect x="4" y="4" width="7" height="7" rx="1.8" fill="none" strokeWidth="1.8" />
      <rect x="13" y="4" width="7" height="7" rx="1.8" fill="none" strokeWidth="1.8" />
      <rect x="4" y="13" width="7" height="7" rx="1.8" fill="none" strokeWidth="1.8" />
      <rect x="13" y="13" width="7" height="7" rx="1.8" fill="none" strokeWidth="1.8" />
    </>
  ),
  message: <path d="M12 4.5c-4.7 0-8.5 3.1-8.5 7 0 2.2 1.2 4.1 3.1 5.4-.1 1-.5 1.9-1.2 2.6 1.5-.1 2.8-.6 3.8-1.4.9.3 1.8.4 2.8.4 4.7 0 8.5-3.1 8.5-7s-3.8-7-8.5-7Z" fill="none" strokeWidth="1.8" strokeLinejoin="round" />,
  sparkles: <path d="M12 3.5 13.8 9 19.3 11 13.8 13 12 18.5 10.2 13 4.7 11 10.2 9Zm7 11.5.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8Z" strokeWidth="0" />,
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6" fill="none" strokeWidth="1.9" />
      <path d="m15.2 15.2 4.6 4.6" fill="none" strokeWidth="1.9" strokeLinecap="round" />
    </>
  ),
  cart: <path d="M4 5h2.2l1.8 10.4c.1.8.8 1.3 1.6 1.3h7.9c.7 0 1.4-.5 1.6-1.2L21 8.5H7M10 21a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4Zm8 0a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4Z" fill="none" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />,
  bookmark: <path d="M7 4.5h10c.6 0 1 .4 1 1V20l-6-3.6L6 20V5.5c0-.6.4-1 1-1Z" fill="none" strokeWidth="1.8" strokeLinejoin="round" />,
  dumbbell: <path d="M2.5 12h2M19.5 12h2M6 8v8M18 8v8M9 6.5v11M15 6.5v11M9 12h6" fill="none" strokeWidth="1.8" strokeLinecap="round" />,
  pencil: <path d="m14.5 5.5 4 4L8 20l-4.6.9L4 16Zm1.5-1.4 1.6-1.6c.5-.5 1.4-.5 1.9 0l2 2c.5.5.5 1.4 0 1.9L20 8" fill="none" strokeWidth="1.7" strokeLinejoin="round" />,
  star: <path d="m12 4 2.4 5 5.6.7-4.1 3.8 1 5.5-4.9-2.7L7.1 19l1-5.5L4 9.7 9.6 9Z" fill="none" strokeWidth="1.7" strokeLinejoin="round" />,
  gear: (
    <>
      <circle cx="12" cy="12" r="3" fill="none" strokeWidth="1.8" />
      <path d="M12 3.5v2.4m0 12.2v2.4m8.5-8.5h-2.4M5.9 12H3.5m14.5-6-1.7 1.7M7.7 16.3 6 18m12 0-1.7-1.7M7.7 7.7 6 6" fill="none" strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  heart: <path d="M12 19.5C7 15.5 4 12.6 4 9.4 4 7 5.9 5 8.3 5c1.5 0 2.9.8 3.7 2 .8-1.2 2.2-2 3.7-2C18.1 5 20 7 20 9.4c0 3.2-3 6.1-8 10.1Z" fill="none" strokeWidth="1.8" strokeLinejoin="round" />,
  flame: <path d="M12 20.5c3.6 0 6-2.4 6-5.7 0-2.5-1.5-4.3-2.9-6.1-.6 1-1.3 1.6-2.1 2-.1-2.8-1.2-5.2-3.5-6.7.3 4.2-4 5.4-4 10.2 0 3.6 2.7 6.3 6.5 6.3Z" fill="none" strokeWidth="1.8" strokeLinejoin="round" />,
};

function iconKey(symbol: string): string {
  const s = symbol.toLowerCase();
  if (s.includes("house")) return "house";
  if (s.includes("chart") || s.includes("waveform")) return "chart";
  if (s.includes("plus")) return "plus";
  if (s.includes("person")) return "person";
  if (s.includes("checkmark")) return "check";
  if (s.includes("book") && !s.includes("bookmark")) return "book";
  if (s.includes("bookmark")) return "bookmark";
  if (s.includes("fork") || s.includes("cup")) return "fork";
  if (s.includes("grid")) return "grid";
  if (s.includes("message") || s.includes("bubble")) return "message";
  if (s.includes("sparkle") || s.includes("wand")) return "sparkles";
  if (s.includes("magnify")) return "search";
  if (s.includes("cart") || s.includes("bag")) return "cart";
  if (s.includes("dumbbell") || s.includes("figure")) return "dumbbell";
  if (s.includes("pencil") || s.includes("square.and.pencil")) return "pencil";
  if (s.includes("star")) return "star";
  if (s.includes("gear")) return "gear";
  if (s.includes("heart")) return "heart";
  if (s.includes("flame")) return "flame";
  if (s.includes("list")) return "list";
  return "star";
}

function SFIcon({ symbol, size = 22, color }: { symbol: string; size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color ?? "currentColor"} stroke={color ?? "currentColor"} aria-hidden>
      {ICON_PATHS[iconKey(symbol)]}
    </svg>
  );
}

/* ---- chrome -------------------------------------------------------------- */

function StatusBar({ light }: { light?: boolean }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  const hh = now.getHours().toString().padStart(2, "0");
  const mm = now.getMinutes().toString().padStart(2, "0");
  return (
    <div className={`ip-statusbar${light ? " light" : ""}`}>
      <span className="ip-time">
        {hh}:{mm}
      </span>
      <span className="ip-status-right">
        <svg width="17" height="11" viewBox="0 0 17 11" fill="currentColor" aria-hidden>
          <rect x="0" y="7" width="3" height="4" rx="0.8" />
          <rect x="4.5" y="5" width="3" height="6" rx="0.8" />
          <rect x="9" y="2.5" width="3" height="8.5" rx="0.8" />
          <rect x="13.5" y="0" width="3" height="11" rx="0.8" opacity="0.4" />
        </svg>
        <svg width="16" height="11" viewBox="0 0 16 11" fill="currentColor" aria-hidden>
          <path d="M8 9.4a1.4 1.4 0 1 0 0 1.6 1.4 1.4 0 0 0 0-1.6Zm-3.3-2.6 1.2 1.2a3 3 0 0 1 4.2 0l1.2-1.2a4.7 4.7 0 0 0-6.6 0ZM2.4 4.5l1.2 1.2a6.2 6.2 0 0 1 8.8 0l1.2-1.2a7.9 7.9 0 0 0-11.2 0ZM0 2.2l1.2 1.2a9.4 9.4 0 0 1 13.6 0L16 2.2a11 11 0 0 0-16 0Z" />
        </svg>
        <svg width="25" height="12" viewBox="0 0 25 12" aria-hidden>
          <rect x="0.5" y="0.5" width="21" height="11" rx="3" fill="none" stroke="currentColor" opacity="0.4" />
          <rect x="2" y="2" width="15" height="8" rx="1.6" fill="currentColor" />
          <path d="M23.5 4v4a2.2 2.2 0 0 0 0-4Z" fill="currentColor" opacity="0.4" />
        </svg>
      </span>
    </div>
  );
}

/* ---- building blocks ----------------------------------------------------- */

function ProgressRing({ value, accent, size = 36 }: { value: number; accent: string; size?: number }) {
  const deg = Math.round(value * 360);
  return (
    <div
      className="ip-ring"
      style={{
        width: size,
        height: size,
        background: `conic-gradient(${accent} ${deg}deg, rgba(255,255,255,0.12) ${deg}deg)`,
      }}
    >
      <span className="ip-ring-hole">{Math.round(value * 100)}</span>
    </div>
  );
}

function IconDisc({ symbol, accent, size = 34 }: { symbol: string; accent: string; size?: number }) {
  return (
    <span
      className="ip-icondisc"
      style={{ width: size, height: size, background: `linear-gradient(135deg, ${alpha(accent, 0.32)}, ${alpha(rotateHue(accent, 36), 0.18)})`, color: accent }}
    >
      <SFIcon symbol={symbol} size={Math.round(size * 0.52)} />
    </span>
  );
}

function SectionHeader({ children }: { children: ReactNode }) {
  return <div className="ip-section">{children}</div>;
}

function Row({
  item,
  accent,
  symbol,
  onTap,
  last,
}: {
  item: BlueprintItem;
  accent: string;
  symbol: string;
  onTap: () => void;
  last: boolean;
}) {
  const p = progressOf(item.detail);
  return (
    <button className={`ip-row${last ? " last" : ""}`} onClick={onTap}>
      {p !== null ? <ProgressRing value={p} accent={accent} /> : <IconDisc symbol={symbol} accent={accent} />}
      <span className="ip-row-text">
        <span className="ip-row-title">{item.title}</span>
        {item.subtitle && <span className="ip-row-sub">{item.subtitle}</span>}
      </span>
      {item.detail && <span className="ip-row-detail">{item.detail}</span>}
      <span className="ip-chevron">›</span>
    </button>
  );
}

/* ---- screens -------------------------------------------------------------- */

function FeedScreen({ tab, accent, onTap }: { tab: BlueprintTab; accent: string; onTap: (i: BlueprintItem) => void }) {
  const [hero, ...rest] = tab.items;
  const g2 = rotateHue(accent, 42);
  return (
    <>
      {hero && (
        <button
          className="ip-hero"
          style={{ background: `linear-gradient(135deg, ${accent}, ${g2})`, boxShadow: `0 14px 34px -10px ${alpha(accent, 0.55)}` }}
          onClick={() => onTap(hero)}
        >
          <span className="ip-hero-glyph">
            <SFIcon symbol={tab.symbol} size={26} color="rgba(255,255,255,0.95)" />
          </span>
          <span className="ip-hero-detail">{hero.detail}</span>
          <span className="ip-hero-title">{hero.title}</span>
          {hero.subtitle && <span className="ip-hero-sub">{hero.subtitle}</span>}
        </button>
      )}
      {rest.length > 0 && (
        <>
          <SectionHeader>Up next</SectionHeader>
          <div className="ip-group">
            {rest.map((it, i) => (
              <Row key={i} item={it} accent={accent} symbol={tab.symbol} onTap={() => onTap(it)} last={i === rest.length - 1} />
            ))}
          </div>
        </>
      )}
    </>
  );
}

function GridScreen({ tab, accent, onTap }: { tab: BlueprintTab; accent: string; onTap: (i: BlueprintItem) => void }) {
  return (
    <div className="ip-widgets">
      {tab.items.map((it, i) => {
      const p = progressOf(it.detail);
      const tint = rotateHue(accent, (i % 4) * 24);
      return (
        <button
          key={i}
          className="ip-widget"
          style={i === 0 ? { background: `linear-gradient(150deg, ${accent}, ${rotateHue(accent, 46)})` } : undefined}
          onClick={() => onTap(it)}
        >
          <span className="ip-widget-top">
            {p !== null ? (
              <ProgressRing value={p} accent={i === 0 ? "#fff" : tint} size={30} />
            ) : (
              <IconDisc symbol={tab.symbol} accent={i === 0 ? "#fff" : tint} size={30} />
            )}
            <span className="ip-widget-detail" style={i === 0 ? { color: "rgba(255,255,255,0.85)" } : { color: tint }}>
              {it.detail}
            </span>
          </span>
          <span className="ip-widget-title" style={i === 0 ? { color: "#fff" } : undefined}>
            {it.title}
          </span>
          {it.subtitle && (
            <span className="ip-widget-sub" style={i === 0 ? { color: "rgba(255,255,255,0.7)" } : undefined}>
              {it.subtitle}
            </span>
          )}
        </button>
      );
      })}
    </div>
  );
}

function ListScreen({ tab, accent, onTap }: { tab: BlueprintTab; accent: string; onTap: (i: BlueprintItem) => void }) {
  return (
    <div className="ip-group">
      {tab.items.map((it, i) => (
        <Row key={i} item={it} accent={accent} symbol={tab.symbol} onTap={() => onTap(it)} last={i === tab.items.length - 1} />
      ))}
    </div>
  );
}

function FormScreen({ tab, accent }: { tab: BlueprintTab; accent: string }) {
  return (
    <>
      <div className="ip-group ip-fields">
        <div className="ip-field">Title</div>
        <div className="ip-field tall last">Notes</div>
      </div>
      <button className="ip-cta" style={{ background: accent }}>
        Add {tab.title === "New" ? "" : tab.title.replace(/s$/, "").toLowerCase()}
      </button>
      {tab.items.length > 0 && (
        <>
          <SectionHeader>Recent</SectionHeader>
          <div className="ip-group">
            {tab.items.slice(0, 3).map((it, i, arr) => (
              <Row key={i} item={it} accent={accent} symbol={tab.symbol} onTap={() => {}} last={i === arr.length - 1} />
            ))}
          </div>
        </>
      )}
    </>
  );
}

function ProfileScreen({ tab, accent, appName }: { tab: BlueprintTab; accent: string; appName: string }) {
  const ICON_CYCLE = ["gear", "bookmark", "chart", "heart", "star", "message"];
  return (
    <>
      <div className="ip-profile-top">
        <span className="ip-avatar" style={{ background: `linear-gradient(135deg, ${accent}, ${rotateHue(accent, 60)})` }}>
          {appName.slice(0, 1).toUpperCase()}
        </span>
        <span className="ip-profile-name">{tab.headline}</span>
        {tab.subhead && <span className="ip-profile-sub">{tab.subhead}</span>}
      </div>
      <div className="ip-group">
        {tab.items.map((it, i) => (
          <button key={i} className={`ip-row${i === tab.items.length - 1 ? " last" : ""}`}>
            <span className="ip-settings-icon" style={{ background: rotateHue(accent, i * 48) }}>
              <SFIcon symbol={ICON_CYCLE[i % ICON_CYCLE.length]!} size={15} color="#fff" />
            </span>
            <span className="ip-row-text">
              <span className="ip-row-title">{it.title}</span>
            </span>
            {it.detail && <span className="ip-row-detail">{it.detail}</span>}
            <span className="ip-chevron">›</span>
          </button>
        ))}
      </div>
    </>
  );
}

/* ---- detail push ----------------------------------------------------------- */

function DetailScreen({
  item,
  tab,
  accent,
  entity,
  onBack,
}: {
  item: BlueprintItem;
  tab: BlueprintTab;
  accent: string;
  entity: string;
  onBack: () => void;
}) {
  const p = progressOf(item.detail);
  return (
    <div className="ip-detail">
      <div className="ip-navbar">
        <button className="ip-back" style={{ color: accent }} onClick={onBack}>
          <span className="ip-back-chevron">‹</span> {tab.title}
        </button>
        <span className="ip-nav-title">{item.title}</span>
        <span className="ip-nav-spacer" />
      </div>
      <div className="ip-scroll">
        <div
          className="ip-detail-hero"
          style={{ background: `linear-gradient(140deg, ${accent}, ${rotateHue(accent, 48)})`, boxShadow: `0 18px 40px -12px ${alpha(accent, 0.5)}` }}
        >
          {p !== null ? (
            <ProgressRing value={p} accent="#fff" size={54} />
          ) : (
            <SFIcon symbol={tab.symbol} size={40} color="rgba(255,255,255,0.95)" />
          )}
          <span className="ip-detail-hero-text">{item.detail || item.title}</span>
        </div>
        <div className="ip-detail-title">{item.title}</div>
        {item.subtitle && <div className="ip-detail-sub">{item.subtitle}</div>}
        <SectionHeader>Details</SectionHeader>
        <div className="ip-group">
          <div className="ip-row static">
            <span className="ip-row-text">
              <span className="ip-row-title">{entity.charAt(0).toUpperCase() + entity.slice(1)}</span>
            </span>
            <span className="ip-row-detail" style={{ color: accent }}>
              {item.detail || "—"}
            </span>
          </div>
          <div className="ip-row static last">
            <span className="ip-row-text">
              <span className="ip-row-title">Status</span>
            </span>
            <span className="ip-row-detail">Active</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---- live preview overlay -------------------------------------------------- */

export interface LogEntry {
  ts: number;
  level: "info" | "warn" | "error";
  source: "npm" | "expo" | "system";
  line: string;
}

export interface LivePreview {
  status: "idle" | "installing" | "starting" | "ready" | "failed" | "stopped";
  url?: string;
  error?: string;
  logTail?: LogEntry[];
  /** bump to force the iframe to re-fetch its src */
  reloadKey?: number;
  onRetry: () => void;
}

const LIVE_LABELS: Record<string, string> = {
  installing: "Installing dependencies…",
  starting: "Starting simulator…",
  idle: "Ready to launch",
};

function LiveOverlay({ live, accent }: { live: LivePreview; accent: string }) {
  const { status } = live;

  if (status === "ready" && live.url) {
    return (
      <iframe
        key={live.reloadKey ?? 0}
        className="ip-live-frame"
        src={live.url}
        title="Live preview"
        sandbox="allow-scripts allow-same-origin allow-forms"
      />
    );
  }

  if (status === "failed") {
    return (
      <div className="ip-live-state failed">
        <div className="ip-live-cross">!</div>
        <div className="ip-live-title">Preview failed to start</div>
        {live.error && <div className="ip-live-error">{live.error}</div>}
        <button className="ip-live-retry" style={{ background: accent }} onClick={live.onRetry}>
          Retry
        </button>
        {live.logTail && live.logTail.length > 0 && <LiveLogs lines={live.logTail.slice(-20)} collapsible />}
      </div>
    );
  }

  if (status === "stopped") {
    return (
      <div className="ip-live-state">
        <div className="ip-live-title dim">Preview stopped</div>
        <button className="ip-live-retry" style={{ background: accent }} onClick={live.onRetry}>
          Run again
        </button>
      </div>
    );
  }

  // installing / starting / idle — booting spinner with rolling logs
  return (
    <div className="ip-live-state">
      <span className="ip-live-spinner" style={{ borderTopColor: accent }} />
      <div className="ip-live-title">{LIVE_LABELS[status] ?? "Starting…"}</div>
      {live.logTail && live.logTail.length > 0 && <LiveLogs lines={live.logTail.slice(-4)} />}
    </div>
  );
}

function LiveLogs({ lines, collapsible }: { lines: LogEntry[]; collapsible?: boolean }) {
  const [open, setOpen] = useState(!collapsible);
  return (
    <div className="ip-live-logs-wrap">
      {collapsible && (
        <button className="ip-live-logs-toggle" onClick={() => setOpen((o) => !o)}>
          {open ? "▾" : "▸"} {open ? "Hide" : "Show"} last {lines.length} log lines
        </button>
      )}
      {open && (
        <pre className="ip-live-logs">
          {lines.map((l, i) => (
            <div key={i} className={`log-${l.level}`}>
              {l.line}
            </div>
          ))}
        </pre>
      )}
    </div>
  );
}

/* ---- root ------------------------------------------------------------------ */

export function PhonePreview({
  blueprint: b,
  activeTab,
  onSelectTab,
  live,
}: {
  blueprint: Blueprint;
  activeTab: number;
  onSelectTab: (i: number) => void;
  live?: LivePreview;
}) {
  const [detail, setDetail] = useState<BlueprintItem | null>(null);
  const tab = b.tabs[Math.min(activeTab, b.tabs.length - 1)];
  if (!tab) return null;
  const accent = b.accentHex;
  const today = new Date()
    .toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })
    .toUpperCase();

  // Live mode: keep the frame + status bar chrome, swap the screen body for the
  // iframe / boot overlays. Mockup mode falls through to the blueprint render.
  if (live) {
    const isReady = live.status === "ready" && live.url;
    return (
      <div className="ip-frame">
        <div className="ip-island" />
        <div className="ip-screen" style={{ background: isReady ? "#000" : `radial-gradient(120% 50% at 50% -8%, ${alpha(accent, 0.16)}, transparent 60%), #000` }}>
          {!isReady && <StatusBar />}
          <div className={`ip-live-body${isReady ? " ready" : ""}`}>
            <LiveOverlay live={live} accent={accent} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ip-frame">
      <div className="ip-island" />
      <div className="ip-screen" style={{ background: `radial-gradient(120% 50% at 50% -8%, ${alpha(accent, 0.16)}, transparent 60%), #000` }}>
        <StatusBar />
        {detail ? (
          <DetailScreen item={detail} tab={tab} accent={accent} entity={b.primaryEntity} onBack={() => setDetail(null)} />
        ) : (
          <div className="ip-scroll">
            {tab.kind !== "profile" && (
              <header className="ip-header">
                <span className="ip-eyebrow">{today}</span>
                <h1 className="ip-largetitle">{tab.headline}</h1>
                {tab.subhead && <p className="ip-subhead">{tab.subhead}</p>}
              </header>
            )}
            {tab.kind === "feed" && <FeedScreen tab={tab} accent={accent} onTap={setDetail} />}
            {tab.kind === "grid" && <GridScreen tab={tab} accent={accent} onTap={setDetail} />}
            {tab.kind === "list" && <ListScreen tab={tab} accent={accent} onTap={setDetail} />}
            {tab.kind === "form" && <FormScreen tab={tab} accent={accent} />}
            {tab.kind === "profile" && <ProfileScreen tab={tab} accent={accent} appName={b.appName} />}
            <div className="ip-scroll-pad" />
          </div>
        )}
        <nav className="ip-tabbar">
          {b.tabs.map((t, i) => (
            <button
              key={i}
              className="ip-tab"
              style={{ color: i === activeTab ? accent : "rgba(235,235,245,0.55)" }}
              onClick={() => {
                setDetail(null);
                onSelectTab(i);
              }}
            >
              <SFIcon symbol={t.symbol} size={23} />
              <span>{t.title}</span>
            </button>
          ))}
        </nav>
        <div className="ip-homebar" />
      </div>
    </div>
  );
}
