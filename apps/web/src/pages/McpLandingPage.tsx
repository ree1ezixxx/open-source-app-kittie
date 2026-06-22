/* ============================================================
   Lane D — MCP marketing landing. /mcp
   Static content only — no backend.
   ============================================================ */
import { useState } from "react";
import { Link } from "react-router-dom";
import type { Theme } from "../lib/theme";
import { PageHeader } from "../components/reviews/primitives";
import {
  IconSpark, IconSun, IconMoon, IconExternal, IconGrid, IconSearch, IconChart,
  IconUsers, IconTrending, IconCoin, IconStar, IconRank, IconDatabase, IconInfo,
  IconKey, IconTerminal,
} from "../icons";

const INSTALL_CMD =
  'claude mcp add appkittie --transport http https://mcp.appkittie.com --header "Authorization: Bearer YOUR_API_KEY"';

const TOOLS = [
  { name: "search_apps", credits: "1 credit / app", desc: "Search and filter iOS apps by category, revenue, downloads, growth, ratings, and 30+ other filters." },
  { name: "get_app_detail", credits: "1 credit", desc: "Full app data — metadata, revenue, historical trends, Meta ads, Apple ads, IAPs, creators, and contacts." },
  { name: "get_keyword_difficulty", credits: "10 credits", desc: "Deep keyword analysis — popularity, difficulty, traffic score, and the top-ranking apps for any keyword." },
  { name: "batch_keyword_difficulty", credits: "10 credits / keyword", desc: "Analyze up to 10 keywords at once, auto-sorted by opportunity. Best keywords surface first." },
  { name: "get_app_reviews", credits: "1 credit / review", desc: "Fetch user reviews for any app — ratings, text, dates, and reviewer info. Paginated for bulk analysis." },
  { name: "get_supported_countries", credits: "FREE", desc: "List all valid App Store country codes for keyword research. Free, no credits needed." },
];

const SKILLS: { icon: typeof IconGrid; title: string; desc: string }[] = [
  { icon: IconSearch, title: "App Discovery", desc: "Search and filter iOS apps by category, revenue, downloads, growth, ratings, and ad intelligence." },
  { icon: IconStar, title: "Keyword Research", desc: "Evaluate keywords by popularity, difficulty, and traffic score — build a prioritized keyword strategy." },
  { icon: IconGrid, title: "Metadata Optimization", desc: "Write optimized title, subtitle, keyword field, and description — with 3 variants and character counts." },
  { icon: IconUsers, title: "Competitor Analysis", desc: "Keyword gaps, revenue comparison, ad strategy teardown, and competitive positioning map." },
  { icon: IconTrending, title: "Growth Analysis", desc: "Find the fastest-growing apps, analyze growth drivers, and spot market movers and emerging trends." },
  { icon: IconRank, title: "Ad Intelligence", desc: "Discover which apps run Meta and Apple ads, analyze creative strategies, and find UA opportunities." },
  { icon: IconCoin, title: "Revenue Analysis", desc: "Revenue benchmarking, monetization model analysis, in-app purchase patterns, and pricing strategy." },
  { icon: IconChart, title: "Review Analysis", desc: "Analyze user sentiment, mine feature requests, identify complaints, and compare reviews across competitors." },
  { icon: IconDatabase, title: "Marketing Context", desc: "Create a shared context document — app, audience, competitors, goals — that all other skills reference." },
];

const SETUP = [
  { t: "Get your API key", d: "Go to Settings → API Keys in your dashboard. Generate a key that starts with appkittie_." },
  { t: "Add to your MCP config", d: "Paste the config snippet below into your Cursor, Claude, or agent settings." },
  { t: "Ask your agent", d: "Start asking questions — your AI now has real-time App Store data." },
];

const MCP_CONFIG = `{
  "mcpServers": {
    "appkittie": {
      "url": "https://mcp.appkittie.com",
      "headers": {
        "Authorization": "Bearer appkittie_your_key_here"
      }
    }
  }
}`;

const INSTALLS = [
  { label: "Cursor", text: "Settings → Rules → Add Rule → Remote Rule → w" },
  { label: "Claude Code", text: "npx skills add appkittie/aso-mcp-skills" },
  { label: "Manual", text: "git clone https://github.com/appkittie/aso-mcp-skills.git && cp -r aso-mcp-skills/skills/* .cursor/skills/" },
];

const PROMPTS = [
  "Find the most profitable apps in Health & Fitness",
  "Research keywords for a meditation app in the US",
  "Analyze my competitors — my app ID is 1234567890",
  "Which apps are running Meta ads in productivity?",
  "What apps are growing fastest this week?",
  "Optimize my App Store title and subtitle",
  "What's the revenue potential in the education category?",
  "Find apps making $10K–50K/month with <1000 reviews",
  "Analyze reviews for app 284882215 — what are users complaining about?",
  "Compare user reviews across the top 3 meditation apps",
];

const PRICING = [
  { tool: "search_apps", what: "Search & filter apps", cost: "1 credit / app" },
  { tool: "get_app_detail", what: "Full app details", cost: "1 credit" },
  { tool: "get_keyword_difficulty", what: "Single keyword analysis", cost: "10 credits" },
  { tool: "batch_keyword_difficulty", what: "Batch keyword analysis", cost: "10 credits / kw" },
  { tool: "get_app_reviews", what: "Fetch app reviews", cost: "1 credit / review" },
  { tool: "get_supported_countries", what: "List country codes", cost: "FREE" },
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
            <a className="btn" href="https://github.com/appkittie/aso-mcp-skills" target="_blank" rel="noreferrer">
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
            <span className="mcp-eyebrow"><IconSpark style={{ width: 13, height: 13 }} /> MCP Server + AI Skills</span>
            <h1 className="mcp-h1">App Store intelligence in your IDE</h1>
            <p className="mcp-lede">
              Connect appkittie to Cursor, Claude Code, or any MCP-compatible agent. Discover apps,
              research keywords, read reviews, and analyze competitors — without leaving your editor.
            </p>
            <CopyCommand cmd={INSTALL_CMD} />
            <div className="mcp-helper"><IconInfo style={{ width: 13, height: 13 }} /> Click to copy — paste into your terminal to connect Claude Code</div>
            <div className="mcp-actions">
              <Link className="btn btn-accent" to="/settings/api-keys"><IconKey /> Get API Key</Link>
              <a className="btn" href="https://github.com/appkittie/aso-mcp-skills" target="_blank" rel="noreferrer">
                <IconExternal /> View on GitHub
              </a>
            </div>
            <div className="mcp-stat-row" aria-label="MCP stats">
              {["6 tools", "9 skills", "30+ filters", "Works with Cursor, Claude, Windsurf"].map((stat) => (
                <span className="mcp-stat" key={stat}>{stat}</span>
              ))}
            </div>
          </section>

          {/* quick setup */}
          <section className="mcp-section">
            <div className="mcp-section-head">
              <h2 className="mcp-h2">Quick Setup</h2>
              <p className="mcp-section-sub">Connect in under a minute</p>
            </div>
            <div className="mcp-setup">
              {SETUP.map((s, i) => (
                <div className="mcp-step" key={s.t}>
                  <span className="mcp-step-n">STEP {String(i + 1).padStart(2, "0")}</span>
                  <div className="mcp-step-t">{s.t}</div>
                  <div className="mcp-step-d">{s.d}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="mcp-section">
            <div className="mcp-section-head">
              <h2 className="mcp-h2">MCP Configuration</h2>
            </div>
            <div className="mcp-config">
              <pre><code>{MCP_CONFIG}</code></pre>
            </div>
          </section>

          {/* tools */}
          <section className="mcp-section">
            <div className="mcp-section-head">
              <h2 className="mcp-h2">MCP Tools</h2>
              <p className="mcp-section-kicker">Real-time App Store data for your AI</p>
              <p className="mcp-section-sub">
                Six tools that give your AI agent access to the same intelligence you see in the appkittie dashboard.
              </p>
            </div>
            <div className="mcp-tool-grid">
              {TOOLS.map((t) => (
                <div className="mcp-tool" key={t.name}>
                  <div className="mcp-tool-head">
                    <code className="mcp-tool-name">{t.name}</code>
                    <span className="mcp-credit">{t.credits}</span>
                  </div>
                  <p className="mcp-tool-desc">{t.desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* skills */}
          <section className="mcp-section">
            <div className="mcp-section-head">
              <h2 className="mcp-h2">AI Skills</h2>
              <p className="mcp-section-kicker">Expert-level analysis, on demand</p>
              <p className="mcp-section-sub">
                Skills teach your AI agent battle-tested ASO and competitive analysis frameworks. Add them to Cursor,
                Claude Code, or any agent that supports the standard.
              </p>
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

          <section className="mcp-section">
            <div className="mcp-section-head">
              <h2 className="mcp-h2">Install Skills</h2>
            </div>
            <div className="mcp-install-grid">
              {INSTALLS.map((item) => (
                <div className="mcp-install" key={item.label}>
                  <div className="mcp-install-label"><IconTerminal /> {item.label}</div>
                  <code>{item.text}</code>
                </div>
              ))}
            </div>
          </section>

          <section className="mcp-section">
            <div className="mcp-section-head">
              <h2 className="mcp-h2">Try It</h2>
              <p className="mcp-section-sub">Just ask your agent</p>
            </div>
            <div className="mcp-prompt-grid">
              {PROMPTS.map((prompt) => (
                <div className="mcp-prompt-card" key={prompt}>{prompt}</div>
              ))}
            </div>
          </section>

          <section className="mcp-section">
            <div className="mcp-section-head">
              <h2 className="mcp-h2">Pricing</h2>
              <p className="mcp-section-kicker">Simple credit-based pricing</p>
              <p className="mcp-section-sub">Your appkittie plan includes API credits. Use them for both the dashboard and MCP.</p>
            </div>
            <div className="mcp-price-table">
              <div className="mcp-price-row mcp-price-head">
                <span>Tool</span><span>What it does</span><span>Cost</span>
              </div>
              {PRICING.map((row) => (
                <div className="mcp-price-row" key={row.tool}>
                  <code>{row.tool}</code>
                  <span>{row.what}</span>
                  <strong>{row.cost}</strong>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
