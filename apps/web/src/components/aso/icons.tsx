/* Lane B — ASO-specific glyphs not in the shared set. 1.6 stroke, 24 grid. */
import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;
const base = (props: P) => ({
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  ...props,
});

export const IconPlus = (p: P) => (
  <svg {...base(p)}><path d="M12 5v14M5 12h14" /></svg>
);
export const IconKey = (p: P) => (
  <svg {...base(p)}><circle cx="8" cy="8" r="5" /><path d="M11.5 11.5L21 21" /><path d="M17 17l2-2M14 14l2-2" /></svg>
);
export const IconLayers = (p: P) => (
  <svg {...base(p)}><path d="M12 3l9 5-9 5-9-5 9-5z" /><path d="M3 13l9 5 9-5" /></svg>
);
export const IconBolt = (p: P) => (
  <svg {...base(p)} fill="currentColor" stroke="none"><path d="M13 2L4.5 13.5H11l-1 8.5 8.5-11.5H12l1-8.5z" /></svg>
);
export const IconTrash = (p: P) => (
  <svg {...base(p)}><path d="M4 7h16" /><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /><path d="M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12" /></svg>
);
export const IconCheck = (p: P) => (
  <svg {...base(p)}><path d="M5 12.5l4.5 4.5L19 7" /></svg>
);
