import type { ElementClass } from "./types";

export const DEFAULT_CLASS_COLORS: Record<ElementClass, string> = {
  hero: "#e11d48",
  secondary: "#2563eb",
  filler: "#16a34a",
};

// Circle size of each tier relative to the Hero tier.
export const RADIUS_RATIO: Record<ElementClass, number> = {
  hero: 1,
  secondary: 0.5,
  filler: 0.27,
};
