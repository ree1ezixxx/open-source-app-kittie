// Lean one-slide renderer. Inspired by the original slide-canvas.tsx but
// rewritten for the one-click generation path: deterministic inline styles
// (so html-to-image exports cleanly), a fixed set of auto-rotated layouts,
// no drag/inspect/element machinery. Always renders at full CANVAS pixel size;
// callers scale a wrapper for previews.

import { CANVAS, MK_RATIO, IPAD_RATIO, phoneW, ipadW } from "./constants";
import type { Device, Slide, Theme } from "./types";
import { Phone, IPad } from "./device-frames";

const FONT_STACK =
  '"Space Grotesk", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';

type Placement = {
  device?: { top: number; left: number; width: number };
  text: { top?: number; bottom?: number; justify: "flex-start" | "center" | "flex-end" };
};

function placement(layout: Slide["layout"], w: number, h: number, device: Device): Placement {
  const aspect = device === "ipad" ? IPAD_RATIO : MK_RATIO; // width / height
  const devWidth = (device === "ipad" ? ipadW(w, h) : phoneW(w, h)) * w;
  const devHeight = devWidth / aspect;
  const left = (w - devWidth) / 2;

  switch (layout) {
    case "device-bottom":
      return {
        device: { top: h - devHeight, left, width: devWidth },
        text: { top: h * 0.05, justify: "flex-start" },
      };
    case "device-top":
      return {
        device: { top: -devHeight * 0.12, left, width: devWidth },
        text: { bottom: h * 0.06, justify: "flex-end" },
      };
    case "no-device":
      return { text: { top: 0, justify: "center" } };
    case "hero":
    default:
      return {
        device: { top: h * 0.32, left, width: devWidth },
        text: { top: h * 0.07, justify: "flex-start" },
      };
  }
}

export function SlideCanvas({
  slide,
  theme,
  device,
}: {
  slide: Slide;
  theme: Theme;
  device: Device;
}) {
  const { w, h } = CANVAS[device];
  const bg = slide.inverted ? theme.bgAlt : theme.bg;
  const fg = slide.inverted ? theme.fgAlt : theme.fg;
  const p = placement(slide.layout, w, h, device);
  const Frame = device === "ipad" ? IPad : Phone;

  const padX = w * 0.085;
  const headlineSize = slide.layout === "no-device" ? w * 0.1 : w * 0.072;
  const labelSize = w * 0.026;

  return (
    <div
      style={{
        width: w,
        height: h,
        position: "relative",
        overflow: "hidden",
        background: bg,
        fontFamily: FONT_STACK,
      }}
    >
      {/* decorative accent glow */}
      <div
        style={{
          position: "absolute",
          top: slide.layout === "device-top" ? "auto" : -h * 0.12,
          bottom: slide.layout === "device-top" ? -h * 0.12 : "auto",
          left: -w * 0.2,
          width: w * 0.7,
          height: w * 0.7,
          borderRadius: "50%",
          background: theme.accent,
          opacity: 0.14,
          filter: "blur(120px)",
        }}
      />

      {/* text block */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: p.text.top,
          bottom: p.text.bottom,
          height: slide.layout === "no-device" ? "100%" : undefined,
          padding: `0 ${padX}px`,
          display: "flex",
          flexDirection: "column",
          justifyContent: p.text.justify,
          alignItems: "center",
          textAlign: "center",
          zIndex: 5,
        }}
      >
        {slide.label && (
          <div
            style={{
              fontSize: labelSize,
              fontWeight: 700,
              letterSpacing: labelSize * 0.18,
              textTransform: "uppercase",
              color: theme.accent,
              marginBottom: headlineSize * 0.32,
            }}
          >
            {slide.label}
          </div>
        )}
        <div
          style={{
            fontSize: headlineSize,
            fontWeight: 800,
            lineHeight: 1.04,
            letterSpacing: -headlineSize * 0.02,
            color: fg,
            whiteSpace: "pre-line",
            maxWidth: w * 0.86,
          }}
        >
          {slide.headline}
        </div>
      </div>

      {/* device */}
      {p.device && (
        <div
          style={{
            position: "absolute",
            top: p.device.top,
            left: p.device.left,
            width: p.device.width,
            zIndex: 2,
          }}
        >
          <Frame src={slide.screenshot} hideEmpty={false} />
        </div>
      )}
    </div>
  );
}
