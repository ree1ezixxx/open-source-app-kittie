/* Stable color-per-category, Attio-style muted pills. */
const COLORS = [
  "#6aa3ff", // blue
  "#b894ff", // purple
  "#5fd08a", // green
  "#f5b545", // amber
  "#ff85c0", // pink
  "#4fd0d8", // cyan
  "#ff8a6b", // coral
  "#8c9bff", // indigo
  "#3fc7a8", // teal
  "#ffa64d", // orange
  "#c6f24d", // lime
  "#e0729b", // rose
  "#7dd3fc", // sky
  "#d4b06a", // sand
  "#a3e635", // chartreuse
];

export function categoryColor(category: string | null | undefined): string {
  if (!category) return "#8a8a92";
  let h = 0;
  for (let i = 0; i < category.length; i++) h = (h * 31 + category.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length] ?? "#8a8a92";
}

export function pillStyle(color: string): React.CSSProperties {
  return {
    color,
    background: `color-mix(in srgb, ${color} 14%, transparent)`,
    borderColor: `color-mix(in srgb, ${color} 26%, transparent)`,
  };
}
