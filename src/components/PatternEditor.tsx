"use client";

import { useMemo, useState } from "react";
import Workspace from "@/components/Workspace";
import LayoutControls from "@/components/LayoutControls";
import { generateLayout } from "@/lib/layout/generateLayout";
import { DEFAULT_CLASS_COLORS } from "@/lib/layout/constants";
import { randomSeed } from "@/lib/layout/rng";
import { loadTierColors, saveTierColors, type TierColors } from "@/lib/colorPrefs";
import { buildShape } from "@/lib/shapes/shapes";
import type { CanvasConfig } from "@/lib/units";
import type { PatternSettings } from "@/lib/layout/types";

interface PatternEditorProps {
  canvasConfig: CanvasConfig;
  onReset: () => void;
}

const DEFAULT_SETTINGS: PatternSettings = {
  repeatStyle: "grid",
  density: 0.5,
  heroCount: 2,
  secondaryCount: 3,
  fillerCount: 4,
  showEdgeRepeats: true,
  showShapeLayout: true,
  diamondSides: "straight",
  shapeFit: "closed",
  ogeeStyle: "standard",
  ogeeCurve: "medium",
  outlinePx: 0,
  openAmount: 25,
  innerCount: 0,
  innerSpacing: 0.08,
};

export default function PatternEditor({ canvasConfig, onReset }: PatternEditorProps) {
  const [settings, setSettings] = useState<PatternSettings>(DEFAULT_SETTINGS);
  const [seed, setSeed] = useState(randomSeed);
  const [colors, setColors] = useState<TierColors>(loadTierColors);

  const { widthPx, heightPx } = canvasConfig;
  const {
    repeatStyle,
    diamondSides,
    shapeFit,
    ogeeStyle,
    ogeeCurve,
    openAmount,
    innerCount,
    innerSpacing,
  } = settings;
  const isShape = repeatStyle === "diamond" || repeatStyle === "ogee";
  const isOpen = repeatStyle === "diamond" && diamondSides !== "straight" && shapeFit === "open";

  const shape = useMemo(
    () =>
      isShape
        ? buildShape(
            {
              kind: repeatStyle === "ogee" ? "ogee" : "diamond",
              sides: diamondSides,
              fit: shapeFit,
              ogeeStyle,
              ogeeCurve,
              openAmount,
              innerCount,
              innerSpacing,
            },
            widthPx,
            heightPx
          )
        : null,
    [
      isShape,
      repeatStyle,
      diamondSides,
      shapeFit,
      ogeeStyle,
      ogeeCurve,
      openAmount,
      innerCount,
      innerSpacing,
      widthPx,
      heightPx,
    ]
  );

  const layout = useMemo(
    () =>
      generateLayout({
        widthPx,
        heightPx,
        repeatStyle,
        density: settings.density,
        seed,
        hero: { count: settings.heroCount, color: DEFAULT_CLASS_COLORS.hero },
        secondary: { count: settings.secondaryCount, color: DEFAULT_CLASS_COLORS.secondary },
        filler: { count: settings.fillerCount, color: DEFAULT_CLASS_COLORS.filler },
        shape: shape ?? undefined,
      }),
    [
      widthPx,
      heightPx,
      repeatStyle,
      settings.density,
      settings.heroCount,
      settings.secondaryCount,
      settings.fillerCount,
      seed,
      shape,
    ]
  );

  // Colors are applied after layout so dragging a color picker doesn't
  // re-run the whole layout on every tick.
  const elements = useMemo(
    () => layout.elements.map((el) => ({ ...el, color: colors[el.class] })),
    [layout.elements, colors]
  );

  function changeColors(next: TierColors) {
    setColors(next);
    saveTierColors(next);
  }

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      <LayoutControls
        value={settings}
        placementCount={layout.elements.length}
        warnings={layout.warnings}
        colors={colors}
        onColorsChange={changeColors}
        onChange={setSettings}
        onRebuild={() => setSeed(randomSeed())}
      />
      <Workspace
        config={canvasConfig}
        elements={isShape && !settings.showShapeLayout ? [] : elements}
        shape={shape}
        outlinePx={isOpen ? 0 : settings.outlinePx}
        showEdgeRepeats={settings.showEdgeRepeats}
        onReset={onReset}
      />
    </div>
  );
}
