"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ISSUE_COLORS,
  ISSUE_NAMES,
  analyzePattern,
  type Analysis,
  type IssueKind,
} from "@/lib/check/analyze";
import PatternPreview from "@/components/checker/PatternPreview";
import DownloadPanel from "@/components/checker/DownloadPanel";

type LayerId = "main" | "middle" | "back";

interface Layer {
  image: HTMLImageElement | null;
  name: string;
  // How many times the layer repeats across the tile, each way. Fewer
  // repeats = larger elements.
  repeats: number;
  opacity: number;
}

const LAYER_LABELS: Record<LayerId, string> = {
  main: "Main pattern (top)",
  middle: "Background pattern 1 (middle)",
  back: "Background pattern 2 (back)",
};
// Drawn back to front.
const DRAW_ORDER: LayerId[] = ["back", "middle", "main"];

const emptyLayer = (): Layer => ({
  image: null,
  name: "",
  repeats: 1,
  opacity: 1,
});

const buttonClass =
  "rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800";
const primaryClass =
  "rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200";

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () =>
      reject(new Error("That file couldn't be opened as an image."));
    img.src = url;
  });
}

// Flatten the layers into one tile the size of the main pattern.
export function compose(
  layers: Record<LayerId, Layer>,
  background: string | null,
  width: number,
  height: number,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);
  }
  for (const id of DRAW_ORDER) {
    const layer = layers[id];
    if (!layer.image) continue;
    ctx.globalAlpha = layer.opacity;
    const n = id === "main" ? 1 : layer.repeats;
    const w = width / n;
    const h = height / n;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++)
        ctx.drawImage(layer.image, i * w, j * h, w, h);
    }
  }
  ctx.globalAlpha = 1;
  return canvas;
}

export default function PatternChecker() {
  const [layers, setLayers] = useState<Record<LayerId, Layer>>({
    main: emptyLayer(),
    middle: emptyLayer(),
    back: emptyLayer(),
  });
  const [useBackground, setUseBackground] = useState(true);
  const [background, setBackground] = useState("#ffffff");
  const [error, setError] = useState<string | null>(null);
  // Each result remembers which composition it scored, so a stale result is
  // never shown against a changed pattern.
  const [result, setResult] = useState<{
    of: HTMLCanvasElement;
    analysis: Analysis;
  } | null>(null);
  const [hidden, setHidden] = useState<Set<IssueKind>>(new Set());
  const [proceeding, setProceeding] = useState(false);
  const [reworkNote, setReworkNote] = useState(false);

  // The tile takes the main pattern's pixel size (or the first layer added).
  const base = layers.main.image ?? layers.middle.image ?? layers.back.image;
  const tileW = base?.naturalWidth ?? 0;
  const tileH = base?.naturalHeight ?? 0;

  const composite = useMemo(
    () =>
      base
        ? compose(layers, useBackground ? background : null, tileW, tileH)
        : null,
    [base, layers, useBackground, background, tileW, tileH],
  );

  // Re-check whenever the composition changes. Scoring always looks at the
  // pattern over a solid colour so transparent areas read as empty space.
  useEffect(() => {
    if (!composite) return;
    const timer = window.setTimeout(() => {
      const flat = document.createElement("canvas");
      flat.width = composite.width;
      flat.height = composite.height;
      const ctx = flat.getContext("2d", { willReadFrequently: true })!;
      ctx.fillStyle = useBackground ? background : "#ffffff";
      ctx.fillRect(0, 0, flat.width, flat.height);
      ctx.drawImage(composite, 0, 0);
      setResult({
        of: composite,
        analysis: analyzePattern(
          ctx.getImageData(0, 0, flat.width, flat.height),
        ),
      });
    }, 50);
    return () => window.clearTimeout(timer);
  }, [composite, useBackground, background]);

  const analysis = result && result.of === composite ? result.analysis : null;
  const checking = !!composite && !analysis;

  const setLayer = useCallback((id: LayerId, patch: Partial<Layer>) => {
    setLayers((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
    setProceeding(false);
    setReworkNote(false);
  }, []);

  async function upload(id: LayerId, file: File | undefined) {
    if (!file) return;
    try {
      const image = await loadImage(file);
      setError(null);
      setLayer(id, { image, name: file.name });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function toggleKind(kind: IssueKind) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  }

  const visibleIssues =
    analysis?.issues.filter((i) => !hidden.has(i.kind)) ?? [];
  const kinds = [...new Set(analysis?.issues.map((i) => i.kind) ?? [])];

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <aside className="flex w-72 shrink-0 flex-col gap-5 overflow-y-auto border-r border-zinc-200 p-4 dark:border-zinc-800">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            Layers
          </h2>
          <p className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">
            Upload a finished pattern tile. Background patterns are optional.
          </p>
        </div>

        {(["main", "middle", "back"] as LayerId[]).map((id) => {
          const layer = layers[id];
          return (
            <div key={id} className="flex flex-col gap-2">
              <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                {LAYER_LABELS[id]}
              </span>
              <div className="flex items-center gap-2">
                <label className={`${buttonClass} cursor-pointer`}>
                  {layer.image ? "Replace" : "Upload"}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      upload(id, e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                </label>
                {layer.image && (
                  <button
                    className={buttonClass}
                    onClick={() => setLayer(id, emptyLayer())}
                  >
                    Remove
                  </button>
                )}
              </div>
              {layer.image && (
                <>
                  <span className="truncate text-xs text-zinc-400 dark:text-zinc-500">
                    {layer.name} · {layer.image.naturalWidth} ×{" "}
                    {layer.image.naturalHeight} px
                  </span>
                  {id !== "main" && (
                    <label className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
                      <span className="flex justify-between">
                        Repeats across the tile
                        <span>
                          {layer.repeats} × {layer.repeats}
                        </span>
                      </span>
                      <input
                        type="range"
                        min={1}
                        max={8}
                        step={1}
                        value={layer.repeats}
                        onChange={(e) =>
                          setLayer(id, { repeats: Number(e.target.value) })
                        }
                      />
                    </label>
                  )}
                  <label className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
                    <span className="flex justify-between">
                      Opacity
                      <span>{Math.round(layer.opacity * 100)}%</span>
                    </span>
                    <input
                      type="range"
                      min={0.05}
                      max={1}
                      step={0.05}
                      value={layer.opacity}
                      onChange={(e) =>
                        setLayer(id, { opacity: Number(e.target.value) })
                      }
                    />
                  </label>
                </>
              )}
            </div>
          );
        })}

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
            Background colour
          </span>
          <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input
              type="checkbox"
              checked={useBackground}
              onChange={(e) => setUseBackground(e.target.checked)}
            />
            Fill behind the layers
          </label>
          {useBackground && (
            <input
              type="color"
              aria-label="Background colour"
              value={background}
              onChange={(e) => setBackground(e.target.value)}
              className="h-8 w-14 cursor-pointer rounded border border-zinc-300 bg-transparent p-0.5 dark:border-zinc-700"
            />
          )}
        </div>

        {error && (
          <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
        )}
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {composite ? (
          <PatternPreview
            source={composite}
            issues={visibleIssues}
            transparent={!useBackground}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
            Upload your main pattern tile to check how it repeats.
          </div>
        )}
      </div>

      {composite && (
        <aside className="flex w-80 shrink-0 flex-col gap-4 overflow-y-auto border-l border-zinc-200 p-4 dark:border-zinc-800">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              Score sheet
            </h2>
            {checking && (
              <span className="text-xs text-zinc-400">Checking…</span>
            )}
          </div>

          {analysis && (
            <>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-semibold text-zinc-900 dark:text-zinc-50">
                  {analysis.overall}
                </span>
                <span className="text-sm text-zinc-500 dark:text-zinc-400">
                  / 100 overall
                </span>
              </div>

              <div className="flex flex-col gap-3">
                {analysis.scores.map((s) => (
                  <div key={s.name}>
                    <div className="flex justify-between text-sm text-zinc-700 dark:text-zinc-300">
                      <span>{s.name}</span>
                      <span>{s.score}</span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-800">
                      <div
                        className="h-1.5 rounded-full bg-zinc-900 dark:bg-zinc-100"
                        style={{ width: `${s.score}%` }}
                      />
                    </div>
                    <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                      {s.summary}
                    </p>
                  </div>
                ))}
                <div>
                  <div className="text-sm text-zinc-700 dark:text-zinc-300">
                    Print size
                  </div>
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    {tileW} × {tileH} px prints at {(tileW / 300).toFixed(2)} ×{" "}
                    {(tileH / 300).toFixed(2)} in at 300 DPI without enlarging.
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                  {analysis.issues.length ? "Found" : "No problems found"}
                </h3>
                {kinds.length > 0 && (
                  <p className="text-xs text-zinc-400 dark:text-zinc-500">
                    Tap a colour to show or hide its highlights.
                  </p>
                )}
                {analysis.issues.map((issue, i) => (
                  <button
                    key={i}
                    onClick={() => toggleKind(issue.kind)}
                    className={`flex gap-2 rounded-md border border-zinc-200 p-2 text-left dark:border-zinc-800 ${
                      hidden.has(issue.kind) ? "opacity-40" : ""
                    }`}
                  >
                    <span
                      className="mt-0.5 h-3 w-3 shrink-0 rounded-sm"
                      style={{ background: ISSUE_COLORS[issue.kind] }}
                    />
                    <span className="text-xs text-zinc-700 dark:text-zinc-300">
                      <span className="font-medium">
                        {ISSUE_NAMES[issue.kind]}:
                      </span>{" "}
                      {issue.detail}
                    </span>
                  </button>
                ))}
              </div>

              {!proceeding ? (
                <div className="flex flex-col gap-2">
                  <p className="text-sm text-zinc-700 dark:text-zinc-300">
                    Rework the pattern, or proceed to download?
                  </p>
                  <div className="flex gap-2">
                    <button
                      className={buttonClass}
                      onClick={() => setReworkNote(true)}
                    >
                      Rework
                    </button>
                    <button
                      className={primaryClass}
                      onClick={() => setProceeding(true)}
                    >
                      Proceed
                    </button>
                  </div>
                  {reworkNote && (
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      Fix the highlighted spots in your art app, then use
                      Replace on the layer to upload the new version —
                      it&apos;ll be checked again automatically.
                    </p>
                  )}
                </div>
              ) : (
                <DownloadPanel
                  tileW={tileW}
                  tileH={tileH}
                  render={(w, h) =>
                    compose(layers, useBackground ? background : null, w, h)
                  }
                />
              )}
            </>
          )}
        </aside>
      )}
    </div>
  );
}
