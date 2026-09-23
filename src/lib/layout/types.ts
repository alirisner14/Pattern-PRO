export type ElementClass = "hero" | "secondary" | "filler";
export type RepeatStyle = "full-drop" | "half-drop" | "brick";
export type Alignment = "grid" | "scattered";

export interface ElementClassConfig {
  count: number;
  color: string;
}

export interface LayoutParams {
  widthPx: number;
  heightPx: number;
  repeatStyle: RepeatStyle;
  alignment: Alignment;
  density: number;
  seed: number;
  hero: ElementClassConfig;
  secondary: ElementClassConfig;
  filler: ElementClassConfig;
}

export interface PlacedElement {
  id: string;
  class: ElementClass;
  label: string;
  x: number;
  y: number;
  radius: number;
  color: string;
}

export interface PatternSettings {
  repeatStyle: RepeatStyle;
  alignment: Alignment;
  density: number;
  heroCount: number;
  secondaryCount: number;
  fillerCount: number;
}
