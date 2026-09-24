import { clearance, type Circle, type DistanceFn, type Vec } from "./geometry";

const DIRECTIONS = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [Math.SQRT1_2, Math.SQRT1_2], [-Math.SQRT1_2, Math.SQRT1_2],
  [Math.SQRT1_2, -Math.SQRT1_2], [-Math.SQRT1_2, -Math.SQRT1_2],
];

// Slide a point uphill until it sits at the true centre of its gap. Movement
// is capped at 2 steps, so only circles that could possibly become the
// nearest within that radius need checking.
function centreInGap(start: Vec, placed: Circle[], dist: DistanceFn, step: number): Vec {
  const reach = 2 * step;
  const startRoom = clearance(start, placed, dist);
  const nearby = placed.filter((c) => dist(start, c) - c.r < startRoom + 2 * reach);

  let p = start;
  let best = startRoom;
  let h = step;
  while (h > step / 32) {
    let moved = false;
    for (const [dx, dy] of DIRECTIONS) {
      const q = { x: p.x + dx * h, y: p.y + dy * h };
      if (Math.hypot(q.x - start.x, q.y - start.y) > reach) continue;
      const c = clearance(q, nearby, dist);
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
}: FillOptions): Vec[] {
  const room = candidates.map((c) => clearance(c, placed, dist));
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

    const p = centreInGap(candidates[bestIndex], placed, dist, step);
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
