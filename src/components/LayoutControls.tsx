"use client";

import RepeatStylePictograph from "@/components/RepeatStylePictograph";
import { DEFAULT_CLASS_COLORS } from "@/lib/layout/constants";
import type { TierColors } from "@/lib/colorPrefs";
import type { PatternSettings, RepeatStyle } from "@/lib/layout/types";
import OgeeVariantIcon from "@/components/OgeeVariantIcon";
import {
  PROPORTIONED_OGEES,
  type OgeeCurve,
  type OgeeProportion,
  type OgeeStyle,
  type ShapeFit,
  type ShapeSides,
} from "@/lib/shapes/shapes";

const REPEAT_STYLES: { value: RepeatStyle; label: string }[] = [
  { value: "grid", label: "Grid" },
  { value: "scattered", label: "Scattered" },
  { value: "half-drop", label: "Half-Drop" },
  { value: "brick", label: "Brick" },
  { value: "diamond", label: "Diamond" },
  { value: "ogee", label: "Ogee" },
];

const OGEE_STYLES: { value: OgeeStyle; label: string }[] = [
  { value: "standard", label: "Standard" },
  { value: "lantern", label: "Lantern" },
  { value: "arabesque", label: "Arabesque" },
  { value: "fan", label: "Fan" },
  { value: "bat", label: "Bat" },
  { value: "column", label: "Column" },
  { value: "quatrefoil", label: "Quatrefoil" },
  { value: "steppedQuatrefoil", label: "Stepped" },
  { value: "drop", label: "Drop" },
  { value: "star", label: "Star" },
  { value: "fourPoint", label: "Four-Point" },
  { value: "petalX", label: "Petal X" },
  { value: "notchedSquare", label: "Notched" },
  { value: "scalloped", label: "Scalloped" },
];

type SetSetting = <K extends keyof PatternSettings>(
  key: K,
  next: PatternSettings[K],
) => void;

const selectClass =
  "rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50";

function ShapeControls({
  value,
  set,
}: {
  value: PatternSettings;
  set: SetSetting;
}) {
  const isDiamond = value.repeatStyle === "diamond";
  const isOpen = value.shapeFit === "open";
  const hasProportion =
    !isDiamond && PROPORTIONED_OGEES.includes(value.ogeeStyle);
  const hasCurve = !isDiamond && value.ogeeStyle !== "column";

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
        Shape
      </h2>

      {!isDiamond && (
        <>
          <div className="grid grid-cols-3 gap-2">
            {OGEE_STYLES.map((opt) => (
              <button
                key={opt.value}
                onClick={() => set("ogeeStyle", opt.value)}
                className={`flex flex-col items-center gap-1 rounded-md border p-2 text-xs transition-colors ${
                  value.ogeeStyle === opt.value
                    ? "border-zinc-900 bg-zinc-100 text-zinc-900 dark:border-zinc-50 dark:bg-zinc-800 dark:text-zinc-50"
                    : "border-zinc-200 text-zinc-500 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-900"
                }`}
              >
                <OgeeVariantIcon style={opt.value} curve={value.ogeeCurve} />
                {opt.label}
              </button>
            ))}
          </div>
          {hasProportion && (
            <label className="flex items-center justify-between text-sm text-zinc-700 dark:text-zinc-300">
              Proportion
              <select
                value={value.ogeeProportion}
                onChange={(e) =>
                  set("ogeeProportion", e.target.value as OgeeProportion)
                }
                className={selectClass}
              >
                <option value="skinny">Skinny</option>
                <option value="mid">Mid</option>
                <option value="wide">Wide</option>
              </select>
            </label>
          )}
          {hasCurve && (
            <label className="flex items-center justify-between text-sm text-zinc-700 dark:text-zinc-300">
              Curve
              <select
                value={value.ogeeCurve}
                onChange={(e) => set("ogeeCurve", e.target.value as OgeeCurve)}
                className={selectClass}
              >
                <option value="subtle">Subtle</option>
                <option value="medium">Medium</option>
                <option value="deep">Deep</option>
              </select>
            </label>
          )}
        </>
      )}

      {isDiamond && (
        <label className="flex items-center justify-between text-sm text-zinc-700 dark:text-zinc-300">
          Sides
          <select
            value={value.diamondSides}
            onChange={(e) => set("diamondSides", e.target.value as ShapeSides)}
            className={selectClass}
          >
            <option value="straight">Straight</option>
            <option value="concave">Concave</option>
            <option value="convex">Convex</option>
          </select>
        </label>
      )}

      <label className="flex items-center justify-between text-sm text-zinc-700 dark:text-zinc-300">
        Fit
        <select
          value={value.shapeFit}
          onChange={(e) => set("shapeFit", e.target.value as ShapeFit)}
          className={selectClass}
        >
          <option value="closed">Closed</option>
          <option value="open">Open</option>
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
        <span className="flex justify-between">
          {isOpen ? "Open amount" : "Outline thickness"}
          <span className="text-xs text-zinc-400 dark:text-zinc-500">
            {isOpen
              ? `${value.openAmount}%`
              : value.outlinePx
                ? `${value.outlinePx}px`
                : "none"}
          </span>
        </span>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={isOpen ? value.openAmount : value.outlinePx}
          onChange={(e) =>
            set(isOpen ? "openAmount" : "outlinePx", Number(e.target.value))
          }
        />
      </label>

      <label className="flex items-center justify-between text-sm text-zinc-700 dark:text-zinc-300">
        Inner shapes
        <input
          type="number"
          min={0}
          max={8}
          step={1}
          value={value.innerCount}
          onChange={(e) =>
            set(
              "innerCount",
              Math.min(8, Math.max(0, Math.round(Number(e.target.value) || 0))),
            )
          }
          className="w-16 rounded-md border border-zinc-300 bg-white px-2 py-1 text-right text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
        />
      </label>

      {value.innerCount > 0 && (
        <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
          <span className="flex justify-between">
            Inner spacing
            <span className="text-xs text-zinc-400 dark:text-zinc-500">
              {Math.round(value.innerSpacing * 100)}%
            </span>
          </span>
          <input
            type="range"
            min={0.03}
            max={0.2}
            step={0.01}
            value={value.innerSpacing}
            onChange={(e) => set("innerSpacing", Number(e.target.value))}
          />
        </label>
      )}

      <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
        <input
          type="checkbox"
          checked={value.showShapeLayout}
          onChange={(e) => set("showShapeLayout", e.target.checked)}
        />
        Layout inside shape
      </label>
    </div>
  );
}

interface LayoutControlsProps {
  value: PatternSettings;
  placementCount: number;
  warnings: string[];
  colors: TierColors;
  onColorsChange: (next: TierColors) => void;
  onChange: (next: PatternSettings) => void;
  onRebuild: () => void;
}

export default function LayoutControls({
  value,
  placementCount,
  warnings,
  colors,
  onColorsChange,
  onChange,
  onRebuild,
}: LayoutControlsProps) {
  const customColors = (Object.keys(colors) as (keyof TierColors)[]).some(
    (cls) => colors[cls].toLowerCase() !== DEFAULT_CLASS_COLORS[cls],
  );

  function set<K extends keyof PatternSettings>(
    key: K,
    next: PatternSettings[K],
  ) {
    onChange({ ...value, [key]: next });
  }

  const isShape =
    value.repeatStyle === "diamond" || value.repeatStyle === "ogee";

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
        </div>
      </div>

      {isShape && <ShapeControls value={value} set={set} />}

      <div>
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            Density
          </h2>
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
        <TierRow
          label="Hero (1)"
          count={value.heroCount}
          onCountChange={(v) => set("heroCount", v)}
          color={colors.hero}
          onColorChange={(c) => onColorsChange({ ...colors, hero: c })}
        />
        <TierRow
          label="Secondary (2)"
          count={value.secondaryCount}
          onCountChange={(v) => set("secondaryCount", v)}
          color={colors.secondary}
          onColorChange={(c) => onColorsChange({ ...colors, secondary: c })}
        />
        <TierRow
          label="Filler (3)"
          count={value.fillerCount}
          onCountChange={(v) => set("fillerCount", v)}
          color={colors.filler}
          onColorChange={(c) => onColorsChange({ ...colors, filler: c })}
        />
        {customColors && (
          <button
            onClick={() => onColorsChange({ ...DEFAULT_CLASS_COLORS })}
            className="self-start text-xs text-zinc-500 underline hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            Reset colors to default
          </button>
        )}
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

function TierRow({
  label,
  count,
  onCountChange,
  color,
  onColorChange,
}: {
  label: string;
  count: number;
  onCountChange: (v: number) => void;
  color: string;
  onColorChange: (c: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 text-sm text-zinc-700 dark:text-zinc-300">
      <span className="flex-1">{label}</span>
      <input
        type="color"
        aria-label={`${label} color`}
        value={color}
        onChange={(e) => onColorChange(e.target.value)}
        className="h-7 w-9 cursor-pointer rounded border border-zinc-300 bg-transparent p-0.5 dark:border-zinc-700"
      />
      <input
        type="number"
        aria-label={`${label} motif count`}
        min={0}
        step={1}
        value={count}
        onChange={(e) =>
          onCountChange(Math.max(0, Math.round(Number(e.target.value) || 0)))
        }
        className="w-16 rounded-md border border-zinc-300 bg-white px-2 py-1 text-right text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
      />
    </div>
  );
}
