import { useMemo, useState, type CSSProperties } from "react";
import "../styles/aistudio.css";
import type { UploadedImage } from "../lib/aiService";
import {
  POPULAR_COUNTRY_CODES,
  TRANSLATION_COUNTRIES,
  loadTrackedApps,
  loadTranslationHistory,
  persistTranslationHistory,
  translationService,
  type TrackedAppSummary,
  type TranslationResult,
} from "../lib/translationService";
import { StudioHeader } from "../components/aistudio/StudioHeader";
import { AppFinder } from "../components/aistudio/AppFinder";
import { importStoreScreenshots, type StoreApp } from "../lib/api/appFinder";
import { ScreenshotUploader } from "../components/aistudio/ScreenshotUploader";
import { StepFlow } from "../components/aistudio/StepFlow";
import { StudioEmptyState } from "../components/aistudio/StudioEmptyState";
import { timeAgo } from "../components/aistudio/util";
import { IconGlobe, IconInfo, IconSearch } from "../icons";
import { IconCheck, IconPlus, IconUpload } from "../components/aistudio/icons";

const STEPS = ["Select app", "Upload screenshots", "Select countries"];

const intakeCardStyle: CSSProperties = {
  margin: 0,
  width: "100%",
  textAlign: "left",
  cursor: "pointer",
  display: "flex",
  alignItems: "flex-start",
  gap: 12,
  transition: "border-color 0.12s, background 0.12s",
};

export function ScreenshotTranslationPage() {
  // Apps tracked on the App Tracking page (read-only snapshot from localStorage).
  const [trackedApps] = useState<TrackedAppSummary[]>(() => loadTrackedApps());
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [countries, setCountries] = useState<string[]>([]);
  const [countrySearch, setCountrySearch] = useState("");
  const [foundAppName, setFoundAppName] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const [history, setHistory] = useState<TranslationResult[]>(() => loadTranslationHistory());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [view, setView] = useState<"build" | "result">("build");
  const [translating, setTranslating] = useState(false);

  const selectedApp = trackedApps.find((a) => a.id === selectedAppId) ?? null;
  const started = manualMode || !!selectedApp || images.length > 0;
  const step = !started ? 0 : images.length === 0 ? 1 : 2;
  const ready = images.length > 0 && countries.length > 0 && !translating;
  const activeResult = useMemo(() => history.find((r) => r.id === activeId) ?? null, [history, activeId]);

  function resetBuild() {
    setView("build");
    setManualMode(false);
    setSelectedAppId(null);
    setImages([]);
    setCountries([]);
    setActiveId(null);
    setFoundAppName(null);
  }

  function pickApp(app: TrackedAppSummary) {
    setSelectedAppId(app.id);
    setManualMode(false);
    setView("build");
  }

  function pickManual() {
    setManualMode(true);
    setSelectedAppId(null);
    setView("build");
  }

  // Search/Paste-URL pulled a real listing — import its store screenshots as
  // source frames (mirrors truth's "Find App Screenshots").
  async function onFindApp(app: StoreApp) {
    setManualMode(true);
    setSelectedAppId(null);
    setView("build");
    setFoundAppName(app.title);
    if (app.screenshotUrls.length > 0) {
      setImporting(true);
      try {
        const frames = await importStoreScreenshots(app, 10);
        if (frames.length) setImages(frames);
      } finally {
        setImporting(false);
      }
    }
  }

  function toggleCountry(code: string) {
    setCountries((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  }

  const filteredCountries = useMemo(() => {
    const q = countrySearch.trim().toLowerCase();
    if (!q) return TRANSLATION_COUNTRIES;
    return TRANSLATION_COUNTRIES.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.language.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q),
    );
  }, [countrySearch]);

  // Mirrors truth's "Select 3" ↔ "Deselect all" toggle on the popular markets.
  const popularSelected =
    countries.length > 0 && POPULAR_COUNTRY_CODES.every((c) => countries.includes(c));

  function quickSelect() {
    if (popularSelected) setCountries([]);
    else setCountries([...new Set([...countries, ...POPULAR_COUNTRY_CODES])]);
  }

  async function translate() {
    if (!ready) return;
    setTranslating(true);
    try {
      const result = await translationService.translateScreenshots({
        appId: selectedApp?.id ?? null,
        appName: selectedApp?.title ?? foundAppName ?? "Manual upload",
        images,
        countries,
      });
      const next = [result, ...history];
      setHistory(next);
      persistTranslationHistory(next);
      setActiveId(result.id);
      setView("result");
    } finally {
      setTranslating(false);
    }
  }

  return (
    <main className="main">
      <StudioHeader
        icon={<IconGlobe style={{ width: 18, height: 18 }} />}
        title="Screenshot Translation"
        subtitle="Upload screenshots and choose the countries to localize for"
        actions={
          <button className="btn btn-accent" onClick={resetBuild}>
            <IconPlus /> New translation
          </button>
        }
      />

      <div className="studio-layout">
        {/* ---------------- left rail ---------------- */}
        <aside className="studio-rail">
          <div className="studio-rail-section">
            <div className="studio-rail-label">Your tracked apps</div>
            {trackedApps.length === 0 ? (
              <StudioEmptyState bare title="No tracked apps" sub="Add apps in App Tracking to quickly translate screenshots." />
            ) : (
              <div className="studio-applist">
                {trackedApps.map((a) => (
                  <button
                    key={a.id}
                    className={`studio-appitem${selectedAppId === a.id ? " active" : ""}`}
                    onClick={() => pickApp(a)}
                  >
                    {a.iconUrl ? (
                      <img className="app-icon" src={a.iconUrl} alt="" loading="lazy" />
                    ) : (
                      <div className="app-icon placeholder">{a.title.charAt(0).toUpperCase()}</div>
                    )}
                    <div style={{ minWidth: 0 }}>
                      <div className="name">{a.title}</div>
                      <div className="sub">{a.developer}{a.category ? ` · ${a.category}` : ""}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="studio-rail-section" style={{ marginTop: "auto" }}>
            <div className="studio-rail-label">
              Recent Translations
              <span>{history.length}</span>
            </div>
            {history.length === 0 ? (
              <StudioEmptyState bare title="No translations yet" sub="Upload screenshots and choose target countries to get started." />
            ) : (
              <div className="studio-history">
                {history.map((r) => {
                  const first = r.groups[0]?.images[0];
                  return (
                    <button
                      key={r.id}
                      className={`studio-histitem${activeId === r.id ? " active" : ""}`}
                      onClick={() => { setActiveId(r.id); setView("result"); }}
                    >
                      <div className="swatch">
                        {first && <img src={first.dataUrl} alt="" />}
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div className="h-name">{r.appName}</div>
                        <div className="h-sub">
                          {r.groups.length} {r.groups.length === 1 ? "country" : "countries"} · {r.sourceCount} frames · {timeAgo(r.createdAt)}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </aside>

        {/* ---------------- right detail ---------------- */}
        <section className="studio-detail">
          <div className="studio-detail-inner">
            {view === "result" && activeResult ? (
              <>
                <div className="studio-block-head">
                  <div>
                    <div className="studio-block-title">{activeResult.appName}</div>
                    <div className="studio-block-hint">
                      {activeResult.sourceCount} source frames · {activeResult.groups.length} {activeResult.groups.length === 1 ? "country" : "countries"} · {timeAgo(activeResult.createdAt)}
                    </div>
                  </div>
                  <button className="btn" onClick={resetBuild}>
                    <IconPlus /> New translation
                  </button>
                </div>

                {activeResult.groups.map((g) => (
                  <div className="gencard" key={g.country.code}>
                    <div className="gencard-head">
                      <span style={{ fontSize: 17, lineHeight: 1 }}>{g.country.flag}</span>
                      <div className="title">{g.country.name}</div>
                      <span className="studio-chip on" style={{ pointerEvents: "none", padding: "3px 9px", fontSize: 11 }}>
                        {g.country.language}
                      </span>
                      <div className="meta">{g.images.length} frames</div>
                    </div>
                    <div className="studio-shots" style={{ paddingBottom: 4 }}>
                      {g.images.map((img) => (
                        <div className="studio-shot" key={img.id} title={img.name}>
                          <img src={img.dataUrl} alt={img.name} />
                          <div className="cap">{img.name}</div>
                          {img.translatedLines && img.translatedLines.length > 0 && (
                            <div className="tr-lines">
                              {img.translatedLines.map((l, i) => (
                                <div className="tr-line" key={i} title={l.source}>
                                  {l.translated}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                <div className="notice">
                  <IconInfo />
                  <span>
                    <strong>Live translation</strong> — Gemini reads each frame's marketing text and translates it
                    per country (shown under the frame). Source frames stay untouched; paste the copy into the
                    Screenshot generator to produce localized art.
                  </span>
                </div>
              </>
            ) : (
              <>
                <StepFlow steps={STEPS} current={step} />

                {/* intake cards */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14, marginBottom: 26 }}>
                  <button
                    className="gencard"
                    style={{
                      ...intakeCardStyle,
                      borderColor: selectedApp ? "var(--accent)" : undefined,
                      background: selectedApp ? "var(--accent-soft)" : undefined,
                    }}
                    onClick={() => setManualMode(false)}
                  >
                    <div className="page-icon"><IconGlobe style={{ width: 16, height: 16 }} /></div>
                    <div>
                      <div style={{ fontSize: 13.5, fontWeight: 650, marginBottom: 3 }}>Select App</div>
                      <div style={{ fontSize: 12, color: "var(--text-tertiary)", lineHeight: 1.45 }}>
                        Choose a saved app or add screenshots
                      </div>
                    </div>
                  </button>
                  <button
                    className="gencard"
                    style={{
                      ...intakeCardStyle,
                      borderColor: manualMode ? "var(--accent)" : undefined,
                      background: manualMode ? "var(--accent-soft)" : undefined,
                    }}
                    onClick={pickManual}
                  >
                    <div className="page-icon"><IconUpload style={{ width: 16, height: 16 }} /></div>
                    <div>
                      <div style={{ fontSize: 13.5, fontWeight: 650, marginBottom: 3 }}>Add Your Screenshots</div>
                      <div style={{ fontSize: 12, color: "var(--text-tertiary)", lineHeight: 1.45 }}>
                        Upload screenshots manually
                      </div>
                    </div>
                  </button>
                </div>

                {!started ? (
                  <StudioEmptyState
                    icon={<IconGlobe />}
                    title="Translate App Store Screenshots"
                    sub="Choose a saved app from the left, or add screenshots manually to translate them into target languages."
                  />
                ) : (
                  <>
                    {selectedApp && (
                      <div className="studio-appitem active" style={{ cursor: "default", marginBottom: 14 }}>
                        {selectedApp.iconUrl ? (
                          <img className="app-icon" src={selectedApp.iconUrl} alt="" />
                        ) : (
                          <div className="app-icon placeholder">{selectedApp.title.charAt(0).toUpperCase()}</div>
                        )}
                        <div style={{ minWidth: 0 }}>
                          <div className="name">{selectedApp.title}</div>
                          <div className="sub">{selectedApp.developer}{selectedApp.category ? ` · ${selectedApp.category}` : ""}</div>
                        </div>
                      </div>
                    )}

                    {/* Step 2 — find or upload source screenshots */}
                    <div className="studio-block">
                      <div className="studio-block-head">
                        <div className="studio-block-title">2 · Source screenshots</div>
                        <div className="studio-block-hint">Search a store listing, paste a URL, or upload — PNG or JPG</div>
                      </div>
                      <AppFinder onPick={onFindApp} busy={importing} />
                      {importing && (
                        <div className="app-finder-importing">
                          <span className="studio-spinner" /> Importing store screenshots…
                        </div>
                      )}
                      <ScreenshotUploader images={images} onChange={setImages} />
                    </div>

                    {/* Step 3 — countries + translate (selectable anytime, like truth) */}
                    <div className="studio-block">
                      <div className="studio-block-head">
                        <div className="studio-block-title">3 · Target countries</div>
                        <div className="studio-block-hint">
                          {countries.length > 0
                            ? `${countries.length} selected`
                            : "Choose the App Store languages to generate translated sets for"}
                        </div>
                      </div>

                      <div className="studio-country-toolbar">
                        <div className="search" style={{ flex: 1, minWidth: 0 }}>
                          <IconSearch />
                          <input
                            value={countrySearch}
                            onChange={(e) => setCountrySearch(e.target.value)}
                            placeholder="Search countries or languages…"
                            spellCheck={false}
                          />
                        </div>
                        <button className="btn" onClick={quickSelect} style={{ height: 34, whiteSpace: "nowrap" }}>
                          {popularSelected ? "Deselect all" : `Select ${POPULAR_COUNTRY_CODES.length}`}
                        </button>
                      </div>

                      <div className="studio-field">
                        <div className="studio-chips studio-country-list">
                          {filteredCountries.length === 0 ? (
                            <div className="studio-block-hint" style={{ padding: "6px 2px" }}>
                              No countries match “{countrySearch}”.
                            </div>
                          ) : (
                            filteredCountries.map((c) => {
                              const on = countries.includes(c.code);
                              return (
                                <button
                                  key={c.code}
                                  className={`studio-chip${on ? " on" : ""}`}
                                  onClick={() => toggleCountry(c.code)}
                                  title={`${c.name} · ${c.language}`}
                                >
                                  <span aria-hidden>{c.flag}</span> {c.name}
                                  <span className="studio-chip-code">{c.code}</span>
                                  {on && <IconCheck style={{ width: 12, height: 12 }} />}
                                </button>
                              );
                            })
                          )}
                        </div>
                      </div>

                      <div className="studio-ready">
                        <span className="studio-ready-summary">
                          {images.length} {images.length === 1 ? "screenshot" : "screenshots"} ·{" "}
                          {countries.length} {countries.length === 1 ? "country" : "countries"}
                        </span>
                        <button className="btn btn-accent" disabled={!ready} onClick={translate} style={{ height: 38 }}>
                          <IconGlobe style={{ width: 15, height: 15 }} />
                          {translating
                            ? "Translating…"
                            : countries.length > 0
                              ? `Translate to ${countries.length} ${countries.length === 1 ? "language" : "languages"}`
                              : "Translate Screenshots"}
                        </button>
                      </div>
                    </div>

                    {translating && (
                      <div className="studio-generating">
                        <div className="studio-skel-shots">
                          {Array.from({ length: Math.min(Math.max(countries.length, 1), 4) }).map((_, i) => (
                            <div className="skel studio-skel-shot" key={i} />
                          ))}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 12.5 }}>
                          <span className="studio-spinner" /> Localizing {images.length} {images.length === 1 ? "frame" : "frames"} for {countries.length} {countries.length === 1 ? "country" : "countries"}…
                        </div>
                      </div>
                    )}

                    <div className="notice">
                      <IconInfo />
                      <span>
                        <strong>Live translation</strong> — Gemini reads each frame's marketing text and translates it
                        into every target language, shown under the source frame. Frames stay untouched.
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
