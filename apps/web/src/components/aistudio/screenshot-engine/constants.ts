// Ported from ParthJadhav/app-store-screenshots (MIT). Canvas + export
// dimensions, the pre-measured iPhone screen overlay, and the theme palette.
// Trimmed to Apple devices (iPhone + iPad) for the App Store screenshot flow.

import type { BackgroundStyle, Device, FlowStrategy, FontId, Theme, ThemeId } from "./types";

// ---------- Canvas dimensions (design at largest required resolution) ----------
export const CANVAS: Record<Device, { w: number; h: number }> = {
  iphone: { w: 1320, h: 2868 },
  ipad: { w: 2064, h: 2752 },
};

// ---------- Export sizes per device (exact App Store requirements) ----------
export type ExportSize = { label: string; w: number; h: number };

export const EXPORT_SIZES: Record<Device, ExportSize[]> = {
  iphone: [
    { label: '6.9"', w: 1320, h: 2868 },
    { label: '6.5"', w: 1284, h: 2778 },
    { label: '6.3"', w: 1206, h: 2622 },
    { label: '6.1"', w: 1125, h: 2436 },
  ],
  ipad: [
    { label: '13" iPad', w: 2064, h: 2752 },
    { label: '12.9" iPad Pro', w: 2048, h: 2732 },
  ],
};

export const DEVICE_LABEL: Record<Device, string> = {
  iphone: "iPhone",
  ipad: "iPad",
};

// ---------- Frame aspect ratios ----------
export const MK_RATIO = 1022 / 2082; // iPhone PNG mockup
export const IPAD_RATIO = 0.77; // iPad bezel

// iPhone mockup screen overlay (pre-measured against mockup.png)
export const PHONE_SCREEN = {
  L: (52 / 1022) * 100,
  T: (46 / 2082) * 100,
  W: (918 / 1022) * 100,
  H: (1990 / 2082) * 100,
  RX: (126 / 918) * 100,
  RY: (126 / 1990) * 100,
};

// Device width as a fraction of canvas width, derived from canvas aspect.
export function phoneW(cW: number, cH: number, clamp = 0.84) {
  return Math.min(clamp, 0.72 * (cH / cW) * MK_RATIO);
}
export function ipadW(cW: number, cH: number, clamp = 0.75) {
  return Math.min(clamp, 0.72 * (cH / cW) * IPAD_RATIO);
}

// ---------- Themes ----------
export const DEFAULT_THEME_ID: ThemeId = "clean-light";

export const THEMES: Record<string, Theme> = {
  "clean-light": {
    id: "clean-light",
    name: "Clean Light",
    bg: "#F6F1EA",
    bgAlt: "#171717",
    fg: "#171717",
    fgAlt: "#F6F1EA",
    accent: "#5B7CFA",
    muted: "#6B7280",
  },
  "dark-bold": {
    id: "dark-bold",
    name: "Dark Bold",
    bg: "#0B1020",
    bgAlt: "#F8FAFC",
    fg: "#F8FAFC",
    fgAlt: "#0B1020",
    accent: "#8B5CF6",
    muted: "#94A3B8",
  },
  "warm-editorial": {
    id: "warm-editorial",
    name: "Warm Editorial",
    bg: "#F7E8DA",
    bgAlt: "#2B1D17",
    fg: "#2B1D17",
    fgAlt: "#F7E8DA",
    accent: "#D97706",
    muted: "#7C5A47",
  },
  "ocean-fresh": {
    id: "ocean-fresh",
    name: "Ocean Fresh",
    bg: "#E0F2FE",
    bgAlt: "#0C4A6E",
    fg: "#0C4A6E",
    fgAlt: "#E0F2FE",
    accent: "#0284C7",
    muted: "#475569",
  },
  "bloom-roast": {
    id: "bloom-roast",
    name: "Bloom Roast",
    bg: "#F2ECE2",
    bgAlt: "#24352F",
    fg: "#1D2420",
    fgAlt: "#FFF7EA",
    accent: "#B8794A",
    muted: "#65736B",
  },
};

export function themeById(themeId: string | undefined): Theme {
  return THEMES[themeId || ""] || THEMES[DEFAULT_THEME_ID]!;
}

// ---------- Fonts (loaded in index.html) ----------
// `display` is the heavy/condensed face used for poster headlines; `family` is
// the face used for body/kickers. Most fonts share one; condensed faces differ.
export const FONTS: Record<FontId, { label: string; family: string; display: string }> = {
  anton: { label: "Anton", family: '"Archivo", system-ui, sans-serif', display: '"Anton", "Archivo Black", system-ui, sans-serif' },
  grotesk: { label: "Space Grotesk", family: '"Space Grotesk", system-ui, sans-serif', display: '"Space Grotesk", system-ui, sans-serif' },
  archivo: { label: "Archivo Black", family: '"Archivo", system-ui, sans-serif', display: '"Archivo Black", system-ui, sans-serif' },
  poppins: { label: "Poppins", family: '"Poppins", system-ui, sans-serif', display: '"Poppins", system-ui, sans-serif' },
  playfair: { label: "Playfair Display", family: '"Playfair Display", Georgia, serif', display: '"Playfair Display", Georgia, serif' },
  inter: { label: "Inter", family: '"Inter", system-ui, sans-serif', display: '"Inter", system-ui, sans-serif' },
  dmsans: { label: "DM Sans", family: '"DM Sans", system-ui, sans-serif', display: '"DM Sans", system-ui, sans-serif' },
};

export function fontFamily(id: FontId): string {
  return (FONTS[id] ?? FONTS.grotesk).family;
}

export function displayFamily(id: FontId): string {
  return (FONTS[id] ?? FONTS.grotesk).display;
}

// ---------- Background styles (for the picker) ----------
export const BACKGROUNDS: { value: BackgroundStyle; label: string }[] = [
  { value: "mesh", label: "Mesh" },
  { value: "gradient", label: "Gradient" },
  { value: "duotone", label: "Duotone" },
  { value: "glow", label: "Glow" },
  { value: "solid", label: "Solid" },
];

// ---------- Flow strategies (for the picker) ----------
export const FLOWS: { value: FlowStrategy; label: string }[] = [
  { value: "default", label: "Default" },
  { value: "hero-split", label: "Hero split" },
  { value: "alternating-split", label: "Alternating split" },
];
