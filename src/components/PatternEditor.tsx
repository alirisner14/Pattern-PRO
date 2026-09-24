"use client";

import { useMemo, useState } from "react";
import Workspace from "@/components/Workspace";
import LayoutControls from "@/components/LayoutControls";
import { generateLayout } from "@/lib/layout/generateLayout";
import { DEFAULT_CLASS_COLORS } from "@/lib/layout/constants";
import { randomSeed } from "@/lib/layout/rng";
import type { CanvasConfig } from "@/lib/units";
import type { PatternSettings } from "@/lib/layout/types";

interface PatternEditorProps {
  canvasConfig: CanvasConfig;
  onReset: () => void;
}

const DEFAULT_SETTINGS: PatternSettings = {
  repeatStyle: "full-drop",
  alignment: "grid",
  density: 0.5,
  heroCount: 2,
  secondaryCount: 3,
  fillerCount: 4,
  showEdgeRepeats: true,
};

export default function PatternEditor({ canvasConfig, onReset }: PatternEditorProps) {
  const [settings, setSettings] = useState<PatternSettings>(DEFAULT_SETTINGS);
  const [seed, setSeed] = useState(randomSeed);

  const layout = useMemo(
    () =>
      generateLayout({
        widthPx: canvasConfig.widthPx,
        heightPx: canvasConfig.heightPx,
        repeatStyle: settings.repeatStyle,
        alignment: settings.alignment,
        density: settings.density,
        seed,
        hero: { count: settings.heroCount, color: DEFAULT_CLASS_COLORS.hero },
        secondary: { count: settings.secondaryCount, color: DEFAULT_CLASS_COLORS.secondary },
        filler: { count: settings.fillerCount, color: DEFAULT_CLASS_COLORS.filler },
      }),
    [canvasConfig.widthPx, canvasConfig.heightPx, settings, seed]
  );

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      <LayoutControls
        value={settings}
        warnings={layout.warnings}
        onChange={setSettings}
        onRebuild={() => setSeed(randomSeed())}
      />
      <Workspace
        config={canvasConfig}
        elements={layout.elements}
        showEdgeRepeats={settings.showEdgeRepeats}
        onReset={onReset}
      />
    </div>
  );
}
