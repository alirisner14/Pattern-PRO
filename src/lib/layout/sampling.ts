import type { Point } from "./lattice";
import type { Rng } from "./rng";

function dist2(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

// Greedy farthest-point sampling: repeatedly pick whichever remaining
// candidate is farthest from everything already chosen. This is what
// keeps same-class elements spread out instead of clumping together.
export function farthestPointSample<T extends Point>(
  candidates: T[],
  count: number,
  rng: Rng
): T[] {
  if (count <= 0 || candidates.length === 0) return [];
  if (count >= candidates.length) return [...candidates];

  const pool = [...candidates];
  const chosen: T[] = [];

  const startIndex = Math.floor(rng() * pool.length);
  chosen.push(pool.splice(startIndex, 1)[0]);

  while (chosen.length < count) {
    let bestIndex = 0;
    let bestDist = -Infinity;
    for (let i = 0; i < pool.length; i++) {
      let nearest = Infinity;
      for (const point of chosen) {
        const d = dist2(pool[i], point);
        if (d < nearest) nearest = d;
      }
      if (nearest > bestDist) {
        bestDist = nearest;
        bestIndex = i;
      }
    }
    chosen.push(pool.splice(bestIndex, 1)[0]);
  }

  return chosen;
}
