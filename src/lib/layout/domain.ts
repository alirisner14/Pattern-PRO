import {
  flatDelta,
  flatDistance,
  latticeDelta,
  latticeDistance,
  torusDelta,
  torusDistance,
  type DeltaFn,
  wrap,
  type DistanceFn,
  type Vec,
} from "./geometry";
import type { Rng } from "./rng";
import type { ShapeModel } from "../shapes/shapes";
import { pointInPolygon, polygonArea, signedDistance } from "../shapes/polygon";

// Where a layout lives and how its edges repeat.
export interface Domain {
  dist: DistanceFn;
  // Shortest offset between two points (matches dist).
  delta: DeltaFn;
  area: number;
  // Where the seams meet, and points along each distinct seam. Null/empty
  // when the region doesn't repeat edge to edge (nothing crosses its edge).
  seamCorner: Vec | null;
  seamSides: Vec[][];
  // Room before a circle would leave the region; absent when it wraps.
  bound?: (p: Vec) => number;
  // Share of the normal gap kept from the outline (default 1).
  edgeShare?: number;
  // Mirror: which coordinates of a point lie on a mirror axis. A circle
  // centred on an axis stays on it (it is its own reflection).
  axisLock?: (p: Vec) => { x: boolean; y: boolean };
  // Mirror: share of a circle that belongs to this region (a half on an
  // axis, a quarter where two axes cross), for counting placements.
  weight?: (p: Vec) => number;
  // Mirror: the points where the axes cross, and spots along the axes for
  // circles to sit on, about `step` apart.
  crossings?: Vec[];
  axisPoints?: (step: number) => Vec[];
  sample: (rng: Rng) => Vec;
  normalize: (p: Vec) => Vec;
}

const SEAM_SAMPLES = 64;

export function rectDomain(width: number, height: number): Domain {
  return {
    dist: torusDistance(width, height),
    delta: torusDelta(width, height),
    area: width * height,
    seamCorner: { x: 0, y: 0 },
    seamSides: [
      Array.from({ length: SEAM_SAMPLES + 1 }, (_, k) => ({
        x: 0,
        y: (k * height) / SEAM_SAMPLES,
      })),
      Array.from({ length: SEAM_SAMPLES + 1 }, (_, k) => ({
        x: (k * width) / SEAM_SAMPLES,
        y: 0,
      })),
    ],
    sample: (rng) => ({ x: rng() * width, y: rng() * height }),
    normalize: (p) => ({ x: wrap(p.x, width), y: wrap(p.y, height) }),
  };
}

function sampleInside(
  poly: Vec[],
  width: number,
  height: number,
  rng: Rng,
): Vec {
  for (let attempt = 0; attempt < 10000; attempt++) {
    const p = { x: rng() * width, y: rng() * height };
    if (pointInPolygon(p, poly)) return p;
  }
  return { x: width / 2, y: height / 2 };
}

export function shapeDomain(
  shape: ShapeModel,
  width: number,
  height: number,
): Domain {
  const { region } = shape;
  const sample = (rng: Rng) => sampleInside(region, width, height, rng);

  if (shape.regionTiles) {
    const [t1, t2] = shape.translations;
    return {
      dist: latticeDistance(t1, t2),
      delta: latticeDelta(t1, t2),
      area: polygonArea(region),
      seamCorner: shape.seamCorner,
      seamSides: shape.seamSides,
      sample,
      normalize: (p) => {
        for (let i = -2; i <= 2; i++) {
          for (let j = -2; j <= 2; j++) {
            const q = {
              x: p.x + i * t1.x + j * t2.x,
              y: p.y + i * t1.y + j * t2.y,
            };
            if (pointInPolygon(q, region)) return q;
          }
        }
        return p;
      },
    };
  }

  return {
    dist: torusDistance(width, height),
    delta: torusDelta(width, height),
    area: shape.area ?? Math.min(width * height, polygonArea(region)),
    seamCorner: null,
    seamSides: [],
    bound: (p) => signedDistance(p, region),
    sample,
    normalize: (p) => ({ x: wrap(p.x, width), y: wrap(p.y, height) }),
  };
}

// One quarter of a Mirror tile. All four of its edges are mirror axes (the
// tile's centre lines and its own edges), so they behave differently from a
// shape's outline: a circle either sits centred ON an axis (so it is halved
// evenly by it, and its reflection is itself), or keeps clear of it. Nothing
// wraps inside a quarter; the neighbours across an axis are reflections.
export function mirrorDomain(width: number, height: number): Domain {
  const EPS = 0.5;
  const onX = (p: Vec) => p.x < EPS || width - p.x < EPS;
  const onY = (p: Vec) => p.y < EPS || height - p.y < EPS;
  const along = (v: number, size: number) =>
    v < EPS || size - v < EPS ? Infinity : Math.min(v, size - v);
  return {
    dist: flatDistance,
    delta: flatDelta,
    area: width * height,
    seamCorner: null,
    seamSides: [],
    // A circle off an axis must clear its own reflection.
    bound: (p) => Math.min(along(p.x, width), along(p.y, height)),
    edgeShare: 0.5,
    axisLock: (p) => ({ x: onX(p), y: onY(p) }),
    weight: (p) => (onX(p) ? 0.5 : 1) * (onY(p) ? 0.5 : 1),
    crossings: [
      { x: 0, y: 0 },
      { x: width, y: 0 },
      { x: 0, y: height },
      { x: width, y: height },
    ],
    axisPoints: (step) => {
      const pts: Vec[] = [];
      for (let y = step / 2; y < height; y += step) {
        pts.push({ x: 0, y }, { x: width, y });
      }
      for (let x = step / 2; x < width; x += step) {
        pts.push({ x, y: 0 }, { x, y: height });
      }
      return pts;
    },
    sample: (rng) => ({ x: rng() * width, y: rng() * height }),
    normalize: (p) => ({
      x: Math.min(width, Math.max(0, p.x)),
      y: Math.min(height, Math.max(0, p.y)),
    }),
  };
}
