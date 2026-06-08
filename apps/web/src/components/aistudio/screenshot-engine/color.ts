// Small colour utilities for the deterministic design system. No deps.

export type RGB = { r: number; g: number; b: number };

function clamp8(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

export function hexToRgb(hex: string): RGB {
  let h = hex.replace("#", "").trim();
  if (h.length === 3) h = h[0]! + h[0]! + h[1]! + h[1]! + h[2]! + h[2]!;
  const n = parseInt(h || "000000", 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgbToHex({ r, g, b }: RGB): string {
  const h = (clamp8(r) << 16) | (clamp8(g) << 8) | clamp8(b);
  return "#" + h.toString(16).padStart(6, "0");
}

/** rgba() string from a hex + alpha (0–1). */
export function rgba(hex: string, a: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/** Shift a colour toward black (amt<0) or white (amt>0). amt in -1..1. */
export function shade(hex: string, amt: number): string {
  const { r, g, b } = hexToRgb(hex);
  const t = amt < 0 ? 0 : 255;
  const p = Math.abs(amt);
  return rgbToHex({ r: r + (t - r) * p, g: g + (t - g) * p, b: b + (t - b) * p });
}

/** Blend two hex colours. t=0 → a, t=1 → b. */
export function mix(a: string, b: string, t: number): string {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return rgbToHex({ r: A.r + (B.r - A.r) * t, g: A.g + (B.g - A.g) * t, b: A.b + (B.b - A.b) * t });
}

export function luminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

export function isLight(hex: string): boolean {
  return luminance(hex) > 0.6;
}

/** A legible foreground (near-black or near-white) for a given background. */
export function readableOn(hex: string): string {
  return isLight(hex) ? "#14130f" : "#ffffff";
}
