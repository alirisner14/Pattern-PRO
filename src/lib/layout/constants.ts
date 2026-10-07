import type { ElementClass } from "./types";

// Taken from the Pattern PRO logo.
export const DEFAULT_CLASS_COLORS: Record<ElementClass, string> = {
  xl: "#ff9f1c",
  hero: "#ff5a86",
  secondary: "#b500ff",
  filler: "#00ffd1",
  xs: "#3d8bff",
};

// Circle size of each tier relative to the Hero tier. These never change:
// turning tiers on or off or changing how many motifs a tier has only changes
// the arrangement, never the size of any circle.
export const RADIUS_RATIO: Record<ElementClass, number> = {
  xl: 1.6,
  hero: 1,
  secondary: 0.5,
  filler: 0.27,
  xs: 0.13,
};
