import { useEffect, useRef, useState } from "react";
import type { ScreenshotGeneration } from "../../lib/aiService";
import { IconDownload } from "../../icons";
import { IconWand } from "./icons";
import { timeAgo } from "./util";
import {
  CANVAS,
  themeById,
  SlideCanvas,
  SlidePreview,
  exportDeckZip,
  exportSlidePng,
  preloadImages,
  type ExportProgress,
} from "./screenshot-engine";

function slug(s: string) {
  return s.replace(/\s+/g, "-").toLowerCase().replace(/[^a-z0-9-]/g, "") || "app";
}

/** Renders one generation: framed previews + exact-size PNG export. Shared. */
export function GenerationResult({ generation }: { generation: ScreenshotGeneration }) {
  const theme = themeById(generation.themeId);
  const device = generation.device;
  const { w, h } = CANVAS[device];

  // Full-resolution off-screen nodes keyed by slide id — html-to-image captures
  // these, never the scaled previews.
  const nodes = useRef<Map<string, HTMLDivElement>>(new Map());
  const [exporting, setExporting] = useState<ExportProgress | null>(null);

  // Inline the iPhone bezel so exports are deterministic (no fetch race).
  useEffect(() => {
    void preloadImages(["/mockup.png"]);
  }, []);

  async function downloadAll() {
    if (exporting) return;
    setExporting({ done: 0, total: generation.slides.length });
    try {
      await exportDeckZip({
        slides: generation.slides,
        device,
        getNode: (id) => nodes.current.get(id) ?? null,
        filename: `${slug(generation.appName)}-app-store-screenshots.zip`,
        onProgress: setExporting,
      });
    } finally {
      setExporting(null);
    }
  }

  async function downloadOne(id: string, i: number) {
    const el = nodes.current.get(id);
    if (el) await exportSlidePng(el, device, i);
  }

  return (
    <div className="gencard">
      <div className="gencard-head">
        <IconWand style={{ width: 16, height: 16, color: "var(--accent)" }} />
        <div className="title">{generation.appName}</div>
        <div className="meta">
          {generation.style} · {generation.slides.length} frames · {timeAgo(generation.createdAt)}
        </div>
        <button
          className="btn btn-accent"
          onClick={downloadAll}
          disabled={!!exporting}
          style={{ marginLeft: "auto" }}
        >
          <IconDownload />
          {exporting ? `Exporting ${exporting.done}/${exporting.total}…` : "Download PNGs (zip)"}
        </button>
      </div>

      <div className="studio-shots">
        {generation.slides.map((s, i) => (
          <div className="studio-shot" key={s.id}>
            <SlidePreview slide={s} theme={theme} device={device} width={220} />
            <div className="cap" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {s.headline.replace(/\n/g, " ")}
              </span>
              <button
                className="icon-btn"
                style={{ width: 26, height: 26 }}
                title="Download this frame (PNG)"
                aria-label="Download frame"
                onClick={() => downloadOne(s.id, i)}
              >
                <IconDownload style={{ width: 13, height: 13 }} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Hidden full-resolution export layer */}
      <div aria-hidden style={{ position: "fixed", left: -100000, top: 0, pointerEvents: "none" }}>
        {generation.slides.map((s) => (
          <div
            key={s.id}
            ref={(el) => {
              if (el) nodes.current.set(s.id, el);
              else nodes.current.delete(s.id);
            }}
            style={{ width: w, height: h }}
          >
            <SlideCanvas slide={s} theme={theme} device={device} />
          </div>
        ))}
      </div>
    </div>
  );
}
