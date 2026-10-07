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
import {
  bestSpacing,
  chooseCount,
  latticePoints,
  pickLattice,
  type LatticeShape,
} from "./pointLattice";
import { RADIUS_RATIO } from "./constants";
import type {
  ElementClass,
  ElementClassConfig,
  LayoutParams,
  LayoutResult,
  PlacedElement,
} from "./types";

const CLASS_ORDER: ElementClass[] = ["xl", "hero", "secondary", "filler", "xs"];
const CLASS_PREFIX: Record<ElementClass, string> = {
  xl: "XL",
  hero: "1",
  secondary: "2",
  filler: "3",
  xs: "XS",
};
const CLASS_NAME: Record<ElementClass, string> = {
  xl: "Extra large",
  hero: "Hero",
  secondary: "Secondary",
  filler: "Filler",
  xs: "Extra small",
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
// A lattice vector counts as a neighbour link (so its midpoint is a saddle)
// when it is at most this much longer than the shortest one.
const SADDLE_REACH = 1.2;
// A saddle accepts a circle that leaves at least this share of the normal gap.
const SADDLE_MIN_GAP = 0.4;
// With only two sizes the smaller fills every gap at this share of the gap.
const TWO_TIER_GAP = 0.4;
// How much a single-size layer (Large, Small) drifts off its lattice: all
// identical circles on a perfect lattice would read as mechanical.
const SINGLE_TIER_LOOSENESS = 0.4;
const MOTIF_FALLOFF = 4;
// Weight of the half-and-half balance, and how many starting deals to try.
const MOTIF_BALANCE = 1;
const MOTIF_STARTS = 4;
// Shifts tried per axis when moving the layout to avoid edge slivers.
const SLIVER_SHIFT_STEPS = 12;
// Rotation: neighbours compared against, and candidate angles tried.
const ANGLE_NEIGHBOURS = 6;
const ANGLE_CANDIDATES = 24;
// Neighbouring elements are never rotated closer together than this.
const MIN_NEIGHBOUR_TURN = 25;
// Spacing relaxation: rounds, and the share of the area the circles (plus
// half the gap around each) should fill.
const RELAX_ITERATIONS = 80;
const RELAX_FILL = 0.82;
// A hole gets an extra smallest-tier element when it can hold one with this
// share of the settled gap all round.
const HOLE_FILL = 0;
// The final hole fill uses this share of the normal gap.
const FINAL_FILL_GAP = 1;

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
  tilted = false,
): Instance[] {
  const dist = latticeDistance(lattice.t1, lattice.t2);
  const { cellW, cellH } = lattice;
  const anchorCls = active[0];
  const placed: Circle[] = [{ x: 0, y: 0, r: radiusOf(anchorCls) }];

  const candidates: Vec[] = [];
  for (let i = 0; i < CELL_SAMPLES; i++) {
    for (let j = 0; j < CELL_SAMPLES; j++) {
      if (tilted) {
        // A tilted lattice's cell is a parallelogram around the anchor.
        const a = (i + 0.5) / CELL_SAMPLES - 0.5;
        const b = (j + 0.5) / CELL_SAMPLES - 0.5;
        candidates.push({
          x: a * lattice.t1.x + b * lattice.t2.x,
          y: a * lattice.t1.y + b * lattice.t2.y,
        });
      } else {
        candidates.push({
          x: -cellW / 2 + ((i + 0.5) * cellW) / CELL_SAMPLES,
          y: -cellH / 2 + ((j + 0.5) * cellH) / CELL_SAMPLES,
        });
      }
    }
  }
  const step = Math.max(cellW, cellH) / CELL_SAMPLES;

  const offsets: Instance[] = [];
  active.slice(1).forEach((cls, i, rest) => {
    const r = radiusOf(cls);
    // Tilted lattices fill every hole as roomy as the best one (one in a
    // square cell, two in a hexagonal one); the rest go to the smaller tier.
    const maxCount =
      i < rest.length - 1
        ? tilted
          ? 2
          : Math.floor(MIDDLE_TIER_PER_ANCHOR)
        : Math.max(0, corners - offsets.length);
    if (tilted) {
      // A tilted lattice has two kinds of gap, as in the benchmark template:
      // the deep holes (the middle of each cell) and the saddles (midway
      // between neighbouring anchors). The first smaller tier takes the holes,
      // the next the saddles, one each; any further tiers fill what is left.
      // With only one smaller tier it takes both.
      const isLast = i === rest.length - 1;
      if (i === 0 && isLast) {
        // Only two sizes: nothing to hand the saddles to, so the smaller
        // one fills every gap, biggest first (a little tighter, so the
        // hole in a hexagonal cell still takes one).
        for (const p of fillGaps({
          candidates,
          placed,
          radius: r,
          gap: gap * TWO_TIER_GAP,
          dist,
          step,
          maxCount: Infinity,
        })) {
          offsets.push({ ...p, r, cls });
        }
        return;
      }
      if (i === 0) {
        for (const p of fillGaps({
          candidates,
          placed,
          radius: r,
          gap,
          dist,
          step,
          maxCount: 2,
          relativeRoom: 0.8,
        })) {
          offsets.push({ ...p, r, cls });
        }
      }
      if (i === 1) {
        for (const p of saddlePoints(lattice.t1, lattice.t2)) {
          if (roomAt(p, placed, dist) < r + SADDLE_MIN_GAP * gap) continue;
          placed.push({ x: p.x, y: p.y, r });
          offsets.push({ ...p, r, cls });
        }
      }
      if (i >= 2) {
        for (const p of fillGaps({
          candidates,
          placed,
          radius: r,
          gap,
          dist,
          step,
          maxCount: isLast ? Infinity : 2,
          relativeRoom: isLast ? undefined : 0.75,
        })) {
          offsets.push({ ...p, r, cls });
        }
      }
      return;
    }
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

// After the best slide, a dense layout may still have the odd element with a
// thin piece over an edge. Nudge each one along that axis: either fully
// inside, or far enough across that the piece is a decent size — whichever
// still leaves it clear of its neighbours.
function trimSlivers(
  items: Instance[],
  dist: DistanceFn,
  gap: number,
  width: number,
  height: number,
): Instance[] {
  const out = items.map((it) => ({ ...it }));
  for (let i = 0; i < out.length; i++) {
    for (const axis of ["x", "y"] as const) {
      const it = out[i];
      const size = axis === "x" ? width : height;
      const v = it[axis];
      const inward = v < size / 2 ? 1 : -1;
      const piece = it.r - Math.min(v, size - v);
      if (!(piece > 0 && piece < SLIVER_SHARE * it.r)) continue;
      for (const move of [piece + 1, -(SLIVER_SHARE * it.r - piece + 1)]) {
        const to = { ...it, [axis]: wrap(v + inward * move, size) };
        const clear = out.every(
          (o, j) => j === i || dist(o, to) - o.r - it.r >= 0.1 * gap,
        );
        if (clear) {
          out[i] = to;
          break;
        }
      }
    }
  }
  return out;
}

// Midpoints of the shortest lattice vectors: the saddles between neighbouring
// anchors. One per edge of the lattice's cell (two in a square lattice, three
// in a hexagonal one); the longer diagonals don't count.
function saddlePoints(t1: Vec, t2: Vec): Vec[] {
  const shortest = Math.hypot(t1.x, t1.y);
  return [
    t1,
    t2,
    { x: t1.x + t2.x, y: t1.y + t2.y },
    { x: t1.x - t2.x, y: t1.y - t2.y },
  ]
    .filter((v) => Math.hypot(v.x, v.y) <= shortest * SADDLE_REACH)
    .map((v) => ({ x: v.x / 2, y: v.y / 2 }));
}

// Loosen a lattice layout: every element drifts a random amount within its
// own spare room. Each may use at most half of the spare room it has to its
// nearest neighbour, so even if two drift towards each other they cannot
// touch, and the spacing stays balanced.
function loosen(
  items: Instance[],
  dist: DistanceFn,
  gap: number,
  amount: number,
  width: number,
  height: number,
  rng: Rng,
): Instance[] {
  if (amount <= 0) return items;
  return items.map((it, i) => {
    let room = Infinity;
    for (let j = 0; j < items.length; j++) {
      if (j !== i)
        room = Math.min(room, dist(it, items[j]) - it.r - items[j].r);
    }
    const reach = 0.5 * amount * Math.max(0, room - gap);
    if (!(reach > 0)) return it;
    const angle = rng() * Math.PI * 2;
    const d = reach * Math.sqrt(rng());
    return {
      ...it,
      x: wrap(it.x + Math.cos(angle) * d, width),
      y: wrap(it.y + Math.sin(angle) * d, height),
    };
  });
}

// A lattice layout can slide anywhere without changing any spacing, so slide
// it to where the tile's edges cut the elements best: no thin slivers, and
// as much of the two seam lines as possible running through elements (so a
// shrunk, repeated tile has no bare stripes). Among equally good slides one
// is picked at random, which is what makes each rebuild look different.
function seamShift(
  items: Instance[],
  t1: Vec,
  t2: Vec,
  width: number,
  height: number,
  rng: Rng,
): Instance[] {
  // More elements means more edges to keep clear, so look at more slides.
  const S = items.length <= 40 ? 24 : items.length <= 150 ? 24 : 40;
  const BINS = 48;
  const options: { dx: number; dy: number; sliver: number; cover: number }[] =
    [];

  for (let a = 0; a < S; a++) {
    for (let b = 0; b < S; b++) {
      const dx = (a / S) * t1.x + (b / S) * t2.x;
      const dy = (a / S) * t1.y + (b / S) * t2.y;
      const covered = new Uint8Array(2 * BINS);
      let sliver = 0;
      for (const it of items) {
        const x = wrap(it.x + dx, width);
        const y = wrap(it.y + dy, height);
        const ex = Math.min(x, width - x);
        const ey = Math.min(y, height - y);
        for (const d of [ex, ey, Math.hypot(ex, ey)]) {
          const piece = it.r - d;
          if (piece > 0 && piece < SLIVER_SHARE * it.r) {
            sliver += (SLIVER_SHARE * it.r - piece) / it.r;
          }
        }
        // Which stretch of each seam line this element covers.
        const mark = (
          offset: number,
          near: number,
          along: number,
          size: number,
        ) => {
          if (near >= it.r) return;
          const half = Math.sqrt(it.r * it.r - near * near);
          const lo = Math.floor(((along - half) / size) * BINS);
          const hi = Math.floor(((along + half) / size) * BINS);
          for (let k = lo; k <= hi; k++) {
            covered[offset + (((k % BINS) + BINS) % BINS)] = 1;
          }
        };
        mark(0, ex, y, height);
        mark(BINS, ey, x, width);
      }
      let cover = 0;
      for (const c of covered) cover += c;
      options.push({ dx, dy, sliver, cover: cover / (2 * BINS) });
    }
  }

  const clean = options.filter((o) => o.sliver < 1e-9);
  const pool = clean.length ? clean : options;
  const key = (o: (typeof options)[number]) => (clean.length ? 0 : o.sliver);
  const bestKey = Math.min(...pool.map(key));
  const finalists = pool.filter((o) => key(o) <= bestKey + 1e-9);
  finalists.sort((p, q) => q.cover - p.cover);
  const top = finalists.slice(
    0,
    Math.max(3, Math.ceil(finalists.length * 0.25)),
  );
  const chosen = top[Math.floor(rng() * top.length)];
  return items.map((it) => ({
    ...it,
    x: wrap(it.x + chosen.dx, width),
    y: wrap(it.y + chosen.dy, height),
  }));
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
      // A capped middle tier spreads across the canvas; the last tier fills
      // every remaining gap anyway.
      spreadFrom:
        i < rest.length - 1 ? pins.filter((q) => q.cls === cls) : undefined,
    })) {
      out.push({ ...normalize(p), r, cls });
    }
  });
  // Settle the spacing, then drop the smallest tier into any hole still big
  // enough to hold one at the settled gap, and settle again.
  const first = relax(out, domain, gap);
  // A single-tier layer (Large, Small) keeps exactly the count its density
  // asks for; holes are already even after settling.
  if (active.length < 2) return first.items;
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
  const settled = extra.length
    ? relax(
        [
          ...first.items,
          ...extra.map((p) => ({ ...normalize(p), r: rS, cls: smallest })),
        ],
        domain,
        gap,
      ).items
    : first.items;
  // Last pass: any spot that can still hold a smallest-tier element at the
  // normal gap gets one, centred in its hole, so nothing reads as bare.
  const last = fillGaps({
    candidates,
    placed: settled.map((p) => ({ ...p })),
    radius: rS,
    gap: gap * FINAL_FILL_GAP,
    dist,
    step,
    bound,
  });
  return [
    ...settled,
    ...last.map((p) => ({ ...normalize(p), r: rS, cls: smallest })),
  ];
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
    : (p: Vec) => {
        const dx = Math.min(p.x, width - p.x);
        const dy = Math.min(p.y, height - p.y);
        // The corner piece of an element crossing two edges counts too.
        return [dx, dy, Math.hypot(dx, dy)];
      };
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
  // A few late placements can end up squeezed between neighbours: give every
  // element still within a close angle of its nearest neighbour a fresh pick.
  for (let pass = 0; pass < 3; pass++) {
    let changed = false;
    for (const el of elements) {
      const near = elements
        .filter((o) => o !== el)
        .sort((a, b) => dist(el, a) - dist(el, b))
        .slice(0, ANGLE_NEIGHBOURS);
      const worst = (angle: number) =>
        Math.min(...near.map((n) => turn(angle, n.angle)));
      if (worst(el.angle) >= MIN_NEIGHBOUR_TURN) continue;
      let best = el.angle;
      let bestGap = worst(best);
      for (let k = 0; k < ANGLE_CANDIDATES; k++) {
        const angle = (k * 360) / ANGLE_CANDIDATES + rng() * 5;
        const g = worst(angle);
        if (g > bestGap) {
          bestGap = g;
          best = angle;
        }
      }
      if (best !== el.angle) {
        el.angle = best % 360;
        changed = true;
      }
    }
    if (!changed) break;
  }
}

// Deal motifs out evenly (each used as close to equally often as possible),
// then keep swapping pairs of placements while it lowers a cost made of two
// parts:
// - copies of the same motif repel each other steeply, so twins never sit
//   side by side and every motif is interleaved with the others;
// - each motif should have half its copies in each half of the canvas, for
//   several ways of halving it (left/right, top/bottom, and the same shifted
//   a quarter), so no motif piles up on one side.
// A few random starting deals are tried and the best result kept.
function assignMotifs(
  members: Vec[],
  motifCount: number,
  dist: DistanceFn,
  rng: Rng,
  width: number,
  height: number,
): number[] {
  const n = members.length;
  if (motifCount <= 1 || n < 2) return new Array<number>(n).fill(0);

  // Pair weights, scaled by the typical neighbour distance.
  const nearest = members.map((p, i) =>
    members.reduce(
      (m, q, j) => (j === i ? m : Math.min(m, dist(p, q))),
      Infinity,
    ),
  );
  const typical = [...nearest].sort((a, b) => a - b)[Math.floor(n / 2)] || 1;
  const w = Array.from({ length: n }, () => new Float64Array(n));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = Math.max(1, dist(members[i], members[j]));
      w[i][j] = w[j][i] = (typical / d) ** MOTIF_FALLOFF;
    }
  }
  // Which side of each halving cut every member is on.
  const cuts = [
    (p: Vec) => wrap(p.x, width) < width / 2,
    (p: Vec) => wrap(p.x - width / 4, width) < width / 2,
    (p: Vec) => wrap(p.y, height) < height / 2,
    (p: Vec) => wrap(p.y - height / 4, height) < height / 2,
  ];
  const side = members.map((p) => cuts.map((cut) => cut(p)));

  const run = (): { result: number[]; cost: number } => {
    const result = new Array<number>(n).fill(0);
    shuffle(
      members.map((_, i) => i),
      rng,
    ).forEach((index, k) => {
      result[index] = k % motifCount;
    });
    const usage = new Array<number>(motifCount).fill(0);
    result.forEach((m) => usage[m]++);
    // pull[i][m]: repulsion member i feels from copies of motif m.
    const pull = Array.from({ length: n }, () => new Float64Array(motifCount));
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) if (j !== i) pull[i][result[j]] += w[i][j];
    }
    // inHalf[m][c]: copies of motif m on the first side of cut c.
    const inHalf = Array.from({ length: motifCount }, () =>
      new Array<number>(cuts.length).fill(0),
    );
    result.forEach((m, i) => side[i].forEach((on, c) => on && inHalf[m][c]++));
    const off = (m: number, c: number, change: number) => {
      const e = usage[m] / 2;
      return (inHalf[m][c] + change - e) ** 2 - (inHalf[m][c] - e) ** 2;
    };

    for (let pass = 0; pass < MOTIF_PASSES; pass++) {
      let improved = false;
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const a = result[i];
          const b = result[j];
          if (a === b) continue;
          let delta =
            pull[i][b] -
            w[i][j] +
            (pull[j][a] - w[i][j]) -
            pull[i][a] -
            pull[j][b];
          for (let c = 0; c < cuts.length; c++) {
            if (side[i][c] === side[j][c]) continue;
            // i leaves motif a for b; j leaves b for a.
            const da = side[i][c] ? -1 : 1;
            delta += MOTIF_BALANCE * (off(a, c, da) + off(b, c, -da));
          }
          if (delta >= -1e-12) continue;
          for (let c = 0; c < cuts.length; c++) {
            if (side[i][c] === side[j][c]) continue;
            const da = side[i][c] ? -1 : 1;
            inHalf[a][c] += da;
            inHalf[b][c] -= da;
          }
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
    let cost = 0;
    for (let i = 0; i < n; i++) cost += pull[i][result[i]] / 2;
    for (let m = 0; m < motifCount; m++) {
      for (let c = 0; c < cuts.length; c++) {
        cost += MOTIF_BALANCE * (inHalf[m][c] - usage[m] / 2) ** 2;
      }
    }
    return { result, cost };
  };

  let best = run();
  for (let attempt = 1; attempt < MOTIF_STARTS; attempt++) {
    const next = run();
    if (next.cost < best.cost) best = next;
  }
  return best.result;
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
const OVERLAP_SHARE = 0.6;
// Extra-small elements that may overlap: this many per hero-sized anchor.
const XS_OVERLAP_PER_ANCHOR = 6;
// Never lay out more anchors than this, however small the tier.
const MAX_ANCHORS = 1500;

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
  const none = { count: 0, color: "" };
  const configs: Record<ElementClass, ElementClassConfig> = {
    xl: params.xl ?? none,
    hero: params.hero,
    secondary: params.secondary,
    filler: params.filler,
    xs: params.xs ?? none,
  };
  const present = CLASS_ORDER.filter((c) => configs[c].count > 0);
  // Extra-small elements can be allowed to overlap; they are then scattered
  // freely over everything else instead of packed between it.
  const overlapXs = !!params.allowOverlap && configs.xs.count > 0;
  const active = present.filter((c) => !(c === "xs" && overlapXs));
  if (present.length === 0) return { elements: [], warnings: [] };

  const rng = mulberry32(seed);
  const target =
    anchorCountForDensity(density) *
    (repeatStyle === "ditsy" ? DITSY_MULTIPLIER : 1);
  const { shape } = params;
  const isFree =
    !!shape || repeatStyle === "scattered" || repeatStyle === "ditsy";
  const domain = shape
    ? shapeDomain(shape, width, height)
    : rectDomain(width, height);
  const shapeCount = (t: number) =>
    shape ? Math.max(1, Math.round((t * domain.area) / (width * height))) : t;

  // Every tier has one fixed size: a set multiple of the hero's radius, and
  // the hero's radius comes from the density alone. So which tiers are on, or
  // how many motifs they have, never resizes a circle. The largest tier that
  // is on becomes the anchor and is laid out with just as many anchors as fit
  // at its size (the hero: `target`; medium circles: four times as many).
  const anchorCls: ElementClass = active[0] ?? "hero";
  const anchorRatio = RADIUS_RATIO[anchorCls];
  const anchorTarget = Math.min(
    MAX_ANCHORS,
    Math.max(1, Math.round(target / (anchorRatio * anchorRatio))),
  );
  // Scattered and Ditsy sit on a tilted lattice: perfectly even, but with no
  // visible rows or columns.
  const tilted =
    !shape && (repeatStyle === "scattered" || repeatStyle === "ditsy");
  let tiltedShape: LatticeShape | null = null;
  let lattice: Lattice | null = null;
  let refSpacing: number;
  if (tilted) {
    refSpacing = bestSpacing(chooseCount(target, width, height), width, height);
    if (active.length) {
      tiltedShape = pickLattice(
        chooseCount(anchorTarget, width, height),
        width,
        height,
        rng,
      );
      lattice = {
        anchors: latticePoints(tiltedShape, width, height),
        t1: tiltedShape.t1,
        t2: tiltedShape.t2,
        cellW: Math.hypot(tiltedShape.t1.x, tiltedShape.t1.y),
        cellH: Math.hypot(tiltedShape.t2.x, tiltedShape.t2.y),
        spacing: tiltedShape.lambda,
      };
    }
  } else if (isFree) {
    refSpacing = Math.sqrt(domain.area / shapeCount(target));
  } else {
    refSpacing = buildLattice(width, height, repeatStyle, target).spacing;
    if (active.length) {
      // Use as many anchors as fit at the tier's fixed size: a grid can be
      // forced tighter than asked (half-drop needs an even column count), so
      // step down until the circles clear each other.
      const needed =
        ANCHOR_RADIUS *
        refSpacing *
        (repeatStyle === "lattice" ? LATTICE_ANCHOR_SHARE : 1) *
        anchorRatio;
      let t = anchorTarget;
      lattice = buildLattice(width, height, repeatStyle, t);
      while (t > 1 && needed > ((1 - GAP) * lattice.spacing) / 2) {
        t--;
        lattice = buildLattice(width, height, repeatStyle, t);
      }
    }
  }
  const anchorCount = shapeCount(anchorTarget);
  const spacing = lattice
    ? lattice.spacing
    : Math.sqrt(domain.area / anchorCount);

  // Narrow shapes (a concave diamond's arms) can't hold full-size circles,
  // so cap the reference radius at half the shape's inner radius.
  const inradius =
    shape && !shape.regionTiles
      ? signedDistance({ x: width / 2, y: height / 2 }, shape.region)
      : Infinity;
  const refRadius = Math.min(
    ANCHOR_RADIUS *
      refSpacing *
      (repeatStyle === "lattice" ? LATTICE_ANCHOR_SHARE : 1),
    INRADIUS_SHARE * inradius,
  );
  const gap = GAP * spacing;
  const radiusOf: RadiusOf = (cls) => {
    const r = refRadius * RADIUS_RATIO[cls];
    // The anchors must clear each other even on an unusual lattice.
    return lattice && cls === anchorCls ? Math.min(r, (spacing - gap) / 2) : r;
  };

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
  const instances: Instance[] = !active.length
    ? []
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
          !!tiltedShape,
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

  const laidOut = !active.length
    ? []
    : tiltedShape
      ? trimSlivers(
          seamShift(
            loosen(
              instances,
              domain.dist,
              gap,
              active.length === 1 ? SINGLE_TIER_LOOSENESS : 0,
              width,
              height,
              rng,
            ),
            tiltedShape.t1,
            tiltedShape.t2,
            width,
            height,
            rng,
          ),
          domain.dist,
          gap,
          width,
          height,
        )
      : repeatStyle === "lattice"
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
  const xsFree: Instance[] = overlapXs
    ? overlappingInstances(
        Math.round(target * XS_OVERLAP_PER_ANCHOR),
        domain,
        "xs",
        radiusOf("xs"),
        width,
        height,
        rng,
      )
    : [];
  const placedInstances = [...laidOut, ...xsFree];

  const dist = domain.dist;
  const elements: PlacedElement[] = [];
  const warnings: string[] = [];

  for (const cls of present) {
    const members = placedInstances.filter((i) => i.cls === cls);
    const motifCount = configs[cls].count;
    if (members.length < motifCount) {
      warnings.push(
        `${CLASS_NAME[cls]}: ${motifCount} motifs but only ${members.length} spots fit. Raise Density or lower the count.`,
      );
    }
    const motifs = assignMotifs(members, motifCount, dist, rng, width, height);
    members.forEach((m, i) => {
      elements.push({
        id: `${cls}-${i}`,
        class: cls,
        label: labelFor(CLASS_PREFIX[cls], motifs[i], motifCount),
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
