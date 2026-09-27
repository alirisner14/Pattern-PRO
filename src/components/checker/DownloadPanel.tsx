"use client";

import { useState } from "react";
import { withDpi } from "@/lib/check/png";

interface DownloadPanelProps {
  tileW: number;
  tileH: number;
  render: (width: number, height: number) => HTMLCanvasElement;
}

// iPad Safari refuses canvases larger than this many pixels.
const MAX_PIXELS = 16_777_216;

const inputClass =
  "w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50";

export default function DownloadPanel({
  tileW,
  tileH,
  render,
}: DownloadPanelProps) {
  const [width, setWidth] = useState(tileW);
  const [height, setHeight] = useState(tileH);
  const [dpi, setDpi] = useState(300);
  const [busy, setBusy] = useState(false);
  const aspect = tileH / tileW;

  const valid = width > 0 && height > 0 && dpi > 0;
  const enlarged = width > tileW || height > tileH;
  const tooBig = width * height > MAX_PIXELS;

  async function download() {
    setBusy(true);
    try {
      const canvas = render(Math.round(width), Math.round(height));
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png"),
      );
      if (!blob) throw new Error("export failed");
      const file = await withDpi(blob, dpi);
      const url = URL.createObjectURL(file);
      const a = document.createElement("a");
      a.href = url;
      a.download = `pattern-${Math.round(width)}x${Math.round(height)}-${dpi}dpi.png`;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
        Download
      </h3>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        One flattened PNG. The default keeps every original pixel, set for 300
        DPI print.
      </p>
      <div className="grid grid-cols-3 gap-2">
        <label className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
          Width px
          <input
            type="number"
            min={1}
            value={width}
            onChange={(e) => {
              const w = Number(e.target.value);
              setWidth(w);
              setHeight(Math.round(w * aspect));
            }}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
          Height px
          <input
            type="number"
            min={1}
            value={height}
            onChange={(e) => {
              const h = Number(e.target.value);
              setHeight(h);
              setWidth(Math.round(h / aspect));
            }}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
          DPI
          <input
            type="number"
            min={1}
            value={dpi}
            onChange={(e) => setDpi(Number(e.target.value))}
            className={inputClass}
          />
        </label>
      </div>
      {valid && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Prints at {(width / dpi).toFixed(2)} × {(height / dpi).toFixed(2)} in.
        </p>
      )}
      {enlarged && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          This is larger than your artwork ({tileW} × {tileH} px). Enlarging
          can&apos;t add detail, so edges may look soft. To print bigger without
          softening, keep the original pixel size and lower the DPI instead.
        </p>
      )}
      {tooBig && (
        <p className="text-xs text-red-600 dark:text-red-400">
          Too large to export on iPad (over 16.7 million pixels). Reduce the
          size.
        </p>
      )}
      <div className="flex gap-2">
        <button
          onClick={() => {
            setWidth(tileW);
            setHeight(tileH);
            setDpi(300);
          }}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Reset
        </button>
        <button
          disabled={!valid || tooBig || busy}
          onClick={download}
          className="flex-1 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {busy ? "Preparing…" : "Download PNG"}
        </button>
      </div>
    </div>
  );
}
