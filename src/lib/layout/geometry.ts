export interface Vec {
  x: number;
  y: number;
}

export interface Circle extends Vec {
  r: number;
}

export type DistanceFn = (a: Vec, b: Vec) => number;

export function wrap(value: number, period: number): number {
  return ((value % period) + period) % period;
}

function wrapDelta(delta: number, period: number): number {
  return delta - period * Math.round(delta / period);
}

// The canvas is a seamless tile: something leaving the right edge re-enters
// on the left, so distances are measured the short way around.
export function torusDistance(width: number, height: number): DistanceFn {
  return (a, b) =>
    Math.hypot(wrapDelta(a.x - b.x, width), wrapDelta(a.y - b.y, height));
}

export type DeltaFn = (a: Vec, b: Vec) => Vec;

// Shortest offset from b to a, the short way around the canvas.
export function torusDelta(width: number, height: number): DeltaFn {
  return (a, b) => ({
    x: wrapDelta(a.x - b.x, width),
    y: wrapDelta(a.y - b.y, height),
  });
}

// Shortest offset from b to a on a repeat lattice.
export function latticeDelta(t1: Vec, t2: Vec): DeltaFn {
  return (a, b) => {
    let best = { x: a.x - b.x, y: a.y - b.y };
    let bestLen = Infinity;
    for (let i = -2; i <= 2; i++) {
      for (let j = -2; j <= 2; j++) {
        const x = a.x - b.x + i * t1.x + j * t2.x;
        const y = a.y - b.y + i * t1.y + j * t2.y;
        const len = x * x + y * y;
        if (len < bestLen) {
          bestLen = len;
          best = { x, y };
        }
      }
    }
    return best;
  };
}

// Distance inside one repeat cell, where every lattice translation of a
// point is the same point (a half-drop cell's neighbour sits half a cell down).
export function latticeDistance(t1: Vec, t2: Vec): DistanceFn {
  return (a, b) => {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    let best = Infinity;
    for (let i = -2; i <= 2; i++) {
      for (let j = -2; j <= 2; j++) {
        const d = Math.hypot(
          dx + i * t1.x + j * t2.x,
          dy + i * t1.y + j * t2.y,
        );
        if (d < best) best = d;
      }
    }
    return best;
  };
}

// How much room a point has before it touches any placed circle's edge.
export function clearance(p: Vec, circles: Circle[], dist: DistanceFn): number {
  let min = Infinity;
  for (const c of circles) {
    const d = dist(p, c) - c.r;
    if (d < min) min = d;
  }
  return min;
}
