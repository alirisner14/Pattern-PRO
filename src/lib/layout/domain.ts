import { latticeDistance, torusDistance, wrap, type DistanceFn, type Vec } from "./geometry";
import type { Rng } from "./rng";
import type { ShapeModel } from "../shapes/shapes";
import { pointInPolygon, polygonArea, signedDistance } from "../shapes/polygon";

// Where a layout lives and how its edges repeat.
export interface Domain {
  dist: DistanceFn;
  area: number;
  // Where the seams meet, and points along each distinct seam. Null/empty
  // when the region doesn't repeat edge to edge (nothing crosses its edge).
  seamCorner: Vec | null;
  seamSides: Vec[][];
  // Room before a circle would leave the region; absent when it wraps.
  bound?: (p: Vec) => number;
  sample: (rng: Rng) => Vec;
  normalize: (p: Vec) => Vec;
}

const SEAM_SAMPLES = 64;

export function rectDomain(width: number, height: number): Domain {
  return {
    dist: torusDistance(width, height),
    area: width * height,
    seamCorner: { x: 0, y: 0 },
    seamSides: [
      Array.from({ length: SEAM_SAMPLES + 1 }, (_, k) => ({ x: 0, y: (k * height) / SEAM_SAMPLES })),
      Array.from({ length: SEAM_SAMPLES + 1 }, (_, k) => ({ x: (k * width) / SEAM_SAMPLES, y: 0 })),
    ],
    sample: (rng) => ({ x: rng() * width, y: rng() * height }),
    normalize: (p) => ({ x: wrap(p.x, width), y: wrap(p.y, height) }),
  };
}

function sampleInside(poly: Vec[], width: number, height: number, rng: Rng): Vec {
  for (let attempt = 0; attempt < 10000; attempt++) {
    const p = { x: rng() * width, y: rng() * height };
    if (pointInPolygon(p, poly)) return p;
  }
  return { x: width / 2, y: height / 2 };
}

export function shapeDomain(shape: ShapeModel, width: number, height: number): Domain {
  const { region } = shape;
  const sample = (rng: Rng) => sampleInside(region, width, height, rng);

  if (shape.regionTiles) {
    const [t1, t2] = shape.translations;
    return {
      dist: latticeDistance(t1, t2),
      area: polygonArea(region),
      seamCorner: shape.seamCorner,
      seamSides: shape.seamSides,
      sample,
      normalize: (p) => {
        for (let i = -2; i <= 2; i++) {
          for (let j = -2; j <= 2; j++) {
            const q = { x: p.x + i * t1.x + j * t2.x, y: p.y + i * t1.y + j * t2.y };
            if (pointInPolygon(q, region)) return q;
          }
        }
        return p;
      },
    };
  }

  return {
    dist: torusDistance(width, height),
    area: shape.area ?? Math.min(width * height, polygonArea(region)),
    seamCorner: null,
    seamSides: [],
    bound: (p) => signedDistance(p, region),
    sample,
    normalize: (p) => ({ x: wrap(p.x, width), y: wrap(p.y, height) }),
  };
}
