import { useMemo, useState } from "react";
import "../styles/aistudio.css";
import type { AppListItem } from "@kittie/types";
import {
  aiService,
  AI_INTEGRATION_POINTS,
  designDefaults,
  type ScreenshotGeneration,
  type ScreenshotStyle,
  type UploadedImage,
} from "../lib/aiService";
import { BACKGROUNDS, FLOWS, FONTS, type DesignSpec, type FontId } from "../components/aistudio/screenshot-engine";
import { StudioHeader } from "../components/aistudio/StudioHeader";
import { AppPicker } from "../components/aistudio/AppPicker";
import { AppDetailsForm, EMPTY_DETAILS, splitTerms, type AppDetails } from "../components/aistudio/AppDetailsForm";
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
const SHOT_POINT = AI_INTEGRATION_POINTS.find((p) => p.id === "screenshot-art-direction")!;

export function ScreenshotGeneratorPage() {
  const [newMode, setNewMode] = useState(false);
  const [selectedApp, setSelectedApp] = useState<AppListItem | null>(null);
  const [details, setDetails] = useState<AppDetails>(EMPTY_DETAILS);
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [style, setStyle] = useState<ScreenshotStyle>("bold");
  const [count, setCount] = useState(4);
  const [design, setDesign] = useState<DesignSpec>(() => designDefaults("bold"));

  // Picking a style snaps the design controls to that preset's coherent defaults.
  function chooseStyle(s: ScreenshotStyle) {
    setStyle(s);
    setDesign(designDefaults(s));
  }
  function patchDesign(p: Partial<DesignSpec>) {
    setDesign((d) => ({ ...d, ...p }));
  }
  function patchDetails(p: Partial<AppDetails>) {
    setDetails((d) => ({ ...d, ...p }));
  }

  const [history, setHistory] = useState<ScreenshotGeneration[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [view, setView] = useState<"build" | "result">("build");
  const [generating, setGenerating] = useState(false);

  const started = newMode || !!selectedApp;
  const targetChosen = started && details.name.trim().length > 0;
  const step = !targetChosen ? 0 : images.length === 0 ? 1 : 2;
  const ready = targetChosen && images.length > 0 && !generating;
  const activeGen = useMemo(() => history.find((g) => g.id === activeId) ?? null, [history, activeId]);

  function resetBuild() {
    setView("build");
    setNewMode(false);
    setSelectedApp(null);
    setDetails(EMPTY_DETAILS);
    setImages([]);
    setActiveId(null);
  }

  function pickApp(app: AppListItem) {
    setSelectedApp(app);
    setNewMode(false);
    setView("build");
    // Prefill what the tracked app gives us; the rest stays editable.
    setDetails({
      ...EMPTY_DETAILS,
      name: app.title,
      developer: app.developer ?? "",
      category: app.category ?? "",
    });
  }

  function pickNew() {
    setNewMode(true);
    setSelectedApp(null);
    setDetails(EMPTY_DETAILS);
    setView("build");
  }

  async function generate() {
    if (!ready) return;
    setGenerating(true);
    try {
      const gen = await aiService.generateScreenshots({
        appId: selectedApp?.id ?? null,
        appName: details.name.trim(),
        subtitle: details.subtitle.trim() || undefined,
        developer: details.developer.trim() || undefined,
        category: details.category.trim() || undefined,
        description: details.description.trim() || undefined,
        prompt: details.prompt.trim() || undefined,
        targetAudience: details.targetAudience.trim() || undefined,
        appStoreKeywords: splitTerms(details.appStoreKeywords),
        brandKeywords: splitTerms(details.brandKeywords),
        sourceImages: images,
        style,
        count,
        accent: design.accent,
        brand: design.brand,
        background: design.background,
        font: design.font,
        flow: design.flow,
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
        subtitle="Upload your screenshots and let AI create optimized App Store visuals"
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
            <div className="studio-rail-intro">
              <div className="studio-rail-title">Select App</div>
              <div className="studio-rail-subcopy">Choose a tracked app or describe a new one</div>
            </div>
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
              <span>{history.length}</span>
            </div>
            {history.length === 0 ? (
              <StudioEmptyState bare title="No generations yet" sub="Select an app and upload screenshots to get started" />
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
                  <span>Live, store-spec frames. Use “Download PNGs (zip)” for an exact App Store bundle (6.9″ → 6.1″).</span>
                </div>
              </>
            ) : (
              <>
                {!started ? (
                  <StudioEmptyState
                    title="Generate App Store Screenshots"
                    sub="Select one of your tracked apps from the left, or describe a new / unreleased app to get started."
                    action={
                      <div className="studio-empty-steps">
                        <StepFlow steps={STEPS} current={-1} />
                      </div>
                    }
                  />
                ) : (
                  <>
                    <StepFlow steps={STEPS} current={step} />

                    {/* Step 1 — app details */}
                    <div className="studio-block">
                      <div className="studio-block-head">
                        <div className="studio-block-title">1 · App details</div>
                        <div className="studio-block-hint">Pick a tracked app on the left, or describe a new one</div>
                      </div>
                      {selectedApp && (
                        <div className="studio-appitem active" style={{ cursor: "default", marginBottom: 14 }}>
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
                      )}
                      <AppDetailsForm details={details} onChange={patchDetails} />
                    </div>

                {/* Step 2 — upload */}
                <div className="studio-block" style={{ opacity: targetChosen ? 1 : 0.5, pointerEvents: targetChosen ? "auto" : "none" }}>
                  <div className="studio-block-head">
                    <div className="studio-block-title">2 · Upload screenshots</div>
                    <div className="studio-block-hint">Your current store frames — used as source layout</div>
                  </div>
                  <ScreenshotUploader images={images} onChange={setImages} />
                </div>

                {/* Step 3 — direction + generate */}
                <div className="studio-block" style={{ opacity: images.length ? 1 : 0.5, pointerEvents: images.length ? "auto" : "none" }}>
                  <div className="studio-block-head">
                    <div className="studio-block-title">3 · Generate</div>
                    <div className="studio-block-hint">Direction & frame count</div>
                  </div>
                  <div className="studio-field">
                    <label>Style</label>
                    <div className="studio-chips">
                      {STYLES.map((s) => (
                        <button key={s.value} className={`studio-chip${style === s.value ? " on" : ""}`} onClick={() => chooseStyle(s.value)}>
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="studio-field">
                    <label>Background</label>
                    <div className="studio-chips">
                      {BACKGROUNDS.map((b) => (
                        <button key={b.value} className={`studio-chip${design.background === b.value ? " on" : ""}`} onClick={() => patchDesign({ background: b.value })}>
                          {b.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="studio-field">
                    <label>Flow</label>
                    <div className="studio-chips">
                      {FLOWS.map((f) => (
                        <button key={f.value} className={`studio-chip${design.flow === f.value ? " on" : ""}`} onClick={() => patchDesign({ flow: f.value })}>
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
                    <div className="studio-field" style={{ flex: "1 1 180px", minWidth: 150 }}>
                      <label>Font</label>
                      <div className="select">
                        <select value={design.font} onChange={(e) => patchDesign({ font: e.target.value as FontId })}>
                          {Object.entries(FONTS).map(([id, f]) => (
                            <option key={id} value={id}>{f.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="studio-field">
                      <label>Accent</label>
                      <input
                        type="color"
                        value={design.accent}
                        onChange={(e) => patchDesign({ accent: e.target.value })}
                        aria-label="Accent colour"
                        style={{ width: 46, height: 36, border: "1px solid var(--border)", borderRadius: 9, background: "transparent", cursor: "pointer", padding: 3 }}
                      />
                    </div>
                    <div className="studio-field">
                      <label>Brand</label>
                      <input
                        type="color"
                        value={design.brand}
                        onChange={(e) => patchDesign({ brand: e.target.value })}
                        aria-label="Brand colour"
                        style={{ width: 46, height: 36, border: "1px solid var(--border)", borderRadius: 9, background: "transparent", cursor: "pointer", padding: 3 }}
                      />
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

                    <div className="notice">
                      <IconInfo />
                      <span>
                        <strong>Render &amp; export are live</strong> — real device frames, exact App Store PNG sizes. {SHOT_POINT.needs}
                      </span>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
