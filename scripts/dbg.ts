import { generateLayout } from "../src/lib/layout/generateLayout";
const W = 3600;
const { elements } = generateLayout({ widthPx: W, heightPx: W, repeatStyle: "scattered", density: 0.5, seed: 11, hero: { count: 3, color: "" }, secondary: { count: 2, color: "" }, filler: { count: 4, color: "" } });
const wd = (a: number) => a - W * Math.round(a / W);
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(wd(a.x - b.x), wd(a.y - b.y));
const H = elements.filter((e) => e.class === "hero"), M = elements.filter((e) => e.class === "secondary"), F = elements.filter((e) => e.class === "filler");
const near = (p: { x: number; y: number }, set: typeof H) => set.map((e) => dist(p, e) - e.radius).sort((a, b) => a - b);
console.log("R", Math.round(H[0].radius), "rm", Math.round(M[0].radius), "rf", Math.round(F[0].radius));
for (const f of F.slice(0, 8)) {
  const h = near(f, H), m = near(f, M), o = F.filter((x) => x !== f).map((x) => dist(f, x) - 2 * f.radius).sort((a, b) => a - b);
  console.log(`filler (${(f.x / W).toFixed(3)},${(f.y / W).toFixed(3)}) gap to large ${h[0].toFixed(0)}/${h[1].toFixed(0)}  medium ${m[0].toFixed(0)}  filler ${o[0].toFixed(0)}`);
}
