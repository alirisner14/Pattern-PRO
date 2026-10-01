// Every shape × fit: no overlapping circles, none outside the shape.
// Run: npx tsx scripts/shape-check.ts
import { generateLayout } from "../src/lib/layout/generateLayout";
import { buildShape, type OgeeStyle } from "../src/lib/shapes/shapes";
import { shapeDomain } from "../src/lib/layout/domain";
import { signedDistance } from "../src/lib/shapes/polygon";
const W = 3600, H = 3600;
const styles: OgeeStyle[] = ["standard","lantern","arabesque","fan","bat","column","quatrefoil","steppedQuatrefoil","drop","star","fourPoint","petalX","notchedSquare","wavyDiamond","badge"];
let bad = 0;
const t0 = Date.now();
for (const [kind, st] of [...styles.map((s) => ["ogee", s] as const), ["diamond", "standard"] as const])
  for (const fit of ["closed", "open"] as const) {
    const shape = buildShape({ kind, sides: "straight", fit, ogeeStyle: st, ogeeCurve: "medium", ogeeProportion: "mid", openAmount: 25, innerCount: 0, innerSpacing: 0.08 }, W, H);
    const dom = shapeDomain(shape, W, H);
    let ov = 0, esc = 0, n = 0;
    for (const seed of [1, 2]) {
      const { elements } = generateLayout({ widthPx: W, heightPx: H, repeatStyle: kind, density: 0.5, seed, hero: { count: 2, color: "" }, secondary: { count: 3, color: "" }, filler: { count: 4, color: "" }, shape });
      n += elements.length;
      for (let i = 0; i < elements.length; i++) for (let j = i + 1; j < elements.length; j++)
        if (dom.dist(elements[i], elements[j]) < elements[i].radius + elements[j].radius - 1) ov++;
      if (!shape.regionTiles) for (const e of elements) {
        let best = -Infinity;
        for (const i of [-1, 0, 1]) for (const j of [-1, 0, 1]) best = Math.max(best, signedDistance({ x: e.x + i * W, y: e.y + j * H }, shape.region));
        if (best < e.radius - 1) esc++;
      }
    }
    if (ov || esc) bad++;
    console.log(`${kind}/${st}`.padEnd(26), fit.padEnd(6), "n", n / 2, "overlaps", ov, "escapes", esc);
  }
for (const style of ["mirror", "lattice", "ditsy", "scattered"] as const) {
  const { elements } = generateLayout({ widthPx: W, heightPx: H, repeatStyle: style, density: 0.5, seed: 3, hero: { count: 2, color: "" }, secondary: { count: 3, color: "" }, filler: { count: 4, color: "" } });
  console.log(style, "n", elements.length);
}
console.log(bad ? `${bad} FAILING` : "all clean", `${((Date.now() - t0) / 1000).toFixed(1)}s`);
