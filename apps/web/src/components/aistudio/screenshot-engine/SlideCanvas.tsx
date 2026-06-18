// Lean one-slide renderer. Deterministic inline styles (clean html-to-image
// export). Poster composition: app wordmark header, pill kicker, big multi-tonal
// condensed headline, designed background, framed screenshot.

import { CANVAS, MK_RATIO, IPAD_RATIO, phoneW, ipadW, fontFamily, displayFamily } from "./constants";
import type { Device, DesignSpec, Palette, Slide, Theme } from "./types";
import { Phone, IPad } from "./device-frames";
import { SlideBackground } from "./backgrounds";
import { shade, rgba, readableOn } from "./color";

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
  header: boolean;
};

function placement(layout: Slide["layout"], w: number, h: number, device: Device): Placement {
  const aspect = device === "ipad" ? IPAD_RATIO : MK_RATIO; // width / height
  const devWidth = (device === "ipad" ? ipadW(w, h) : phoneW(w, h)) * w;
  const devHeight = devWidth / aspect;
  const left = (w - devWidth) / 2;
  const centeredText = { align: "center" as const, maxWidth: w * 0.88 };

  switch (layout) {
    case "device-bottom":
      return {
        device: { top: h - devHeight, left, width: devWidth },
        text: { top: h * 0.1, justify: "flex-start", ...centeredText },
        header: true,
      };
    case "device-top":
      return {
        device: { top: -devHeight * 0.12, left, width: devWidth },
        text: { bottom: h * 0.06, justify: "flex-end", ...centeredText },
        header: false,
      };
    case "split": {
      const sw = devWidth * 0.82;
      return {
        device: { top: h * 0.38, left: w - sw * 0.74, width: sw, rotate: 5 },
        text: { top: h * 0.12, justify: "flex-start", align: "flex-start", maxWidth: w * 0.64, insetX: w * 0.085 },
        header: true,
      };
    }
    case "no-device":
      return { text: { top: 0, justify: "center", ...centeredText }, header: true };
    case "hero":
    default:
      return {
        device: { top: h * 0.34, left, width: devWidth },
        text: { top: h * 0.11, justify: "flex-start", ...centeredText },
        header: true,
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
    tint: design.tint,
    fg: inverted ? theme.fgAlt : theme.fg,
    muted: theme.muted,
  };
}

/** Split a headline so the last word/line can be emphasised in a tonal colour. */
function splitHeadline(h: string): { main: string; emph: string } {
  if (h.includes("\n")) {
    const lines = h.split("\n");
    const emph = lines.pop() ?? "";
    return { main: lines.join("\n"), emph };
  }
  const words = h.split(" ");
  if (words.length >= 2) {
    const emph = words.pop() ?? "";
    return { main: words.join(" ") + " ", emph };
  }
  return { main: "", emph: h };
}

export function SlideCanvas({
  slide,
  theme,
  device,
  design,
  appName,
  appIcon,
}: {
  slide: Slide;
  theme: Theme;
  device: Device;
  design: DesignSpec;
  appName: string;
  appIcon?: string | null;
}) {
  const { w, h } = CANVAS[device];
  const pal = buildPalette(theme, design, slide.inverted);
  const p = placement(slide.layout, w, h, device);
  const Frame = device === "ipad" ? IPad : Phone;
  const seed = slide.id.charCodeAt(slide.id.length - 1) || 0;

  const condensed = design.font === "anton" || design.font === "archivo";
  const padX = p.text.insetX ?? w * 0.085;
  const big = slide.layout === "no-device";
  const headlineSize = condensed ? w * (big ? 0.142 : 0.118) : w * (big ? 0.104 : 0.08);
  const labelSize = w * 0.026;
  const { main, emph } = splitHeadline(slide.headline);

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

      {/* app wordmark header */}
      {p.header && appName && (
        <div
          style={{
            position: "absolute",
            top: h * 0.038,
            left: 0,
            right: 0,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: w * 0.016,
            zIndex: 6,
          }}
        >
          {appIcon ? (
            <img
              src={appIcon}
              alt=""
              style={{ width: w * 0.05, height: w * 0.05, borderRadius: w * 0.012, objectFit: "cover", display: "inline-block" }}
            />
          ) : (
            <span style={{ width: w * 0.028, height: w * 0.028, borderRadius: w * 0.008, background: pal.accent, display: "inline-block" }} />
          )}
          <span style={{ fontFamily: fontFamily(design.font), fontWeight: 700, fontSize: w * 0.033, color: pal.fg, letterSpacing: -w * 0.0004 }}>
            {appName}
          </span>
        </div>
      )}

      {/* kicker pill + headline */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: p.text.top,
          bottom: p.text.bottom,
          height: big ? "100%" : undefined,
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
              letterSpacing: labelSize * 0.12,
              textTransform: "uppercase",
              color: readableOn(pal.tint),
              background: pal.tint,
              padding: `${labelSize * 0.46}px ${labelSize * 0.95}px`,
              borderRadius: 999,
              marginBottom: headlineSize * 0.24,
            }}
          >
            {slide.label}
          </div>
        )}
        <div
          style={{
            fontFamily: displayFamily(design.font),
            fontSize: headlineSize,
            fontWeight: condensed ? 400 : 800,
            lineHeight: condensed ? 0.92 : 1.03,
            letterSpacing: condensed ? -headlineSize * 0.005 : -headlineSize * 0.02,
            textTransform: condensed ? "uppercase" : "none",
            color: pal.fg,
            whiteSpace: "pre-line",
            maxWidth: p.text.maxWidth,
            textShadow: `0 2px 34px ${rgba(pal.base, 0.45)}`,
          }}
        >
          {main}
          <span style={{ color: pal.accent }}>{emph}</span>
        </div>
      </div>

      {/* device + backing glow */}
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
