import { useMemo, useState } from "react";
import "../styles/aistudio.css";
import type { AppListItem } from "@kittie/types";
import {
  aiService,
  AI_INTEGRATION_POINTS,
  type ScreenshotGeneration,
  type ScreenshotStyle,
  type UploadedImage,
} from "../lib/aiService";
import { StudioHeader } from "../components/aistudio/StudioHeader";
import { AppPicker } from "../components/aistudio/AppPicker";
import { ScreenshotUploader } from "../components/aistudio/ScreenshotUploader";
import { StepFlow } from "../components/aistudio/StepFlow";
import { GenerationResult } from "../components/aistudio/GenerationResult";
import { HistoryList } from "../components/aistudio/HistoryList";
import { StudioEmptyState } from "../components/aistudio/StudioEmptyState";
import { IconImage, IconInfo } from "../icons";
import { IconWand, IconPlus } from "../components/aistudio/icons";

const STEPS = ["Select app", "Upload screenshots", "Generate"];
const STYLES: { value: ScreenshotStyle; label: string }[] = [
  { value: "bold", label: "Bold" },
  { value: "minimal", label: "Minimal" },
  { value: "playful", label: "Playful" },
  { value: "premium", label: "Premium" },
];
const FRAME_COUNTS = [3, 4, 5, 6];
const SHOT_POINT = AI_INTEGRATION_POINTS.find((p) => p.id === "screenshot-generation")!;

export function ScreenshotGeneratorPage() {
  const [newMode, setNewMode] = useState(false);
  const [selectedApp, setSelectedApp] = useState<AppListItem | null>(null);
  const [newName, setNewName] = useState("");
  const [newBrief, setNewBrief] = useState("");
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [style, setStyle] = useState<ScreenshotStyle>("bold");
  const [count, setCount] = useState(4);

  const [history, setHistory] = useState<ScreenshotGeneration[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [view, setView] = useState<"build" | "result">("build");
  const [generating, setGenerating] = useState(false);

  const targetChosen = newMode ? newName.trim().length > 0 : !!selectedApp;
  const step = !targetChosen ? 0 : images.length === 0 ? 1 : 2;
  const ready = targetChosen && images.length > 0 && !generating;
  const activeGen = useMemo(() => history.find((g) => g.id === activeId) ?? null, [history, activeId]);

  function resetBuild() {
    setView("build");
    setNewMode(false);
    setSelectedApp(null);
    setNewName("");
    setNewBrief("");
    setImages([]);
    setActiveId(null);
  }

  function pickApp(app: AppListItem) {
    setSelectedApp(app);
    setNewMode(false);
    setView("build");
  }

  function pickNew() {
    setNewMode(true);
    setSelectedApp(null);
    setView("build");
  }

  async function generate() {
    if (!ready) return;
    setGenerating(true);
    try {
      const gen = await aiService.generateScreenshots({
        appId: newMode ? null : selectedApp?.id ?? null,
        appName: newMode ? newName.trim() : selectedApp?.title ?? "Untitled app",
        brief: newMode ? newBrief.trim() || undefined : undefined,
        sourceImages: images,
        style,
        count,
      });
      setHistory((h) => [gen, ...h]);
      setActiveId(gen.id);
      setView("result");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <main className="main">
      <StudioHeader
        icon={<IconImage style={{ width: 18, height: 18 }} />}
        title="AI Screenshot Generator"
        subtitle="Generate optimized App-Store visuals from your screenshots"
        actions={
          <button className="btn btn-accent" onClick={resetBuild}>
            <IconPlus /> Add generation
          </button>
        }
      />

      <div className="studio-layout">
        {/* ---------------- left rail ---------------- */}
        <aside className="studio-rail">
          <div className="studio-rail-section">
            <div className="studio-rail-label">Your apps</div>
            <AppPicker
              selectedId={selectedApp?.id ?? null}
              newMode={newMode}
              onSelectApp={pickApp}
              onNewMode={pickNew}
            />
          </div>
          <div className="studio-rail-section" style={{ marginTop: "auto" }}>
            <div className="studio-rail-label">
              Previous Generations
              {history.length > 0 && <span>{history.length}</span>}
            </div>
            {history.length === 0 ? (
              <StudioEmptyState bare title="No generations yet" sub="Your generated sets appear here." />
            ) : (
              <HistoryList items={history} activeId={activeId} onSelect={(id) => { setActiveId(id); setView("result"); }} />
            )}
          </div>
        </aside>

        {/* ---------------- right detail ---------------- */}
        <section className="studio-detail">
          <div className="studio-detail-inner">
            {view === "result" && activeGen ? (
              <>
                <div className="studio-block-head">
                  <div className="studio-block-title">Generated set</div>
                  <button className="btn" onClick={resetBuild}>
                    <IconPlus /> New generation
                  </button>
                </div>
                <GenerationResult generation={activeGen} />
                <div className="notice">
                  <IconInfo />
                  <span>Mock preview frames. Wire real image generation to ship store-ready PNGs — see the notice below the builder.</span>
                </div>
              </>
            ) : (
              <>
                <StepFlow steps={STEPS} current={step} />

                {/* Step 1 — target */}
                <div className="studio-block">
                  <div className="studio-block-head">
                    <div className="studio-block-title">1 · Select app</div>
                    <div className="studio-block-hint">Pick a tracked app on the left, or describe a new one</div>
                  </div>
                  {newMode ? (
                    <>
                      <div className="studio-field">
                        <label htmlFor="new-name">App name</label>
                        <input
                          id="new-name"
                          className="studio-input"
                          placeholder="e.g. Streak — Sober Companion"
                          value={newName}
                          onChange={(e) => setNewName(e.target.value)}
                        />
                      </div>
                      <div className="studio-field">
                        <label htmlFor="new-brief">What does it do? (optional)</label>
                        <textarea
                          id="new-brief"
                          className="studio-textarea"
                          placeholder="One or two lines on the app, audience, and the feeling the screenshots should sell."
                          value={newBrief}
                          onChange={(e) => setNewBrief(e.target.value)}
                        />
                      </div>
                    </>
                  ) : selectedApp ? (
                    <div className="studio-appitem active" style={{ cursor: "default" }}>
                      {selectedApp.iconUrl ? (
                        <img className="app-icon" src={selectedApp.iconUrl} alt="" />
                      ) : (
                        <div className="app-icon placeholder">{selectedApp.title.charAt(0)}</div>
                      )}
                      <div style={{ minWidth: 0 }}>
                        <div className="name">{selectedApp.title}</div>
                        <div className="sub">{selectedApp.developer}{selectedApp.category ? ` · ${selectedApp.category}` : ""}</div>
                      </div>
                    </div>
                  ) : (
                    <StudioEmptyState
                      title="No app selected"
                      sub="Choose a tracked app from the left rail, or click “Describe a new / unreleased app”."
                    />
                  )}
                </div>

                {/* Step 2 — upload */}
                <div className="studio-block" style={{ opacity: targetChosen ? 1 : 0.5, pointerEvents: targetChosen ? "auto" : "none" }}>
                  <div className="studio-block-head">
                    <div className="studio-block-title">2 · Upload screenshots</div>
                    <div className="studio-block-hint">Your current store frames — used as source layout</div>
                  </div>
                  <ScreenshotUploader images={images} onChange={setImages} />
                </div>

                {/* Step 3 — style + generate */}
                <div className="studio-block" style={{ opacity: images.length ? 1 : 0.5, pointerEvents: images.length ? "auto" : "none" }}>
                  <div className="studio-block-head">
                    <div className="studio-block-title">3 · Generate</div>
                    <div className="studio-block-hint">Direction & frame count</div>
                  </div>
                  <div className="studio-field">
                    <label>Style</label>
                    <div className="studio-chips">
                      {STYLES.map((s) => (
                        <button key={s.value} className={`studio-chip${style === s.value ? " on" : ""}`} onClick={() => setStyle(s.value)}>
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="studio-field">
                    <label>Frames</label>
                    <div className="studio-chips">
                      {FRAME_COUNTS.map((c) => (
                        <button key={c} className={`studio-chip${count === c ? " on" : ""}`} onClick={() => setCount(c)}>
                          {c}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button className="btn btn-accent" disabled={!ready} onClick={generate} style={{ height: 38 }}>
                    <IconWand /> {generating ? "Generating…" : `Generate ${count} screenshots`}
                  </button>
                </div>

                {generating && (
                  <div className="studio-generating">
                    <div className="studio-skel-shots">
                      {Array.from({ length: count }).map((_, i) => (
                        <div className="skel studio-skel-shot" key={i} />
                      ))}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 12.5 }}>
                      <span className="studio-spinner" /> Composing {count} optimized frames…
                    </div>
                  </div>
                )}

                <div className="notice warn">
                  <IconInfo />
                  <span>
                    <strong>Mock mode.</strong> {SHOT_POINT.needs} Swap <code>aiService</code> to a live impl to ship real visuals.
                  </span>
                </div>
              </>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
