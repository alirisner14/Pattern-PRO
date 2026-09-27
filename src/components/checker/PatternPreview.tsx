"use client";

import { useEffect, useRef, useState } from "react";
import { ISSUE_COLORS, type Issue, type Mark } from "@/lib/check/analyze";

interface PatternPreviewProps {
  source: HTMLCanvasElement;
  issues: Issue[];
  transparent: boolean;
}

const MAX_REPEATS = 10;

function MarkShape({
  mark,
  color,
  minSize,
}: {
  mark: Mark;
  color: string;
  minSize: number;
}) {
  const common = {
    stroke: color,
    strokeWidth: 2.5,
    vectorEffect: "non-scaling-stroke" as const,
  };
  if (mark.type === "circle") {
    return (
      <circle
        cx={mark.x}
        cy={mark.y}
        r={mark.r}
        fill={color}
        fillOpacity={0.15}
        {...common}
      />
    );
  }
  if (mark.type === "line") {
    return (
      <line
        x1={mark.x1}
        y1={mark.y1}
        x2={mark.x2}
        y2={mark.y2}
        {...common}
        strokeWidth={6}
        strokeOpacity={0.8}
        strokeLinecap="round"
      />
    );
  }
  // Hairline boxes are only a few pixels wide; widen them so they're visible.
  const w = Math.max(mark.w, minSize);
  const h = Math.max(mark.h, minSize);
  return (
    <rect
      x={mark.x + mark.w / 2 - w / 2}
      y={mark.y + mark.h / 2 - h / 2}
      width={w}
      height={h}
      fill={color}
      fillOpacity={0.18}
      {...common}
    />
  );
}

// The pattern tiled n × n, scaled to fit its container, with the issue
// highlights drawn over every copy.
function TiledView({
  source,
  issues,
  repeats,
  transparent,
}: PatternPreviewProps & { repeats: number }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const observer = new ResizeObserver(() => {
      const totalW = source.width * repeats;
      const totalH = source.height * repeats;
      const scale = Math.min(
        box.clientWidth / totalW,
        box.clientHeight / totalH,
      );
      setSize({ w: Math.floor(totalW * scale), h: Math.floor(totalH * scale) });
    });
    observer.observe(box);
    return () => observer.disconnect();
  }, [source, repeats]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !size.w) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(size.w * dpr);
    canvas.height = Math.round(size.h * dpr);
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const tw = canvas.width / repeats;
    const th = canvas.height / repeats;
    for (let i = 0; i < repeats; i++) {
      for (let j = 0; j < repeats; j++) {
        // Overlap by a pixel so the preview itself never shows a gap.
        ctx.drawImage(
          source,
          Math.floor(i * tw),
          Math.floor(j * th),
          Math.ceil(tw) + 1,
          Math.ceil(th) + 1,
        );
      }
    }
  }, [source, repeats, size]);

  const W = source.width;
  const H = source.height;
  const copies: [number, number][] = [];
  for (let i = -1; i <= repeats; i++) {
    for (let j = -1; j <= repeats; j++) copies.push([i, j]);
  }
  const minSize = Math.min(W, H) * 0.012 * repeats;

  return (
    <div
      ref={boxRef}
      className="flex min-h-0 flex-1 items-center justify-center overflow-hidden"
    >
      <div
        className={`relative ${transparent ? "checkerboard-light" : ""}`}
        style={{ width: size.w, height: size.h }}
      >
        <canvas
          ref={canvasRef}
          style={{ width: size.w, height: size.h }}
          className="absolute inset-0"
        />
        <svg
          viewBox={`0 0 ${W * repeats} ${H * repeats}`}
          className="pointer-events-none absolute inset-0"
          width={size.w}
          height={size.h}
          style={{ overflow: "hidden" }}
        >
          {copies.map(([i, j]) => (
            <g key={`${i}:${j}`} transform={`translate(${i * W} ${j * H})`}>
              {issues.map((issue, k) =>
                issue.marks.map((mark, m) => (
                  <MarkShape
                    key={`${k}:${m}`}
                    mark={mark}
                    color={ISSUE_COLORS[issue.kind]}
                    minSize={minSize}
                  />
                )),
              )}
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}

function RepeatControl({
  repeats,
  onChange,
  dark,
}: {
  repeats: number;
  onChange: (n: number) => void;
  dark?: boolean;
}) {
  return (
    <label
      className={`flex flex-1 items-center gap-3 text-sm ${dark ? "text-zinc-200" : "text-zinc-700 dark:text-zinc-300"}`}
    >
      <span className="shrink-0">Repeats</span>
      <input
        type="range"
        min={1}
        max={MAX_REPEATS}
        step={1}
        value={repeats}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1"
      />
      <span className="w-14 shrink-0 text-right">
        {repeats} × {repeats}
      </span>
    </label>
  );
}

export default function PatternPreview(props: PatternPreviewProps) {
  const [repeats, setRepeats] = useState(1);
  const [fullScreen, setFullScreen] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!fullScreen) return;
    // Use the browser's real full screen where it's allowed (iPad Safari
    // supports it for elements); the fixed overlay covers the page either way.
    const el = overlayRef.current as
      (HTMLDivElement & { webkitRequestFullscreen?: () => void }) | null;
    try {
      if (el?.requestFullscreen) el.requestFullscreen().catch(() => {});
      else el?.webkitRequestFullscreen?.();
    } catch {
      // Not allowed here; the overlay alone still fills the window.
    }
    const onKey = (e: KeyboardEvent) =>
      e.key === "Escape" && setFullScreen(false);
    const onExit = () => {
      if (!document.fullscreenElement) setFullScreen(false);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("fullscreenchange", onExit);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("fullscreenchange", onExit);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, [fullScreen]);

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
        <TiledView {...props} repeats={repeats} />
        <div className="flex items-center gap-3">
          <RepeatControl repeats={repeats} onChange={setRepeats} />
          <button
            onClick={() => setFullScreen(true)}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            ⛶ Full screen
          </button>
        </div>
      </div>

      {fullScreen && (
        <div
          ref={overlayRef}
          className="fixed inset-0 z-50 flex flex-col bg-zinc-950"
        >
          <div className="flex min-h-0 flex-1 p-2">
            <TiledView {...props} repeats={repeats} />
          </div>
          <div className="flex items-center gap-4 border-t border-zinc-800 bg-zinc-900 px-4 py-3">
            <RepeatControl repeats={repeats} onChange={setRepeats} dark />
            <button
              onClick={() => setFullScreen(false)}
              className="rounded-md bg-zinc-50 px-4 py-2 text-sm font-medium text-zinc-900"
            >
              Exit full screen
            </button>
          </div>
        </div>
      )}
    </>
  );
}
