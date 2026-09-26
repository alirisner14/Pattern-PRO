import { useMemo } from "react";
import { buildShape, type OgeeCurve, type OgeeStyle } from "@/lib/shapes/shapes";
import { polygonPoints } from "@/lib/shapes/polygon";

const SIZE = 40;

export default function OgeeVariantIcon({ style, curve }: { style: OgeeStyle; curve: OgeeCurve }) {
  const points = useMemo(() => {
    const shape = buildShape(
      {
        kind: "ogee",
        sides: "straight",
        fit: "closed",
        ogeeStyle: style,
        ogeeCurve: curve,
        ogeeProportion: "mid",
        openAmount: 0,
        innerCount: 0,
        innerSpacing: 0,
      },
      SIZE,
      SIZE
    );
    // Clip to the icon box (a column runs past its top and bottom).
    return polygonPoints(
      shape.copies[0].map((p) => ({ x: p.x, y: Math.max(0, Math.min(SIZE, p.y)) }))
    );
  }, [style, curve]);

  return (
    <svg viewBox={`-3 -3 ${SIZE + 6} ${SIZE + 6}`} className="h-9 w-9" fill="none">
      <polygon points={points} className="stroke-current" strokeWidth={2} strokeLinejoin="round" />
    </svg>
  );
}
