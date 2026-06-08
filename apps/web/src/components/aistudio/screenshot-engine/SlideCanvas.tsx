// Lean one-slide renderer. Deterministic inline styles (clean html-to-image
// export), a fixed set of auto-rotated layouts, designed backgrounds, and a
// resolved brand palette. Always renders at full CANVAS pixel size; callers
// scale a wrapper for previews.

import { CANVAS, MK_RATIO, IPAD_RATIO, phoneW, ipadW, fontFamily } from "./constants";
import type { Device, DesignSpec, Palette, Slide, Theme } from "./types";
import { Phone, IPad } from "./device-frames";
import { SlideBackground } from "./backgrounds";
import { shade, rgba } from "./color";

type Placement = {
  device?: { top: number; left: number; width: number; rotate?: number };
  text: {
    top?: number;
    bottom?: number;
    justify: "flex-start" | "center" | "flex-end";
    align: "center" | "flex-start";
    maxWidth: number;
    insetX?: number;
  };
};

function placement(layout: Slide["layout"], w: number, h: number, device: Device): Placement {
  const aspect = device === "ipad" ? IPAD_RATIO : MK_RATIO; // width / height
  const devWidth = (device === "ipad" ? ipadW(w, h) : phoneW(w, h)) * w;
  const devHeight = devWidth / aspect;
  const left = (w - devWidth) / 2;
  const centeredText = { align: "center" as const, maxWidth: w * 0.86 };

  switch (layout) {
    case "device-bottom":
      return {
        device: { top: h - devHeight, left, width: devWidth },
        text: { top: h * 0.05, justify: "flex-start", ...centeredText },
      };
    case "device-top":
      return {
        device: { top: -devHeight * 0.12, left, width: devWidth },
        text: { bottom: h * 0.06, justify: "flex-end", ...centeredText },
      };
    case "split": {
      // Character-hero feel: caption upper-left, device offset to the right.
      const sw = devWidth * 0.82;
      return {
        device: { top: h * 0.36, left: w - sw * 0.74, width: sw, rotate: 5 },
        text: { top: h * 0.08, justify: "flex-start", align: "flex-start", maxWidth: w * 0.64, insetX: w * 0.085 },
      };
    }
    case "no-device":
      return { text: { top: 0, justify: "center", ...centeredText } };
    case "hero":
    default:
      return {
        device: { top: h * 0.32, left, width: devWidth },
        text: { top: h * 0.07, justify: "flex-start", ...centeredText },
      };
  }
}

function buildPalette(theme: Theme, design: DesignSpec, inverted: boolean): Palette {
  const base = inverted ? theme.bgAlt : theme.bg;
  return {
    base,
    base2: shade(base, inverted ? 0.05 : -0.03),
    accent: design.accent,
    brand: design.brand,
    fg: inverted ? theme.fgAlt : theme.fg,
    muted: theme.muted,
  };
}

export function SlideCanvas({
  slide,
  theme,
  device,
  design,
}: {
  slide: Slide;
  theme: Theme;
  device: Device;
  design: DesignSpec;
}) {
  const { w, h } = CANVAS[device];
  const pal = buildPalette(theme, design, slide.inverted);
  const p = placement(slide.layout, w, h, device);
  const Frame = device === "ipad" ? IPad : Phone;
  const seed = slide.id.charCodeAt(slide.id.length - 1) || 0;

  const padX = p.text.insetX ?? w * 0.085;
  const headlineSize = slide.layout === "no-device" ? w * 0.102 : w * 0.072;
  const labelSize = w * 0.026;

  return (
    <div
      style={{
        width: w,
        height: h,
        position: "relative",
        overflow: "hidden",
        background: pal.base,
        fontFamily: fontFamily(design.font),
      }}
    >
      <SlideBackground background={design.background} palette={pal} seed={seed} />

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
          alignItems: p.text.align,
          textAlign: p.text.align === "flex-start" ? "left" : "center",
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
              color: pal.accent,
              marginBottom: headlineSize * 0.3,
              display: "inline-flex",
              alignItems: "center",
              gap: labelSize * 0.5,
            }}
          >
            <span style={{ width: labelSize * 1.4, height: 3, borderRadius: 2, background: pal.accent, display: "inline-block" }} />
            {slide.label}
          </div>
        )}
        <div
          style={{
            fontSize: headlineSize,
            fontWeight: 800,
            lineHeight: 1.04,
            letterSpacing: -headlineSize * 0.02,
            color: pal.fg,
            whiteSpace: "pre-line",
            maxWidth: p.text.maxWidth,
            textShadow: `0 2px 30px ${rgba(pal.base, 0.5)}`,
          }}
        >
          {slide.headline}
        </div>
      </div>

      {/* device + backing glow (keeps the dark device readable on any base) */}
      {p.device && (
        <>
          <div
            aria-hidden
            style={{
              position: "absolute",
              top: p.device.top - p.device.width * 0.14,
              left: p.device.left - p.device.width * 0.2,
              width: p.device.width * 1.4,
              height: p.device.width * 1.95,
              borderRadius: "50%",
              background: `radial-gradient(closest-side, ${rgba(pal.accent, 0.18)} 0%, transparent 72%)`,
              filter: "blur(70px)",
              zIndex: 1,
            }}
          />
          <div
            style={{
              position: "absolute",
              top: p.device.top,
              left: p.device.left,
              width: p.device.width,
              transform: p.device.rotate ? `rotate(${p.device.rotate}deg)` : undefined,
              filter: "drop-shadow(0 24px 46px rgba(0,0,0,0.4))",
              zIndex: 2,
            }}
          >
            <Frame src={slide.screenshot} hideEmpty={false} />
          </div>
        </>
      )}
    </div>
  );
}
