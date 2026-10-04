// Measures layout quality: spacing evenness, bare areas, and whether any
// one motif dominates part of the canvas. Run: npx tsx scripts/layout-metrics.ts
import { generateLayout } from "../src/lib/layout/generateLayout";
import { torusDistance } from "../src/lib/layout/geometry";
import type { RepeatStyle } from "../src/lib/layout/types";

const W = 3600,
  H = 3600;
const d = torusDistance(W, H);
const wd = (a: number, p: number) => a - p * Math.round(a / p);

function metrics(style: RepeatStyle, density: number, seed: number) {
  const { elements: els } = generateLayout({
    widthPx: W,
    heightPx: H,
    repeatStyle: style,
    density,
    seed,
    hero: { count: 2, color: "" },
    secondary: { count: 3, color: "" },
    filler: { count: 4, color: "" },
  });
  let overlaps = 0;
  const gaps = els.map((a, i) => {
    let g = Infinity;
    els.forEach((b, j) => {
      if (i === j) return;
      const e = d(a, b) - a.radius - b.radius;
      if (e < -1) overlaps++;
      g = Math.min(g, e);
    });
    return g;
  });
  const mean = gaps.reduce((s, g) => s + g, 0) / gaps.length;
  const cv =
    Math.sqrt(gaps.reduce((s, g) => s + (g - mean) ** 2, 0) / gaps.length) /
    mean;
  // Largest empty circle, relative to the hero radius.
  const hero = Math.max(...els.map((e) => e.radius));
  let hole = 0;
  for (let x = 0; x < W; x += W / 60)
    for (let y = 0; y < H; y += H / 60) {
      let c = Infinity;
      for (const e of els) c = Math.min(c, d({ x, y }, e) - e.radius);
      hole = Math.max(hole, c);
    }
  // Motif spread: for each label, its closest pair of copies compared with
  // the distance they'd have if spread perfectly evenly (1 = ideal).
  const byLabel = new Map<string, typeof els>();
  for (const e of els)
    byLabel.set(e.label, [...(byLabel.get(e.label) ?? []), e]);
  let spreadSum = 0,
    spreadN = 0,
    worstSpread = Infinity;
  for (const [, copies] of byLabel) {
    if (copies.length < 2) continue;
    let m = Infinity;
    for (let i = 0; i < copies.length; i++)
      for (let j = i + 1; j < copies.length; j++)
        m = Math.min(m, d(copies[i], copies[j]));
    const ideal = Math.sqrt((2 * W * H) / (Math.sqrt(3) * copies.length));
    spreadSum += m / ideal;
    spreadN++;
    worstSpread = Math.min(worstSpread, m / ideal);
  }
  const worst = spreadN ? spreadSum / spreadN : 1;
  // Same-motif neighbours: share of each element's nearest same-tier
  // neighbour that carries the same label (lower = better mixed).
  let same = 0,
    total = 0;
  for (const a of els) {
    let best: (typeof els)[number] | null = null,
      bd = Infinity;
    for (const b of els) {
      if (b === a || b.class !== a.class) continue;
      const dd = d(a, b);
      if (dd < bd) {
        bd = dd;
        best = b;
      }
    }
    if (best) {
      total++;
      if (best.label === a.label) same++;
    }
  }
  // Edge slivers: far-side piece under 35% of the radius.
  let slivers = 0;
  for (const e of els)
    for (const v of [Math.min(e.x, W - e.x), Math.min(e.y, H - e.y)]) {
      const piece = e.radius - v;
      if (piece > 0 && piece < 0.35 * e.radius) slivers++;
    }
  // Rotation: smallest angle difference between an element and its nearest neighbour.
  let minTurn = 180;
  for (const a of els) {
    let best: (typeof els)[number] | null = null,
      bd = Infinity;
    for (const b of els) {
      if (b === a) continue;
      const dd = d(a, b);
      if (dd < bd) {
        bd = dd;
        best = b;
      }
    }
    if (best) {
      const t = Math.abs((((a.angle - best.angle) % 360) + 360) % 360);
      minTurn = Math.min(minTurn, Math.min(t, 360 - t));
    }
  }
  // Sparse spots: biggest empty circle compared with the smallest element.
  const smallest = Math.min(...els.map((e) => e.radius));
  const sparse = hole / smallest;
  // Nearest neighbour (any tier) carrying the very same label.
  let twin = 0;
  for (const a of els) {
    let best: (typeof els)[number] | null = null,
      bd = Infinity;
    for (const b of els) {
      if (b === a) continue;
      const dd = d(a, b);
      if (dd < bd) {
        bd = dd;
        best = b;
      }
    }
    if (best && best.label === a.label) twin++;
  }
  // Half balance: for labels with 4+ copies, worst split between halves.
  let imbalance = 0;
  for (const [, copies] of byLabel) {
    if (copies.length < 4) continue;
    for (const axis of ["x", "y"] as const)
      for (const cut of [0, 0.25]) {
        const size = axis === "x" ? W : H;
        const inHalf = copies.filter(
          (c) => (((c[axis] - cut * size) % size) + size) % size < size / 2,
        ).length;
        imbalance = Math.max(
          imbalance,
          Math.abs(inHalf - copies.length / 2) / (copies.length / 2),
        );
      }
  }
  return {
    sparse,
    twin: twin / els.length,
    imbalance,
    slivers,
    minTurn,
    n: els.length,
    overlaps: overlaps / 2,
    gapCV: cv,
    hole: hole / hero,
    spread: worst,
    worstSpread: worstSpread === Infinity ? 1 : worstSpread,
    sameNeighbour: total ? same / total : 0,
  };
}

for (const style of (process.argv[2]?.split(",") ?? [
  "scattered",
  "grid",
  "half-drop",
  "ditsy",
]) as RepeatStyle[]) {
  for (const density of [0.3, 0.5, 0.75]) {
    const runs = [1, 2, 3, 4, 5].map((s) => metrics(style, density, s));
    const avg = (k: keyof (typeof runs)[number]) =>
      (runs.reduce((s, r) => s + (r[k] as number), 0) / runs.length).toFixed(2);
    console.log(
      `${style.padEnd(10)} d=${density} n=${avg("n")} overlaps=${avg("overlaps")} gapCV=${avg("gapCV")} hole=${avg("hole")} spread=${avg("spread")} worstSpread=${avg("worstSpread")} sameNbr=${avg("sameNeighbour")} slivers=${avg("slivers")} sparse=${avg("sparse")} twin=${avg("twin")} imbalance=${avg("imbalance")} minTurn=${avg("minTurn")}`,
    );
  }
}
