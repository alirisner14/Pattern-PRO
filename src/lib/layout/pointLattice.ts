import type { Vec } from "./geometry";
import type { Rng } from "./rng";

// Evenly spread anchor points on a seamless tile.
//
// Any N points that repeat as a lattice on the torus are perfectly even: every
// point has the same surroundings. Tilting the lattice (e.g. 5 points on the
// vector (1, 2) / 5) hides the rows and columns, so it reads as scattered
// while staying exactly balanced. This is the structure behind the benchmark
// template. All such lattices are the Hermite normal forms of index N:
//   points = { (i / d2 + j b / N, j / d1) : i < d2, j < d1 }, d1 d2 = N.

export interface LatticeShape {
  n: number;
  d1: number;
  d2: number;
  b: number;
  // Reduced basis: t1 is the shortest lattice vector.
  t1: Vec;
  t2: Vec;
  lambda: number;
  // 1 = as dense as a hexagonal packing; a square lattice scores 0.87.
  quality: number;
}

const HEX = 2 / Math.sqrt(3);

const len2 = (v: Vec) => v.x * v.x + v.y * v.y;
const dot = (a: Vec, b: Vec) => a.x * b.x + a.y * b.y;

function reduce(u: Vec, v: Vec): [Vec, Vec] {
  let a = u;
  let b = v;
  for (let k = 0; k < 64; k++) {
    if (len2(b) < len2(a)) [a, b] = [b, a];
    const m = Math.round(dot(a, b) / len2(a));
    if (m === 0) break;
    b = { x: b.x - m * a.x, y: b.y - m * a.y };
  }
  if (len2(b) < len2(a)) [a, b] = [b, a];
  return [a, b];
}

// Every distinct lattice of n points on a width × height tile.
export function latticeShapes(
  n: number,
  width: number,
  height: number,
): LatticeShape[] {
  const out: LatticeShape[] = [];
  for (let d1 = 1; d1 <= n; d1++) {
    if (n % d1) continue;
    const d2 = n / d1;
    for (let b = 0; b < d1; b++) {
      const u = { x: (d1 * width) / n, y: 0 };
      const v = { x: (b * width) / n, y: (d2 * height) / n };
      const [t1, t2] = reduce(u, v);
      const lambda = Math.sqrt(len2(t1));
      out.push({
        n,
        d1,
        d2,
        b,
        t1,
        t2,
        lambda,
        quality: (lambda * lambda * n) / (width * height) / HEX,
      });
    }
  }
  return out;
}

export function bestQuality(n: number, width: number, height: number): number {
  return latticeShapes(n, width, height).reduce(
    (m, s) => Math.max(m, s.quality),
    0,
  );
}

// Spacing (shortest lattice vector) of the best lattice for n points.
export function bestSpacing(n: number, width: number, height: number): number {
  return Math.max(...latticeShapes(n, width, height).map((s) => s.lambda));
}

// How many anchors to actually use for a requested count: a nearby count
// whose best lattice is notably more even (5 beats 6, say) is preferred.
export function chooseCount(
  target: number,
  width: number,
  height: number,
): number {
  // For big counts only a handful of neighbours are compared, to stay fast.
  const reach = Math.min(Math.ceil(target * 0.2), 8);
  const lo = Math.max(1, Math.min(target - 1, target - reach));
  const hi = Math.max(target + 1, target + reach);
  let best = target;
  let bestScore = -Infinity;
  for (let n = lo; n <= hi; n++) {
    const score =
      bestQuality(n, width, height) - (0.5 * Math.abs(n - target)) / target;
    if (score > bestScore + 1e-9) {
      bestScore = score;
      best = n;
    }
  }
  return best;
}

// One of the most even lattices for n points, chosen at random among those
// within a few percent of the best (mirror images and rotations of each
// other, mostly) so rebuilding gives a different look.
export function pickLattice(
  n: number,
  width: number,
  height: number,
  rng: Rng,
): LatticeShape {
  const all = latticeShapes(n, width, height);
  const top = Math.max(...all.map((s) => s.lambda));
  const near = all.filter((s) => s.lambda >= top * 0.97);
  return near[Math.floor(rng() * near.length)];
}

export function latticePoints(
  s: LatticeShape,
  width: number,
  height: number,
): Vec[] {
  const pts: Vec[] = [];
  for (let j = 0; j < s.d1; j++) {
    for (let i = 0; i < s.d2; i++) {
      const x = (i / s.d2 + (j * s.b) / s.n) % 1;
      pts.push({ x: x * width, y: (j / s.d1) * height });
    }
  }
  return pts;
}
