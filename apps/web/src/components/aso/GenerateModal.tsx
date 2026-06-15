// Lane B — staged progress modal shown while the generator runs (mirrors AppKittie's pipeline).
import { IconKey } from "./icons";

export interface GenState {
  seed: string;
  stage: number; // 0..3 index into STAGES
  done: number; // scored count (stage 2)
  total: number; // related count (stage 2)
}

const STAGES = ["Analyzing keyword", "Finding similar keywords", "Scoring ideas", "Saving results"];

export function GenerateModal({ seed, stage, done, total }: GenState) {
  const overall =
    stage >= STAGES.length - 1
      ? 100
      : Math.round((stage / STAGES.length) * 100 + (stage === 2 && total > 0 ? (done / total) * (100 / STAGES.length) : 0));

  return (
    <div className="gen-overlay" role="dialog" aria-modal="true" aria-label="Generating keyword ideas">
      <div className="gen-modal">
        <div className="gen-head">
          <div className="gen-mark"><IconKey style={{ width: 16, height: 16 }} /></div>
          <div>
            <div className="gen-title">Exploring “{seed}”</div>
            <div className="gen-sub">Pulling live store data — this takes a few seconds</div>
          </div>
        </div>

        <ul className="gen-stages">
          {STAGES.map((label, i) => {
            const state = i < stage ? "done" : i === stage ? "active" : "idle";
            return (
              <li key={label} className={`gen-stage ${state}`}>
                <span className="gen-stage-dot">
                  {state === "done" ? "✓" : state === "active" ? <span className="aso-spin" /> : i + 1}
                </span>
                <span className="gen-stage-label">{label}</span>
                {i === 2 && state !== "idle" && total > 0 && (
                  <span className="gen-stage-count">{Math.min(done, total)}/{total}</span>
                )}
              </li>
            );
          })}
        </ul>

        <div className="gen-bar">
          <span className="gen-bar-fill" style={{ width: `${overall}%` }} />
        </div>
      </div>
    </div>
  );
}
