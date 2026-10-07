// How often does the generator give a good layout? Runs many seeds across
// densities and element counts and scores each against fixed criteria,
// calibrated on the benchmark template (measured by hand from the image).
// Run: npx tsx scripts/reliability.ts [scattered|ditsy|...]
import { generateLayout } from "../src/lib/layout/generateLayout";
import { torusDistance } from "../src/lib/layout/geometry";
import type { RepeatStyle } from "../src/lib/layout/types";

const W = 3600;
const d = torusDistance(W, W);

// Largest empty circle, as a share of the largest element's radius.
function biggestHole(els: { x: number; y: number; radius: number }[]) {
  const R = Math.max(...els.map((e) => e.radius));
  let hole = 0;
  const n = 90;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const p = { x: ((i + 0.5) * W) / n, y: ((j + 0.5) * W) / n };
      let c = Infinity;
      for (const e of els) c = Math.min(c, d(p, e) - e.radius);
      hole = Math.max(hole, c);
    }
  }
  return hole / R;
}

// Benchmark template: 5 large (r .157), 5 medium (.079), 10 small (.041).
const L = [[0, 0], [0.2, 0.4], [0.4, 0.8], [0.6, 0.2], [0.8, 0.6]];
const bench: { x: number; y: number; radius: number }[] = [];
for (const [x, y] of L) {
  bench.push({ x: x * W, y: y * W, radius: 0.157 * W });
  bench.push({ x: ((x + 0.5) % 1) * W, y: ((y + 0.5) % 1) * W, radius: 0.079 * W });
  bench.push({ x: ((x + 0.1) % 1) * W, y: ((y + 0.2) % 1) * W, radius: 0.041 * W });
  bench.push({ x: ((x + 0.3) % 1) * W, y: ((y - 0.1 + 1) % 1) * W, radius: 0.041 * W });
}
const benchHole = biggestHole(bench);
console.log(`benchmark: largest empty circle = ${benchHole.toFixed(2)} x the largest element's radius`);

const styles = (process.argv[2]?.split(",") ?? ["scattered"]) as RepeatStyle[];
const configs: [number, number, number][] = [[2, 3, 4], [3, 2, 4], [4, 4, 6]];
const densities = [0.3, 0.4, 0.5, 0.6, 0.7, 0.8];
const SEEDS = 25;

for (const style of styles) {
  let total = 0, pass = 0;
  const fails: Record<string, number> = {};
  for (const density of densities) {
    let dp = 0, dt = 0;
    for (const [h, s, f] of configs) {
      for (let seed = 1; seed <= SEEDS; seed++) {
        const { elements: els } = generateLayout({
          widthPx: W, heightPx: W, repeatStyle: style, density, seed,
          hero: { count: h, color: "" }, secondary: { count: s, color: "" }, filler: { count: f, color: "" },
        });
        const why: string[] = [];
        // 1. Nothing overlaps.
        let overlap = false;
        for (let i = 0; i < els.length && !overlap; i++)
          for (let j = i + 1; j < els.length; j++)
            if (d(els[i], els[j]) < els[i].radius + els[j].radius - 1) { overlap = true; break; }
        if (overlap) why.push("overlap");
        // 2. No thin slivers over an edge.
        let sliver = false;
        for (const e of els) for (const v of [Math.min(e.x, W - e.x), Math.min(e.y, W - e.y)]) {
          const piece = e.radius - v;
          if (piece > 0 && piece < 0.45 * e.radius) sliver = true;
        }
        if (sliver) why.push("sliver");
        // 3. No bare patches: largest hole within 1.25x the benchmark's.
        if (biggestHole(els) > benchHole * 1.25) why.push("bare");
        // 4. Neighbours rotated differently (at least 20 degrees apart).
        let minTurn = 180;
        for (const a of els) {
          let nb = els[0], nd = Infinity;
          for (const b of els) { if (b === a) continue; const dd = d(a, b); if (dd < nd) { nd = dd; nb = b; } }
          const t = Math.abs(((a.angle - nb.angle) % 360 + 360) % 360);
          minTurn = Math.min(minTurn, Math.min(t, 360 - t));
        }
        if (minTurn < 20) why.push("rotation");
        // 5. A motif with several copies is not piled into one half.
        const byLabel = new Map<string, typeof els>();
        for (const e of els) byLabel.set(e.label, [...(byLabel.get(e.label) ?? []), e]);
        let lopsided = false;
        for (const [, c] of byLabel) {
          if (c.length < 4) continue;
          for (const axis of ["x", "y"] as const) {
            const inHalf = c.filter((e) => e[axis] < W / 2).length;
            if (Math.abs(inHalf - c.length / 2) / (c.length / 2) > 0.5) lopsided = true;
          }
        }
        if (lopsided) why.push("lopsided");
        total++; dt++;
        if (!why.length) { pass++; dp++; } else for (const w of why) fails[w] = (fails[w] ?? 0) + 1;
      }
    }
    console.log(`  ${style} density ${density}: ${((100 * dp) / dt).toFixed(0)}% good`);
  }
  console.log(`${style}: ${((100 * pass) / total).toFixed(1)}% good overall (${pass}/${total}).`, "Failures by reason:", fails);
}
