import { useMemo } from "react";
import { buildShape, type OgeeStyle } from "@/lib/shapes/shapes";
import { polygonPoints } from "@/lib/shapes/polygon";

const SIZE = 40;

export default function OgeeVariantIcon({ style }: { style: OgeeStyle }) {
  const points = useMemo(() => {
    const shape = buildShape(
      {
        kind: "ogee",
        sides: "straight",
        fit: "closed",
        ogeeStyle: style,
        openAmount: 0,
        innerCount: 0,
        innerSpacing: 0,
      },
      SIZE,
      SIZE,
    );
    return polygonPoints(shape.copies[0]);
  }, [style]);

  return (
    <svg
      viewBox={`-3 -3 ${SIZE + 6} ${SIZE + 6}`}
      className="h-9 w-9"
      fill="none"
    >
      <polygon
        points={points}
        className="stroke-current"
        strokeWidth={2}
        strokeLinejoin="round"
      />
    </svg>
  );
}
