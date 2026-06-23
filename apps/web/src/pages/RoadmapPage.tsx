import { useEffect, useState } from "react";
import type { RoadmapTemplate } from "@kittie/types";
import { PageShell } from "../components/PageShell";
import { RoadmapCanvas } from "../components/roadmap/RoadmapCanvas";
import { getRoadmapTemplate } from "../lib/api/roadmap";
import { IconRising, IconInfo } from "../icons";
import type { Theme } from "../lib/theme";

/**
 * Roadmap — the founder-journey canvas. Slice 1: render the fixed curated
 * 7-stage template for a venture (no persistence / live state yet).
 */
export function RoadmapPage({ theme, onToggleTheme }: { theme: Theme; onToggleTheme: () => void }) {
  const [template, setTemplate] = useState<RoadmapTemplate | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    getRoadmapTemplate(ac.signal)
      .then((t) => !ac.signal.aborted && setTemplate(t))
      .catch((e) => !ac.signal.aborted && setError(e instanceof Error ? e.message : "Failed to load"));
    return () => ac.abort();
  }, []);

  return (
    <PageShell
      icon={<IconRising />}
      title="Roadmap"
      sub="Idea to launch — your founder journey, one board"
      theme={theme}
      onToggleTheme={onToggleTheme}
      bodyClass="flush"
    >
      {error ? (
        <div className="center-state">
          <IconInfo />
          <div className="title">Couldn’t load the roadmap</div>
          <div className="sub">{error}</div>
        </div>
      ) : !template ? (
        <div className="center-state">
          <div className="sub">Loading…</div>
        </div>
      ) : (
        <RoadmapCanvas template={template} />
      )}
    </PageShell>
  );
}
