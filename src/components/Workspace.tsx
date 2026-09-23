"use client";

import { useEffect, useRef, useState } from "react";
import { UNIT_OPTIONS, type CanvasConfig } from "@/lib/units";

interface WorkspaceProps {
  config: CanvasConfig;
  onReset: () => void;
}

type PreviewTheme = "light" | "dark";

export default function Workspace({ config, onReset }: WorkspaceProps) {
  const [theme, setTheme] = useState<PreviewTheme>("light");
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
    <div className="flex flex-1 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <div className="flex items-center gap-3">
          <button
            onClick={onReset}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            ← New Canvas
          </button>
          <div className="text-sm text-zinc-500 dark:text-zinc-400">
            {config.rawWidth} × {config.rawHeight} {unitLabel}
            {config.unit !== "px" && (
              <>
                {" "}@ {config.dpi} DPI →{" "}
              </>
            )}
            {config.unit === "px" && " → "}
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
        className="flex flex-1 items-center justify-center overflow-hidden p-6"
      >
        <div
          style={{
            width: config.widthPx,
            height: config.heightPx,
            transform: `scale(${scale})`,
          }}
          className={`shrink-0 border border-zinc-400/60 dark:border-zinc-600/60 ${
            theme === "light" ? "checkerboard-light" : "checkerboard-dark"
          }`}
        />
      </div>
    </div>
  );
}
