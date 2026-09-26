export type ElementClass = "hero" | "secondary" | "filler";
import type {
  OgeeCurve,
  OgeeProportion,
  OgeeStyle,
  ShapeFit,
  ShapeModel,
  ShapeSides,
} from "../shapes/shapes";

export type RepeatStyle = "grid" | "scattered" | "half-drop" | "brick" | "diamond" | "ogee";

export interface ElementClassConfig {
  count: number;
  color: string;
}

export interface LayoutParams {
  widthPx: number;
  heightPx: number;
  repeatStyle: RepeatStyle;
  density: number;
  seed: number;
  hero: ElementClassConfig;
  secondary: ElementClassConfig;
  filler: ElementClassConfig;
  // Diamond/Ogee: the layout goes inside this shape.
  shape?: ShapeModel;
}

export interface PlacedElement {
  id: string;
  class: ElementClass;
  label: string;
  x: number;
  y: number;
  radius: number;
  color: string;
  // Direction of the indicator dot, in degrees clockwise from 3 o'clock.
  angle: number;
}

export interface LayoutResult {
  elements: PlacedElement[];
  warnings: string[];
}

export interface PatternSettings {
  repeatStyle: RepeatStyle;
  density: number;
  heroCount: number;
  secondaryCount: number;
  fillerCount: number;
  showEdgeRepeats: boolean;
  showShapeLayout: boolean;
  diamondSides: ShapeSides;
  shapeFit: ShapeFit;
  ogeeStyle: OgeeStyle;
  ogeeCurve: OgeeCurve;
  ogeeProportion: OgeeProportion;
  outlinePx: number;
  openAmount: number;
  innerCount: number;
  innerSpacing: number;
}
