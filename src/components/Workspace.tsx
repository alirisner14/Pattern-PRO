"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { UNIT_OPTIONS, type CanvasConfig } from "@/lib/units";
import { renderCircles, type CircleFrame } from "@/lib/layout/edgeRepeats";
import { polygonPoints } from "@/lib/shapes/polygon";
import { trellisLineWidth } from "@/lib/layout/lattice";
import type { ShapeModel } from "@/lib/shapes/shapes";
import type { PlacedElement } from "@/lib/layout/types";

interface WorkspaceProps {
  config: CanvasConfig;
  elements: PlacedElement[];
  shape: ShapeModel | null;
  outlinePx: number;
  showEdgeRepeats: boolean;
  trellis?: { cellW: number; cellH: number };
  mirrorAxes?: boolean;
  onReset: () => void;
}

type PreviewTheme = "light" | "dark";

const SHAPE_CLIP_ID = "pattern-shape-clip";
const SHADE_MASK_ID = "pattern-shade-mask";
// 70% lightness: marks everything outside the shape as "don't draw here".
const SHADE = "#b3b3b3";
const WATERMARK_ID = "pattern-watermark";
const WATERMARK_TEXT = "Pattern PRO";

// Trellis for the Lattice style: diagonal lines that break at each crossing,
// with a dot where they meet. Diamonds centred on the cell corners cover
// every line segment exactly once.
function Trellis({
  cellW,
  cellH,
  w,
  h,
}: {
  cellW: number;
  cellH: number;
  w: number;
  h: number;
}) {
  const line = trellisLineWidth(w, h);
  const cols = Math.round(w / cellW);
  const rows = Math.round(h / cellH);
  const hx = cellW / 2;
  const hy = cellH / 2;
  // Each segment stops short of the crossing by this share of its length.
  const trim = Math.min(0.25, (line * 3) / Math.hypot(hx, hy));
  const segments: [number, number, number, number][] = [];
  const dots: [number, number][] = [];
  for (let c = 0; c <= cols; c++) {
    for (let r = 0; r <= rows; r++) {
      const x = c * cellW;
      const y = r * cellH;
      const v = [
        [x - hx, y],
        [x, y - hy],
        [x + hx, y],
        [x, y + hy],
      ];
      for (let k = 0; k < 4; k++) {
        const [ax, ay] = v[k];
        const [bx, by] = v[(k + 1) % 4];
        segments.push([
          ax + (bx - ax) * trim,
          ay + (by - ay) * trim,
          bx - (bx - ax) * trim,
          by - (by - ay) * trim,
        ]);
      }
      dots.push([x + hx, y], [x, y + hy]);
    }
  }
  return (
    <g stroke="#000" strokeWidth={line} strokeLinecap="round">
      {segments.map(([x1, y1, x2, y2], i) => (
        <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />
      ))}
      {dots.map(([cx, cy], i) => (
        <circle
          key={`d${i}`}
          cx={cx}
          cy={cy}
          r={line * 1.4}
          fill="#000"
          stroke="none"
        />
      ))}
    </g>
  );
}

// Faint tiled credit across the template. It never touches the user's own
// artwork — only these generated templates carry it.
function Watermark({ w, h }: { w: number; h: number }) {
  const tile = Math.min(w, h) / 4;
  const fontSize = tile * 0.14;
  return (
    <>
      <defs>
        <pattern
          id={WATERMARK_ID}
          width={tile}
          height={tile}
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(-30)"
        >
          <text
            x={tile / 2}
            y={tile / 2}
            fontSize={fontSize}
            fontWeight={600}
            fontFamily="ui-sans-serif, system-ui, sans-serif"
            textAnchor="middle"
            dominantBaseline="central"
            fill="#808080"
          >
            {WATERMARK_TEXT}
          </text>
        </pattern>
      </defs>
      <rect
        width={w}
        height={h}
        fill={`url(#${WATERMARK_ID})`}
        opacity={0.14}
        pointerEvents="none"
      />
    </>
  );
}

// Spacing between dots on a dotted outline, adjusted so a whole number of
// dots fits the circumference and there's no uneven seam where it closes.
function dotGap(r: number, dotSize: number): number {
  const circumference = 2 * Math.PI * r;
  return (
    circumference / Math.max(8, Math.round(circumference / (dotSize * 2.6)))
  );
}

export default function Workspace({
  config,
  elements,
  shape,
  outlinePx,
  showEdgeRepeats,
  trellis,
  mirrorAxes,
  onReset,
}: WorkspaceProps) {
  const [theme, setTheme] = useState<PreviewTheme>("light");
  const circles = useMemo(() => {
    const frame: CircleFrame = shape?.regionTiles
      ? {
          kind: "tile",
          polygon: shape.region,
          translations: shape.translations,
        }
      : { kind: "rect" };
    return renderCircles(
      elements,
      config.widthPx,
      config.heightPx,
      showEdgeRepeats,
      frame,
    );
  }, [elements, config.widthPx, config.heightPx, showEdgeRepeats, shape]);
  const strokeWidth = Math.max(
    3,
    Math.min(config.widthPx, config.heightPx) * 0.0035,
  );
  const w = config.widthPx;
  const h = config.heightPx;
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    function updateScale() {
      const el = containerRef.current;
      if (!el) return;
      const next = Math.min(
        el.clientWidth / config.widthPx,
        el.clientHeight / config.heightPx,
        1,
      );
      setScale(next > 0 ? next : 1);
    }

    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(container);
    return () => observer.disconnect();
  }, [config.widthPx, config.heightPx]);

  const unitLabel =
    UNIT_OPTIONS.find((o) => o.value === config.unit)?.label ?? config.unit;

  return (
    <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <div className="flex items-center gap-3">
          <button
            onClick={onReset}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            ← New Canvas
          </button>
          <div className="text-sm text-zinc-500 dark:text-zinc-400">
            {config.rawWidth} × {config.rawHeight} {unitLabel} @ {config.dpi}{" "}
            DPI →{" "}
            <span className="font-medium text-zinc-700 dark:text-zinc-300">
              {config.widthPx} × {config.heightPx} px
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm text-zinc-400 dark:text-zinc-500">
            {Math.round(scale * 100)}%
          </span>
          <div className="flex rounded-md border border-zinc-300 p-0.5 dark:border-zinc-700">
            <button
              onClick={() => setTheme("light")}
              className={`rounded px-3 py-1 text-sm transition-colors ${
                theme === "light"
                  ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900"
                  : "text-zinc-600 dark:text-zinc-400"
              }`}
            >
              Light
            </button>
            <button
              onClick={() => setTheme("dark")}
              className={`rounded px-3 py-1 text-sm transition-colors ${
                theme === "dark"
                  ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900"
                  : "text-zinc-600 dark:text-zinc-400"
              }`}
            >
              Dark
            </button>
          </div>
        </div>
      </div>

      <div
        ref={containerRef}
        className="flex flex-1 min-h-0 items-center justify-center overflow-hidden p-6"
      >
        <div
          style={{
            width: config.widthPx,
            height: config.heightPx,
            transform: `scale(${scale})`,
          }}
          className={`relative shrink-0 border border-zinc-400/60 dark:border-zinc-600/60 ${
            theme === "light" ? "checkerboard-light" : "checkerboard-dark"
          }`}
        >
          <svg
            width={config.widthPx}
            height={config.heightPx}
            viewBox={`0 0 ${config.widthPx} ${config.heightPx}`}
            className="absolute inset-0"
            style={{ overflow: "hidden" }}
          >
            {shape && (
              <>
                <defs>
                  <mask id={SHADE_MASK_ID}>
                    <rect width={w} height={h} fill="#fff" />
                    {shape.copies.map((poly, i) => (
                      <polygon
                        key={i}
                        points={polygonPoints(poly)}
                        fill="#000"
                      />
                    ))}
                  </mask>
                  <clipPath id={SHAPE_CLIP_ID}>
                    {shape.copies.map((poly, i) => (
                      <polygon key={i} points={polygonPoints(poly)} />
                    ))}
                  </clipPath>
                </defs>
                <rect
                  width={w}
                  height={h}
                  fill={SHADE}
                  mask={`url(#${SHADE_MASK_ID})`}
                />
                {outlinePx > 0 &&
                  shape.copies.map((poly, i) => (
                    <polygon
                      key={`outline-${i}`}
                      points={polygonPoints(poly)}
                      fill="none"
                      stroke="#000"
                      strokeWidth={outlinePx}
                      strokeLinejoin="round"
                    />
                  ))}
                {shape.inner.map((poly, i) => (
                  <polygon
                    key={`inner-${i}`}
                    points={polygonPoints(poly)}
                    fill="none"
                    stroke="#000"
                    strokeWidth={Math.max(1, outlinePx)}
                    strokeLinejoin="round"
                  />
                ))}
              </>
            )}
            {trellis && (
              <Trellis
                cellW={trellis.cellW}
                cellH={trellis.cellH}
                w={w}
                h={h}
              />
            )}
            {mirrorAxes && (
              <path
                d={`M${w / 2} 0 V${h} M0 ${h / 2} H${w}`}
                stroke="#000"
                strokeOpacity={0.35}
                strokeWidth={trellisLineWidth(w, h)}
                strokeDasharray={`${trellisLineWidth(w, h) * 4} ${trellisLineWidth(w, h) * 4}`}
              />
            )}
            <g clipPath={shape ? `url(#${SHAPE_CLIP_ID})` : undefined}>
              {circles.map((c) => (
                <g key={c.key} opacity={c.split ? 0.5 : 1}>
                  <circle
                    cx={c.cx}
                    cy={c.cy}
                    r={c.r}
                    fill="none"
                    stroke={c.color}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeDasharray={`0 ${dotGap(c.r, strokeWidth)}`}
                  />
                  <circle
                    cx={c.dotX}
                    cy={c.dotY}
                    r={strokeWidth * 0.8}
                    fill="#000"
                  />
                  <text
                    x={c.labelX}
                    y={c.labelY}
                    fill={c.color}
                    fontSize={c.fontSize}
                    fontWeight={600}
                    fontFamily="ui-sans-serif, system-ui, sans-serif"
                    textAnchor="middle"
                    dominantBaseline="central"
                  >
                    {c.label}
                  </text>
                </g>
              ))}
            </g>
            <Watermark w={w} h={h} />
          </svg>
        </div>
      </div>
    </div>
  );
}
