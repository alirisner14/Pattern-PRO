// Spacing quality of the free (non-lattice) layouts: Ogee/Diamond shapes and
// Mirror. Reports overlaps, how even the gaps are (gapCV, lower = more even)
// and the largest bare spot (hole, x the largest radius).
// Run: npx tsx scripts/free-metrics.ts
import { generateLayout } from "../src/lib/layout/generateLayout";
import { buildShape, type OgeeStyle } from "../src/lib/shapes/shapes";
import { shapeDomain } from "../src/lib/layout/domain";
import { pointInPolygon, signedDistance } from "../src/lib/shapes/polygon";
import { torusDistance } from "../src/lib/layout/geometry";

const W = 3600,
  H = 3600;
const styles: OgeeStyle[] = ["standard", "lantern", "quatrefoil", "star", "badge"];

type El = { x: number; y: number; radius: number };

function score(
  els: El[],
  dist: (a: { x: number; y: number }, b: { x: number; y: number }) => number,
  inside: (p: { x: number; y: number }) => number,
) {
  let overlaps = 0;
  const gaps = els.map((a, i) => {
    let g = Infinity;
    els.forEach((b, j) => {
      if (i === j) return;
      const e = dist(a, b) - a.radius - b.radius;
      if (e < -1) overlaps++;
      g = Math.min(g, e);
    });
    return g;
  });
  const mean = gaps.reduce((s, g) => s + g, 0) / gaps.length;
  const cv =
    Math.sqrt(gaps.reduce((s, g) => s + (g - mean) ** 2, 0) / gaps.length) /
    mean;
  const R = Math.max(...els.map((e) => e.radius));
  let hole = 0;
  const n = 72;
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const p = { x: ((i + 0.5) * W) / n, y: ((j + 0.5) * H) / n };
      const room = inside(p);
      if (room < 0) continue;
      let c = room;
      for (const e of els) c = Math.min(c, dist(p, e) - e.radius);
      hole = Math.max(hole, c);
    }
  return { overlaps: overlaps / 2, cv, hole: hole / R, n: els.length };
}

const rows: Record<
  string,
  { cv: number; hole: number; worst: number; ov: number; n: number }
> = {};
const add = (key: string, s: ReturnType<typeof score>, runs: number) => {
  const r = (rows[key] ??= { cv: 0, hole: 0, worst: 0, ov: 0, n: 0 });
  r.worst = Math.max(r.worst, s.hole);
  r.cv += s.cv / runs;
  r.hole += s.hole / runs;
  r.ov += s.overlaps;
  r.n += s.n / runs;
};

const t0 = Date.now();
const seeds = [1, 2, 3, 4];
for (const density of [0.35, 0.5, 0.7]) {
  for (const [kind, st] of [
    ...styles.map((s) => ["ogee", s] as const),
    ["diamond", "standard"] as const,
  ]) {
    const shape = buildShape(
      {
        kind,
        sides: "straight",
        fit: "closed",
        ogeeStyle: st,
        ogeeCurve: "medium",
        ogeeProportion: "mid",
        openAmount: 25,
        innerCount: 0,
        innerSpacing: 0.08,
      },
      W,
      H,
    );
    const dom = shapeDomain(shape, W, H);
    const inside = shape.regionTiles
      ? (p: { x: number; y: number }) =>
          pointInPolygon(p, shape.region) ? Infinity : -1
      : (p: { x: number; y: number }) => signedDistance(p, shape.region);
    for (const seed of seeds) {
      const { elements } = generateLayout({
        widthPx: W,
        heightPx: H,
        repeatStyle: kind,
        density,
        seed,
        hero: { count: 2, color: "" },
        secondary: { count: 3, color: "" },
        filler: { count: 4, color: "" },
        shape,
      });
      add(`${kind}/${st} d=${density}`, score(elements, dom.dist, inside), seeds.length);
    }
  }
  const d = torusDistance(W, H);
  for (const seed of seeds) {
    const { elements } = generateLayout({
      widthPx: W,
      heightPx: H,
      repeatStyle: "mirror",
      density,
      seed,
      hero: { count: 2, color: "" },
      secondary: { count: 3, color: "" },
      filler: { count: 4, color: "" },
    });
    add(`mirror d=${density}`, score(elements, d, () => Infinity), seeds.length);
  }
}
let cvAll = 0,
  worstAll = 0,
  holeAll = 0,
  ovAll = 0;
const keys = Object.keys(rows);
for (const k of keys) {
  const r = rows[k];
  cvAll += r.cv / keys.length;
  holeAll += r.hole / keys.length;
  worstAll += r.worst / keys.length;
  ovAll += r.ov;
  console.log(
    k.padEnd(28),
    `n=${r.n.toFixed(0)}`.padEnd(7),
    `gapCV=${r.cv.toFixed(2)}`,
    `hole=${r.hole.toFixed(2)}`,
    `worstHole=${r.worst.toFixed(2)}`,
    `overlaps=${r.ov}`,
  );
}
console.log(
  `AVERAGE gapCV=${cvAll.toFixed(3)} hole=${holeAll.toFixed(3)} worstHole=${worstAll.toFixed(3)} overlaps=${ovAll}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`,
);
