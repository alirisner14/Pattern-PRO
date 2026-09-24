"use client";

import RepeatStylePictograph from "@/components/RepeatStylePictograph";
import type { PatternSettings, RepeatStyle } from "@/lib/layout/types";

const REPEAT_STYLES: { value: RepeatStyle; label: string }[] = [
  { value: "grid", label: "Grid" },
  { value: "scattered", label: "Scattered" },
  { value: "half-drop", label: "Half-Drop" },
  { value: "brick", label: "Brick" },
  { value: "diamond", label: "Diamond" },
];

interface LayoutControlsProps {
  value: PatternSettings;
  placementCount: number;
  warnings: string[];
  onChange: (next: PatternSettings) => void;
  onRebuild: () => void;
}

export default function LayoutControls({
  value,
  placementCount,
  warnings,
  onChange,
  onRebuild,
}: LayoutControlsProps) {
  function set<K extends keyof PatternSettings>(key: K, next: PatternSettings[K]) {
    onChange({ ...value, [key]: next });
  }

  return (
    <aside className="flex w-72 shrink-0 flex-col gap-5 overflow-y-auto border-r border-zinc-200 p-4 dark:border-zinc-800">
      <div>
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Repeat Style
        </h2>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {REPEAT_STYLES.map((opt) => (
            <button
              key={opt.value}
              onClick={() => set("repeatStyle", opt.value)}
              className={`flex flex-col items-center gap-1 rounded-md border p-2 text-xs transition-colors ${
                value.repeatStyle === opt.value
                  ? "border-zinc-900 bg-zinc-100 text-zinc-900 dark:border-zinc-50 dark:bg-zinc-800 dark:text-zinc-50"
                  : "border-zinc-200 text-zinc-500 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-900"
              }`}
            >
              <RepeatStylePictograph style={opt.value} />
              {opt.label}
            </button>
          ))}
          <button
            disabled
            title="Coming soon"
            className="flex cursor-not-allowed flex-col items-center gap-1 rounded-md border border-dashed border-zinc-200 p-2 text-xs text-zinc-400 dark:border-zinc-700 dark:text-zinc-600"
          >
            <RepeatStylePictograph style="ogee" />
            Ogee · soon
          </button>
        </div>
        {value.repeatStyle === "diamond" && (
          <label className="mt-3 flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input
              type="checkbox"
              checked={value.showShapeLayout}
              onChange={(e) => set("showShapeLayout", e.target.checked)}
            />
            Layout inside shape
          </label>
        )}
      </div>

      <div>
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Density</h2>
          <span className="text-xs text-zinc-400 dark:text-zinc-500">
            {placementCount} placements
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={value.density}
          onChange={(e) => set("density", Number(e.target.value))}
          className="mt-2 w-full"
        />
      </div>

      <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
        <input
          type="checkbox"
          checked={value.showEdgeRepeats}
          onChange={(e) => set("showEdgeRepeats", e.target.checked)}
        />
        Show Edge Repeats
      </label>

      <div className="flex flex-col gap-3">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            Elements
          </h2>
          <p className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">
            Distinct motifs per tier. Density sets how often they repeat.
          </p>
        </div>
        <CountField
          label="Hero (1)"
          value={value.heroCount}
          onChange={(v) => set("heroCount", v)}
        />
        <CountField
          label="Secondary (2)"
          value={value.secondaryCount}
          onChange={(v) => set("secondaryCount", v)}
        />
        <CountField
          label="Filler (3)"
          value={value.fillerCount}
          onChange={(v) => set("fillerCount", v)}
        />
        {warnings.map((w) => (
          <p key={w} className="text-xs text-amber-600 dark:text-amber-400">
            {w}
          </p>
        ))}
      </div>

      <button
        onClick={onRebuild}
        className="mt-auto w-full rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        ⟳ Rebuild Layout
      </button>
    </aside>
  );
}

function CountField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex items-center justify-between text-sm text-zinc-700 dark:text-zinc-300">
      {label}
      <input
        type="number"
        min={0}
        step={1}
        value={value}
        onChange={(e) => onChange(Math.max(0, Math.round(Number(e.target.value) || 0)))}
        className="w-20 rounded-md border border-zinc-300 bg-white px-2 py-1 text-right text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
      />
    </label>
  );
}
