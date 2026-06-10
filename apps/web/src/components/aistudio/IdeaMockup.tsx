import type { AppIdea } from "../../lib/api/ideas";

/**
 * Deterministic phone-frame mockup for a Hot idea — pure CSS, seeded by the
 * idea's own fields (ADR 0005: reuse the deterministic engine approach, no
 * image model). Every idea gets a visually distinct but stable little UI.
 */

const PALETTES = [
  { accent: "#7c6cf0", soft: "#7c6cf022" },
  { accent: "#0ea5e9", soft: "#0ea5e922" },
  { accent: "#f59e0b", soft: "#f59e0b22" },
  { accent: "#10b981", soft: "#10b98122" },
  { accent: "#ef4444", soft: "#ef444422" },
  { accent: "#c6f24d", soft: "#c6f24d22" },
  { accent: "#ec4899", soft: "#ec489922" },
];

function seedOf(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function IdeaMockup({ idea, height = 210 }: { idea: AppIdea; height?: number }) {
  const seed = seedOf(idea.id || idea.title);
  const palette = PALETTES[seed % PALETTES.length] ?? PALETTES[0]!;
  const features = idea.blueprintDoc?.mvpFeatures?.slice(0, 3) ?? [];
  const layout = seed % 3; // 0 = list, 1 = cards, 2 = hero-stat

  return (
    <div className="idea-mockup" style={{ height }} aria-hidden>
      <div className="idea-phone">
        <div className="idea-phone-notch" />
        <div className="idea-screen">
          <div className="idea-ui-header">
            <span className="idea-ui-appdot" style={{ background: palette.accent }} />
            <span className="idea-ui-title">{idea.title.slice(0, 22)}</span>
          </div>

          {layout === 2 && (
            <div className="idea-ui-hero" style={{ background: palette.soft }}>
              <span className="idea-ui-hero-num" style={{ color: palette.accent }}>
                {((seed % 89) + 11).toString()}
              </span>
              <span className="idea-ui-hero-sub">{idea.ideaCategory}</span>
            </div>
          )}

          <div className={layout === 1 ? "idea-ui-cards" : "idea-ui-list"}>
            {(features.length ? features : [idea.ideaCategory, idea.sourceCategory, "Get started"]).map(
              (f, i) => (
                <div
                  key={i}
                  className={layout === 1 ? "idea-ui-card" : "idea-ui-row"}
                  style={layout === 1 ? { background: palette.soft } : undefined}
                >
                  {layout !== 1 && (
                    <span className="idea-ui-rowdot" style={{ background: palette.accent }} />
                  )}
                  <span className="idea-ui-rowtext">{String(f).slice(0, 34)}</span>
                </div>
              ),
            )}
          </div>

          <div className="idea-ui-fab" style={{ background: palette.accent }} />
        </div>
      </div>
    </div>
  );
}
