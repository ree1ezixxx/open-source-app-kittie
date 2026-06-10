/* ============================================================
   Lane D — MCP marketing landing. /mcp
   Static content only — no backend.
   ============================================================ */
import { useState } from "react";
import type { Theme } from "../lib/theme";
import { PageHeader } from "../components/reviews/primitives";
import {
  IconSpark, IconSun, IconMoon, IconExternal, IconGrid, IconSearch, IconChart,
  IconUsers, IconTrending, IconCoin, IconStar, IconRank, IconDatabase, IconInfo,
} from "../icons";

const INSTALL_CMD =
  'claude mcp add appkittie --transport http https://mcp.appkittie.com --header "Authorization: Bearer YOUR_API_KEY"';

const TOOLS = [
  { name: "search_apps", desc: "Search & filter the app database by category, store, revenue, rating and growth." },
  { name: "get_app_detail", desc: "Full listing for one app — metadata, screenshots, historicals, IAPs." },
  { name: "get_keyword_difficulty", desc: "Difficulty, popularity and traffic score for a single keyword." },
  { name: "batch_keyword_difficulty", desc: "Score many keywords in one call for opportunity ranking." },
  { name: "get_app_reviews", desc: "Latest review text for an app by country — ratings, titles, dates." },
  { name: "get_supported_countries", desc: "Countries the store data, charts and rankings cover." },
];

const SKILLS: { icon: typeof IconGrid; title: string; desc: string }[] = [
  { icon: IconSearch, title: "App Discovery", desc: "Surface apps matching a thesis — niche, store, momentum." },
  { icon: IconStar, title: "Keyword Research", desc: "Find low-difficulty, high-traffic keywords to target." },
  { icon: IconGrid, title: "Metadata Optimization", desc: "Tighten title, subtitle and keyword field for ASO." },
  { icon: IconUsers, title: "Competitor Analysis", desc: "Benchmark an app against its closest rivals." },
  { icon: IconTrending, title: "Growth Analysis", desc: "Read momentum from rank, download and review deltas." },
  { icon: IconRank, title: "Ad Intelligence", desc: "Inspect Meta & Apple Search Ads creative and spend signals." },
  { icon: IconCoin, title: "Revenue Analysis", desc: "Estimate MRR and revenue trajectory per app." },
  { icon: IconChart, title: "Review Intelligence", desc: "Cluster review themes and sentiment into action items." },
  { icon: IconDatabase, title: "Localization & Pricing", desc: "PPP-aware pricing and per-locale store coverage." },
];

const SETUP = [
  { t: "Get your API key", d: "Grab a key from your AppKittie dashboard under Settings." },
  { t: "Add the MCP server", d: "Run the one-liner in your IDE or agent terminal." },
  { t: "Ask away", d: "Prompt your agent: “Find rising finance apps under 10k reviews.”" },
];

function CopyCommand({ cmd }: { cmd: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard?.writeText(cmd).then(
      () => { setCopied(true); window.setTimeout(() => setCopied(false), 1600); },
      () => {},
    );
  }
  return (
    <div className="mcp-term">
      <div className="mcp-term-bar">
        <span className="mcp-dot" /><span className="mcp-dot" /><span className="mcp-dot" />
        <span className="mcp-term-label">terminal</span>
        <button className="mcp-copy" onClick={copy}>{copied ? "Copied ✓" : "Copy"}</button>
      </div>
      <pre className="mcp-term-body"><code><span className="mcp-prompt">$</span> {cmd}</code></pre>
    </div>
  );
}

export function McpLandingPage({ theme, onToggleTheme }: { theme: Theme; onToggleTheme: () => void }) {
  return (
    <main className="main">
      <PageHeader
        icon={<IconSpark style={{ width: 18, height: 18 }} />}
        title="MCP Server"
        subtitle="App Store intelligence, native to your agent"
        actions={
          <>
            <a className="btn" href="https://github.com/appkittie" target="_blank" rel="noreferrer">
              <IconExternal /> View on GitHub
            </a>
            <button className="icon-btn" onClick={onToggleTheme} aria-label="Toggle theme">
              {theme === "dark" ? <IconSun /> : <IconMoon />}
            </button>
          </>
        }
      />

      <div className="mcp-scroll">
        <div className="mcp-inner">
          {/* hero */}
          <section className="mcp-hero">
            <span className="mcp-eyebrow"><IconSpark style={{ width: 13, height: 13 }} /> Model Context Protocol</span>
            <h1 className="mcp-h1">App Store intelligence<br />in your IDE</h1>
            <p className="mcp-lede">
              Give Claude, Cursor or any MCP-aware agent live access to 100,000+ tracked apps, keyword
              difficulty, revenue estimates and real review streams — without leaving your editor.
            </p>
            <CopyCommand cmd={INSTALL_CMD} />
            <div className="mcp-hero-meta">
              <span><IconInfo style={{ width: 13, height: 13 }} /> Works with Claude Code, Claude Desktop, Cursor & Cline</span>
            </div>
          </section>

          {/* tools */}
          <section className="mcp-section">
            <div className="mcp-section-head">
              <h2 className="mcp-h2">6 tools</h2>
              <p className="mcp-section-sub">Everything the agent can call, exposed over HTTP.</p>
            </div>
            <div className="mcp-tool-grid">
              {TOOLS.map((t) => (
                <div className="mcp-tool" key={t.name}>
                  <code className="mcp-tool-name">{t.name}</code>
                  <p className="mcp-tool-desc">{t.desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* skills */}
          <section className="mcp-section">
            <div className="mcp-section-head">
              <h2 className="mcp-h2">9 agent skills</h2>
              <p className="mcp-section-sub">Composed workflows the tools unlock out of the box.</p>
            </div>
            <div className="mcp-skill-grid">
              {SKILLS.map((s) => {
                const Icon = s.icon;
                return (
                  <div className="mcp-skill" key={s.title}>
                    <div className="mcp-skill-icon"><Icon style={{ width: 17, height: 17 }} /></div>
                    <div className="mcp-skill-title">{s.title}</div>
                    <div className="mcp-skill-desc">{s.desc}</div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* quick setup */}
          <section className="mcp-section">
            <div className="mcp-section-head">
              <h2 className="mcp-h2">Up and running in 3 steps</h2>
            </div>
            <div className="mcp-setup">
              {SETUP.map((s, i) => (
                <div className="mcp-step" key={s.t}>
                  <span className="mcp-step-n">{i + 1}</span>
                  <div className="mcp-step-t">{s.t}</div>
                  <div className="mcp-step-d">{s.d}</div>
                </div>
              ))}
            </div>
            <div className="mcp-cta">
              <CopyCommand cmd={INSTALL_CMD} />
              <a className="btn btn-accent mcp-cta-btn" href="https://github.com/appkittie" target="_blank" rel="noreferrer">
                <IconExternal /> View on GitHub
              </a>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
