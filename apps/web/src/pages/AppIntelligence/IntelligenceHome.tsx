import { Link } from "react-router-dom";
import "../../styles/intelligence.css";
import { IconBulb, IconSearch, IconGrid, IconExternal } from "../../icons";
import { readRecents } from "../../lib/intelligence/recents";

const ENTRIES = [
  {
    to: "/intelligence/validate",
    icon: <IconBulb />,
    title: "Validate an idea",
    desc: "Turn an app idea into a verdict — score, angle, competitors, MVP and risks, with the evidence behind it.",
  },
  {
    to: "/intelligence/similar",
    icon: <IconSearch />,
    title: "Find similar apps",
    desc: "Describe a product and get its competitor clusters — direct, adjacent and analogue — ranked by why they match.",
  },
  {
    to: "/dashboard/explore",
    icon: <IconGrid />,
    title: "Teardown an app",
    desc: "Open any app and switch to the Teardown tab for its thesis, core loop, monetisation and clone insights.",
  },
];

/** Entry hub for the App-Intelligence layer. Deliberately a launcher, not a dashboard. */
export function IntelligenceHome() {
  const recents = readRecents();
  return (
    <main className="main">
      <div className="intel">
        <div className="intel-crumb">App Intelligence</div>
        <h1 className="intel-title">Market awareness for what you're building</h1>
        <p className="intel-sub">
          Validate an idea, find its competitors, or tear down a live app — every answer is a decision backed by
          evidence, with its confidence and coverage shown, never hidden.
        </p>

        <div className="intel-hub-grid">
          {ENTRIES.map((e) => (
            <Link className="intel-card" to={e.to} key={e.to}>
              <span className="intel-card-ico">{e.icon}</span>
              <span className="intel-card-title">{e.title}</span>
              <span className="intel-card-desc">{e.desc}</span>
            </Link>
          ))}
        </div>

        <div className="intel-recent">
          <h3>Recent reports</h3>
          {recents.length === 0 ? (
            <div className="intel-empty">
              Reports you run this session show up here. App Intelligence is stateless in P0 — nothing is stored
              server-side, so this list clears with the tab.
            </div>
          ) : (
            <ul className="intel-list">
              {recents.map((r) => (
                <li key={r.href}>
                  <Link className="sim-teardown-link" to={r.href}>
                    {r.kind === "validate" ? "Validate" : "Similar"} · {r.label}
                    <IconExternal />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </main>
  );
}
