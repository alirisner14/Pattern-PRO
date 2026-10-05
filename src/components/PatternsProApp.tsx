"use client";

import { useState } from "react";
import Image from "next/image";
import CanvasSetupForm from "@/components/CanvasSetupForm";
import PatternEditor from "@/components/PatternEditor";
import PatternChecker from "@/components/checker/PatternChecker";
import ServiceWorkerManager from "@/components/ServiceWorkerManager";
import type { CanvasConfig } from "@/lib/units";

type Mode = "templates" | "check";

const MODES: { value: Mode; label: string }[] = [
  { value: "templates", label: "Make a Template" },
  { value: "check", label: "Check a Pattern" },
];

export default function PatternsProApp() {
  const [config, setConfig] = useState<CanvasConfig | null>(null);
  const [mode, setMode] = useState<Mode>("templates");

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center gap-4 border-b border-zinc-200 px-4 py-2 dark:border-zinc-800">
        {/* The logo's lettering is black, so it sits on a white badge in dark mode too. */}
        <span className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-white">
          <Image
            src="/icons/icon-192.png"
            alt="Pattern PRO"
            width={44}
            height={44}
            unoptimized
            priority
          />
        </span>
        <nav className="flex rounded-md border border-zinc-300 p-0.5 dark:border-zinc-700">
          {MODES.map((m) => (
            <button
              key={m.value}
              onClick={() => setMode(m.value)}
              className={`rounded px-3 py-1 text-sm transition-colors ${
                mode === m.value
                  ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900"
                  : "text-zinc-600 dark:text-zinc-400"
              }`}
            >
              {m.label}
            </button>
          ))}
        </nav>
      </header>

      {/* Both stay mounted so switching tabs doesn't lose work. */}
      <div
        className={
          mode === "templates" ? "flex min-h-0 flex-1 flex-col" : "hidden"
        }
      >
        {config ? (
          <PatternEditor
            canvasConfig={config}
            onReset={() => setConfig(null)}
          />
        ) : (
          <CanvasSetupForm onCreate={setConfig} />
        )}
      </div>
      <div
        className={mode === "check" ? "flex min-h-0 flex-1 flex-col" : "hidden"}
      >
        <PatternChecker />
      </div>
      <ServiceWorkerManager />
    </div>
  );
}
