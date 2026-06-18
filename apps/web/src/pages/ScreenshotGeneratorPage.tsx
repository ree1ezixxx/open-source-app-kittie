import { useMemo, useState } from "react";
import "../styles/aistudio.css";
import type { TrackedAppSummary } from "../lib/translationService";
import {
  aiService,
  AI_INTEGRATION_POINTS,
  designDefaults,
  type ScreenshotGeneration,
  type ScreenshotStyle,
  type UploadedImage,
} from "../lib/aiService";
import { BACKGROUNDS, FONTS, type DesignSpec, type FontId, type FlowStrategy } from "../components/aistudio/screenshot-engine";
import { StudioHeader } from "../components/aistudio/StudioHeader";
import { AppPicker } from "../components/aistudio/AppPicker";
import { AppDetailsForm, EMPTY_DETAILS, splitTerms, type AppDetails } from "../components/aistudio/AppDetailsForm";
import { AppFinder } from "../components/aistudio/AppFinder";
import { importStoreScreenshots, importStoreIcon, type StoreApp } from "../lib/api/appFinder";
import { ScreenshotUploader } from "../components/aistudio/ScreenshotUploader";
import { StepFlow } from "../components/aistudio/StepFlow";
import { GenerationResult } from "../components/aistudio/GenerationResult";
import { HistoryList } from "../components/aistudio/HistoryList";
import { StudioEmptyState } from "../components/aistudio/StudioEmptyState";
import { IconImage, IconInfo } from "../icons";
import { IconWand, IconPlus } from "../components/aistudio/icons";

const STEPS = ["App details", "Upload screenshots", "Generate"];
// Mirrors appkittie's Design Style list (same labels, same order).
const STYLES: { value: ScreenshotStyle; label: string }[] = [
  { value: "modern", label: "Modern" },
  { value: "editorial", label: "Editorial" },
  { value: "ios-native", label: "iOS Native" },
  { value: "premium", label: "Premium" },
  { value: "feature-focused", label: "Feature Focused" },
  { value: "minimal", label: "Minimal" },
  { value: "playful", label: "Playful" },
  { value: "professional", label: "Professional" },
  { value: "bold", label: "Bold" },
  { value: "elegant", label: "Elegant" },
];
const FRAME_COUNTS = [3, 4, 5, 6, 7, 8, 9, 10];
const colorInputStyle = {
  width: 46,
  height: 36,
  border: "1px solid var(--border)",
  borderRadius: 9,
  background: "transparent",
  cursor: "pointer",
  padding: 3,
} as const;

// Screenshot Flow templates (mirrors appkittie's labels + descriptions). Each
// `frames` entry is a mini-layout hint for the inline preview.
type FrameKind = "hero" | "split" | "device" | "none";
const FLOW_META: { value: FlowStrategy; label: string; desc: string; frames: FrameKind[] }[] = [
  { value: "default", label: "Default", desc: "Uses the story-driven screenshot planner.", frames: ["hero", "device", "device"] },
  {
    value: "hero-split",
    label: "Character Hero Split",
    desc: "Starts with a no-phone hero poster, then alternates split layouts.",
    frames: ["none", "split", "split"],
  },
  {
    value: "alternating-split",
    label: "Alternating Split",
    desc: "Skips the standalone hero and alternates split layouts from frame 1.",
    frames: ["split", "device", "split"],
  },
];
const SHOT_POINT = AI_INTEGRATION_POINTS.find((p) => p.id === "screenshot-art-direction")!;

export function ScreenshotGeneratorPage() {
  const [newMode, setNewMode] = useState(false);
  const [selectedApp, setSelectedApp] = useState<TrackedAppSummary | null>(null);
  const [details, setDetails] = useState<AppDetails>(EMPTY_DETAILS);
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [style, setStyle] = useState<ScreenshotStyle>("modern");
  const [count, setCount] = useState(6);
  const [design, setDesign] = useState<DesignSpec>(() => designDefaults("modern"));

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

  function pickApp(app: TrackedAppSummary) {
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

  const [importing, setImporting] = useState(false);

  // Search/Paste-URL pulled a real listing — autofill the brief and import its
  // store screenshots as source frames (mirrors truth's "Find app details").
  async function onFindApp(app: StoreApp) {
    setNewMode(true);
    setSelectedApp(null);
    setView("build");
    setDetails((d) => ({
      ...d,
      name: app.title,
      developer: app.developer || d.developer,
      category: app.category ?? d.category,
      description: app.description ?? d.description,
    }));
    setImporting(true);
    try {
      const [frames, icon] = await Promise.all([
        app.screenshotUrls.length > 0 ? importStoreScreenshots(app, 10) : Promise.resolve([]),
        importStoreIcon(app),
      ]);
      if (frames.length) setImages(frames);
      if (icon) setDetails((d) => ({ ...d, iconUrl: icon }));
    } finally {
      setImporting(false);
    }
  }

  async function generate() {
    if (!ready) return;
    setGenerating(true);
    try {
      const gen = await aiService.generateScreenshots({
        appId: selectedApp?.id ?? null,
        appName: details.name.trim(),
        appIcon: details.iconUrl || undefined,
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
        tint: design.tint,
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
            <div className="studio-rail-label">Your tracked apps</div>
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
                  <span>Live, store-spec frames. Use “Download PNGs (zip)” for an exact App Store bundle (6.9″ → 6.1″).</span>
                </div>
              </>
            ) : (
              <>
                <StepFlow steps={STEPS} current={step} />

                {/* Step 1 — app details */}
                <div className="studio-block">
                  <div className="studio-block-head">
                    <div className="studio-block-title">1 · App details</div>
                    <div className="studio-block-hint">Search the store, paste a URL, or describe a new app</div>
                  </div>
                  <AppFinder onPick={onFindApp} busy={importing} />
                  {importing && (
                    <div className="app-finder-importing">
                      <span className="studio-spinner" /> Importing store screenshots…
                    </div>
                  )}
                  {started ? (
                    <>
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
                    </>
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

                {/* Step 3 — direction + generate */}
                <div className="studio-block" style={{ opacity: images.length ? 1 : 0.5, pointerEvents: images.length ? "auto" : "none" }}>
                  <div className="studio-block-head">
                    <div className="studio-block-title">3 · Generate</div>
                    <div className="studio-block-hint">Direction & frame count</div>
                  </div>
                  <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                    <div className="studio-field" style={{ flex: "1 1 200px", minWidth: 160 }}>
                      <label>Design style</label>
                      <div className="select">
                        <select value={style} onChange={(e) => chooseStyle(e.target.value as ScreenshotStyle)}>
                          {STYLES.map((s) => (
                            <option key={s.value} value={s.value}>{s.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="studio-field" style={{ flex: "1 1 200px", minWidth: 160 }}>
                      <label>Background style</label>
                      <div className="select">
                        <select value={design.background} onChange={(e) => patchDesign({ background: e.target.value as DesignSpec["background"] })}>
                          {BACKGROUNDS.map((b) => (
                            <option key={b.value} value={b.value}>{b.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="studio-field">
                    <label>Screenshot flow</label>
                    <div className="flow-cards">
                      {FLOW_META.map((f) => (
                        <button
                          key={f.value}
                          type="button"
                          className={`flow-card${design.flow === f.value ? " on" : ""}`}
                          onClick={() => patchDesign({ flow: f.value })}
                        >
                          <FlowPreview frames={f.frames} />
                          <div className="flow-card-name">{f.label}</div>
                          <div className="flow-card-desc">{f.desc}</div>
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
                      <label>Primary</label>
                      <input
                        type="color"
                        value={design.accent}
                        onChange={(e) => patchDesign({ accent: e.target.value })}
                        aria-label="Primary colour"
                        style={colorInputStyle}
                      />
                    </div>
                    <div className="studio-field">
                      <label>Secondary</label>
                      <input
                        type="color"
                        value={design.brand}
                        onChange={(e) => patchDesign({ brand: e.target.value })}
                        aria-label="Secondary colour"
                        style={colorInputStyle}
                      />
                    </div>
                    <div className="studio-field">
                      <label>Accent</label>
                      <input
                        type="color"
                        value={design.tint}
                        onChange={(e) => patchDesign({ tint: e.target.value })}
                        aria-label="Accent colour"
                        style={colorInputStyle}
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
          </div>
        </section>
      </div>
    </main>
  );
}

/* ---------------- flow preview (inline mini-layout diagram) ---------------- */

function FlowMini({ kind }: { kind: FrameKind }) {
  // A tiny slide: a text bar and (optionally) a phone shape, positioned to hint
  // the layout — device-bottom/hero (phone low), split (phone offset), no-phone.
  const bar = (w: string, top: string, left = "50%") => (
    <span
      style={{
        position: "absolute",
        top,
        left,
        transform: left === "50%" ? "translateX(-50%)" : undefined,
        width: w,
        height: 3,
        borderRadius: 2,
        background: "var(--text-tertiary)",
        opacity: 0.7,
      }}
    />
  );
  const phone = (style: React.CSSProperties) => (
    <span
      style={{
        position: "absolute",
        borderRadius: 4,
        background: "var(--surface-3, var(--surface))",
        border: "1px solid var(--border-strong)",
        ...style,
      }}
    />
  );
  return (
    <span className="flow-mini">
      {kind === "device" && (
        <>
          {bar("56%", "5px")}
          {phone({ bottom: -6, left: "50%", transform: "translateX(-50%)", width: 18, height: 26 })}
        </>
      )}
      {kind === "hero" && (
        <>
          {bar("60%", "6px")}
          {bar("40%", "12px")}
          {phone({ bottom: -8, left: "50%", transform: "translateX(-50%)", width: 17, height: 22 })}
        </>
      )}
      {kind === "split" && (
        <>
          {bar("44%", "7px", "6px")}
          {bar("30%", "13px", "6px")}
          {phone({ top: 16, right: -7, width: 15, height: 24, transform: "rotate(6deg)" })}
        </>
      )}
      {kind === "none" && (
        <>
          {bar("58%", "10px")}
          {bar("46%", "16px")}
          {bar("30%", "23px")}
        </>
      )}
    </span>
  );
}

function FlowPreview({ frames }: { frames: FrameKind[] }) {
  return (
    <span className="flow-preview" aria-hidden>
      {frames.map((k, i) => (
        <FlowMini key={i} kind={k} />
      ))}
    </span>
  );
}
