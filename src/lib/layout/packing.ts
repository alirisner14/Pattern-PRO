import { clearance, type Circle, type DistanceFn, type Vec } from "./geometry";

const DIRECTIONS = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [Math.SQRT1_2, Math.SQRT1_2], [-Math.SQRT1_2, Math.SQRT1_2],
  [Math.SQRT1_2, -Math.SQRT1_2], [-Math.SQRT1_2, -Math.SQRT1_2],
];

export type Bound = (p: Vec) => number;

// Room at a point: distance to the nearest placed circle's edge, and (inside
// a shape that doesn't wrap) to the shape's own outline.
export function roomAt(p: Vec, placed: Circle[], dist: DistanceFn, bound?: Bound): number {
  const c = clearance(p, placed, dist);
  return bound ? Math.min(c, bound(p)) : c;
}

// Slide a point uphill until it sits at the true centre of its gap. Movement
// is capped at 2 steps, so only circles that could possibly become the
// nearest within that radius need checking.
function centreInGap(
  start: Vec,
  placed: Circle[],
  dist: DistanceFn,
  step: number,
  bound?: Bound
): Vec {
  const reach = 2 * step;
  const startRoom = roomAt(start, placed, dist, bound);
  const nearby = placed.filter((c) => dist(start, c) - c.r < startRoom + 2 * reach);

  let p = start;
  let best = startRoom;
  let h = step;
  while (h > step / 32) {
    let moved = false;
    for (const [dx, dy] of DIRECTIONS) {
      const q = { x: p.x + dx * h, y: p.y + dy * h };
      if (Math.hypot(q.x - start.x, q.y - start.y) > reach) continue;
      const c = roomAt(q, nearby, dist, bound);
      if (c > best + 1e-9) {
        p = q;
        best = c;
        moved = true;
      }
    }
    if (!moved) h /= 2;
  }
  return p;
}

interface FillOptions {
  candidates: Vec[];
  placed: Circle[];
  radius: number;
  gap: number;
  dist: DistanceFn;
  step: number;
  maxCount?: number;
  centre?: boolean;
  bound?: Bound;
}

// Repeatedly drop a circle into the roomiest remaining gap until no gap can
// hold one. Filling biggest-gap-first is what keeps density even: nothing
// lands next to a neighbour while an emptier spot exists elsewhere.
// Mutates `placed` so later tiers pack around earlier ones.
export function fillGaps({
  candidates,
  placed,
  radius,
  gap,
  dist,
  step,
  maxCount = Infinity,
  centre = true,
  bound,
}: FillOptions): Vec[] {
  const room = candidates.map((c) => roomAt(c, placed, dist, bound));
  const added: Vec[] = [];
  const needed = radius + gap;

  while (added.length < maxCount) {
    let bestIndex = -1;
    let bestRoom = -Infinity;
    for (let i = 0; i < room.length; i++) {
      if (room[i] > bestRoom) {
        bestRoom = room[i];
        bestIndex = i;
      }
    }
    if (bestIndex < 0 || bestRoom < needed) break;

    const p = centre
      ? centreInGap(candidates[bestIndex], placed, dist, step, bound)
      : candidates[bestIndex];
    const circle = { x: p.x, y: p.y, r: radius };
    placed.push(circle);
    added.push(p);

    for (let i = 0; i < candidates.length; i++) {
      const d = dist(candidates[i], circle) - radius;
      if (d < room[i]) room[i] = d;
    }
  }

  return added;
}
