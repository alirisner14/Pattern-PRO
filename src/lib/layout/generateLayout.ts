import { mulberry32, type Rng } from "./rng";
import { buildLattice, type Lattice } from "./lattice";
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
import type { ElementClass, LayoutParams, LayoutResult, PlacedElement } from "./types";

const CLASS_ORDER: ElementClass[] = ["hero", "secondary", "filler"];
const CLASS_NUMBER: Record<ElementClass, number> = { hero: 1, secondary: 2, filler: 3 };
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

function labelFor(classNumber: number, motif: number, motifCount: number): string {
  return motifCount === 1 ? String(classNumber) : `${classNumber}${letterFor(motif)}`;
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
  height: number
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
    const maxCount = i < rest.length - 1 ? Math.floor(MIDDLE_TIER_PER_ANCHOR) : Infinity;
    for (const p of fillGaps({ candidates, placed, radius: r, gap, dist, step, maxCount })) {
      offsets.push({ ...p, r, cls });
    }
  });

  const out: Instance[] = [];
  for (const a of lattice.anchors) {
    out.push({ ...a, r: radiusOf(anchorCls), cls: anchorCls });
    for (const o of offsets) {
      out.push({ x: wrap(a.x + o.x, width), y: wrap(a.y + o.y, height), r: o.r, cls: o.cls });
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
  rng: Rng
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
    pin(() => seam[Math.floor((0.2 + 0.6 * rng()) * (seam.length - 1))], pickTier());
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
  rng: Rng
): Instance[] {
  const { dist, normalize, bound } = domain;
  const anchorCls = active[0];
  const rA = radiusOf(anchorCls);
  const maxJitter = SCATTER_JITTER * spacing;
  const pins = pinSeams(domain, active, radiusOf, gap, rng);
  const pinned = (cls: ElementClass) => pins.filter((p) => p.cls === cls).length;

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
      const q = normalize({ x: a.x + Math.cos(angle) * d, y: a.y + Math.sin(angle) * d });
      if (roomAt(q, others, dist, bound) >= rA + gap) {
        anchors[k] = { ...q, r: rA };
        break;
      }
    }
  }

  const placed: Circle[] = [...pins, ...anchors];
  const out: Instance[] = [...pins, ...anchors.map((a) => ({ ...a, cls: anchorCls }))];

  active.slice(1).forEach((cls, i, rest) => {
    const r = radiusOf(cls);
    const maxCount =
      i < rest.length - 1
        ? Math.max(0, Math.round(MIDDLE_TIER_PER_ANCHOR * anchorCount) - pinned(cls))
        : Infinity;
    for (const p of fillGaps({ candidates, placed, radius: r, gap, dist, step, maxCount, bound })) {
      out.push({ ...normalize(p), r, cls });
    }
  });
  return out;
}

// Deal motifs out evenly (each used as close to equally often as possible),
// and give each placement the motif whose nearest copy is farthest away, so
// the same motif never bunches up.
function assignMotifs(members: Vec[], motifCount: number, dist: DistanceFn, rng: Rng): number[] {
  const result = new Array<number>(members.length).fill(0);
  if (motifCount <= 1) return result;

  const usage = new Array<number>(motifCount).fill(0);
  const copies: Vec[][] = Array.from({ length: motifCount }, () => []);
  const motifOrder = Array.from({ length: motifCount }, (_, i) => i);

  for (const index of shuffle(members.map((_, i) => i), rng)) {
    const p = members[index];
    const leastUsed = Math.min(...usage);
    let choice = -1;
    let farthest = -1;
    for (const m of shuffle(motifOrder, rng)) {
      if (usage[m] !== leastUsed) continue;
      let nearest = Infinity;
      for (const q of copies[m]) nearest = Math.min(nearest, dist(p, q));
      if (nearest > farthest) {
        farthest = nearest;
        choice = m;
      }
    }
    result[index] = choice;
    usage[choice]++;
    copies[choice].push(p);
  }
  return result;
}

export function generateLayout(params: LayoutParams): LayoutResult {
  const { widthPx: width, heightPx: height, repeatStyle, density, seed } = params;
  const configs = { hero: params.hero, secondary: params.secondary, filler: params.filler };
  const active = CLASS_ORDER.filter((c) => configs[c].count > 0);
  if (active.length === 0) return { elements: [], warnings: [] };

  const rng = mulberry32(seed);
  const target = anchorCountForDensity(density);
  const { shape } = params;
  const isFree = !!shape || repeatStyle === "scattered";
  const domain = shape ? shapeDomain(shape, width, height) : rectDomain(width, height);
  const lattice = isFree ? null : buildLattice(width, height, repeatStyle, target);
  // A shape gets anchors in proportion to its share of the canvas; spacing
  // is area-per-anchor either way, so circle sizes match the grids.
  const anchorCount = shape
    ? Math.max(1, Math.round((target * domain.area) / (width * height)))
    : target;
  const spacing = lattice ? lattice.spacing : Math.sqrt(domain.area / anchorCount);

  // Narrow shapes (a concave diamond's arms) can't hold full-size circles,
  // so cap the anchor at half the shape's inner radius and let the smaller
  // tiers reach into the thin parts.
  const inradius =
    shape && !shape.regionTiles
      ? signedDistance({ x: width / 2, y: height / 2 }, shape.region)
      : Infinity;
  const anchorRadius = Math.min(ANCHOR_RADIUS * spacing, INRADIUS_SHARE * inradius);
  const radiusOf: RadiusOf = (cls) =>
    (anchorRadius * RADIUS_RATIO[cls]) / RADIUS_RATIO[active[0]];
  const gap = GAP * spacing;

  const instances = lattice
    ? gridInstances(lattice, active, radiusOf, gap, width, height)
    : scatteredInstances(anchorCount, spacing, domain, active, radiusOf, gap, rng);

  const dist = domain.dist;
  const elements: PlacedElement[] = [];
  const warnings: string[] = [];

  for (const cls of active) {
    const members = instances.filter((i) => i.cls === cls);
    const motifCount = configs[cls].count;
    if (members.length < motifCount) {
      warnings.push(
        `${CLASS_NAME[cls]}: ${motifCount} motifs but only ${members.length} spots fit. Raise Density or lower the count.`
      );
    }
    const motifs = assignMotifs(members, motifCount, dist, rng);
    members.forEach((m, i) => {
      elements.push({
        id: `${cls}-${i}`,
        class: cls,
        label: labelFor(CLASS_NUMBER[cls], motifs[i], motifCount),
        x: m.x,
        y: m.y,
        radius: m.r,
        color: configs[cls].color,
        // Tossed layouts get random orientations; structured ones all point up.
        angle: isFree ? rng() * 360 : -90,
      });
    });
  }

  return { elements, warnings };
}
