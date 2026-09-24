import type { Vec } from "../layout/geometry";
import { scalePolygon, translatePolygon } from "./polygon";

export type ShapeKind = "diamond" | "ogee";
export type ShapeSides = "straight" | "concave" | "convex";
export type ShapeFit = "closed" | "open";
export type OgeeStyle = "standard" | "faceted" | "lantern";
export type OgeeCurve = "subtle" | "medium" | "deep";

export interface ShapeOptions {
  kind: ShapeKind;
  sides: ShapeSides;
  fit: ShapeFit;
  ogeeStyle: OgeeStyle;
  ogeeCurve: OgeeCurve;
  openAmount: number;
  innerCount: number;
  innerSpacing: number;
}

export interface ShapeModel {
  // Where the layout goes: the shape itself, or its innermost inner shape.
  region: Vec[];
  // True when the region repeats edge to edge, so circles wrap across it.
  regionTiles: boolean;
  // The shape plus any copies that show on the canvas (Open reaches past edges).
  copies: Vec[][];
  inner: Vec[][];
  seamCorner: Vec | null;
  seamSides: Vec[][];
}

const SIDE_SAMPLES = 64;
// Concave/convex bow depth and ogee S-curve sway, as fractions of side length.
const BOW = 0.2;
const OGEE_SWAY: Record<OgeeCurve, number> = { subtle: 0.06, medium: 0.1, deep: 0.14 };
// Lantern shoulder: where the step sits along the side, and how deep it is
// relative to the sway.
const LANTERN_STEP: [number, number] = [0.58, 0.72];
const LANTERN_DEPTH = 0.4;

interface Profile {
  at: (s: number) => number;
  // Where the profile has a corner or a step, sampled exactly so edges stay crisp.
  breaks: number[];
}

// One ogee side from the rounded vertex (s=0) to the pointed vertex (s=1):
// bulges out first, then pinches in toward the point.
function ogeeProfile(style: OgeeStyle, sway: number): Profile {
  if (style === "faceted") {
    const zigzag = (s: number) =>
      s < 0.25 ? s / 0.25 : s < 0.75 ? 1 - (s - 0.25) / 0.25 : -1 + (s - 0.75) / 0.25;
    return { at: (s) => sway * zigzag(s), breaks: [0.25, 0.75] };
  }
  const curve = (s: number) => sway * Math.sin(2 * Math.PI * s);
  if (style === "lantern") {
    const [a, b] = LANTERN_STEP;
    return {
      at: (s) => curve(s) - (s >= a && s <= b ? LANTERN_DEPTH * sway : 0),
      breaks: [a, b],
    };
  }
  return { at: curve, breaks: [] };
}

const mirror = (p: Profile): Profile => ({
  at: (s) => p.at(1 - s),
  breaks: p.breaks.map((b) => 1 - b),
});
// Open at 100% scales the shape this much past touching the edges.
const MAX_OPEN = 0.5;

// Copies of a diamond-type shape offset by half the canvas diagonally tile
// the plane: whatever leaves one edge re-enters through the opposite edge.
export function diamondTranslations(width: number, height: number): [Vec, Vec] {
  return [
    { x: width / 2, y: height / 2 },
    { x: width / 2, y: -height / 2 },
  ];
}

// One side from a to b, pushed along its outward normal by profile(s) × length.
function side(a: Vec, b: Vec, centre: Vec, profile: Profile): Vec[] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  let nx = -dy / len;
  let ny = dx / len;
  if (nx * ((a.x + b.x) / 2 - centre.x) + ny * ((a.y + b.y) / 2 - centre.y) < 0) {
    nx = -nx;
    ny = -ny;
  }
  // Sample just either side of each break so steps are vertical and
  // facet corners are sharp rather than smeared across a sample.
  const eps = 1e-4;
  const ss = [
    ...Array.from({ length: SIDE_SAMPLES + 1 }, (_, i) => i / SIDE_SAMPLES),
    ...profile.breaks.flatMap((b) => [b - eps, b + eps]),
  ].sort((x, y) => x - y);
  return ss.map((s) => {
    const o = profile.at(s) * len;
    return { x: a.x + s * dx + nx * o, y: a.y + s * dy + ny * o };
  });
}

const flat = (at: (s: number) => number): Profile => ({ at, breaks: [] });

const join = (sides: Vec[][]) => sides.flatMap((s) => s.slice(0, -1));

export function buildShape(o: ShapeOptions, width: number, height: number): ShapeModel {
  const centre = { x: width / 2, y: height / 2 };
  const L = { x: 0, y: height / 2 };
  const T = { x: width / 2, y: 0 };
  const R = { x: width, y: height / 2 };
  const B = { x: width / 2, y: height };
  const [t1, t2] = diamondTranslations(width, height);
  const tiles = o.kind === "ogee" || o.sides === "straight";

  let lt: Vec[];
  let tr: Vec[];
  let outer: Vec[];
  if (tiles) {
    // Opposite sides are exact translated copies of each other, which is
    // what lets the shape repeat edge to edge. The S-curve pinches the top
    // and bottom points and rounds out the left and right.
    const profile =
      o.kind === "ogee" ? ogeeProfile(o.ogeeStyle, OGEE_SWAY[o.ogeeCurve]) : flat(() => 0);
    lt = side(L, T, centre, profile);
    tr = side(T, R, centre, mirror(profile));
    const rb = translatePolygon(lt, t1).reverse();
    const bl = translatePolygon(tr, { x: -t2.x, y: -t2.y }).reverse();
    outer = join([lt, tr, rb, bl]);
  } else {
    const bow = o.sides === "convex" ? BOW : -BOW;
    const profile = flat((s) => bow * Math.sin(Math.PI * s));
    lt = side(L, T, centre, profile);
    tr = side(T, R, centre, profile);
    outer = join([lt, tr, side(R, B, centre, profile), side(B, L, centre, profile)]);
  }

  const open = !tiles && o.fit === "open";
  if (open) outer = scalePolygon(outer, centre, 1 + (o.openAmount / 100) * MAX_OPEN);

  const offsets = open
    ? [-1, 0, 1].flatMap((i) => [-1, 0, 1].map((j) => ({ x: i * width, y: j * height })))
    : [{ x: 0, y: 0 }];
  const withCopies = (poly: Vec[]) => offsets.map((t) => translatePolygon(poly, t));

  const inner: Vec[][] = [];
  let region = outer;
  for (let i = 1; i <= o.innerCount; i++) {
    const k = 1 - i * o.innerSpacing;
    if (k <= 0.05) break;
    region = scalePolygon(outer, centre, k);
    inner.push(...withCopies(region));
  }

  const regionTiles = tiles && region === outer;
  return {
    region,
    regionTiles,
    copies: withCopies(outer),
    inner,
    seamCorner: regionTiles ? T : null,
    seamSides: regionTiles ? [lt, tr] : [],
  };
}
