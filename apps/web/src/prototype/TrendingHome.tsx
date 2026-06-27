import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CATEGORIES,
  PULSE_ROWS,
  CATEGORY_PULSE,
  PULSE_TAGLINE,
  appsByCategory,
  type App,
} from "./data";
import { Logo } from "./Logo";

function Tile({ app }: { app: App }) {
  const nav = useNavigate();
  const sign = app.delta > 0 ? "+" : "";
  return (
    <div className="pp-tile" onClick={() => nav(`/idea/${app.slug}`)} role="button" tabIndex={0}>
      <div className="pp-tile-top">
        <Logo name={app.name} hue={app.hue} icon={app.icon} />
        <div>
          <div className="name">{app.name}</div>
          <div className="cat">{app.category}</div>
        </div>
      </div>
      <div className="reason">{app.reason}</div>
      <div className="pp-tile-foot">
        <span className={`pp-badge ${app.momentum}`}>
          {app.momentum === "hot" ? "▲" : app.momentum === "rising" ? "▴" : "◦"} {sign}
          {app.delta}%
        </span>
        <span className="metric">{app.downloads}/mo · ★{app.rating}</span>
      </div>
    </div>
  );
}

function PulseRow({
  tagline,
  pulse,
  apps,
  direction,
}: {
  tagline: string;
  pulse: string;
  apps: App[];
  direction: "ltr" | "rtl";
}) {
  // duplicate the list so the marquee loops seamlessly
  const loop = [...apps, ...apps];
  return (
    <section className="pp-row">
      <div className="pp-row-head">
        <h2>{tagline}</h2>
        <span className="pulse">{pulse}</span>
        <span className="more">view all →</span>
      </div>
      <div className="pp-marquee">
        <div className={`pp-track ${direction === "rtl" ? "rtl" : ""}`}>
          {loop.map((a, i) => (
            <Tile key={`${a.slug}-${i}`} app={a} />
          ))}
        </div>
      </div>
    </section>
  );
}

export function TrendingHome() {
  const [cat, setCat] = useState<string>("All");

  const rows = useMemo(() => {
    if (cat === "All") return PULSE_ROWS;
    const apps = appsByCategory(cat);
    if (!apps.length) return [];
    return [
      {
        category: cat,
        tagline: PULSE_TAGLINE[cat] ?? cat,
        pulse: CATEGORY_PULSE[cat] ?? `${apps.length} apps tracked`,
        apps,
        direction: "ltr" as const,
      },
    ];
  }, [cat]);

  return (
    <div className="pp-root">
      <header className="pp-top">
        <div className="pp-brand">
          <span className="dot">◆</span>
          kittie
          <span className="tag">trending ideas</span>
        </div>
        <div className="spacer" />
        <div className="pp-search">
          <span>⌕</span>
          <input placeholder="Search app, category, keyword, or idea…" />
        </div>
        <button className="pp-btn ghost">
          <span className="k">$</span> Ask via MCP
        </button>
      </header>

      <section className="pp-hero">
        <div className="pp-kicker">live app-market signals</div>
        <h1>
          Winners copy <span className="accent">winners.</span>
        </h1>
        <p>
          Live app-store signals turned into build-ready ideas for AI builders. We surface apps on
          the rise — not incumbents — and compress downloads, revenue, reviews, ads and keywords
          into one output: build this, here's why, here's the evidence, here's the agent prompt.
          Move while the window is open.
        </p>
        <div className="pp-cta-row">
          <button className="pp-btn accent">Browse trending ideas</button>
          <button className="pp-btn primary">Generate build brief</button>
          <button className="pp-btn ghost">
            Ask via MCP <span className="k">↗</span>
          </button>
        </div>
      </section>

      <nav className="pp-cats">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            className={`pp-cat ${cat === c ? "active" : ""}`}
            onClick={() => setCat(c)}
          >
            {c}
          </button>
        ))}
      </nav>

      <main className="pp-rows">
        {rows.length ? (
          rows.map((r) => (
            <PulseRow
              key={r.category}
              tagline={r.tagline}
              pulse={r.pulse}
              apps={r.apps}
              direction={r.direction}
            />
          ))
        ) : (
          <div style={{ padding: "60px 56px", color: "var(--pp-ink-3)", fontFamily: "var(--pp-mono)" }}>
            No signals tracked in this category yet.
          </div>
        )}
      </main>
    </div>
  );
}
