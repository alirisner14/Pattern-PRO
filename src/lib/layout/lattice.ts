import type { RepeatStyle } from "./types";

export interface Point {
  x: number;
  y: number;
}

// A dense, periodic candidate grid that already carries the chosen
// repeat style's column/row offset, so anything sampled from it keeps
// that drop structure instead of looking randomly placed.
export function generateCandidateLattice(
  widthPx: number,
  heightPx: number,
  repeatStyle: RepeatStyle,
  targetCount: number
): Point[] {
  const desiredCandidates = Math.max(targetCount * 6, 24);
  const aspect = widthPx / heightPx;
  const rows = Math.max(1, Math.round(Math.sqrt(desiredCandidates / aspect)));
  const cols = Math.max(1, Math.round(desiredCandidates / rows));

  const cellW = widthPx / cols;
  const cellH = heightPx / rows;

  const points: Point[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      let x = (col + 0.5) * cellW;
      let y = (row + 0.5) * cellH;

      if (repeatStyle === "half-drop" && col % 2 === 1) {
        y += cellH / 2;
      }
      if (repeatStyle === "brick" && row % 2 === 1) {
        x += cellW / 2;
      }

      // The offset can push a point past the canvas edge — wrap it to
      // the opposite side so the lattice stays periodic (its seamless
      // counterpart re-enters where this one exits).
      x = ((x % widthPx) + widthPx) % widthPx;
      y = ((y % heightPx) + heightPx) % heightPx;

      points.push({ x, y });
    }
  }
  return points;
}
