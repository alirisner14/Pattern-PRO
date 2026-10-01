export type ElementClass = "hero" | "secondary" | "filler";
import type {
  OgeeCurve,
  OgeeProportion,
  OgeeStyle,
  ShapeFit,
  ShapeModel,
  ShapeSides,
} from "../shapes/shapes";

export type RepeatStyle =
  | "grid"
  | "scattered"
  | "half-drop"
  | "brick"
  | "lattice"
  | "mirror"
  | "ditsy"
  | "diamond"
  | "ogee";

// Main: the three tiers. Large: a back layer of extra-large elements only.
// Small: a texture layer of extra-small elements, optionally overlapping.
export type LayerType = "main" | "large" | "small";

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
  layer?: LayerType;
  // Small layer: elements may overlap once it gets dense.
  allowOverlap?: boolean;
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
  // Lattice: the trellis cell size, for drawing its lines.
  trellis?: { cellW: number; cellH: number };
  // Mirror: the canvas's centre lines are mirror axes.
  mirrorAxes?: boolean;
  warnings: string[];
}

export interface PatternSettings {
  layer: LayerType;
  largeCount: number;
  smallCount: number;
  allowOverlap: boolean;
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
