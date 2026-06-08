// Scales a full-resolution SlideCanvas down to a target display width for
// on-screen previews and history thumbnails. Export always uses the full-size
// canvas (see GenerationResult's hidden layer), never this scaled wrapper.

import { CANVAS } from "./constants";
import type { Device, DesignSpec, Slide, Theme } from "./types";
import { SlideCanvas } from "./SlideCanvas";

export function SlidePreview({
  slide,
  theme,
  device,
  design,
  width,
  radius = 14,
}: {
  slide: Slide;
  theme: Theme;
  device: Device;
  design: DesignSpec;
  width: number;
  radius?: number;
}) {
  const { w, h } = CANVAS[device];
  const scale = width / w;
  return (
    <div
      style={{
        width,
        height: h * scale,
        overflow: "hidden",
        borderRadius: radius,
        border: "1px solid var(--border, rgba(255,255,255,0.08))",
        flexShrink: 0,
      }}
    >
      <div style={{ width: w, height: h, transform: `scale(${scale})`, transformOrigin: "top left" }}>
        <SlideCanvas slide={slide} theme={theme} device={device} design={design} />
      </div>
    </div>
  );
}
