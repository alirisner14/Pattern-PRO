import { wrap, type Vec } from "./geometry";
import type { RepeatStyle } from "./types";

export interface Lattice {
  anchors: Vec[];
  t1: Vec;
  t2: Vec;
  cellW: number;
  cellH: number;
  spacing: number;
}

// The anchor grid for the chosen repeat style. Half-drop needs an even
// column count (and brick an even row count) so the offset columns/rows
// still line up when the canvas wraps edge to edge.
export function buildLattice(
  width: number,
  height: number,
  style: RepeatStyle,
  target: number
): Lattice {
  // Keep cells as close to square as the canvas allows — uneven cells make
  // the gap geometry (and therefore how the smaller tiers pack) lurch around
  // as density changes.
  const aspect = width / height;
  let cols = Math.max(1, Math.round(Math.sqrt(target * aspect)));
  if (style === "half-drop" && cols % 2 === 1) cols += 1;
  let rows = Math.max(1, Math.round(height / (width / cols)));
  if (style === "brick" && rows % 2 === 1) rows += 1;

  const cellW = width / cols;
  const cellH = height / rows;
  const t1 = style === "half-drop" ? { x: cellW, y: cellH / 2 } : { x: cellW, y: 0 };
  const t2 = style === "brick" ? { x: cellW / 2, y: cellH } : { x: 0, y: cellH };

  const anchors: Vec[] = [];
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      const x = (c + 0.5) * cellW + (style === "brick" && r % 2 === 1 ? cellW / 2 : 0);
      const y = (r + 0.5) * cellH + (style === "half-drop" && c % 2 === 1 ? cellH / 2 : 0);
      anchors.push({ x: wrap(x, width), y: wrap(y, height) });
    }
  }

  return { anchors, t1, t2, cellW, cellH, spacing: shortestVector(t1, t2) };
}

function shortestVector(t1: Vec, t2: Vec): number {
  let spacing = Infinity;
  for (let i = -2; i <= 2; i++) {
    for (let j = -2; j <= 2; j++) {
      if (i === 0 && j === 0) continue;
      const len = Math.hypot(i * t1.x + j * t2.x, i * t1.y + j * t2.y);
      if (len < spacing) spacing = len;
    }
  }
  return spacing;
}
