import type { Vec } from "./geometry";
import type { PlacedElement } from "./types";
import { diamondTranslations } from "../shapes/shapes";
import { signedDistance } from "../shapes/polygon";

export interface RenderedCircle {
  key: string;
  cx: number;
  cy: number;
  r: number;
  color: string;
  label: string;
  labelX: number;
  labelY: number;
  fontSize: number;
  split: boolean;
  // Indicator dot on the perimeter. Each piece of a split circle carries it
  // at the same relative spot, so exactly one visible piece shows it.
  dotX: number;
  dotY: number;
}

const OFFSETS = [-1, 0, 1];

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

interface ShapeGeometry {
  translations: [Vec, Vec];
  // Signed distance to the outline: positive inside, negative outside.
  inset: (p: Vec) => number;
  // Nearest point at least `pad` inside the outline, for label placement.
  labelPoint: (p: Vec, pad: number) => Vec;
}

function rectGeometry(width: number, height: number): ShapeGeometry {
  return {
    translations: [
      { x: width, y: 0 },
      { x: 0, y: height },
    ],
    inset: (p) => Math.min(p.x, width - p.x, p.y, height - p.y),
    labelPoint: (p, pad) => ({
      x: clamp(p.x, pad, width - pad),
      y: clamp(p.y, pad, height - pad),
    }),
  };
}

function tileGeometry(polygon: Vec[], width: number, height: number): ShapeGeometry {
  const centre = { x: width / 2, y: height / 2 };
  const inset = (p: Vec) => signedDistance(p, polygon);
  const toward = (p: Vec, s: number) => ({
    x: p.x + s * (centre.x - p.x),
    y: p.y + s * (centre.y - p.y),
  });
  return {
    translations: diamondTranslations(width, height),
    inset,
    // Walk from the fragment's centre toward the shape's centre until the
    // point sits at least `pad` inside the outline.
    labelPoint: (p, pad) => {
      if (inset(p) >= pad) return p;
      let lo = 0;
      let hi = 1;
      for (let k = 0; k < 24; k++) {
        const mid = (lo + hi) / 2;
        if (inset(toward(p, mid)) >= pad) hi = mid;
        else lo = mid;
      }
      return toward(p, hi);
    },
  };
}

// Rect: the canvas edges repeat. Tile: a shape that repeats edge to edge on
// the diamond lattice, so its own outline is the seam.
export type CircleFrame = { kind: "rect" } | { kind: "tile"; polygon: Vec[] };

// Every visible fragment of every circle — including the clones that wrap
// onto the opposite edge(s) — with its label pulled into the visible part so
// split pairs can be matched across margins.
export function renderCircles(
  elements: PlacedElement[],
  width: number,
  height: number,
  showEdgeRepeats: boolean,
  frame: CircleFrame
): RenderedCircle[] {
  const geo =
    frame.kind === "tile"
      ? tileGeometry(frame.polygon, width, height)
      : rectGeometry(width, height);
  const [t1, t2] = geo.translations;
  const out: RenderedCircle[] = [];

  for (const el of elements) {
    const crossesEdge = geo.inset(el) < el.radius;
    const fullSize = el.radius * 0.55;

    for (const i of OFFSETS) {
      for (const j of OFFSETS) {
        const isOriginal = i === 0 && j === 0;
        if (!isOriginal && !showEdgeRepeats) continue;

        const c = { x: el.x + i * t1.x + j * t2.x, y: el.y + i * t1.y + j * t2.y };
        if (!isOriginal && geo.inset(c) <= -el.radius) continue;

        // Every visible piece must say what it is. Shrink the label until it
        // fits inside the fragment; if even the smallest won't, it sits just
        // outside the sliver (still inside the canvas) — usability over looks.
        let fontSize = fullSize;
        let label = geo.labelPoint(c, fontSize * 0.9);
        let fits = Math.hypot(label.x - c.x, label.y - c.y) <= el.radius - fontSize * 0.6;
        for (const scale of [0.7, 0.5]) {
          if (fits) break;
          fontSize = fullSize * scale;
          label = geo.labelPoint(c, fontSize * 0.9);
          fits = Math.hypot(label.x - c.x, label.y - c.y) <= el.radius - fontSize * 0.6;
        }

        out.push({
          key: `${el.id}:${i}:${j}`,
          cx: c.x,
          cy: c.y,
          r: el.radius,
          color: el.color,
          label: el.label,
          labelX: label.x,
          labelY: label.y,
          fontSize,
          split: crossesEdge,
          dotX: c.x + el.radius * Math.cos((el.angle * Math.PI) / 180),
          dotY: c.y + el.radius * Math.sin((el.angle * Math.PI) / 180),
        });
      }
    }
  }

  return out;
}
