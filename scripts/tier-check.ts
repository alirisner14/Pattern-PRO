// Tier sizes must never change with the element counts or which tiers are on.
// Also checks the extra-large / extra-small tiers for overlaps.
// Run: npx tsx scripts/tier-check.ts
import { generateLayout } from "../src/lib/layout/generateLayout";
import { torusDistance } from "../src/lib/layout/geometry";
import type { RepeatStyle } from "../src/lib/layout/types";

const W = 3600,
  d = torusDistance(W, W);
type Counts = [number, number, number, number, number]; // xl, hero, secondary, filler, xs
const radii = (
  style: RepeatStyle,
  density: number,
  c: Counts,
  seed = 1,
  overlap = false,
) => {
  const { elements } = generateLayout({
    widthPx: W,
    heightPx: W,
    repeatStyle: style,
    density,
    seed,
    allowOverlap: overlap,
    xl: { count: c[0], color: "" },
    hero: { count: c[1], color: "" },
    secondary: { count: c[2], color: "" },
    filler: { count: c[3], color: "" },
    xs: { count: c[4], color: "" },
  });
  const byClass: Record<string, number[]> = {};
  for (const e of elements)
    (byClass[e.class] ??= []).push(Math.round(e.radius));
  return {
    elements,
    sizes: Object.fromEntries(
      Object.entries(byClass).map(([k, v]) => [k, [...new Set(v)]]),
    ),
  };
};

import { RADIUS_RATIO } from "../src/lib/layout/constants";
let bad = 0,
  compared = 0;
for (const style of [
  "scattered",
  "ditsy",
  "grid",
  "half-drop",
  "brick",
] as RepeatStyle[]) {
  for (const density of [0.3, 0.5, 0.7]) {
    // The hero radius at this density, from a plain hero layout.
    const heroR = radii(style, density, [0, 3, 3, 4, 0]).sizes.hero[0];
    const trials: Counts[] = [
      [0, 3, 3, 4, 0],
      [0, 1, 1, 1, 0],
      [0, 5, 2, 8, 0],
      [0, 0, 3, 4, 0],
      [0, 3, 0, 4, 0],
      [0, 0, 0, 4, 0],
      [2, 3, 3, 4, 0],
      [0, 3, 3, 4, 5],
      [1, 0, 0, 0, 3],
      [3, 3, 3, 3, 3],
      [1, 3, 3, 4, 2],
    ];
    for (const t of trials) {
      const got = radii(style, density, t).sizes;
      for (const [cls, sizes] of Object.entries(got)) {
        const want = heroR * RADIUS_RATIO[cls as keyof typeof RADIUS_RATIO];
        compared++;
        if (sizes.length !== 1 || Math.abs(sizes[0] - want) > 3) {
          bad++;
          console.log(
            `SIZE CHANGED ${style} d=${density} counts=[${t}] ${cls}: ${sizes} vs expected ${Math.round(want)}`,
          );
        }
      }
    }
  }
}
console.log(
  bad
    ? `${bad} size changes in ${compared} comparisons`
    : `tier sizes identical whatever the counts or tiers (${compared} comparisons)`,
);

// Overlaps (extra small may overlap on purpose).
for (const style of ["scattered", "grid"] as RepeatStyle[]) {
  for (const c of [
    [1, 3, 3, 4, 0],
    [0, 3, 3, 4, 3],
    [1, 2, 2, 2, 2],
  ] as Counts[]) {
    const { elements, sizes } = radii(style, 0.5, c);
    let ov = 0;
    for (let i = 0; i < elements.length; i++)
      for (let j = i + 1; j < elements.length; j++)
        if (
          d(elements[i], elements[j]) <
          elements[i].radius + elements[j].radius - 1
        )
          ov++;
    console.log(
      style,
      `counts=[${c}]`,
      "placements",
      elements.length,
      "overlaps",
      ov,
      JSON.stringify(sizes),
    );
  }
}
const withOverlap = radii("scattered", 0.5, [0, 3, 3, 4, 3], 1, true);
console.log(
  "XS may overlap:",
  withOverlap.elements.length,
  "placements",
  JSON.stringify(withOverlap.sizes),
);
