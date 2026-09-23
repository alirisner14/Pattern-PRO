"use client";

import { useState, type FormEvent } from "react";
import {
  DEFAULT_DPI,
  UNIT_OPTIONS,
  buildCanvasConfig,
  type CanvasConfig,
  type Unit,
} from "@/lib/units";

interface CanvasSetupFormProps {
  onCreate: (config: CanvasConfig) => void;
}

export default function CanvasSetupForm({ onCreate }: CanvasSetupFormProps) {
  const [width, setWidth] = useState("12");
  const [height, setHeight] = useState("12");
  const [unit, setUnit] = useState<Unit>("in");
  const [dpi, setDpi] = useState(String(DEFAULT_DPI));
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();

    const w = Number(width);
    const h = Number(height);
    const d = Number(dpi);

    if (!Number.isFinite(w) || w <= 0 || !Number.isFinite(h) || h <= 0) {
      setError("Width and height must be positive numbers.");
      return;
    }
    if (!Number.isFinite(d) || d <= 0) {
      setError("DPI must be a positive number.");
      return;
    }

    setError(null);
    onCreate(buildCanvasConfig(w, h, unit, d));
  }

  return (
    <div className="flex flex-1 items-center justify-center px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
      >
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          New Canvas
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Set the exact dimensions for your pattern template.
        </p>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
            Width
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              value={width}
              onChange={(e) => setWidth(e.target.value)}
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
            Height
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              value={height}
              onChange={(e) => setHeight(e.target.value)}
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
            />
          </label>
        </div>

        <label className="mt-3 flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
          Unit
          <select
            value={unit}
            onChange={(e) => setUnit(e.target.value as Unit)}
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
          >
            {UNIT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        <label className="mt-3 flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
          DPI / PPI
          <input
            type="number"
            inputMode="numeric"
            min={1}
            step="1"
            value={dpi}
            onChange={(e) => setDpi(e.target.value)}
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
          />
        </label>
        <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
          Used to convert to pixels, and embedded in the exported PNG.
        </p>

        {error && (
          <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>
        )}

        <button
          type="submit"
          className="mt-5 w-full rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Create Canvas
        </button>
      </form>
    </div>
  );
}
