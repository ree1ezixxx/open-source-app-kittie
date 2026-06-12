import { useMemo, useState } from "react";
import "../styles/aistudio.css";
import type { AppListItem } from "@kittie/types";
import {
  aiService,
  isAiServiceMocked,
  type ScreenshotTranslation,
  type UploadedImage,
} from "../lib/aiService";
import { StudioHeader } from "../components/aistudio/StudioHeader";
import { AppPicker } from "../components/aistudio/AppPicker";
import { AppDetailsForm, EMPTY_DETAILS, type AppDetails } from "../components/aistudio/AppDetailsForm";
import { ScreenshotUploader } from "../components/aistudio/ScreenshotUploader";
import { StepFlow } from "../components/aistudio/StepFlow";
import { HistoryList } from "../components/aistudio/HistoryList";
import { StudioEmptyState } from "../components/aistudio/StudioEmptyState";
import { IconImage, IconInfo } from "../icons";
import { IconWand, IconPlus } from "../components/aistudio/icons";
import { SUPPORTED_LANGUAGES } from "../lib/languages";

const STEPS = ["App details", "Upload screenshots", "Select languages"];

export function ScreenshotTranslationPage() {
  const [newMode, setNewMode] = useState(false);
  const [selectedApp, setSelectedApp] = useState<AppListItem | null>(null);
  const [details, setDetails] = useState<AppDetails>(EMPTY_DETAILS);
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);

  const [history, setHistory] = useState<ScreenshotTranslation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [view, setView] = useState<"build" | "result">("build");
  const [translating, setTranslating] = useState(false);
  const [transError, setTransError] = useState<string | null>(null);

  const started = newMode || !!selectedApp;
  const targetChosen = started && details.name.trim().length > 0;
  const step = !targetChosen ? 0 : images.length === 0 ? 1 : 2;
  const ready = targetChosen && images.length > 0 && selectedLanguages.length > 0 && !translating;
  const activeTrans = useMemo(() => history.find((t) => t.id === activeId) ?? null, [history, activeId]);

  function resetBuild() {
    setView("build");
    setNewMode(false);
    setSelectedApp(null);
    setDetails(EMPTY_DETAILS);
    setImages([]);
    setSelectedLanguages([]);
    setActiveId(null);
  }

  function pickApp(app: AppListItem) {
    setSelectedApp(app);
    setNewMode(false);
    setView("build");
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

  function toggleLanguage(lang: string) {
    setSelectedLanguages((l) =>
      l.includes(lang) ? l.filter((x) => x !== lang) : [...l, lang]
    );
  }

  async function translate() {
    if (!ready) return;
    setTranslating(true);
    setTransError(null);
    try {
      const trans = await aiService.translateScreenshots({
        appId: selectedApp?.id ?? null,
        appName: details.name.trim(),
        sourceImages: images,
        targetLanguages: selectedLanguages,
        device: "iphone",
      });

      if (trans.status !== "done") {
        setTransError("Translation failed; please try again");
        return;
      }

      if (!trans.slides || trans.slides.length === 0) {
        setTransError("No translations were generated");
        return;
      }

      setHistory((h) => [trans, ...h]);
      setActiveId(trans.id);
      setView("result");
    } catch (e) {
      setTransError(e instanceof Error ? e.message : "Translation failed");
    } finally {
      setTranslating(false);
    }
  }

  return (
    <main className="main">
      <StudioHeader
        icon={<IconImage style={{ width: 18, height: 18 }} />}
        title="Screenshot Translation"
        subtitle={
          isAiServiceMocked()
            ? "Translate screenshot text into multiple languages (mock mode)"
            : "Translate screenshot text into multiple languages"
        }
        actions={
          <button className="btn btn-accent" onClick={resetBuild}>
            <IconPlus /> New translation
          </button>
        }
      />

      <div className="studio-layout">
        {/* left rail */}
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
              Recent Translations
              {history.length > 0 && <span>{history.length}</span>}
            </div>
            {history.length === 0 ? (
              <StudioEmptyState bare title="No translations yet" sub="Your translated sets appear here." />
            ) : (
              <HistoryList
                items={history.map((t) => ({
                  ...t,
                  slides: t.slides.slice(0, 1), // Show only first slide thumbnail
                }))}
                activeId={activeId}
                onSelect={(id) => {
                  setActiveId(id);
                  setView("result");
                }}
              />
            )}
          </div>
        </aside>

        {/* right detail */}
        <section className="studio-detail">
          <div className="studio-detail-inner">
            {view === "result" && activeTrans ? (
              <>
                <div className="studio-block-head">
                  <div className="studio-block-title">Translated set</div>
                  <button className="btn" onClick={resetBuild}>
                    <IconPlus /> New translation
                  </button>
                </div>
                <TranslationResult translation={activeTrans} />
                <div className="notice">
                  <IconInfo />
                  <span>
                    {selectedLanguages.length} language{selectedLanguages.length !== 1 ? "s" : ""} generated. Mock mode shows source screenshots — real implementation would overlay translated text.
                  </span>
                </div>
              </>
            ) : (
              <>
                <StepFlow steps={STEPS} current={step} />

                {/* Step 1 — app details */}
                <div className="studio-block">
                  <div className="studio-block-head">
                    <div className="studio-block-title">1 · App details</div>
                    <div className="studio-block-hint">Pick a tracked app on the left, or describe a new one</div>
                  </div>
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
                      <AppDetailsForm details={details} onChange={(p) => setDetails((d) => ({ ...d, ...p }))} />
                    </>
                  ) : (
                    <StudioEmptyState
                      title="No app selected"
                      sub="Choose a tracked app from the left rail, or click 'Describe a new / unreleased app'."
                    />
                  )}
                </div>

                {/* Step 2 — upload */}
                <div className="studio-block" style={{ opacity: targetChosen ? 1 : 0.5, pointerEvents: targetChosen ? "auto" : "none" }}>
                  <div className="studio-block-head">
                    <div className="studio-block-title">2 · Upload screenshots</div>
                    <div className="studio-block-hint">Your current app store screenshots — source for translation</div>
                  </div>
                  <ScreenshotUploader images={images} onChange={setImages} />
                </div>

                {/* Step 3 — language selection */}
                <div className="studio-block" style={{ opacity: images.length ? 1 : 0.5, pointerEvents: images.length ? "auto" : "none" }}>
                  <div className="studio-block-head">
                    <div className="studio-block-title">3 · Select languages</div>
                    <div className="studio-block-hint">Choose target languages for on-image text translation</div>
                  </div>

                  <div className="studio-field">
                    <label>Target Languages</label>
                    <div className="studio-chips">
                      {SUPPORTED_LANGUAGES.map((lang) => (
                        <button
                          key={lang.code}
                          className={`studio-chip${selectedLanguages.includes(lang.code) ? " on" : ""}`}
                          onClick={() => toggleLanguage(lang.code)}
                        >
                          {lang.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  {selectedLanguages.length > 0 && (
                    <div style={{ fontSize: 12.5, color: "var(--text-tertiary)", marginBottom: 14 }}>
                      {selectedLanguages.length} language{selectedLanguages.length !== 1 ? "s" : ""} selected
                    </div>
                  )}

                  <button className="btn btn-accent" disabled={!ready} onClick={translate} style={{ height: 38 }}>
                    <IconWand /> {translating ? "Translating…" : `Translate ${selectedLanguages.length} languages`}
                  </button>

                  {transError && (
                    <div className="notice warn" style={{ marginTop: 12 }}>
                      <span>{transError}</span>
                    </div>
                  )}
                </div>

                {translating && (
                  <div className="studio-generating">
                    <div className="studio-skel-shots">
                      {Array.from({ length: images.length * selectedLanguages.length }).map((_, i) => (
                        <div className="skel studio-skel-shot" key={i} />
                      ))}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 12.5 }}>
                      <span className="studio-spinner" /> Translating {images.length} screenshot{images.length !== 1 ? "s" : ""} into {selectedLanguages.length} language{selectedLanguages.length !== 1 ? "s" : ""}…
                    </div>
                  </div>
                )}

                <div className="notice">
                  <IconInfo />
                  <span>
                    <strong>On-image text translation</strong> — real implementation uses vision + OCR to detect and overlay localized text. Currently in mock mode.
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

function TranslationResult({ translation }: { translation: ScreenshotTranslation }) {
  // Group slides by language
  const byLanguage = translation.slides.reduce(
    (acc, slide) => {
      if (!acc[slide.language]) acc[slide.language] = [];
      acc[slide.language]!.push(slide);
      return acc;
    },
    {} as Record<string, typeof translation.slides>
  );

  return (
    <div className="gencard">
      <div className="gencard-head">
        <IconWand style={{ width: 16, height: 16, color: "var(--accent)" }} />
        <div className="title">{translation.appName}</div>
        <div className="meta">
          {translation.targetLanguages.length} languages · {translation.slides.length} frames
        </div>
      </div>

      {Object.entries(byLanguage).map(([lang, slides]) => (
        <div key={lang} style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 560, color: "var(--text)", marginBottom: 12, paddingLeft: 2 }}>
            {slides[0]?.languageName || lang}
          </div>
          <div className="studio-shots">
            {slides.map((s, i) => (
              <div className="studio-shot" key={s.id}>
                <div style={{ width: "100%", aspectRatio: "9/16", background: "var(--surface-2)", overflow: "hidden", borderRadius: "inherit" }}>
                  {s.translatedScreenshot ? (
                    <img src={s.translatedScreenshot} alt={`${s.languageName} translation`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-tertiary)", fontSize: 12 }}>
                      Translation pending
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
