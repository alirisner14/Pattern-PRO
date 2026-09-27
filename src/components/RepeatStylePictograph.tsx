import type { RepeatStyle } from "@/lib/layout/types";

const AXIS = 3;
const SIZE = 40;
const STEP = SIZE / (AXIS + 1);

// Fixed nudges so the Scattered icon reads as tossed but never changes.
const SCATTER_NUDGE = [
  [-3, 2],
  [2, -3],
  [-1, 3],
  [3, 1],
  [-2, -2],
  [1, 3],
  [3, -2],
  [-3, -1],
  [2, 2],
];

export default function RepeatStylePictograph({
  style,
}: {
  style: RepeatStyle;
}) {
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

  if (style === "mirror") {
    return (
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="h-9 w-9" fill="none">
        <path
          d="M20 3 V37 M3 20 H37"
          className="stroke-current"
          strokeWidth={1}
          strokeDasharray="2 2"
        />
        <path
          d="M8 8 L16 12 L8 16 Z M32 8 L24 12 L32 16 Z M8 32 L16 28 L8 24 Z M32 32 L24 28 L32 24 Z"
          className="fill-current"
        />
      </svg>
    );
  }

  if (style === "ditsy") {
    const pts = [
      [6, 7],
      [15, 4],
      [26, 8],
      [35, 5],
      [10, 15],
      [21, 14],
      [31, 17],
      [5, 23],
      [16, 22],
      [27, 25],
      [36, 26],
      [9, 31],
      [20, 30],
      [30, 34],
      [14, 37],
      [24, 20],
    ];
    return (
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="h-9 w-9">
        {pts.map(([cx, cy], i) => (
          <circle key={i} cx={cx} cy={cy} r={1.4} className="fill-current" />
        ))}
      </svg>
    );
  }

  if (style === "lattice") {
    return (
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="h-9 w-9" fill="none">
        <path
          d="M4 16 L16 4 M4 36 L36 4 M24 36 L36 24 M4 24 L16 36 M4 4 L36 36 M24 4 L36 16"
          className="stroke-current"
          strokeWidth={2}
        />
      </svg>
    );
  }

  if (style === "diamond") {
    return (
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="h-9 w-9" fill="none">
        <polygon
          points="20,4 36,20 20,36 4,20"
          className="stroke-current"
          strokeWidth={2}
        />
        <circle cx={20} cy={14} r={2.5} className="fill-current" />
        <circle cx={14} cy={22} r={2.5} className="fill-current" />
        <circle cx={25} cy={25} r={2.5} className="fill-current" />
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
