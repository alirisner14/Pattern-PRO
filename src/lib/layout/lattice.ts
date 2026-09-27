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
  target: number,
): Lattice {
  // Keep cells as close to square as the canvas allows — uneven cells make
  // the gap geometry (and therefore how the smaller tiers pack) lurch around
  // as density changes.
  const aspect = width / height;
  // Lattice puts an anchor in every diamond of the trellis — two per square
  // cell (its centre and its corner) — so it needs half as many cells.
  const perCell = style === "lattice" ? 2 : 1;
  let cols = Math.max(1, Math.round(Math.sqrt((target / perCell) * aspect)));
  if (style === "half-drop" && cols % 2 === 1) cols += 1;
  let rows = Math.max(1, Math.round(height / (width / cols)));
  if (style === "brick" && rows % 2 === 1) rows += 1;

  const cellW = width / cols;
  const cellH = height / rows;

  if (style === "lattice") {
    const anchors: Vec[] = [];
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        anchors.push({ x: c * cellW, y: r * cellH });
        anchors.push({ x: (c + 0.5) * cellW, y: (r + 0.5) * cellH });
      }
    }
    const t1 = { x: cellW / 2, y: cellH / 2 };
    const t2 = { x: cellW / 2, y: -cellH / 2 };
    return { anchors, t1, t2, cellW, cellH, spacing: shortestVector(t1, t2) };
  }

  const t1 =
    style === "half-drop" ? { x: cellW, y: cellH / 2 } : { x: cellW, y: 0 };
  const t2 =
    style === "brick" ? { x: cellW / 2, y: cellH } : { x: 0, y: cellH };

  const anchors: Vec[] = [];
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      const x =
        (c + 0.5) * cellW + (style === "brick" && r % 2 === 1 ? cellW / 2 : 0);
      const y =
        (r + 0.5) * cellH +
        (style === "half-drop" && c % 2 === 1 ? cellH / 2 : 0);
      anchors.push({ x: wrap(x, width), y: wrap(y, height) });
    }
  }

  return { anchors, t1, t2, cellW, cellH, spacing: shortestVector(t1, t2) };
}

// Trellis line thickness, matched to the placeholder circles' stroke.
export function trellisLineWidth(width: number, height: number): number {
  return Math.max(3, Math.min(width, height) * 0.0035);
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
