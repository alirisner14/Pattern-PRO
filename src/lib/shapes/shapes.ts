import type { Vec } from "../layout/geometry";
import { scalePolygon, translatePolygon } from "./polygon";

export type ShapeKind = "diamond" | "ogee";
export type ShapeSides = "straight" | "concave" | "convex";
export type ShapeFit = "closed" | "open";
// The shapes offered under Ogee, in the order the user listed them.
export type OgeeStyle =
  | "bat"
  | "lantern"
  | "fan"
  | "fourPoint"
  | "quatrefoil"
  | "clover"
  | "onion"
  | "leaf"
  | "moroccan"
  | "ogee"
  | "deepOgee"
  | "petalX";

export interface ShapeOptions {
  kind: ShapeKind;
  sides: ShapeSides;
  fit: ShapeFit;
  ogeeStyle: OgeeStyle;
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
  // Overrides the polygon's area.
  area?: number;
  // The shape plus any copies that show on the canvas (Open reaches past edges).
  copies: Vec[][];
  inner: Vec[][];
  seamCorner: Vec | null;
  seamSides: Vec[][];
}

const SIDE_SAMPLES = 96;
const CURVE_SAMPLES = 24;
// Concave/convex diamond bow, as a fraction of the side length. (0.21 would
// turn the diamond into a circle, so keep it gentle.)
const BOW = 0.07;
// Open at 100% scales the shape this much past touching the edges.
const MAX_OPEN = 0.5;
// Quatrefoil: how far each round lobe's centre sits from the middle, as a
// share of the half-width (so the lobes just touch the canvas edges).
const QUATREFOIL_OFFSET = 0.49;

// Ogee sides leave each end at slope 1 (so the shape rounds smoothly into
// its neighbour at the sides and closes into a clean point top and bottom);
// these terms shape the S-curve in between.
const OGEE_TERMS: Record<"ogee" | "deepOgee", number[]> = {
  ogee: [-2.555, 5.934, 7.42, 0.232],
  deepOgee: [-1.617, 6.587, 11.215, 1.336],
};

// Shapes that repeat edge to edge on their own (when Closed): opposite sides
// are exact translated copies. Every other shape keeps its circles inside.
const TILING: OgeeStyle[] = ["bat", "ogee", "deepOgee"];

export function shapeTiles(
  o: Pick<ShapeOptions, "kind" | "sides" | "ogeeStyle">,
): boolean {
  return o.kind === "ogee"
    ? TILING.includes(o.ogeeStyle)
    : o.sides === "straight";
}

// An outline drawn as smooth curves: each anchor is a point the outline
// passes through, with the handles that set how it arrives and leaves
// (canvas fractions, 0..1; a handle on its own anchor makes a sharp corner).
// Only one part is given and symmetry completes it: "x" is the left half
// (top to bottom), "xy" the top-left quarter (top to left middle), "d4" an
// eighth (top to the top-left diagonal).
interface Outline {
  sym: "x" | "xy" | "d4";
  anchors: {
    at: [number, number];
    in: [number, number] | null;
    out: [number, number] | null;
  }[];
}

type OutlineStyle = Exclude<
  OgeeStyle,
  "bat" | "ogee" | "deepOgee" | "quatrefoil"
>;

const OUTLINES: Record<OutlineStyle, Outline> = {
  lantern: {
    sym: "xy",
    anchors: [
      { at: [0.5, 0.006], in: null, out: [0.472, 0.068] },
      { at: [0.441, 0.13], in: [0.466, 0.088], out: [0.386, 0.224] },
      { at: [0.32, 0.247], in: [0.367, 0.181], out: [0.32, 0.247] },
      { at: [0.357, 0.282], in: [0.359, 0.256], out: [0.354, 0.332] },
      { at: [0.294, 0.324], in: [0.294, 0.324], out: [0.265, 0.333] },
      { at: [0.185, 0.39], in: [0.192, 0.382], out: [0.183, 0.393] },
      { at: [0.144, 0.5], in: [0.144, 0.435], out: null },
    ],
  },
  fan: {
    sym: "x",
    anchors: [
      { at: [0.5, 0.105], in: null, out: [0.323, 0.105] },
      { at: [0.139, 0.27], in: [0.266, 0.161], out: [0.057, 0.34] },
      { at: [0.003, 0.533], in: [0.003, 0.533], out: [0.151, 0.533] },
      { at: [0.365, 0.64], in: [0.268, 0.548], out: [0.403, 0.676] },
      { at: [0.5, 0.886], in: [0.453, 0.768], out: null },
    ],
  },
  fourPoint: {
    sym: "d4",
    anchors: [
      { at: [0.5, 0.008], in: null, out: [0.475, 0.077] },
      { at: [0.404, 0.155], in: [0.431, 0.139], out: [0.345, 0.19] },
      { at: [0.289, 0.289], in: [0.338, 0.234], out: null },
    ],
  },
  clover: {
    sym: "xy",
    anchors: [
      { at: [0.5, 0.066], in: null, out: [0.455, 0.066] },
      { at: [0.325, 0.012], in: [0.4, -0.006], out: [0.247, 0.031] },
      { at: [0.205, 0.13], in: [0.212, 0.085], out: [0.2, 0.161] },
      { at: [0.226, 0.288], in: [0.22, 0.242], out: [0.215, 0.282] },
      { at: [0.109, 0.266], in: [0.14, 0.256], out: [0.043, 0.287] },
      { at: [0.015, 0.365], in: [0.031, 0.324], out: [0, 0.403] },
      { at: [0.06, 0.5], in: [0.06, 0.474], out: null },
    ],
  },
  onion: {
    sym: "x",
    anchors: [
      { at: [0.5, 0.01], in: null, out: [0.463, 0.049] },
      { at: [0.44, 0.15], in: [0.458, 0.134], out: [0.409, 0.178] },
      { at: [0.25, 0.29], in: [0.307, 0.229], out: [0.186, 0.358] },
      { at: [0.155, 0.48], in: [0.16, 0.389], out: [0.151, 0.554] },
      { at: [0.25, 0.69], in: [0.177, 0.594], out: [0.31, 0.769] },
      { at: [0.44, 0.83], in: [0.423, 0.814], out: [0.468, 0.858] },
      { at: [0.5, 0.99], in: [0.46, 0.91], out: null },
    ],
  },
  leaf: {
    sym: "xy",
    anchors: [
      { at: [0.5, 0.004], in: null, out: [0.485, 0.02] },
      { at: [0.465, 0.07], in: [0.476, 0.048], out: [0.465, 0.07] },
      { at: [0.35, 0.234], in: [0.377, 0.184], out: [0.306, 0.314] },
      { at: [0.275, 0.5], in: [0.275, 0.394], out: null },
    ],
  },
  moroccan: {
    sym: "x",
    anchors: [
      { at: [0.5, 0.006], in: null, out: [0.476, 0.04] },
      { at: [0.44, 0.141], in: [0.485, 0.09], out: [0.403, 0.183] },
      { at: [0.3, 0.235], in: [0.379, 0.18], out: [0.226, 0.287] },
      { at: [0.215, 0.336], in: [0.263, 0.309], out: [0.12, 0.395] },
      { at: [0.097, 0.493], in: [0.115, 0.393], out: [0.081, 0.588] },
      { at: [0.2, 0.69], in: [0.2, 0.69], out: [0.225, 0.725] },
      { at: [0.296, 0.775], in: [0.256, 0.734], out: [0.313, 0.796] },
      { at: [0.348, 0.83], in: [0.284, 0.817], out: [0.397, 0.855] },
      { at: [0.5, 0.994], in: [0.441, 0.939], out: null },
    ],
  },
  petalX: {
    sym: "d4",
    anchors: [
      { at: [0.5, 0.21], in: null, out: [0.399, 0.11] },
      { at: [0.233, 0.03], in: [0.321, 0.056], out: [0.227, 0.028] },
      { at: [0.025, 0.025], in: [0.066, -0.016], out: null },
    ],
  },
};

function cubic(p0: Vec, c1: Vec, c2: Vec, p3: Vec): Vec[] {
  return Array.from({ length: CURVE_SAMPLES }, (_, i) => {
    const t = i / CURVE_SAMPLES;
    const u = 1 - t;
    const a = u * u * u;
    const b = 3 * u * u * t;
    const c = 3 * u * t * t;
    const d = t * t * t;
    return {
      x: a * p0.x + b * c1.x + c * c2.x + d * p3.x,
      y: a * p0.y + b * c1.y + c * c2.y + d * p3.y,
    };
  });
}

// The full outline (canvas fractions), clamped so a closed shape stays on
// the canvas.
function outline(def: Outline): Vec[] {
  const v = ([x, y]: [number, number]): Vec => ({ x, y });
  const { anchors } = def;
  const part: Vec[] = [];
  for (let i = 0; i < anchors.length - 1; i++) {
    const a = anchors[i];
    const b = anchors[i + 1];
    part.push(...cubic(v(a.at), v(a.out!), v(b.in!), v(b.at)));
  }
  part.push(v(anchors[anchors.length - 1].at));

  const flipX = (p: Vec) => ({ x: 1 - p.x, y: p.y });
  const flipY = (p: Vec) => ({ x: p.x, y: 1 - p.y });
  const flipD = (p: Vec) => ({ x: p.y, y: p.x });
  const open = (pts: Vec[]) => pts.slice(0, -1);
  let full: Vec[];
  if (def.sym === "x") {
    full = [...open(part), ...open(part.map(flipX).reverse())];
  } else {
    const q =
      def.sym === "d4" ? [...open(part), ...part.map(flipD).reverse()] : part;
    full = [
      ...open(q),
      ...open(q.map(flipY).reverse()),
      ...open(q.map((p) => flipX(flipY(p)))),
      ...open(q.map(flipX).reverse()),
    ];
  }
  return full.map((p) => ({
    x: Math.min(1, Math.max(0, p.x)),
    y: Math.min(1, Math.max(0, p.y)),
  }));
}

// Offset of a circular arc over s in [0, 1] with the given sagitta (both as
// fractions of the chord).
function arc(s: number, sag: number): number {
  const r = (0.25 + sag * sag) / (2 * sag);
  return Math.sqrt(Math.max(0, r * r - (s - 0.5) ** 2)) - (r - sag);
}

interface Profile {
  at: (s: number) => number;
  // Where the profile has a corner, sampled exactly so it stays crisp.
  breaks: number[];
}

const mirror = (p: Profile): Profile => ({
  at: (s) => p.at(1 - s),
  breaks: p.breaks.map((b) => 1 - b),
});
const flat = (at: (s: number) => number): Profile => ({ at, breaks: [] });

// k is the cell's width / height: the slope the side needs at its ends to
// meet its neighbour smoothly.
function ogeeProfile(terms: number[], k: number): Profile {
  return flat((s) => {
    const q = s * (1 - s);
    let f = 1;
    let qq = q;
    for (const c of terms) {
      f += c * qq;
      qq *= q;
    }
    return k * s * (1 - s) * (1 - 2 * s) * f;
  });
}

// Bat: each upper side is two quarter circles (a side lobe, then half the
// top lobe); the translated copies along the bottom pinch it to a point.
const BAT: Profile = {
  at: (s) => 0.5 * arc(s < 0.5 ? 2 * s : 2 * s - 1, 0.207),
  breaks: [0.5],
};

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
  // Sample just either side of each break so corners stay sharp.
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

const join = (sides: Vec[][]) => sides.flatMap((s) => s.slice(0, -1));

// Four round lobes that just touch the canvas edges, meeting in sharp
// points between them (canvas fractions).
function quatrefoil(): Vec[] {
  const d = QUATREFOIL_OFFSET;
  const r = 1 - d;
  const centres = [
    { x: d, y: 0 },
    { x: 0, y: d },
    { x: -d, y: 0 },
    { x: 0, y: -d },
  ];
  const n = 512;
  return Array.from({ length: n }, (_, i) => {
    const a = (2 * Math.PI * i) / n;
    const u = { x: Math.cos(a), y: Math.sin(a) };
    let reach = 0;
    for (const c of centres) {
      const along = c.x * u.x + c.y * u.y;
      const disc = along * along - (c.x * c.x + c.y * c.y) + r * r;
      if (disc >= 0) reach = Math.max(reach, along + Math.sqrt(disc));
    }
    return { x: 0.5 + (reach * u.x) / 2, y: 0.5 + (reach * u.y) / 2 };
  });
}

export function buildShape(
  o: ShapeOptions,
  width: number,
  height: number,
): ShapeModel {
  const centre = { x: width / 2, y: height / 2 };
  const L = { x: 0, y: centre.y };
  const T = { x: centre.x, y: 0 };
  const R = { x: width, y: centre.y };
  const B = { x: centre.x, y: height };
  // Copies offset by these tile the plane: whatever leaves one side
  // re-enters through the opposite side.
  const t1 = { x: width / 2, y: height / 2 };
  const t2 = { x: width / 2, y: -height / 2 };
  const open = o.fit === "open";
  const tiles = shapeTiles(o) && !open;
  const style = o.kind === "ogee" ? o.ogeeStyle : null;
  const toCanvas = (pts: Vec[]) =>
    pts.map((p) => ({ x: p.x * width, y: p.y * height }));

  let lt: Vec[] = [];
  let tr: Vec[] = [];
  let outer: Vec[];
  if (style === "bat" || style === "ogee" || style === "deepOgee") {
    // Opposite sides are exact translated copies of each other, which is
    // what lets the shape repeat edge to edge.
    const profile =
      style === "bat" ? BAT : ogeeProfile(OGEE_TERMS[style], width / height);
    lt = side(L, T, centre, profile);
    tr = side(T, R, centre, mirror(profile));
    const rb = translatePolygon(lt, t1).reverse();
    const bl = translatePolygon(tr, { x: -t2.x, y: -t2.y }).reverse();
    outer = join([lt, tr, rb, bl]);
  } else if (style === "quatrefoil") {
    outer = toCanvas(quatrefoil());
  } else if (style) {
    outer = toCanvas(outline(OUTLINES[style]));
  } else {
    const bow = o.sides === "convex" ? BOW : o.sides === "concave" ? -BOW : 0;
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
  return {
    region,
    regionTiles,
    translations: [t1, t2],
    copies: withCopies(outer),
    inner,
    seamCorner: regionTiles ? T : null,
    seamSides: regionTiles ? [lt, tr] : [],
  };
}
