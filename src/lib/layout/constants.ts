import type { ElementClass } from "./types";

export const DEFAULT_CLASS_COLORS: Record<ElementClass, string> = {
  hero: "#e11d48",
  secondary: "#2563eb",
  filler: "#16a34a",
};

export const RADIUS_RATIO: Record<ElementClass, number> = {
  hero: 0.42,
  secondary: 0.26,
  filler: 0.16,
};
