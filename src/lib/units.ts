export type Unit = "px" | "pt" | "cm" | "mm" | "in";

export const UNIT_OPTIONS: { value: Unit; label: string }[] = [
  { value: "px", label: "Pixels (px)" },
  { value: "pt", label: "Points (pt)" },
  { value: "cm", label: "Centimeters (cm)" },
  { value: "mm", label: "Millimeters (mm)" },
  { value: "in", label: "Inches (in)" },
];

export const DEFAULT_DPI = 300;

export function toPixels(value: number, unit: Unit, dpi: number): number {
  switch (unit) {
    case "px":
      return value;
    case "pt":
      return (value / 72) * dpi;
    case "in":
      return value * dpi;
    case "cm":
      return (value / 2.54) * dpi;
    case "mm":
      return (value / 25.4) * dpi;
  }
}

export interface CanvasConfig {
  unit: Unit;
  rawWidth: number;
  rawHeight: number;
  dpi: number;
  widthPx: number;
  heightPx: number;
}

export function buildCanvasConfig(
  rawWidth: number,
  rawHeight: number,
  unit: Unit,
  dpi: number
): CanvasConfig {
  return {
    unit,
    rawWidth,
    rawHeight,
    dpi,
    widthPx: Math.round(toPixels(rawWidth, unit, dpi)),
    heightPx: Math.round(toPixels(rawHeight, unit, dpi)),
  };
}
