import { latticeDistance, torusDistance, wrap, type DistanceFn, type Vec } from "./geometry";
import type { Rng } from "./rng";

// Where a layout lives and how its edges repeat.
export interface Domain {
  dist: DistanceFn;
  area: number;
  // A point where both seams meet (canvas corner / diamond vertex).
  seamCorner: Vec;
  // One segment per distinct seam (opposite edges are the same seam).
  seams: { start: Vec; along: Vec }[];
  sample: (rng: Rng) => Vec;
  normalize: (p: Vec) => Vec;
}

export function rectDomain(width: number, height: number): Domain {
  return {
    dist: torusDistance(width, height),
    area: width * height,
    seamCorner: { x: 0, y: 0 },
    seams: [
      { start: { x: 0, y: 0 }, along: { x: 0, y: height } },
      { start: { x: 0, y: 0 }, along: { x: width, y: 0 } },
    ],
    sample: (rng) => ({ x: rng() * width, y: rng() * height }),
    normalize: (p) => ({ x: wrap(p.x, width), y: wrap(p.y, height) }),
  };
}

// 0 at the centre, 1 on the diamond's outline.
export function diamondNorm(p: Vec, width: number, height: number): number {
  return Math.abs(p.x - width / 2) / (width / 2) + Math.abs(p.y - height / 2) / (height / 2);
}

// Offsetting copies of the diamond by half the canvas diagonally is what
// makes the Diamond Method seamless: whatever leaves one edge of the
// diamond re-enters through the opposite edge.
export function diamondTranslations(width: number, height: number): [Vec, Vec] {
  return [
    { x: width / 2, y: height / 2 },
    { x: width / 2, y: -height / 2 },
  ];
}

export function diamondDomain(width: number, height: number): Domain {
  const [t1, t2] = diamondTranslations(width, height);
  return {
    dist: latticeDistance(t1, t2),
    area: (width * height) / 2,
    seamCorner: { x: width / 2, y: 0 },
    seams: [
      { start: { x: 0, y: height / 2 }, along: t2 },
      { start: { x: width / 2, y: 0 }, along: t1 },
    ],
    sample: (rng) => {
      for (;;) {
        const p = { x: rng() * width, y: rng() * height };
        if (diamondNorm(p, width, height) <= 1) return p;
      }
    },
    normalize: (p) => {
      for (let i = -2; i <= 2; i++) {
        for (let j = -2; j <= 2; j++) {
          const q = { x: p.x + i * t1.x + j * t2.x, y: p.y + i * t1.y + j * t2.y };
          if (diamondNorm(q, width, height) <= 1) return q;
        }
      }
      return p;
    },
  };
}
