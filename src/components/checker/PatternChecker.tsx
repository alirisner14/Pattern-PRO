"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ISSUE_COLORS,
  ISSUE_NAMES,
  analyzePattern,
  type Analysis,
  type IssueKind,
} from "@/lib/check/analyze";
import PatternPreview from "@/components/checker/PatternPreview";
import DownloadPanel from "@/components/checker/DownloadPanel";

// The flow once a finished design comes back: background colour (only when
// it's transparent), check, then scale and export.
type Step = "background" | "check" | "export";

// Scale steps: each one shrinks the design to a quarter and puts it in all
// four corners, so the design repeats 1, 2, 4 or 8 times each way.
const SCALE_STEPS = [1, 2, 4, 8];

const buttonClass =
  "rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800";
const primaryClass =
  "rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200";

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () =>
      reject(new Error("That file couldn't be opened as an image."));
    img.src = URL.createObjectURL(file);
  });
}

function hasTransparency(img: HTMLImageElement): boolean {
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let i = 3; i < data.length; i += 4) if (data[i] < 250) return true;
  return false;
}

// The design, over its background colour if it needs one, repeated n × n
// into a canvas of the given size.
function render(
  img: HTMLImageElement,
  background: string | null,
  repeats: number,
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
  const w = width / repeats;
  const h = height / repeats;
  for (let i = 0; i < repeats; i++) {
    for (let j = 0; j < repeats; j++) ctx.drawImage(img, i * w, j * h, w, h);
  }
  return canvas;
}

function StepBadge({
  n,
  label,
  active,
  done,
}: {
  n: number;
  label: string;
  active: boolean;
  done: boolean;
}) {
  return (
    <li
      className={`flex items-center gap-2 text-sm ${
        active
          ? "font-semibold text-zinc-900 dark:text-zinc-50"
          : "text-zinc-400 dark:text-zinc-500"
      }`}
    >
      <span
        className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${
          active
            ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900"
            : done
              ? "bg-zinc-300 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200"
              : "border border-zinc-300 dark:border-zinc-700"
        }`}
      >
        {done && !active ? "✓" : n}
      </span>
      {label}
    </li>
  );
}

export default function PatternChecker() {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [fileName, setFileName] = useState("");
  const [transparent, setTransparent] = useState(false);
  const [background, setBackground] = useState("#ffffff");
  const [step, setStep] = useState<Step>("check");
  const [error, setError] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<IssueKind>>(new Set());
  const [scale, setScale] = useState(1);
  const [result, setResult] = useState<{
    of: HTMLCanvasElement;
    analysis: Analysis;
  } | null>(null);

  // The design as it will repeat: over the chosen colour when transparent.
  const design = useMemo(
    () =>
      image
        ? render(
            image,
            transparent ? background : null,
            1,
            image.naturalWidth,
            image.naturalHeight,
          )
        : null,
    [image, transparent, background],
  );

  // Score whenever the design changes. Transparent areas are judged against
  // the background colour so they read as empty space.
  useEffect(() => {
    if (!design || !image) return;
    const timer = window.setTimeout(() => {
      const flat = render(
        image,
        transparent ? background : "#ffffff",
        1,
        design.width,
        design.height,
      );
      const ctx = flat.getContext("2d", { willReadFrequently: true })!;
      setResult({
        of: design,
        analysis: analyzePattern(
          ctx.getImageData(0, 0, flat.width, flat.height),
        ),
      });
    }, 50);
    return () => window.clearTimeout(timer);
  }, [design, image, transparent, background]);

  const analysis = result && result.of === design ? result.analysis : null;

  async function upload(file: File | undefined) {
    if (!file) return;
    try {
      const img = await loadImage(file);
      const clear = hasTransparency(img);
      setError(null);
      setImage(img);
      setFileName(file.name);
      setTransparent(clear);
      setStep(clear ? "background" : "check");
      setScale(1);
      setHidden(new Set());
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

  const uploadButton = (label: string) => (
    <label className={`${primaryClass} cursor-pointer`}>
      {label}
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          upload(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </label>
  );

  if (!image || !design) {
    return (
      <div className="flex flex-1 items-center justify-center px-4">
        <div className="flex w-full max-w-md flex-col items-start gap-3 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Check your design
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Upload the finished, flattened pattern tile (PNG, transparent or
            with a background). It&apos;s checked for seams, hairline gaps,
            spacing and balance before you scale and export it.
          </p>
          {uploadButton("Upload design")}
          {error && (
            <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
          )}
        </div>
      </div>
    );
  }

  const steps: { id: Step; label: string }[] = [
    ...(transparent
      ? [{ id: "background" as Step, label: "Background colour" }]
      : []),
    { id: "check", label: "Check" },
    { id: "export", label: "Scale & export" },
  ];
  const stepIndex = steps.findIndex((s) => s.id === step);
  const visibleIssues =
    step === "check"
      ? (analysis?.issues.filter((i) => !hidden.has(i.kind)) ?? [])
      : [];

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <PatternPreview
          source={design}
          issues={visibleIssues}
          transparent={false}
          steps={step === "export" ? SCALE_STEPS : undefined}
          repeats={scale}
          onRepeatsChange={setScale}
        />
      </div>

      <aside className="flex w-80 shrink-0 flex-col gap-4 overflow-y-auto border-l border-zinc-200 p-4 dark:border-zinc-800">
        <ol className="flex flex-col gap-2">
          {steps.map((s, i) => (
            <StepBadge
              key={s.id}
              n={i + 1}
              label={s.label}
              active={s.id === step}
              done={i < stepIndex}
            />
          ))}
        </ol>
        <p className="truncate text-xs text-zinc-400 dark:text-zinc-500">
          {fileName} · {image.naturalWidth} × {image.naturalHeight} px
        </p>

        {step === "background" && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-zinc-700 dark:text-zinc-300">
              Your design is transparent. Pick the colour that goes behind it.
            </p>
            <input
              type="color"
              aria-label="Background colour"
              value={background}
              onChange={(e) => setBackground(e.target.value)}
              className="h-10 w-20 cursor-pointer rounded border border-zinc-300 bg-transparent p-0.5 dark:border-zinc-700"
            />
            <button className={primaryClass} onClick={() => setStep("check")}>
              Next: check
            </button>
          </div>
        )}

        {step === "check" && (
          <>
            {!analysis ? (
              <p className="text-sm text-zinc-400">Checking…</p>
            ) : (
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
                </div>

                <div className="flex flex-col gap-2">
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                    {analysis.issues.length ? "Found" : "No problems found"}
                  </h3>
                  {analysis.issues.length > 0 && (
                    <p className="text-xs text-zinc-400 dark:text-zinc-500">
                      Tap an item to show or hide its highlights.
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

                <div className="flex flex-col gap-2">
                  <p className="text-sm text-zinc-700 dark:text-zinc-300">
                    Rework the design, or move forward?
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {uploadButton("Rework: upload new version")}
                    <button
                      className={buttonClass}
                      onClick={() => setStep("export")}
                    >
                      Move forward
                    </button>
                  </div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    To rework, fix the highlighted spots in your art app and
                    upload the new version — it&apos;s checked again
                    automatically.
                  </p>
                </div>
              </>
            )}
          </>
        )}

        {step === "export" && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                Scale
              </span>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Each step shrinks the design to a quarter and repeats it in all
                four corners.
              </p>
              <div className="grid grid-cols-4 gap-2">
                {SCALE_STEPS.map((n) => (
                  <button
                    key={n}
                    onClick={() => setScale(n)}
                    className={`rounded-md border px-2 py-1.5 text-sm ${
                      scale === n
                        ? "border-zinc-900 bg-zinc-100 text-zinc-900 dark:border-zinc-50 dark:bg-zinc-800 dark:text-zinc-50"
                        : "border-zinc-200 text-zinc-500 dark:border-zinc-700 dark:text-zinc-400"
                    }`}
                  >
                    {n} × {n}
                  </button>
                ))}
              </div>
            </div>
            <DownloadPanel
              tileW={image.naturalWidth}
              tileH={image.naturalHeight}
              repeats={scale}
              render={(w, h) =>
                render(image, transparent ? background : null, scale, w, h)
              }
            />
            <button className={buttonClass} onClick={() => setStep("check")}>
              ← Back to the score sheet
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}
