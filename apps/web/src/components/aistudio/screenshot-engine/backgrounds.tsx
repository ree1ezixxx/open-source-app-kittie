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
  const { base, base2, accent, brand } = palette;
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

    case "glow":
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

    case "duotone":
      treatment = (
        <>
          <Layer style={{ background: base }} />
          <Layer
            style={{
              background: `linear-gradient(${flip ? 145 : 35}deg, ${rgba(brand, light ? 0.28 : 0.32)} 0%, transparent 55%, ${rgba(accent, light ? 0.26 : 0.3)} 100%)`,
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
                `radial-gradient(at 50% 96%, ${rgba(mix(accent, brand, 0.5), a * 0.7)} 0px, transparent 50%)`,
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
