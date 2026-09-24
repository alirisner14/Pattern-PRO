import type { RepeatStyle } from "@/lib/layout/types";

const AXIS = 3;
const SIZE = 40;
const STEP = SIZE / (AXIS + 1);

// Fixed nudges so the Scattered icon reads as tossed but never changes.
const SCATTER_NUDGE = [
  [-3, 2], [2, -3], [-1, 3], [3, 1], [-2, -2], [1, 3], [3, -2], [-3, -1], [2, 2],
];

export default function RepeatStylePictograph({ style }: { style: RepeatStyle | "ogee" }) {
  if (style === "ogee") {
    return (
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="h-9 w-9" fill="none">
        <path
          d="M12 2 C12 10 28 12 28 20 C28 28 12 30 12 38 M28 2 C28 10 12 12 12 20 C12 28 28 30 28 38"
          className="stroke-current"
          strokeWidth={2}
        />
      </svg>
    );
  }

  const dots: { cx: number; cy: number }[] = [];
  for (let col = 0; col < AXIS; col++) {
    for (let row = 0; row < AXIS; row++) {
      let cx = (col + 1) * STEP;
      let cy = (row + 1) * STEP;
      if (style === "half-drop" && col % 2 === 1) cy += STEP / 2;
      if (style === "brick" && row % 2 === 1) cx += STEP / 2;
      if (style === "scattered") {
        const [dx, dy] = SCATTER_NUDGE[col * AXIS + row];
        cx += dx;
        cy += dy;
      }
      dots.push({ cx, cy });
    }
  }

  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="h-9 w-9">
      {dots.map((d, i) => (
        <circle key={i} cx={d.cx} cy={d.cy} r={2.5} className="fill-current" />
      ))}
    </svg>
  );
}
