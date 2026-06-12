// PNG export — html-to-image + jszip, mirroring the capture approach from
// ParthJadhav/app-store-screenshots (MIT). Each slide's full-res DOM node is
// rendered once per required store size and bundled into a zip.

import { toPng } from "html-to-image";
import JSZip from "jszip";
import { CANVAS, EXPORT_SIZES } from "./constants";
import type { Device, Slide } from "./types";

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export type ExportProgress = { done: number; total: number };

export interface ExportResult {
  ok: number;
  failed: number;
  error?: string;
}

/**
 * Render every slide at each App Store size and download a zip organised by
 * resolution. `getNode` resolves a slide id to its full-resolution off-screen
 * DOM node (rendered by GenerationResult's hidden export layer).
 */
export async function exportDeckZip(opts: {
  slides: Slide[];
  device: Device;
  getNode: (slideId: string) => HTMLElement | null;
  filename?: string;
  onProgress?: (p: ExportProgress) => void;
}): Promise<ExportResult> {
  const { slides, device, getNode, onProgress } = opts;

  if (slides.length === 0) {
    return { ok: 0, failed: 0, error: "No slides to export" };
  }

  const { w, h } = CANVAS[device];
  const sizes = EXPORT_SIZES[device];
  const zip = new JSZip();

  const total = sizes.length * slides.length;
  let done = 0;
  let ok = 0;
  let failed = 0;

  for (const size of sizes) {
    const folder = zip.folder(size.label) ?? zip;
    for (let i = 0; i < slides.length; i++) {
      const slide = slides[i]!;
      const el = getNode(slide.id);
      if (!el) {
        failed++;
        done++;
        onProgress?.({ done, total });
        continue;
      }

      try {
        const dataUrl = await toPng(el, {
          width: w,
          height: h,
          canvasWidth: size.w,
          canvasHeight: size.h,
          pixelRatio: 1,
          cacheBust: false,
          backgroundColor: "#ffffff",
        });
        const base64 = dataUrl.split(",")[1] ?? "";
        if (!base64) {
          failed++;
        } else {
          folder.file(`${String(i + 1).padStart(2, "0")}.png`, base64, { base64: true });
          ok++;
        }
      } catch (e) {
        failed++;
      }
      done++;
      onProgress?.({ done, total });
    }
  }

  if (ok === 0) {
    return { ok, failed, error: "All exports failed; try refreshing the page" };
  }

  const blob = await zip.generateAsync({ type: "blob" });
  triggerDownload(blob, opts.filename ?? "app-store-screenshots.zip");
  return { ok, failed };
}

/** Export a single slide as one PNG at the device's largest store size. */
export async function exportSlidePng(
  el: HTMLElement,
  device: Device,
  index: number,
): Promise<void> {
  const { w, h } = CANVAS[device];
  const size = EXPORT_SIZES[device][0]!;
  const dataUrl = await toPng(el, {
    width: w,
    height: h,
    canvasWidth: size.w,
    canvasHeight: size.h,
    pixelRatio: 1,
    cacheBust: false,
    backgroundColor: "#ffffff",
  });
  const resp = await fetch(dataUrl);
  triggerDownload(await resp.blob(), `screenshot-${String(index + 1).padStart(2, "0")}.png`);
}
