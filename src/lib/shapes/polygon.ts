import type { Vec } from "../layout/geometry";

export function pointInPolygon(p: Vec, poly: Vec[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

function segmentDistance(p: Vec, a: Vec, b: Vec): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

// Distance to the outline: positive inside, negative outside.
export function signedDistance(p: Vec, poly: Vec[]): number {
  let d = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    d = Math.min(d, segmentDistance(p, poly[j], poly[i]));
  }
  return pointInPolygon(p, poly) ? d : -d;
}

export function polygonArea(poly: Vec[]): number {
  let sum = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    sum += poly[j].x * poly[i].y - poly[i].x * poly[j].y;
  }
  return Math.abs(sum) / 2;
}

export function scalePolygon(poly: Vec[], centre: Vec, k: number): Vec[] {
  return poly.map((p) => ({ x: centre.x + (p.x - centre.x) * k, y: centre.y + (p.y - centre.y) * k }));
}

export function translatePolygon(poly: Vec[], t: Vec): Vec[] {
  return poly.map((p) => ({ x: p.x + t.x, y: p.y + t.y }));
}

export function polygonPoints(poly: Vec[]): string {
  return poly.map((p) => `${p.x},${p.y}`).join(" ");
}
