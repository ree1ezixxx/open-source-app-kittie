// Designed background treatments. Each returns full-bleed inline-styled layers
// (deterministic for html-to-image). Driven by the resolved Palette so brand
// colours flow through. Overlay alphas stay modest so headline text keeps
// contrast on both light and dark bases.

import type { CSSProperties, ReactNode } from "react";
import type { BackgroundStyle, Palette } from "./types";
import { rgba, shade, mix, isLight } from "./color";

function Layer({ style }: { style: CSSProperties }) {
  return <div style={{ position: "absolute", inset: 0, ...style }} />;
}

export function SlideBackground({
  background,
  palette,
  seed,
}: {
  background: BackgroundStyle;
  palette: Palette;
  seed: number;
}) {
  const { base, base2, accent, brand, tint } = palette;
  const light = isLight(base);
  // Subtler overlays on light bases (colour reads stronger on white).
  const a = light ? 0.5 : 0.42;
  const flip = seed % 2 === 1;

  // Edge vignette adds depth (stronger on dark bases). Sits above the treatment.
  const vignette = (
    <Layer
      style={{
        background: `radial-gradient(125% 115% at 50% 38%, transparent 52%, ${rgba("#000000", light ? 0.08 : 0.34)} 100%)`,
        pointerEvents: "none",
      }}
    />
  );

  let treatment: ReactNode;
  switch (background) {
    case "solid":
      treatment = <Layer style={{ background: base }} />;
      break;

    case "minimal":
      // Near-solid base with one whisper-soft tint for depth.
      treatment = (
        <>
          <Layer style={{ background: base }} />
          <Layer
            style={{
              backgroundImage: `radial-gradient(80% 60% at ${flip ? 78 : 22}% 0%, ${rgba(accent, light ? 0.06 : 0.1)} 0%, transparent 70%)`,
            }}
          />
        </>
      );
      break;

    case "spotlight":
      treatment = (
        <>
          <Layer style={{ background: base }} />
          <Layer
            style={{
              backgroundImage: `radial-gradient(60% 40% at ${flip ? 80 : 20}% 12%, ${rgba(accent, 0.22)} 0%, transparent 70%), radial-gradient(50% 35% at ${flip ? 10 : 90}% 85%, ${rgba(brand, 0.18)} 0%, transparent 70%)`,
            }}
          />
        </>
      );
      break;

    case "gradient":
      treatment = (
        <Layer
          style={{
            background: `linear-gradient(${flip ? 200 : 155}deg, ${shade(base, light ? 0.04 : 0.08)} 0%, ${base} 45%, ${mix(base, accent, light ? 0.12 : 0.2)} 100%)`,
          }}
        />
      );
      break;

    case "glass":
      // Frosted panels: tinted wash + accent bloom + diagonal light sheen.
      treatment = (
        <>
          <Layer style={{ background: `linear-gradient(${flip ? 160 : 200}deg, ${mix(base, accent, light ? 0.1 : 0.16)} 0%, ${base} 60%)` }} />
          <Layer style={{ backgroundImage: `radial-gradient(45% 30% at ${flip ? 25 : 75}% 18%, ${rgba(brand, 0.2)} 0%, transparent 70%)` }} />
          <Layer style={{ background: `linear-gradient(115deg, ${rgba("#ffffff", light ? 0.18 : 0.06)} 0%, transparent 38%, transparent 62%, ${rgba("#ffffff", light ? 0.1 : 0.04)} 100%)` }} />
        </>
      );
      break;

    case "layered":
      // Overlapping diagonal colour bands + grounding shade.
      treatment = (
        <>
          <Layer style={{ background: base }} />
          <Layer style={{ background: `linear-gradient(${flip ? 135 : 45}deg, ${rgba(brand, light ? 0.26 : 0.3)} 0%, transparent 50%)` }} />
          <Layer style={{ background: `linear-gradient(${flip ? 45 : 135}deg, transparent 50%, ${rgba(accent, light ? 0.24 : 0.28)} 100%)` }} />
          <Layer style={{ background: `linear-gradient(180deg, transparent 62%, ${rgba(shade(base, light ? 0.06 : 0.12), 0.6)} 100%)` }} />
        </>
      );
      break;

    case "pattern":
      // Faint dot grid over base + soft top bloom.
      treatment = (
        <>
          <Layer style={{ background: base }} />
          <Layer
            style={{
              backgroundImage: `radial-gradient(${rgba(accent, light ? 0.16 : 0.22)} 1.5px, transparent 1.6px)`,
              backgroundSize: "34px 34px",
            }}
          />
          <Layer style={{ backgroundImage: `radial-gradient(70% 55% at 50% 16%, ${rgba(brand, 0.12)} 0%, transparent 70%)` }} />
        </>
      );
      break;

    case "blurred":
      // A few oversized soft blobs (mesh's softer cousin; no CSS blur so it
      // exports cleanly via html-to-image).
      treatment = (
        <>
          <Layer style={{ background: base2 }} />
          <Layer
            style={{
              backgroundImage: [
                `radial-gradient(55% 45% at ${flip ? 72 : 28}% 22%, ${rgba(accent, a)} 0%, transparent 60%)`,
                `radial-gradient(50% 42% at ${flip ? 22 : 78}% 80%, ${rgba(brand, a * 0.9)} 0%, transparent 62%)`,
              ].join(", "),
            }}
          />
        </>
      );
      break;

    case "mesh":
    default:
      treatment = (
        <>
          <Layer style={{ background: base2 }} />
          <Layer
            style={{
              backgroundImage: [
                `radial-gradient(at ${flip ? 78 : 18}% 16%, ${rgba(accent, a)} 0px, transparent 45%)`,
                `radial-gradient(at ${flip ? 12 : 88}% 4%, ${rgba(brand, a * 0.85)} 0px, transparent 42%)`,
                `radial-gradient(at 50% 96%, ${rgba(tint, a * 0.72)} 0px, transparent 50%)`,
                `radial-gradient(at ${flip ? 92 : 8}% 70%, ${rgba(shade(accent, 0.2), a * 0.6)} 0px, transparent 45%)`,
              ].join(", "),
            }}
          />
        </>
      );
  }

  return (
    <>
      {treatment}
      {vignette}
    </>
  );
}
