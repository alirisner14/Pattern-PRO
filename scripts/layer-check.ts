// Large/Small layers: placement counts, overlaps, timing.
// Run: npx tsx scripts/layer-check.ts
import { generateLayout } from "../src/lib/layout/generateLayout";
import { torusDistance } from "../src/lib/layout/geometry";
const W = 3600, H = 3600, d = torusDistance(W, H);
for (const layer of ["large", "small"] as const)
  for (const allowOverlap of layer === "small" ? [false, true] : [false])
    for (const density of [0, 0.2, 0.5, 0.7, 1]) {
      const t = Date.now();
      const { elements, warnings } = generateLayout({ widthPx: W, heightPx: H, repeatStyle: "scattered", density, seed: 4, layer, allowOverlap,
        hero: { count: 3, color: "" }, secondary: { count: 3, color: "" }, filler: { count: 4, color: "" } });
      let ov = 0, deep = 0;
      for (let i = 0; i < elements.length; i++) for (let j = i + 1; j < elements.length; j++) {
        const g = d(elements[i], elements[j]) - elements[i].radius - elements[j].radius;
        if (g < -1) ov++;
        if (g < -0.6 * elements[i].radius - 1) deep++;
      }
      const labels = [...new Set(elements.map((e) => e.label))].join(",");
      console.log(layer, allowOverlap ? "overlap" : "", "d", density, "n", elements.length, "r", Math.round(elements[0]?.radius), "overlaps", ov, "tooDeep", deep, labels, `${Date.now() - t}ms`, warnings.join(" "));
    }
