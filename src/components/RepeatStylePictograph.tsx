import type { RepeatStyle } from "@/lib/layout/types";

const AXIS = 3;
const SIZE = 40;
const STEP = SIZE / (AXIS + 1);

export default function RepeatStylePictograph({ style }: { style: RepeatStyle }) {
  const dots: { cx: number; cy: number }[] = [];
  for (let col = 0; col < AXIS; col++) {
    for (let row = 0; row < AXIS; row++) {
      let cx = (col + 1) * STEP;
      let cy = (row + 1) * STEP;
      if (style === "half-drop" && col % 2 === 1) cy += STEP / 2;
      if (style === "brick" && row % 2 === 1) cx += STEP / 2;
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
