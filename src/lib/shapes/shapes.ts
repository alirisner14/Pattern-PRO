import type { Vec } from "../layout/geometry";
import { scalePolygon, translatePolygon } from "./polygon";

export type ShapeKind = "diamond" | "ogee";
export type ShapeSides = "straight" | "concave" | "convex";
export type ShapeFit = "closed" | "open";
export type OgeeStyle = "standard" | "lantern" | "quatrefoil" | "drop" | "star";
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

// Quatrefoil lobe-centre offset, drop tip sharpness, and star pinch, per Curve.
const QUATREFOIL_OFFSET: Record<OgeeCurve, number> = { subtle: 0.3, medium: 0.4, deep: 0.5 };
const DROP_TIP: Record<OgeeCurve, number> = { subtle: 0.6, medium: 1, deep: 2 };
const STAR_PINCH: Record<OgeeCurve, number> = { subtle: 0.06, medium: 0.1, deep: 0.14 };
const STAR_SHOULDER = 0.04;
const OUTLINE_SAMPLES = 256;

// Only these repeat edge to edge on their own; every other shape keeps its
// circles inside the outline and supports the Open fit.
export function shapeTiles(o: Pick<ShapeOptions, "kind" | "sides" | "ogeeStyle">): boolean {
  return o.kind === "ogee"
    ? o.ogeeStyle === "standard" || o.ogeeStyle === "lantern"
    : o.sides === "straight";
}

// One ogee side from the rounded vertex (s=0) to the pointed vertex (s=1):
// bulges out first, then pinches in toward the point.
function ogeeProfile(style: OgeeStyle, sway: number): Profile {
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
  // corners are sharp rather than smeared across a sample.
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

// Shapes defined in a unit square ([-1, 1] on both axes) and stretched to the
// canvas, so they touch all four edges when Closed.
function fromUnit(points: Vec[], width: number, height: number): Vec[] {
  return points.map((p) => ({ x: width / 2 + (p.x * width) / 2, y: height / 2 + (p.y * height) / 2 }));
}

// Four overlapping circular lobes: trace the outermost hit along each ray.
function quatrefoil(curve: OgeeCurve): Vec[] {
  const d = QUATREFOIL_OFFSET[curve];
  const r = 1 - d;
  const centres = [
    { x: d, y: 0 },
    { x: 0, y: d },
    { x: -d, y: 0 },
    { x: 0, y: -d },
  ];
  return Array.from({ length: OUTLINE_SAMPLES }, (_, i) => {
    const a = (2 * Math.PI * i) / OUTLINE_SAMPLES;
    const u = { x: Math.cos(a), y: Math.sin(a) };
    let reach = 0;
    for (const c of centres) {
      const along = c.x * u.x + c.y * u.y;
      const disc = along * along - (c.x * c.x + c.y * c.y) + r * r;
      if (disc >= 0) reach = Math.max(reach, along + Math.sqrt(disc));
    }
    return { x: reach * u.x, y: reach * u.y };
  });
}

// Pointed top, round bottom. A higher tip exponent pinches the point into
// the concave onion-dome tip.
function drop(curve: OgeeCurve): Vec[] {
  const m = DROP_TIP[curve];
  const raw = Array.from({ length: OUTLINE_SAMPLES }, (_, i) => {
    const t = (2 * Math.PI * i) / OUTLINE_SAMPLES;
    return { x: Math.sin(t) * Math.pow(Math.sin(t / 2), m), y: -Math.cos(t) };
  });
  const widest = Math.max(...raw.map((p) => Math.abs(p.x)));
  return raw.map((p) => ({ x: p.x / widest, y: p.y }));
}

export function buildShape(o: ShapeOptions, width: number, height: number): ShapeModel {
  const centre = { x: width / 2, y: height / 2 };
  const L = { x: 0, y: height / 2 };
  const T = { x: width / 2, y: 0 };
  const R = { x: width, y: height / 2 };
  const B = { x: width / 2, y: height };
  const [t1, t2] = diamondTranslations(width, height);
  const tiles = shapeTiles(o);

  let lt: Vec[] = [];
  let tr: Vec[] = [];
  let outer: Vec[];
  if (o.kind === "ogee" && o.ogeeStyle === "quatrefoil") {
    outer = fromUnit(quatrefoil(o.ogeeCurve), width, height);
  } else if (o.kind === "ogee" && o.ogeeStyle === "drop") {
    outer = fromUnit(drop(o.ogeeCurve), width, height);
  } else if (o.kind === "ogee" && o.ogeeStyle === "star") {
    // Each side pinches in on both halves, leaving a shoulder point midway.
    const pinch = STAR_PINCH[o.ogeeCurve];
    const profile: Profile = {
      at: (s) => STAR_SHOULDER * Math.sin(Math.PI * s) - pinch * Math.abs(Math.sin(2 * Math.PI * s)),
      breaks: [0.5],
    };
    outer = join([
      side(L, T, centre, profile),
      side(T, R, centre, profile),
      side(R, B, centre, profile),
      side(B, L, centre, profile),
    ]);
  } else if (tiles) {
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
