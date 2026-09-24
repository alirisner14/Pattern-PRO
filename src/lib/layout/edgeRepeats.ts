import type { PlacedElement } from "./types";

export interface RenderedCircle {
  key: string;
  cx: number;
  cy: number;
  r: number;
  color: string;
  label: string;
  labelX: number;
  labelY: number;
  fontSize: number;
  showLabel: boolean;
  dashed: boolean;
}

const OFFSETS = [-1, 0, 1];

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

// Every visible fragment of every circle — including the clones that wrap
// onto the opposite edge/corners — with its label pulled into the visible
// part so split pairs can be matched across margins.
export function renderCircles(
  elements: PlacedElement[],
  width: number,
  height: number,
  showEdgeRepeats: boolean
): RenderedCircle[] {
  const out: RenderedCircle[] = [];

  for (const el of elements) {
    const crossesEdge =
      el.x - el.radius < 0 ||
      el.x + el.radius > width ||
      el.y - el.radius < 0 ||
      el.y + el.radius > height;
    const fontSize = el.radius * 0.55;
    const pad = fontSize * 0.9;

    for (const ox of OFFSETS) {
      for (const oy of OFFSETS) {
        const isOriginal = ox === 0 && oy === 0;
        if (!isOriginal && !showEdgeRepeats) continue;

        const cx = el.x + ox * width;
        const cy = el.y + oy * height;
        const nearestX = clamp(cx, 0, width);
        const nearestY = clamp(cy, 0, height);
        if (Math.hypot(cx - nearestX, cy - nearestY) >= el.radius) continue;

        const labelX = clamp(cx, pad, width - pad);
        const labelY = clamp(cy, pad, height - pad);

        out.push({
          key: `${el.id}:${ox}:${oy}`,
          cx,
          cy,
          r: el.radius,
          color: el.color,
          label: el.label,
          labelX,
          labelY,
          fontSize,
          showLabel: Math.hypot(labelX - cx, labelY - cy) <= el.radius - fontSize * 0.6,
          dashed: crossesEdge,
        });
      }
    }
  }

  return out;
}
