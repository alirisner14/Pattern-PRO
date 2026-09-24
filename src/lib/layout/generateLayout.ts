import { mulberry32, type Rng } from "./rng";
import { buildLattice, type Lattice } from "./lattice";
import {
  clearance,
  latticeDistance,
  torusDistance,
  wrap,
  type Circle,
  type DistanceFn,
  type Vec,
} from "./geometry";
import { fillGaps } from "./packing";
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

interface Instance extends Circle {
  cls: ElementClass;
}

type RadiusOf = (cls: ElementClass) => number;

export function anchorCountForDensity(density: number): number {
  return Math.round(2 * Math.pow(30, density));
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

// Scattered: nudge each anchor organically off its lattice point (never into
// a neighbour), then pack the smaller tiers into whatever gaps that leaves.
function scatteredInstances(
  lattice: Lattice,
  active: ElementClass[],
  radiusOf: RadiusOf,
  gap: number,
  width: number,
  height: number,
  rng: Rng
): Instance[] {
  const dist = torusDistance(width, height);
  const anchorCls = active[0];
  const rA = radiusOf(anchorCls);
  const maxJitter = SCATTER_JITTER * lattice.spacing;
  const placed: Circle[] = [];
  const out: Instance[] = [];

  for (const a of shuffle(lattice.anchors, rng)) {
    let best: Vec = a;
    let bestRoom = clearance(a, placed, dist);
    for (let attempt = 0; attempt < 12; attempt++) {
      const angle = rng() * Math.PI * 2;
      const d = maxJitter * Math.sqrt(rng());
      const q = {
        x: wrap(a.x + Math.cos(angle) * d, width),
        y: wrap(a.y + Math.sin(angle) * d, height),
      };
      const room = clearance(q, placed, dist);
      if (room >= rA + gap) {
        best = q;
        break;
      }
      if (room > bestRoom) {
        best = q;
        bestRoom = room;
      }
    }
    placed.push({ ...best, r: rA });
    out.push({ ...best, r: rA, cls: anchorCls });
  }

  const count = Math.max(1500, SCATTER_SAMPLES_PER_ANCHOR * lattice.anchors.length);
  const candidates = Array.from({ length: count }, () => ({
    x: rng() * width,
    y: rng() * height,
  }));
  const step = Math.sqrt((width * height) / count);

  active.slice(1).forEach((cls, i, rest) => {
    const r = radiusOf(cls);
    const maxCount =
      i < rest.length - 1
        ? Math.round(MIDDLE_TIER_PER_ANCHOR * lattice.anchors.length)
        : Infinity;
    for (const p of fillGaps({ candidates, placed, radius: r, gap, dist, step, maxCount })) {
      out.push({ x: wrap(p.x, width), y: wrap(p.y, height), r, cls });
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
  const lattice = buildLattice(width, height, repeatStyle, anchorCountForDensity(density));
  const anchorRadius = ANCHOR_RADIUS * lattice.spacing;
  const radiusOf: RadiusOf = (cls) =>
    (anchorRadius * RADIUS_RATIO[cls]) / RADIUS_RATIO[active[0]];
  const gap = GAP * lattice.spacing;

  const instances =
    repeatStyle === "scattered"
      ? scatteredInstances(lattice, active, radiusOf, gap, width, height, rng)
      : gridInstances(lattice, active, radiusOf, gap, width, height);

  const dist = torusDistance(width, height);
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
      });
    });
  }

  return { elements, warnings };
}
