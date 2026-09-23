"use client";

import { useState } from "react";
import CanvasSetupForm from "@/components/CanvasSetupForm";
import PatternEditor from "@/components/PatternEditor";
import type { CanvasConfig } from "@/lib/units";

export default function PatternsProApp() {
  const [config, setConfig] = useState<CanvasConfig | null>(null);

  return (
    <div className="flex h-screen flex-col">
      <header className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <span className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Patterns PRO
        </span>
      </header>

      {config ? (
        <PatternEditor canvasConfig={config} onReset={() => setConfig(null)} />
      ) : (
        <CanvasSetupForm onCreate={setConfig} />
      )}
    </div>
  );
}
