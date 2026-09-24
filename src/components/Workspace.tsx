"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { UNIT_OPTIONS, type CanvasConfig } from "@/lib/units";
import { renderCircles, type Shape } from "@/lib/layout/edgeRepeats";
import type { PlacedElement } from "@/lib/layout/types";

interface WorkspaceProps {
  config: CanvasConfig;
  elements: PlacedElement[];
  shape: Shape;
  showEdgeRepeats: boolean;
  onReset: () => void;
}

type PreviewTheme = "light" | "dark";

const DIAMOND_CLIP_ID = "pattern-diamond-clip";

// Spacing between dots on a dotted outline, adjusted so a whole number of
// dots fits the circumference and there's no uneven seam where it closes.
function dotGap(r: number, dotSize: number): number {
  const circumference = 2 * Math.PI * r;
  return circumference / Math.max(8, Math.round(circumference / (dotSize * 2.6)));
}

export default function Workspace({
  config,
  elements,
  shape,
  showEdgeRepeats,
  onReset,
}: WorkspaceProps) {
  const [theme, setTheme] = useState<PreviewTheme>("light");
  const circles = useMemo(
    () => renderCircles(elements, config.widthPx, config.heightPx, showEdgeRepeats, shape),
    [elements, config.widthPx, config.heightPx, showEdgeRepeats, shape]
  );
  const strokeWidth = Math.max(3, Math.min(config.widthPx, config.heightPx) * 0.0035);
  const w = config.widthPx;
  const h = config.heightPx;
  const diamondPoints = `${w / 2},0 ${w},${h / 2} ${w / 2},${h} 0,${h / 2}`;
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
        1
      );
      setScale(next > 0 ? next : 1);
    }

    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(container);
    return () => observer.disconnect();
  }, [config.widthPx, config.heightPx]);

  const unitLabel = UNIT_OPTIONS.find((o) => o.value === config.unit)?.label ?? config.unit;

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
            {config.rawWidth} × {config.rawHeight} {unitLabel} @ {config.dpi} DPI →{" "}
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
            {shape === "diamond" && (
              <>
                <defs>
                  <clipPath id={DIAMOND_CLIP_ID}>
                    <polygon points={diamondPoints} />
                  </clipPath>
                </defs>
                <polygon
                  points={diamondPoints}
                  fill="none"
                  stroke="#71717a"
                  strokeWidth={strokeWidth}
                />
              </>
            )}
            <g clipPath={shape === "diamond" ? `url(#${DIAMOND_CLIP_ID})` : undefined}>
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
                <circle cx={c.dotX} cy={c.dotY} r={strokeWidth * 0.8} fill="#000" />
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
          </svg>
        </div>
      </div>
    </div>
  );
}
