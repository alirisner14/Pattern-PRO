import { DEFAULT_CLASS_COLORS } from "@/lib/layout/constants";
import type { ElementClass } from "@/lib/layout/types";

export type TierColors = Record<ElementClass, string>;

const STORAGE_KEY = "patternspro.tierColors";
const HEX = /^#[0-9a-f]{6}$/i;

// Storage can be missing or blocked (private mode, cleared data), so any
// failure just falls back to the defaults.
export function loadTierColors(): TierColors {
  const colors = { ...DEFAULT_CLASS_COLORS };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    for (const cls of Object.keys(colors) as ElementClass[]) {
      if (typeof saved[cls] === "string" && HEX.test(saved[cls])) colors[cls] = saved[cls];
    }
  } catch {}
  return colors;
}

export function saveTierColors(colors: TierColors): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(colors));
  } catch {}
}
