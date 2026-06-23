import { useNavigate } from "react-router-dom";
import type { RoadmapNode, RoadmapTemplate } from "@kittie/types";

const KIND_LABEL = { you: "You", agent: "Agent", kittie: "Kittie" } as const;
const STATE_LABEL = {
  todo: "To do",
  "needs-you": "Needs you",
  "in-progress": "In progress",
  done: "Done",
} as const;

/** Where a Kittie node points (real existing surfaces). */
const KITTIE_ROUTE = {
  teardown: { to: "/dashboard/explore", label: "Open competitor research" },
  aso: { to: "/dashboard/aso/keywords", label: "Open Keyword Explorer" },
  growth: { to: "/dashboard/trending", label: "Open growth tracking" },
} as const;

/**
 * The card's side panel: its specifics + where it sits in the journey (what it
 * needs, what it unlocks) + the contextual action for its kind. Slice 1 is
 * read-only for You nodes (answering / marking done lands with persistence in
 * the next slice); Agent/Kittie nodes navigate to their real surface.
 */
export function RoadmapDrawer({
  node,
  template,
  onClose,
}: {
  node: RoadmapNode | null;
  template: RoadmapTemplate;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const byKey = new Map(template.nodes.map((n) => [n.key, n]));
  const stageLabel = (id: string) => template.stages.find((s) => s.id === id)?.label ?? id;

  const needs = node ? node.dependsOn.map((k) => byKey.get(k)).filter(Boolean) : [];
  const unlocks = node
    ? template.nodes.filter((n) => n.dependsOn.includes(node.key))
    : [];

  return (
    <>
      <div className={`rm-scrim${node ? " open" : ""}`} onClick={onClose} />
      <aside className={`rm-drawer${node ? " open" : ""}`}>
        {node && (
          <>
            <div className="rm-drawer-head">
              <div className="rm-drawer-head-meta">
                <span className={`rm-kind rm-kind-tag-${node.kind}`}>{KIND_LABEL[node.kind]}</span>
                <span className="rm-drawer-stage">{stageLabel(node.stage)} stage</span>
              </div>
              <button className="rm-drawer-close" onClick={onClose} aria-label="Close">
                ✕
              </button>
            </div>

            <div className="rm-drawer-body">
              <h2 className="rm-drawer-title">{node.title}</h2>
              {node.subtitle && <p className="rm-drawer-sub">{node.subtitle}</p>}

              <div className="rm-drawer-row">
                <span className="rm-drawer-key">State</span>
                <span className={`rm-state rm-state-${node.state}`}>
                  <span className="rm-dot" />
                  {STATE_LABEL[node.state]}
                </span>
              </div>

              {needs.length > 0 && (
                <div className="rm-drawer-block">
                  <span className="rm-drawer-key">Needs first</span>
                  <ul className="rm-drawer-list">
                    {needs.map((n) => (
                      <li key={n!.key}>
                        <span className="rm-drawer-pip" />
                        {n!.title}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {unlocks.length > 0 && (
                <div className="rm-drawer-block">
                  <span className="rm-drawer-key">Unlocks</span>
                  <ul className="rm-drawer-list">
                    {unlocks.map((n) => (
                      <li key={n.key}>
                        <span className="rm-drawer-pip" />
                        {n.title}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="rm-drawer-action">
                {node.kind === "agent" && (
                  <button className="rm-btn rm-btn-primary" onClick={() => navigate("/dashboard/builder")}>
                    Open Builder →
                  </button>
                )}
                {node.kind === "kittie" && node.target && (
                  <button
                    className="rm-btn rm-btn-primary"
                    onClick={() => navigate(KITTIE_ROUTE[node.target!].to)}
                  >
                    {KITTIE_ROUTE[node.target].label} →
                  </button>
                )}
                {node.kind === "you" && (
                  <p className="rm-drawer-hint">
                    {node.mode === "manual"
                      ? "You'll be able to check this off here."
                      : "You'll be able to capture your answer here."}
                  </p>
                )}
              </div>
            </div>
          </>
        )}
      </aside>
    </>
  );
}
