import { diamondNorm, diamondTranslations } from "./domain";
import type { Vec } from "./geometry";
import type { PlacedElement } from "./types";

export type Shape = "rect" | "diamond";

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

function diamondGeometry(width: number, height: number): ShapeGeometry {
  const a = width / 2;
  const b = height / 2;
  // Distance from the centre to each side, per unit of diamond "norm".
  const apothem = (a * b) / Math.hypot(a, b);
  return {
    translations: diamondTranslations(width, height),
    inset: (p) => (1 - diamondNorm(p, width, height)) * apothem,
    // The norm shrinks linearly toward the centre, so walking straight in
    // reaches the required margin at a closed-form fraction of the way.
    labelPoint: (p, pad) => {
      const k = diamondNorm(p, width, height);
      const s = k > 0 ? clamp(1 - (1 - pad / apothem) / k, 0, 1) : 0;
      return { x: p.x + s * (a - p.x), y: p.y + s * (b - p.y) };
    },
  };
}

// Every visible fragment of every circle — including the clones that wrap
// onto the opposite edge(s) — with its label pulled into the visible part so
// split pairs can be matched across margins.
export function renderCircles(
  elements: PlacedElement[],
  width: number,
  height: number,
  showEdgeRepeats: boolean,
  shape: Shape
): RenderedCircle[] {
  const geo = shape === "diamond" ? diamondGeometry(width, height) : rectGeometry(width, height);
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
