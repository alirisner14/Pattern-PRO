import type { ElementClass } from "./types";

// Taken from the Pattern PRO logo.
export const DEFAULT_CLASS_COLORS: Record<ElementClass, string> = {
  hero: "#ff5a86",
  secondary: "#b500ff",
  filler: "#00ffd1",
};

// Circle size of each tier relative to the Hero tier.
export const RADIUS_RATIO: Record<ElementClass, number> = {
  hero: 1,
  secondary: 0.5,
  filler: 0.27,
};
