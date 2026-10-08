import type { Vec } from "../layout/geometry";
import { scalePolygon, translatePolygon } from "./polygon";

export type ShapeKind = "diamond" | "ogee";
export type ShapeSides = "straight" | "concave" | "convex";
export type ShapeFit = "closed" | "open";
export type OgeeStyle =
  | "standard"
  | "lantern"
  | "arabesque"
  | "fan"
  | "bat"
  | "column"
  | "quatrefoil"
  | "steppedQuatrefoil"
  | "drop"
  | "star"
  | "fourPoint"
  | "petalX"
  | "notchedSquare"
  | "wavyDiamond"
  | "badge";
export type OgeeCurve = "subtle" | "medium" | "deep";
export type OgeeProportion = "skinny" | "mid" | "wide";

export interface ShapeOptions {
  kind: ShapeKind;
  sides: ShapeSides;
  fit: ShapeFit;
  ogeeStyle: OgeeStyle;
  ogeeCurve: OgeeCurve;
  ogeeProportion: OgeeProportion;
  openAmount: number;
  innerCount: number;
  innerSpacing: number;
}

export interface ShapeModel {
  // Where the layout goes: the shape itself, or its innermost inner shape.
  region: Vec[];
  // True when the region repeats edge to edge, so circles wrap across it.
  regionTiles: boolean;
  // Lattice the region repeats on when it tiles.
  translations: [Vec, Vec];
  // Overrides the polygon's area (a column runs past the canvas top and bottom).
  area?: number;
  // The shape plus any copies that show on the canvas (Open reaches past edges).
  copies: Vec[][];
  inner: Vec[][];
  seamCorner: Vec | null;
  seamSides: Vec[][];
}

const SIDE_SAMPLES = 64;
// Concave/convex bow depth and ogee S-curve sway, as fractions of side length.
// (A bow of 0.21 would turn the diamond into a circle, so keep it gentle.)
const BOW = 0.07;
const OGEE_SWAY: Record<OgeeCurve, number> = {
  subtle: 0.06,
  medium: 0.1,
  deep: 0.14,
};
// Arabesque notch depth, relative to the sway.
const LANTERN_DEPTH = 0.4;
// Lantern shoulder step: where it sits along the side, how long it is, and
// how far in the neck above it is set (fractions of the side length).
const LANTERN_JOG = 0.56;
const LANTERN_JOG_LENGTH = 0.035;
const LANTERN_JOG_DEPTH = 0.03;

interface Profile {
  at: (s: number) => number;
  // Where the profile has a corner or a step, sampled exactly so edges stay crisp.
  breaks: number[];
  // Square steps: the stretch [from, to] is skipped and its two ends joined
  // by one horizontal and one vertical segment, stepping inward.
  jogs?: [number, number][];
}

// Quatrefoil lobe-centre offset, drop tip sharpness, and star pinch, per Curve.
const QUATREFOIL_OFFSET: Record<OgeeCurve, number> = {
  subtle: 0.3,
  medium: 0.4,
  deep: 0.5,
};
const QUATREFOIL_STEP = 0.06;
const QUATREFOIL_STEP_WIDTH = 0.12;
const DROP_TIP: Record<OgeeCurve, number> = { subtle: 0.6, medium: 1, deep: 2 };
const STAR_PINCH: Record<OgeeCurve, number> = {
  subtle: 0.06,
  medium: 0.1,
  deep: 0.14,
};
const STAR_SHOULDER = 0.04;
// Fan: a circular arc whose ends meet the neighbouring side smoothly.
const FAN_SAG: Record<OgeeCurve, number> = {
  subtle: 0.15,
  medium: 0.207,
  deep: 0.26,
};
// Bat: [side lobe, top lobe] sagittas.
const BAT_SAG: Record<OgeeCurve, [number, number]> = {
  subtle: [0.22, 0.15],
  medium: [0.3, 0.207],
  deep: [0.38, 0.26],
};
// Four-point: [bulge, pinch] — pinched near both points, bulging between.
const FOUR_POINT: Record<OgeeCurve, [number, number]> = {
  subtle: [0.18, 0.08],
  medium: [0.24, 0.12],
  deep: [0.3, 0.16],
};
const PETAL_CUSP: Record<OgeeCurve, number> = {
  subtle: 0.55,
  medium: 0.45,
  deep: 0.35,
};
const PETAL_SAG = 0.18;
const NOTCH_RADIUS: Record<OgeeCurve, number> = {
  subtle: 0.12,
  medium: 0.2,
  deep: 0.28,
};
// Wavy diamond: [bulge, pinch] per half-side, and the jog where halves meet.
const WAVY_DIAMOND: Record<OgeeCurve, [number, number]> = {
  subtle: [0.08, 0.03],
  medium: [0.11, 0.045],
  deep: [0.14, 0.06],
};
const WAVY_JOG = 0.025;
// Badge: how far the side points reach, and the ripple before them.
const BADGE_POINT: Record<OgeeCurve, number> = {
  subtle: 0.45,
  medium: 0.55,
  deep: 0.65,
};
const BADGE_RIPPLE = 0.07;
const BADGE_CORNER = 0.45;
const BADGE_ROUND = 0.35;
const BADGE_DIP = 0.12;
const COLUMN_WIDTH: Record<OgeeProportion, number> = {
  skinny: 0.34,
  mid: 0.48,
  wide: 0.67,
};
const OUTLINE_SAMPLES = 256;

const TILING_OGEES: OgeeStyle[] = [
  "standard",
  "lantern",
  "arabesque",
  "fan",
  "bat",
];
// Only these take the Proportion option (the references come in those sizes).
export const PROPORTIONED_OGEES: OgeeStyle[] = [
  "standard",
  "lantern",
  "column",
];

// Only these repeat edge to edge on their own (when Closed); every other
// shape keeps its circles inside the outline.
export function shapeTiles(
  o: Pick<ShapeOptions, "kind" | "sides" | "ogeeStyle">,
): boolean {
  return o.kind === "ogee"
    ? TILING_OGEES.includes(o.ogeeStyle)
    : o.sides === "straight";
}

// Offset of a circular arc over s in [0, 1] with the given sagitta (both as
// fractions of the chord).
function arc(s: number, sag: number): number {
  const r = (0.25 + sag * sag) / (2 * sag);
  return Math.sqrt(Math.max(0, r * r - (s - 0.5) ** 2)) - (r - sag);
}

// The ogee S-curve: zero at both ends, bulging out then pinching in, and
// leaving each end at slope k. With k = the cell's width / height the side
// meets its neighbour smoothly at the rounded vertex (no corner at the left
// and right of the shape) and closes into a clean point at the top and
// bottom, as in a real ogee. `sway` sets the depth of the bulge.
function ogeeCurve(sway: number, k: number): (s: number) => number {
  const shape = (c: number) => (s: number) =>
    s * (1 - s) * (1 - 2 * s) * (k + c * s * (1 - s));
  const depth = (c: number) => {
    let m = 0;
    for (let i = 0; i <= 200; i++) m = Math.max(m, shape(c)(i / 200));
    return m;
  };
  // Solve for the extra term that gives the requested depth; it can't go
  // below -4k without the curve folding over itself.
  let lo = -3.6 * k;
  let hi = 40;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (depth(mid) < sway) lo = mid;
    else hi = mid;
  }
  return shape(lo);
}

// One ogee side from the rounded vertex (s=0) to the pointed vertex (s=1):
// bulges out first, then pinches in toward the point.
function ogeeProfile(style: OgeeStyle, sway: number, k: number): Profile {
  const curve =
    style === "arabesque"
      ? (s: number) => sway * Math.sin(2 * Math.PI * s)
      : ogeeCurve(sway, k);
  if (style === "lantern") {
    // A small square step on the shoulder; the neck above it is set in and
    // eases back out to the point.
    const a = LANTERN_JOG;
    const b = a + LANTERN_JOG_LENGTH;
    return {
      at: (s) =>
        s < b
          ? curve(s)
          : curve(s) - LANTERN_JOG_DEPTH * ((1 - s) / (1 - b)) ** 2,
      breaks: [],
      jogs: [[a, b]],
    };
  }
  if (style === "arabesque") {
    // Straight runs instead of curves, with an angled step on the pinch.
    const tri = (s: number) =>
      s < 0.25 ? s * 4 : s < 0.75 ? 2 - s * 4 : s * 4 - 4;
    const notch = (s: number) =>
      s < 0.52 || s > 0.78
        ? 0
        : s < 0.6
          ? (s - 0.52) / 0.08
          : s <= 0.7
            ? 1
            : (0.78 - s) / 0.08;
    return {
      at: (s) => sway * tri(s) - LANTERN_DEPTH * sway * notch(s),
      breaks: [0.25, 0.52, 0.6, 0.7, 0.75, 0.78],
    };
  }
  return { at: curve, breaks: [] };
}

// Fan and bat sides bow out along the top; the translated copies along the
// bottom then bow in, pinching the bottom to a point.
function fanProfile(style: OgeeStyle, curve: OgeeCurve): Profile {
  if (style === "bat") {
    const [sideSag, topSag] = BAT_SAG[curve];
    return {
      at: (s) =>
        s < 0.5 ? 0.5 * arc(2 * s, sideSag) : 0.5 * arc(2 * s - 1, topSag),
      breaks: [0.5],
    };
  }
  return { at: (s) => arc(s, FAN_SAG[curve]), breaks: [] };
}

const mirror = (p: Profile): Profile => ({
  at: (s) => p.at(1 - s),
  breaks: p.breaks.map((b) => 1 - b),
  jogs: p.jogs?.map(([a, b]) => [1 - b, 1 - a]),
});
// Open at 100% scales the shape this much past touching the edges.
const MAX_OPEN = 0.5;

// One side from a to b, pushed along its outward normal by profile(s) × length.
function side(a: Vec, b: Vec, centre: Vec, profile: Profile): Vec[] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  let nx = -dy / len;
  let ny = dx / len;
  if (
    nx * ((a.x + b.x) / 2 - centre.x) + ny * ((a.y + b.y) / 2 - centre.y) <
    0
  ) {
    nx = -nx;
    ny = -ny;
  }
  // Sample just either side of each break so steps are vertical and
  // corners are sharp rather than smeared across a sample.
  const eps = 1e-4;
  const jogs = profile.jogs ?? [];
  const ss = [
    ...Array.from({ length: SIDE_SAMPLES + 1 }, (_, i) => i / SIDE_SAMPLES),
    ...profile.breaks.flatMap((b) => [b - eps, b + eps]),
    ...jogs.flat(),
  ]
    .filter((s) => !jogs.some(([from, to]) => s > from && s < to))
    .sort((x, y) => x - y);
  const at = (s: number) => {
    const o = profile.at(s) * len;
    return { x: a.x + s * dx + nx * o, y: a.y + s * dy + ny * o };
  };
  return ss.flatMap((s) => {
    const jog = jogs.find(([from]) => from === s);
    if (!jog) return [at(s)];
    // Join the two ends with a horizontal and a vertical segment, turning
    // at whichever corner lies on the inner side.
    const p = at(jog[0]);
    const q = at(jog[1]);
    const corners = [
      { x: q.x, y: p.y },
      { x: p.x, y: q.y },
    ];
    const d = (v: Vec) => Math.hypot(v.x - centre.x, v.y - centre.y);
    return [p, d(corners[0]) < d(corners[1]) ? corners[0] : corners[1]];
  });
}

// Round off the corners nearest the given points: the outline within
// `radius` of each is replaced by a curve that eases from one side into
// the next (a quadratic curve with the corner as its control point).
function roundCorners(poly: Vec[], corners: Vec[], radius: number): Vec[] {
  let out = poly;
  for (const c of corners) {
    const n = out.length;
    let i = 0;
    for (let k = 1; k < n; k++) {
      if (
        Math.hypot(out[k].x - c.x, out[k].y - c.y) <
        Math.hypot(out[i].x - c.x, out[i].y - c.y)
      )
        i = k;
    }
    // Start the outline away from the corner so the walk never wraps.
    out = [...out.slice(i), ...out.slice(0, i)];
    const far = (p: Vec) => Math.hypot(p.x - c.x, p.y - c.y) >= radius;
    let i1 = 1;
    while (i1 < n - 1 && !far(out[i1])) i1++;
    let i0 = n - 1;
    while (i0 > i1 && !far(out[i0])) i0--;
    const p0 = out[i0];
    const p2 = out[i1];
    const k = out[0];
    const curve = Array.from({ length: 15 }, (_, j) => {
      const t = j / 14;
      return {
        x: (1 - t) ** 2 * p0.x + 2 * t * (1 - t) * k.x + t * t * p2.x,
        y: (1 - t) ** 2 * p0.y + 2 * t * (1 - t) * k.y + t * t * p2.y,
      };
    });
    out = [...curve, ...out.slice(i1 + 1, i0)];
  }
  return out;
}

const flat = (at: (s: number) => number): Profile => ({ at, breaks: [] });

const join = (sides: Vec[][]) => sides.flatMap((s) => s.slice(0, -1));

// Shapes defined in a unit square ([-1, 1] on both axes) and stretched to the
// canvas, so they touch all four edges when Closed.
function fromUnit(points: Vec[], width: number, height: number): Vec[] {
  return points.map((p) => ({
    x: width / 2 + (p.x * width) / 2,
    y: height / 2 + (p.y * height) / 2,
  }));
}

// Four overlapping circular lobes: trace the outermost hit along each ray.
// Stepped adds a small inward notch where two lobes meet.
function quatrefoil(curve: OgeeCurve, stepped: boolean): Vec[] {
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
    const toJoin = Math.abs((a % (Math.PI / 2)) - Math.PI / 4);
    if (stepped && toJoin < QUATREFOIL_STEP_WIDTH) reach -= QUATREFOIL_STEP;
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

// Four petals reaching into the canvas corners, pinched in at each edge.
function petalX(curve: OgeeCurve): Vec[] {
  const q = PETAL_CUSP[curve];
  const pts = [
    { x: 0, y: -q },
    { x: 1, y: -1 },
    { x: q, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: q },
    { x: -1, y: 1 },
    { x: -q, y: 0 },
    { x: -1, y: -1 },
  ];
  const origin = { x: 0, y: 0 };
  const petal = flat((s) => arc(s, PETAL_SAG));
  const clampUnit = (v: number) => Math.max(-1, Math.min(1, v));
  return join(
    pts.map((p, i) => side(p, pts[(i + 1) % pts.length], origin, petal)),
  ).map((p) => ({
    x: clampUnit(p.x),
    y: clampUnit(p.y),
  }));
}

// A square whose corners are scooped out by quarter circles.
function notchedSquare(curve: OgeeCurve): Vec[] {
  const r = NOTCH_RADIUS[curve];
  const corners = [
    { x: 1, y: -1, from: Math.PI },
    { x: 1, y: 1, from: -Math.PI / 2 },
    { x: -1, y: 1, from: 0 },
    { x: -1, y: -1, from: Math.PI / 2 },
  ];
  const steps = 16;
  return corners.flatMap((c) =>
    Array.from({ length: steps + 1 }, (_, i) => {
      const a = c.from - (i / steps) * (Math.PI / 2);
      return { x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) };
    }),
  );
}

// Stretch a unit-ish outline so it touches all four edges of [-1, 1].
function fitUnit(points: Vec[]): Vec[] {
  const wx = Math.max(...points.map((p) => Math.abs(p.x)));
  const wy = Math.max(...points.map((p) => Math.abs(p.y)));
  return points.map((p) => ({ x: p.x / wx, y: p.y / wy }));
}

// Top and bottom: two round lobes each. Left and right: a ripple, then a
// straight run out to a point.
function badge(curve: OgeeCurve): Vec[] {
  const c = BADGE_CORNER;
  const peak = BADGE_POINT[curve];
  const origin = { x: 0, y: 0 };
  const lobes: Profile = {
    at: (s) => 0.5 * arc(s < 0.5 ? 2 * s : 2 * s - 1, 0.5),
    breaks: [0.5],
  };
  const pointed: Profile = {
    at: (s) => {
      const u = s < 0.5 ? 2 * s : 2 - 2 * s;
      return peak * u + BADGE_RIPPLE * Math.sin(2 * Math.PI * u);
    },
    breaks: [0.5],
  };
  const tl = { x: -c, y: -c };
  const tr = { x: c, y: -c };
  const br = { x: c, y: c };
  const bl = { x: -c, y: c };
  const outline = join([
    side(tl, tr, origin, lobes),
    side(tr, br, origin, pointed),
    side(br, bl, origin, lobes),
    side(bl, tl, origin, pointed),
  ]);
  // Where the lobes meet the sides the outline eases round, and the dip
  // between the two lobes is softened, so only the side points stay sharp.
  const dips = [
    { x: 0, y: -c },
    { x: 0, y: c },
  ];
  return fitUnit(
    roundCorners(
      roundCorners(outline, [tl, tr, br, bl], BADGE_ROUND * c),
      dips,
      BADGE_DIP * c,
    ),
  );
}

// Half-size of the repeating cell: Mid fills the canvas, Skinny is half as
// wide (two across), Wide is half as tall (two down).
function cellHalf(o: ShapeOptions, width: number, height: number): Vec {
  const proportion: OgeeProportion =
    o.kind !== "ogee"
      ? "mid"
      : o.ogeeStyle === "arabesque"
        ? "skinny"
        : PROPORTIONED_OGEES.includes(o.ogeeStyle)
          ? o.ogeeProportion
          : "mid";
  return {
    x: proportion === "skinny" ? width / 4 : width / 2,
    y: proportion === "wide" ? height / 4 : height / 2,
  };
}

export function buildShape(
  o: ShapeOptions,
  width: number,
  height: number,
): ShapeModel {
  const centre = { x: width / 2, y: height / 2 };
  const half = cellHalf(o, width, height);
  const L = { x: centre.x - half.x, y: centre.y };
  const T = { x: centre.x, y: centre.y - half.y };
  const R = { x: centre.x + half.x, y: centre.y };
  const B = { x: centre.x, y: centre.y + half.y };
  // Copies offset by these tile the plane: whatever leaves one side
  // re-enters through the opposite side.
  const t1 = { x: half.x, y: half.y };
  const t2 = { x: half.x, y: -half.y };
  const open = o.fit === "open";
  const tiles = shapeTiles(o) && !open;
  const style = o.kind === "ogee" ? o.ogeeStyle : null;

  let lt: Vec[] = [];
  let tr: Vec[] = [];
  let outer: Vec[];
  if (style === "quatrefoil" || style === "steppedQuatrefoil") {
    outer = fromUnit(
      quatrefoil(o.ogeeCurve, style === "steppedQuatrefoil"),
      width,
      height,
    );
  } else if (style === "drop") {
    outer = fromUnit(drop(o.ogeeCurve), width, height);
  } else if (style === "petalX") {
    outer = fromUnit(petalX(o.ogeeCurve), width, height);
  } else if (style === "notchedSquare") {
    outer = fromUnit(notchedSquare(o.ogeeCurve), width, height);
  } else if (style === "badge") {
    outer = fromUnit(badge(o.ogeeCurve), width, height);
  } else if (style === "wavyDiamond") {
    // Each half-side pinches in near its point and bulges toward the middle,
    // with a small jog where the halves meet.
    const [bulge, pinch] = WAVY_DIAMOND[o.ogeeCurve];
    const half = (u: number) =>
      bulge * Math.sin(Math.PI * u) ** 3 - pinch * Math.sin(Math.PI * u);
    const profile: Profile = {
      at: (s) =>
        s < 0.5 ? half(2 * s) : half(2 - 2 * s) - WAVY_JOG * (2 - 2 * s),
      breaks: [0.5],
    };
    outer = join([
      side(L, T, centre, profile),
      side(T, R, centre, profile),
      side(R, B, centre, profile),
      side(B, L, centre, profile),
    ]);
  } else if (style === "column") {
    // A straight band that runs past the top and bottom, so it wraps.
    const w = (COLUMN_WIDTH[o.ogeeProportion] * width) / 2;
    outer = [
      { x: centre.x - w, y: -height },
      { x: centre.x + w, y: -height },
      { x: centre.x + w, y: 2 * height },
      { x: centre.x - w, y: 2 * height },
    ];
  } else if (style === "fourPoint") {
    const [bulge, pinch] = FOUR_POINT[o.ogeeCurve];
    const profile = flat(
      (s) => bulge * Math.sin(Math.PI * s) ** 3 - pinch * Math.sin(Math.PI * s),
    );
    outer = join([
      side(L, T, centre, profile),
      side(T, R, centre, profile),
      side(R, B, centre, profile),
      side(B, L, centre, profile),
    ]);
  } else if (style === "star") {
    // Each side pinches in on both halves, leaving a shoulder point midway.
    const pinch = STAR_PINCH[o.ogeeCurve];
    const profile: Profile = {
      at: (s) =>
        STAR_SHOULDER * Math.sin(Math.PI * s) -
        pinch * Math.abs(Math.sin(2 * Math.PI * s)),
      breaks: [0.5],
    };
    outer = join([
      side(L, T, centre, profile),
      side(T, R, centre, profile),
      side(R, B, centre, profile),
      side(B, L, centre, profile),
    ]);
  } else if (shapeTiles(o)) {
    // Opposite sides are exact translated copies of each other, which is
    // what lets the shape repeat edge to edge.
    const profile =
      style === "fan" || style === "bat"
        ? fanProfile(style, o.ogeeCurve)
        : style
          ? ogeeProfile(style, OGEE_SWAY[o.ogeeCurve], half.x / half.y)
          : flat(() => 0);
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
    outer = join([
      lt,
      tr,
      side(R, B, centre, profile),
      side(B, L, centre, profile),
    ]);
  }

  if (open)
    outer = scalePolygon(outer, centre, 1 + (o.openAmount / 100) * MAX_OPEN);

  const offsets = open
    ? [-1, 0, 1].flatMap((i) =>
        [-1, 0, 1].map((j) => ({ x: i * width, y: j * height })),
      )
    : [{ x: 0, y: 0 }];
  const withCopies = (poly: Vec[]) =>
    offsets.map((t) => translatePolygon(poly, t));

  const inner: Vec[][] = [];
  let region = outer;
  for (let i = 1; i <= o.innerCount; i++) {
    const k = 1 - i * o.innerSpacing;
    if (k <= 0.05) break;
    region = scalePolygon(outer, centre, k);
    inner.push(...withCopies(region));
  }

  const regionTiles = tiles && region === outer;
  let area: number | undefined;
  if (style === "column") {
    const xs = region.map((p) => p.x);
    area = (Math.max(...xs) - Math.min(...xs)) * height;
  }
  return {
    region,
    regionTiles,
    translations: [t1, t2],
    area,
    copies: withCopies(outer),
    inner,
    seamCorner: regionTiles ? T : null,
    seamSides: regionTiles ? [lt, tr] : [],
  };
}
