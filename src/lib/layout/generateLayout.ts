import { mulberry32, type Rng } from "./rng";
import { buildLattice, trellisLineWidth, type Lattice } from "./lattice";
import {
  clearance,
  latticeDistance,
  wrap,
  type Circle,
  type DistanceFn,
  type Vec,
} from "./geometry";
import { rectDomain, shapeDomain, type Domain } from "./domain";
import { signedDistance } from "../shapes/polygon";
import { fillGaps, roomAt } from "./packing";
import { RADIUS_RATIO } from "./constants";
import type {
  ElementClass,
  LayoutParams,
  LayoutResult,
  PlacedElement,
} from "./types";

const CLASS_ORDER: ElementClass[] = ["hero", "secondary", "filler"];
const CLASS_NUMBER: Record<ElementClass, number> = {
  hero: 1,
  secondary: 2,
  filler: 3,
};
const CLASS_NAME: Record<ElementClass, string> = {
  hero: "Hero",
  secondary: "Secondary",
  filler: "Filler",
};

// Fractions of the anchor lattice's nearest-neighbour spacing. Tuned so the
// three tiers together cover roughly half the canvas at any density.
const ANCHOR_RADIUS = 0.34;
const GAP = 0.05;
const SCATTER_JITTER = 0.3;
const CELL_SAMPLES = 48;
const SCATTER_SAMPLES_PER_ANCHOR = 60;
// A middle tier left uncapped can swallow every gap and leave the smallest
// tier with nowhere to go, so it gets at most this many per anchor.
const MIDDLE_TIER_PER_ANCHOR = 1.25;
const INRADIUS_SHARE = 0.5;
// Lattice anchors shrink so the smaller tiers still fit in each diamond's
// corners without touching the trellis lines.
const LATTICE_ANCHOR_SHARE = 0.7;
// A diamond has four corners: one for the middle tier, the rest for the
// smallest, so the lattice never crowds.
const LATTICE_CORNERS = 4;
// Upper bound on improvement passes when spreading motifs apart.
const MOTIF_PASSES = 30;
// Shifts tried per axis when moving the layout to avoid edge slivers.
const SLIVER_SHIFT_STEPS = 12;
// Rotation: neighbours compared against, and candidate angles tried.
const ANGLE_NEIGHBOURS = 6;
const ANGLE_CANDIDATES = 24;
// Spacing relaxation: rounds, and the share of the area the circles (plus
// half the gap around each) should fill.
const RELAX_ITERATIONS = 80;
const RELAX_FILL = 0.82;
// A hole gets an extra smallest-tier element when it can hold one with this
// share of the settled gap all round.
const HOLE_FILL = 0.9;

interface Instance extends Circle {
  cls: ElementClass;
}

type RadiusOf = (cls: ElementClass) => number;

// The finished pattern shrinks each template tile to a quarter and repeats it
// 2×2, so the template itself stays sparse: the midpoint gives ~4 anchors.
export function anchorCountForDensity(density: number): number {
  return Math.max(1, Math.round(Math.pow(36, density)));
}

function shuffle<T>(items: T[], rng: Rng): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function letterFor(index: number): string {
  let s = "";
  let n = index;
  do {
    s = String.fromCharCode(97 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

function labelFor(prefix: string, motif: number, motifCount: number): string {
  return motifCount === 1 ? prefix : `${prefix}${letterFor(motif)}`;
}

// Grid: solve the smaller tiers' positions once inside a single repeat cell,
// then stamp that exact arrangement onto every anchor — so every cell is
// mathematically identical and snapped to its true gap centres.
function gridInstances(
  lattice: Lattice,
  active: ElementClass[],
  radiusOf: RadiusOf,
  gap: number,
  width: number,
  height: number,
  bound?: (p: Vec) => number,
  corners = Infinity,
): Instance[] {
  const dist = latticeDistance(lattice.t1, lattice.t2);
  const { cellW, cellH } = lattice;
  const anchorCls = active[0];
  const placed: Circle[] = [{ x: 0, y: 0, r: radiusOf(anchorCls) }];

  const candidates: Vec[] = [];
  for (let i = 0; i < CELL_SAMPLES; i++) {
    for (let j = 0; j < CELL_SAMPLES; j++) {
      candidates.push({
        x: -cellW / 2 + ((i + 0.5) * cellW) / CELL_SAMPLES,
        y: -cellH / 2 + ((j + 0.5) * cellH) / CELL_SAMPLES,
      });
    }
  }
  const step = Math.max(cellW, cellH) / CELL_SAMPLES;

  const offsets: Instance[] = [];
  active.slice(1).forEach((cls, i, rest) => {
    const r = radiusOf(cls);
    const maxCount =
      i < rest.length - 1
        ? Math.floor(MIDDLE_TIER_PER_ANCHOR)
        : Math.max(0, corners - offsets.length);
    for (const p of fillGaps({
      candidates,
      placed,
      radius: r,
      gap,
      dist,
      step,
      maxCount,
      bound,
    })) {
      offsets.push({ ...p, r, cls });
    }
  });

  const out: Instance[] = [];
  for (const a of lattice.anchors) {
    out.push({ ...a, r: radiusOf(anchorCls), cls: anchorCls });
    for (const o of offsets) {
      out.push({
        x: wrap(a.x + o.x, width),
        y: wrap(a.y + o.y, height),
        r: o.r,
        cls: o.cls,
      });
    }
  }
  return out;
}

// When the tile is shrunk and repeated, a seam nothing crosses reads as a
// bare stripe. So one element of a random tier straddles the point where the
// seams meet, and one more sits somewhere random along each seam. Each pin
// is jittered less than its radius so it's guaranteed to cross.
function pinSeams(
  domain: Domain,
  active: ElementClass[],
  radiusOf: RadiusOf,
  gap: number,
  rng: Rng,
): Instance[] {
  const pins: Instance[] = [];
  const pickTier = () => active[Math.floor(rng() * active.length)];

  const pin = (base: () => Vec, cls: ElementClass) => {
    const r = radiusOf(cls);
    for (let attempt = 0; attempt < 10; attempt++) {
      const b = base();
      const p = domain.normalize({
        x: b.x + (rng() - 0.5) * 0.7 * r,
        y: b.y + (rng() - 0.5) * 0.7 * r,
      });
      if (clearance(p, pins, domain.dist) >= r + gap) {
        pins.push({ ...p, r, cls });
        return;
      }
    }
  };

  const corner = domain.seamCorner;
  if (!corner) return pins;
  pin(() => corner, pickTier());
  for (const seam of domain.seamSides) {
    pin(
      () => seam[Math.floor((0.2 + 0.6 * rng()) * (seam.length - 1))],
      pickTier(),
    );
  }
  return pins;
}

// Scattered (and inside the Diamond): no lattice, so any anchor count works.
// Anchors are spread by best-candidate sampling, nudged organically (never
// into a neighbour), then the smaller tiers pack into the gaps left over.
function scatteredInstances(
  anchorCount: number,
  spacing: number,
  domain: Domain,
  active: ElementClass[],
  radiusOf: RadiusOf,
  gap: number,
  rng: Rng,
): Instance[] {
  const { dist, normalize, bound } = domain;
  const anchorCls = active[0];
  const rA = radiusOf(anchorCls);
  const maxJitter = SCATTER_JITTER * spacing;
  const pins = pinSeams(domain, active, radiusOf, gap, rng);
  const pinned = (cls: ElementClass) =>
    pins.filter((p) => p.cls === cls).length;

  const count = Math.max(1500, SCATTER_SAMPLES_PER_ANCHOR * anchorCount);
  const candidates = Array.from({ length: count }, () => domain.sample(rng));
  const step = Math.sqrt(domain.area / count);
  const spread = fillGaps({
    candidates,
    placed: [...pins],
    radius: rA,
    gap,
    dist,
    step,
    maxCount: Math.max(0, anchorCount - pinned(anchorCls)),
    centre: false,
    bound,
  });
  const anchors: Circle[] = spread.map((p) => ({ ...p, r: rA }));

  // Nudge each anchor against the pins and every other anchor's current
  // position; if no nudge is legal it simply stays put, so the spacing
  // guaranteed above can never be broken.
  for (let k = 0; k < anchors.length; k++) {
    const others = [...pins, ...anchors.filter((_, i) => i !== k)];
    const a = anchors[k];
    for (let attempt = 0; attempt < 12; attempt++) {
      const angle = rng() * Math.PI * 2;
      const d = maxJitter * Math.sqrt(rng());
      const q = normalize({
        x: a.x + Math.cos(angle) * d,
        y: a.y + Math.sin(angle) * d,
      });
      if (roomAt(q, others, dist, bound) >= rA + gap) {
        anchors[k] = { ...q, r: rA };
        break;
      }
    }
  }

  const placed: Circle[] = [...pins, ...anchors];
  const out: Instance[] = [
    ...pins,
    ...anchors.map((a) => ({ ...a, cls: anchorCls })),
  ];

  active.slice(1).forEach((cls, i, rest) => {
    const r = radiusOf(cls);
    const maxCount =
      i < rest.length - 1
        ? Math.max(
            0,
            Math.round(MIDDLE_TIER_PER_ANCHOR * anchorCount) - pinned(cls),
          )
        : Infinity;
    for (const p of fillGaps({
      candidates,
      placed,
      radius: r,
      gap,
      dist,
      step,
      maxCount,
      bound,
    })) {
      out.push({ ...normalize(p), r, cls });
    }
  });
  // Settle the spacing, then drop the smallest tier into any hole still big
  // enough to hold one at the settled gap, and settle again.
  const first = relax(out, domain, gap);
  const smallest = active[active.length - 1];
  const rS = radiusOf(smallest);
  const extra = fillGaps({
    candidates,
    placed: first.items.map((p) => ({ ...p })),
    radius: rS,
    gap: Math.max(gap, first.target * HOLE_FILL),
    dist,
    step,
    bound,
  });
  if (!extra.length) return first.items;
  return relax(
    [
      ...first.items,
      ...extra.map((p) => ({ ...normalize(p), r: rS, cls: smallest })),
    ],
    domain,
    gap,
  ).items;
}

// Even out the spacing: every pair closer (edge to edge) than the target
// gap pushes apart, and the outline of a shape pushes inward, until things
// settle. Crowded spots spread into bare ones, so the gaps between all
// elements end up close to equal. The target gap is the one that would let
// the elements just fill the space.
function relax(
  items: Instance[],
  domain: Domain,
  gap: number,
): { items: Instance[]; target: number } {
  const n = items.length;
  if (n < 2) return { items, target: gap };
  const { delta, dist, bound, normalize } = domain;

  // Solve for the gap G at which the circles, each grown by G/2, cover the
  // usable share of the area.
  const cover = (G: number) =>
    items.reduce((sum, it) => sum + Math.PI * (it.r + G / 2) ** 2, 0);
  // A negative gap (overlap allowed) lets the solution go below touching.
  let lo = Math.min(0, gap);
  let hi = Math.sqrt(domain.area);
  for (let k = 0; k < 40; k++) {
    const mid = (lo + hi) / 2;
    if (cover(mid) < RELAX_FILL * domain.area) lo = mid;
    else hi = mid;
  }
  const target = Math.max(gap, lo);

  const minGap = (pts: Instance[]) => {
    let m = Infinity;
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        m = Math.min(m, dist(pts[i], pts[j]) - pts[i].r - pts[j].r);
      }
    }
    return m;
  };
  const inside = (p: Vec, r: number) => !bound || bound(p) >= r + gap;
  const before = minGap(items);

  let pts = items.map((it) => ({ ...it }));
  for (let iter = 0; iter < RELAX_ITERATIONS; iter++) {
    // Steps shrink as things settle.
    const ease = 1 - iter / RELAX_ITERATIONS;
    const moves = pts.map(() => ({ x: 0, y: 0 }));
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const v = delta(pts[i], pts[j]);
        const d = Math.hypot(v.x, v.y) || 1e-6;
        const short = target - (d - pts[i].r - pts[j].r);
        if (short <= 0) continue;
        const push = (short / 2) * 0.5;
        moves[i].x += (v.x / d) * push;
        moves[i].y += (v.y / d) * push;
        moves[j].x -= (v.x / d) * push;
        moves[j].y -= (v.y / d) * push;
      }
      if (bound) {
        // The outline keeps elements a target gap away, pushing inward.
        const p = pts[i];
        const room = bound(p) - p.r;
        if (room < target) {
          const h = 1;
          const gx =
            bound({ x: p.x + h, y: p.y }) - bound({ x: p.x - h, y: p.y });
          const gy =
            bound({ x: p.x, y: p.y + h }) - bound({ x: p.x, y: p.y - h });
          const gl = Math.hypot(gx, gy) || 1;
          const push = (target - room) * 0.5;
          moves[i].x += (gx / gl) * push;
          moves[i].y += (gy / gl) * push;
        }
      }
    }
    const maxStep = target * 0.5 * ease + 1;
    pts = pts.map((p, i) => {
      let { x, y } = moves[i];
      const len = Math.hypot(x, y);
      if (len > maxStep) {
        x *= maxStep / len;
        y *= maxStep / len;
      }
      const q = normalize({ x: p.x + x, y: p.y + y });
      return inside(q, p.r) ? { ...p, ...q } : p;
    });
  }

  // Never trade away the clearance the packing guaranteed.
  return {
    items: minGap(pts) >= Math.min(gap, before) - 1 ? pts : items,
    target,
  };
}

// Small layer with overlap: one element dropped at random inside each cell
// of a grid over the canvas. Every cell gets one, so the layer stays evenly
// spread, but within a cell anything goes — neighbours may overlap, just
// never so deeply that one hides the other.
function overlappingInstances(
  cellCount: number,
  domain: Domain,
  cls: ElementClass,
  r: number,
  width: number,
  height: number,
  rng: Rng,
): Instance[] {
  const cols = Math.max(1, Math.round(Math.sqrt((cellCount * width) / height)));
  const rows = Math.max(1, Math.round(cellCount / cols));
  const cw = width / cols;
  const ch = height / rows;
  const minDist = (2 - OVERLAP_SHARE) * r;
  const out: Instance[] = [];
  for (const c of shuffle(
    Array.from({ length: cols * rows }, (_, i) => i),
    rng,
  )) {
    const cx = (c % cols) * cw;
    const cy = Math.floor(c / cols) * ch;
    for (let attempt = 0; attempt < 12; attempt++) {
      const p = domain.normalize({ x: cx + rng() * cw, y: cy + rng() * ch });
      if (domain.bound && domain.bound(p) < r) continue;
      if (out.some((o) => domain.dist(o, p) < minDist)) continue;
      out.push({ ...p, r, cls });
      break;
    }
  }
  return out;
}

// How much of an element pokes across an edge it straddles: a piece
// narrower than this share of its radius reads as a sliver.
const SLIVER_SHARE = 0.35;

// Total sliver badness: for every element crossing an edge (or a tiling
// shape's outline), how far its far-side piece falls short of a decent size.
function sliverScore(items: Circle[], inset: (p: Vec) => number[]): number {
  let score = 0;
  for (const it of items) {
    for (const d of inset(it)) {
      const piece = it.r - d;
      if (piece > 0 && piece < SLIVER_SHARE * it.r) {
        score += (SLIVER_SHARE * it.r - piece) / it.r;
      }
    }
  }
  return score;
}

// The layout repeats, so shifting every element by the same amount keeps it
// seamless and keeps every spacing exactly as it was. Try a range of shifts
// and keep the one that leaves the fewest slivers at the edges; then, for
// free layouts, nudge any element still leaving a sliver either fully inside
// or clearly across.
function avoidSlivers(
  items: Instance[],
  domain: Domain,
  shape: LayoutParams["shape"],
  width: number,
  height: number,
  spacing: number,
  gap: number,
  free: boolean,
): Instance[] {
  if (domain.bound) return items; // Kept inside a shape: nothing crosses.
  const tiles = !!shape?.regionTiles;
  const inset = tiles
    ? (p: Vec) => [signedDistance(p, shape!.region)]
    : (p: Vec) => [Math.min(p.x, width - p.x), Math.min(p.y, height - p.y)];
  const shift = (dx: number, dy: number) =>
    items.map((it) => ({
      ...it,
      ...domain.normalize({ x: it.x + dx, y: it.y + dy }),
    }));

  let best = items;
  let bestScore = sliverScore(items, inset);
  const steps = SLIVER_SHIFT_STEPS;
  for (let a = 0; a < steps && bestScore > 0; a++) {
    for (let b = 0; b < steps && bestScore > 0; b++) {
      if (!a && !b) continue;
      let dx: number;
      let dy: number;
      if (tiles) {
        const [t1, t2] = shape!.translations;
        dx = (a / steps) * t1.x + (b / steps) * t2.x;
        dy = (a / steps) * t1.y + (b / steps) * t2.y;
      } else {
        dx = (a / steps) * spacing;
        dy = (b / steps) * spacing;
      }
      const moved = shift(dx, dy);
      const score = sliverScore(moved, inset);
      if (score < bestScore - 1e-9) {
        best = moved;
        bestScore = score;
      }
    }
  }
  if (!free || tiles || bestScore === 0) return best;

  // Nudge leftovers along the axis they cross.
  const out = best.map((it) => ({ ...it }));
  for (let i = 0; i < out.length; i++) {
    const it = out[i];
    for (const axis of ["x", "y"] as const) {
      const size = axis === "x" ? width : height;
      const v = it[axis];
      const d = Math.min(v, size - v);
      const piece = it.r - d;
      if (!(piece > 0 && piece < SLIVER_SHARE * it.r)) continue;
      const nearLow = v < size / 2;
      // Either fully inside, or across by half a radius.
      for (const target of [it.r + gap, 0.5 * it.r]) {
        const nv = nearLow ? target : size - target;
        const moved = { ...it, [axis]: nv };
        const clear = out.every(
          (o, j) => j === i || domain.dist(o, moved) >= o.r + it.r + gap - 1,
        );
        if (clear) {
          out[i] = moved;
          break;
        }
      }
    }
  }
  return out;
}

// Give every element its own rotation: each takes, from a ring of
// candidate angles, the one furthest from the angles of its nearest
// neighbours, so no two side-by-side elements point the same way.
function assignAngles(
  elements: PlacedElement[],
  dist: DistanceFn,
  rng: Rng,
): void {
  const done: PlacedElement[] = [];
  const turn = (a: number, b: number) => {
    const d = Math.abs(((a - b) % 360) + 360) % 360;
    return Math.min(d, 360 - d);
  };
  for (const index of shuffle(
    elements.map((_, i) => i),
    rng,
  )) {
    const el = elements[index];
    const neighbours = [...done]
      .sort((a, b) => dist(el, a) - dist(el, b))
      .slice(0, ANGLE_NEIGHBOURS);
    const offset = rng() * (360 / ANGLE_CANDIDATES);
    let bestAngle = offset;
    let bestGap = -1;
    for (let k = 0; k < ANGLE_CANDIDATES; k++) {
      const angle = offset + (k * 360) / ANGLE_CANDIDATES;
      const gap = neighbours.length
        ? Math.min(...neighbours.map((n) => turn(angle, n.angle)))
        : rng() * 180;
      if (gap > bestGap) {
        bestGap = gap;
        bestAngle = angle;
      }
    }
    el.angle = bestAngle % 360;
    done.push(el);
  }
}

// Deal motifs out evenly (each used as close to equally often as possible),
// then keep swapping pairs of placements while it pushes same-motif copies
// further apart. The cost is a repulsion between copies of the same motif
// (1/d²), so the best arrangement interleaves every motif across the whole
// canvas instead of letting one take over a region.
function assignMotifs(
  members: Vec[],
  motifCount: number,
  dist: DistanceFn,
  rng: Rng,
): number[] {
  const n = members.length;
  const result = new Array<number>(n).fill(0);
  if (motifCount <= 1 || n < 2) return result;

  // Balanced starting deal in random order.
  shuffle(
    members.map((_, i) => i),
    rng,
  ).forEach((index, k) => {
    result[index] = k % motifCount;
  });

  const w = Array.from({ length: n }, () => new Float64Array(n));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = Math.max(1, dist(members[i], members[j]));
      w[i][j] = w[j][i] = 1 / (d * d);
    }
  }
  // pull[i][m]: repulsion element i feels from copies of motif m.
  const pull = Array.from({ length: n }, () => new Float64Array(motifCount));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) if (j !== i) pull[i][result[j]] += w[i][j];
  }

  for (let pass = 0; pass < MOTIF_PASSES; pass++) {
    let improved = false;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = result[i];
        const b = result[j];
        if (a === b) continue;
        // Change in total cost if i and j trade motifs.
        const delta =
          pull[i][b] -
          w[i][j] +
          (pull[j][a] - w[i][j]) -
          pull[i][a] -
          pull[j][b];
        if (delta >= -1e-15) continue;
        result[i] = b;
        result[j] = a;
        for (let k = 0; k < n; k++) {
          if (k !== i) {
            pull[k][a] -= w[k][i];
            pull[k][b] += w[k][i];
          }
          if (k !== j) {
            pull[k][b] -= w[k][j];
            pull[k][a] += w[k][j];
          }
        }
        improved = true;
      }
    }
    if (!improved) break;
  }
  return result;
}

// Mirror: lay out one quarter, kept clear of its edges (every edge is a
// mirror axis), then flip it into the other three quarters. The flipped
// 2×2 block repeats as a plain grid.
function mirrorLayout(params: LayoutParams): LayoutResult {
  const w = params.widthPx / 2;
  const h = params.heightPx / 2;
  const quarter = [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ];
  const inner = generateLayout({
    ...params,
    widthPx: w,
    heightPx: h,
    repeatStyle: "scattered",
    // Four copies of the quarter, so a quarter of the placements each.
    density: Math.max(0, params.density - Math.log(4) / Math.log(36)),
    shape: {
      region: quarter,
      regionTiles: false,
      translations: [
        { x: w, y: 0 },
        { x: 0, y: h },
      ],
      copies: [quarter],
      inner: [],
      seamCorner: null,
      seamSides: [],
    },
  });
  const W = params.widthPx;
  const H = params.heightPx;
  const elements = inner.elements.flatMap((e) => [
    e,
    { ...e, id: `${e.id}-h`, x: W - e.x, angle: 180 - e.angle },
    { ...e, id: `${e.id}-v`, y: H - e.y, angle: -e.angle },
    { ...e, id: `${e.id}-hv`, x: W - e.x, y: H - e.y, angle: 180 + e.angle },
  ]);
  return { elements, warnings: inner.warnings, mirrorAxes: true };
}

// Ditsy: tiny motifs, scattered this many times more densely.
const DITSY_MULTIPLIER = 4;
// Small layer: this many times more elements than the main layer.
const SMALL_LAYER_MULTIPLIER = 8;
// Small layer: elements fill less of their spacing, so they read as tiny.
const SMALL_LAYER_SHARE = 0.6;
// Large layer: elements fill more of their spacing.
const LARGE_LAYER_SHARE = 1.25;
const OVERLAP_SHARE = 0.6;

export function generateLayout(params: LayoutParams): LayoutResult {
  if (params.repeatStyle === "mirror" && !params.shape)
    return mirrorLayout(params);
  const {
    widthPx: width,
    heightPx: height,
    repeatStyle,
    density,
    seed,
  } = params;
  // The extra layers use a single tier: the hero's settings for Large, the
  // filler's for Small.
  const layer = params.layer ?? "main";
  const none = { count: 0, color: "" };
  const configs = {
    hero: layer === "small" ? none : params.hero,
    secondary: layer === "main" ? params.secondary : none,
    filler: layer === "large" ? none : params.filler,
  };
  const prefixOf = (cls: ElementClass) =>
    layer === "large"
      ? "XL"
      : layer === "small"
        ? "XS"
        : String(CLASS_NUMBER[cls]);
  const active = CLASS_ORDER.filter((c) => configs[c].count > 0);
  if (active.length === 0) return { elements: [], warnings: [] };

  const rng = mulberry32(seed);
  const target =
    anchorCountForDensity(density) *
    (repeatStyle === "ditsy" ? DITSY_MULTIPLIER : 1) *
    (layer === "small" ? SMALL_LAYER_MULTIPLIER : 1);
  const { shape } = params;
  const isFree =
    !!shape || repeatStyle === "scattered" || repeatStyle === "ditsy";
  const domain = shape
    ? shapeDomain(shape, width, height)
    : rectDomain(width, height);
  const lattice = isFree
    ? null
    : buildLattice(width, height, repeatStyle, target);
  // A shape gets anchors in proportion to its share of the canvas; spacing
  // is area-per-anchor either way, so circle sizes match the grids.
  const anchorCount = shape
    ? Math.max(1, Math.round((target * domain.area) / (width * height)))
    : target;
  const spacing = lattice
    ? lattice.spacing
    : Math.sqrt(domain.area / anchorCount);

  // Narrow shapes (a concave diamond's arms) can't hold full-size circles,
  // so cap the anchor at half the shape's inner radius and let the smaller
  // tiers reach into the thin parts.
  const inradius =
    shape && !shape.regionTiles
      ? signedDistance({ x: width / 2, y: height / 2 }, shape.region)
      : Infinity;
  const anchorRadius = Math.min(
    ANCHOR_RADIUS *
      spacing *
      (repeatStyle === "lattice" ? LATTICE_ANCHOR_SHARE : 1) *
      (layer === "large"
        ? LARGE_LAYER_SHARE
        : layer === "small"
          ? SMALL_LAYER_SHARE
          : 1),
    INRADIUS_SHARE * inradius,
  );
  const radiusOf: RadiusOf = (cls) =>
    (anchorRadius * RADIUS_RATIO[cls]) / RADIUS_RATIO[active[0]];
  // Overlap lets small elements sit up to this share of their radius into
  // each other once the layer is dense.
  const gap =
    layer === "small" && params.allowOverlap
      ? -OVERLAP_SHARE * anchorRadius
      : GAP * spacing;

  // Lattice circles stay inside their diamond, clear of the trellis lines.
  const trellisBound =
    repeatStyle === "lattice" && lattice
      ? (p: Vec) => {
          const ax = 2 / lattice.cellW;
          const ay = 2 / lattice.cellH;
          return (
            (1 - ax * Math.abs(p.x) - ay * Math.abs(p.y)) / Math.hypot(ax, ay) -
            trellisLineWidth(width, height) / 2
          );
        }
      : undefined;
  const overlapping = layer === "small" && !!params.allowOverlap;
  const instances = overlapping
    ? overlappingInstances(
        Math.round((anchorCount * width * height) / domain.area),
        domain,
        active[0],
        anchorRadius,
        width,
        height,
        rng,
      )
    : lattice
      ? gridInstances(
          lattice,
          active,
          radiusOf,
          gap,
          width,
          height,
          trellisBound,
          trellisBound ? LATTICE_CORNERS : Infinity,
        )
      : scatteredInstances(
          anchorCount,
          spacing,
          domain,
          active,
          radiusOf,
          gap,
          rng,
        );

  const placedInstances =
    repeatStyle === "lattice" || overlapping
      ? instances
      : avoidSlivers(
          instances,
          domain,
          shape,
          width,
          height,
          spacing,
          gap,
          isFree,
        );

  const dist = domain.dist;
  const elements: PlacedElement[] = [];
  const warnings: string[] = [];

  for (const cls of active) {
    const members = placedInstances.filter((i) => i.cls === cls);
    const motifCount = configs[cls].count;
    if (members.length < motifCount) {
      warnings.push(
        `${layer === "large" ? "Large" : layer === "small" ? "Small" : CLASS_NAME[cls]}: ${motifCount} motifs but only ${members.length} spots fit. Raise Density or lower the count.`,
      );
    }
    const motifs = assignMotifs(members, motifCount, dist, rng);
    members.forEach((m, i) => {
      elements.push({
        id: `${cls}-${i}`,
        class: cls,
        label: labelFor(prefixOf(cls), motifs[i], motifCount),
        x: m.x,
        y: m.y,
        radius: m.r,
        color: configs[cls].color,
        angle: 0,
      });
    });
  }
  assignAngles(elements, dist, rng);

  return {
    elements,
    warnings,
    trellis:
      repeatStyle === "lattice" && lattice
        ? { cellW: lattice.cellW, cellH: lattice.cellH }
        : undefined,
  };
}
