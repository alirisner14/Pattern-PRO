import type { ElementClass } from "./types";

export const DEFAULT_CLASS_COLORS: Record<ElementClass, string> = {
  hero: "#ff2e93",
  secondary: "#00c2b8",
  filler: "#8b3dff",
};

// Circle size of each tier relative to the Hero tier.
export const RADIUS_RATIO: Record<ElementClass, number> = {
  hero: 1,
  secondary: 0.5,
  filler: 0.27,
};
