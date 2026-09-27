// Checks a finished pattern tile for the problems that show once it repeats:
// edges that don't line up, hairline gaps where split pieces were joined,
// empty patches, and crowded clumps. Every finding carries the exact spots
// to highlight.

export type IssueKind = "seam" | "hairline" | "empty" | "crowded";

export const ISSUE_COLORS: Record<IssueKind, string> = {
  seam: "#ef4444",
  hairline: "#f97316",
  empty: "#3b82f6",
  crowded: "#a855f7",
};

export const ISSUE_NAMES: Record<IssueKind, string> = {
  seam: "Edge mismatch",
  hairline: "Hairline gap",
  empty: "Empty area",
  crowded: "Crowded area",
};

export type Mark =
  | { type: "rect"; x: number; y: number; w: number; h: number }
  | { type: "circle"; x: number; y: number; r: number }
  | { type: "line"; x1: number; y1: number; x2: number; y2: number };

export interface Issue {
  kind: IssueKind;
  detail: string;
  marks: Mark[];
}

export interface CategoryScore {
  name: string;
  score: number; // 0–100
  summary: string;
}

export interface Analysis {
  width: number;
  height: number;
  issues: Issue[];
  scores: CategoryScore[];
  overall: number;
}

// Colour difference (sum of channel differences) that counts as "different".
const EDGE_JUMP = 60;
const HAIRLINE_JUMP = 36;
// A hairline must run at least this share of the tile to count, so short
// vertical strokes in the artwork aren't mistaken for gaps.
const HAIRLINE_MIN_RUN = 0.04;
const INK_DIFF = 45;
const GRID = 64;
const WEIGHT_GRID = 8;

function diff(d: Uint8ClampedArray, i: number, j: number): number {
  return (
    Math.abs(d[i] - d[j]) +
    Math.abs(d[i + 1] - d[j + 1]) +
    Math.abs(d[i + 2] - d[j + 2])
  );
}

// Runs of true values, merging breaks of up to `bridge` and dropping runs
// shorter than `min`.
function runs(
  hits: boolean[],
  bridge: number,
  min: number,
): [number, number][] {
  const out: [number, number][] = [];
  let start = -1;
  let lastHit = -Infinity;
  for (let i = 0; i <= hits.length; i++) {
    const hit = i < hits.length && hits[i];
    if (hit) {
      if (start < 0 || i - lastHit > bridge + 1) {
        if (start >= 0 && lastHit - start + 1 >= min)
          out.push([start, lastHit]);
        start = i;
      }
      lastHit = i;
    }
  }
  if (start >= 0 && lastHit - start + 1 >= min) out.push([start, lastHit]);
  return out;
}

// Opposite edges must continue into each other: the jump across the wrap
// should look like any other neighbouring pair of pixels.
function checkEdges(d: Uint8ClampedArray, w: number, h: number): Issue[] {
  const px = (x: number, y: number) => (y * w + x) * 4;
  const band = Math.max(6, Math.round(Math.min(w, h) * 0.006));
  const issues: Issue[] = [];

  const rowsHit: boolean[] = [];
  for (let y = 0; y < h; y++) {
    const across = diff(d, px(w - 1, y), px(0, y));
    const inside = Math.max(
      diff(d, px(w - 2, y), px(w - 1, y)),
      diff(d, px(0, y), px(1, y)),
    );
    rowsHit.push(across > EDGE_JUMP && across > inside * 2.5);
  }
  const rowRuns = runs(rowsHit, 2, 3);
  if (rowRuns.length) {
    issues.push({
      kind: "seam",
      detail: `Left and right edges don't line up in ${rowRuns.length} place${rowRuns.length > 1 ? "s" : ""}.`,
      marks: rowRuns.flatMap(([a, b]) => [
        { type: "rect" as const, x: 0, y: a, w: band, h: b - a + 1 },
        { type: "rect" as const, x: w - band, y: a, w: band, h: b - a + 1 },
      ]),
    });
  }

  const colsHit: boolean[] = [];
  for (let x = 0; x < w; x++) {
    const across = diff(d, px(x, h - 1), px(x, 0));
    const inside = Math.max(
      diff(d, px(x, h - 2), px(x, h - 1)),
      diff(d, px(x, 0), px(x, 1)),
    );
    colsHit.push(across > EDGE_JUMP && across > inside * 2.5);
  }
  const colRuns = runs(colsHit, 2, 3);
  if (colRuns.length) {
    issues.push({
      kind: "seam",
      detail: `Top and bottom edges don't line up in ${colRuns.length} place${colRuns.length > 1 ? "s" : ""}.`,
      marks: colRuns.flatMap(([a, b]) => [
        { type: "rect" as const, x: a, y: 0, w: b - a + 1, h: band },
        { type: "rect" as const, x: a, y: h - band, w: b - a + 1, h: band },
      ]),
    });
  }
  return issues;
}

// A hairline is a 1–2 px strip that differs from both sides while the two
// sides match each other — the tell-tale gap between joined pieces.
function lineHits(
  d: Uint8ClampedArray,
  sample: (t: number, offset: number) => number,
  length: number,
  width: number,
): boolean[] {
  const hits: boolean[] = [];
  for (let t = 0; t < length; t++) {
    const before = sample(t, -1);
    const after = sample(t, width);
    const sides = diff(d, before, after);
    let hit = true;
    for (let k = 0; k < width && hit; k++) {
      const mid = sample(t, k);
      hit =
        Math.min(diff(d, mid, before), diff(d, mid, after)) - sides >
        HAIRLINE_JUMP;
    }
    hits.push(hit);
  }
  return hits;
}

// Merge overlapping rectangles in place (one gap found at several offsets).
function mergeRects(marks: Mark[]): void {
  let merged = true;
  while (merged) {
    merged = false;
    for (let i = 0; i < marks.length && !merged; i++) {
      const a = marks[i];
      if (a.type !== "rect") continue;
      for (let j = i + 1; j < marks.length; j++) {
        const b = marks[j];
        if (b.type !== "rect") continue;
        if (
          a.x <= b.x + b.w + 2 &&
          b.x <= a.x + a.w + 2 &&
          a.y <= b.y + b.h + 2 &&
          b.y <= a.y + a.h + 2
        ) {
          const x = Math.min(a.x, b.x);
          const y = Math.min(a.y, b.y);
          marks[i] = {
            type: "rect",
            x,
            y,
            w: Math.max(a.x + a.w, b.x + b.w) - x,
            h: Math.max(a.y + a.h, b.y + b.h) - y,
          };
          marks.splice(j, 1);
          merged = true;
          break;
        }
      }
    }
  }
}

function checkHairlines(d: Uint8ClampedArray, w: number, h: number): Issue[] {
  const px = (x: number, y: number) => {
    const xx = ((Math.round(x) % w) + w) % w;
    const yy = ((Math.round(y) % h) + h) % h;
    return (yy * w + xx) * 4;
  };
  const marks: Mark[] = [];
  const pad = Math.max(4, Math.round(Math.min(w, h) * 0.004));

  for (const width of [1, 2]) {
    const minX = Math.max(8, Math.round(h * HAIRLINE_MIN_RUN));
    for (let x = 1; x < w - width; x++) {
      const hits = lineHits(d, (t, o) => px(x + o, t), h, width);
      for (const [a, b] of runs(hits, 3, minX)) {
        marks.push({
          type: "rect",
          x: x - pad,
          y: a,
          w: width + pad * 2,
          h: b - a + 1,
        });
      }
    }
    const minY = Math.max(8, Math.round(w * HAIRLINE_MIN_RUN));
    for (let y = 1; y < h - width; y++) {
      const hits = lineHits(d, (t, o) => px(t, y + o), w, width);
      for (const [a, b] of runs(hits, 3, minY)) {
        marks.push({
          type: "rect",
          x: a,
          y: y - pad,
          w: b - a + 1,
          h: width + pad * 2,
        });
      }
    }
  }

  // Diamond technique: the four lines joining the edge midpoints.
  const diagonals: [number, number, number, number][] = [
    [0, h / 2, w / 2, 0],
    [w / 2, 0, w, h / 2],
    [w, h / 2, w / 2, h],
    [w / 2, h, 0, h / 2],
  ];
  for (const [x1, y1, x2, y2] of diagonals) {
    const len = Math.round(Math.hypot(x2 - x1, y2 - y1));
    const ux = (x2 - x1) / len;
    const uy = (y2 - y1) / len;
    // Step across the line one pixel at a time on the axis it leans toward.
    const nx = Math.abs(uy) > Math.abs(ux) ? 1 : 0;
    const ny = 1 - nx;
    // A gap may sit a pixel or two off the exact line, so combine nearby
    // offsets before finding runs.
    const union = new Array<boolean>(len).fill(false);
    for (let shift = -2; shift <= 2; shift++) {
      for (const width of [1, 2]) {
        const hits = lineHits(
          d,
          (t, o) =>
            px(x1 + ux * t + nx * (o + shift), y1 + uy * t + ny * (o + shift)),
          len,
          width,
        );
        hits.forEach((hit, t) => {
          if (hit) union[t] = true;
        });
      }
    }
    for (const [a, b] of runs(
      union,
      3,
      Math.max(8, Math.round(len * HAIRLINE_MIN_RUN)),
    )) {
      marks.push({
        type: "line",
        x1: x1 + ux * a,
        y1: y1 + uy * a,
        x2: x1 + ux * b,
        y2: y1 + uy * b,
      });
    }
  }

  mergeRects(marks);
  if (!marks.length) return [];
  return [
    {
      kind: "hairline",
      detail: `${marks.length} hairline gap${marks.length > 1 ? "s" : ""} where pieces meet — they'll show as thin lines in the repeat.`,
      marks,
    },
  ];
}

// The most common colour, taken as the "empty" background.
function dominantColor(d: Uint8ClampedArray): [number, number, number] {
  const counts = new Map<number, number>();
  const step = Math.max(1, Math.floor(d.length / 4 / 200000)) * 4;
  for (let i = 0; i < d.length; i += step) {
    const key = ((d[i] >> 3) << 10) | ((d[i + 1] >> 3) << 5) | (d[i + 2] >> 3);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let best = 0;
  let bestCount = -1;
  for (const [k, c] of counts) {
    if (c > bestCount) {
      best = k;
      bestCount = c;
    }
  }
  return [
    ((best >> 10) & 31) * 8 + 4,
    ((best >> 5) & 31) * 8 + 4,
    (best & 31) * 8 + 4,
  ];
}

// Share of "ink" (anything that isn't the background) in each cell.
function inkGrid(
  d: Uint8ClampedArray,
  w: number,
  h: number,
  g: number,
): number[] {
  const bg = dominantColor(d);
  const cells = new Array<number>(g * g).fill(0);
  const counts = new Array<number>(g * g).fill(0);
  const step = Math.max(1, Math.floor(Math.min(w, h) / (g * 12)));
  for (let y = 0; y < h; y += step) {
    const cy = Math.min(g - 1, Math.floor((y / h) * g));
    for (let x = 0; x < w; x += step) {
      const i = (y * w + x) * 4;
      const cx = Math.min(g - 1, Math.floor((x / w) * g));
      const ink =
        Math.abs(d[i] - bg[0]) +
          Math.abs(d[i + 1] - bg[1]) +
          Math.abs(d[i + 2] - bg[2]) >
        INK_DIFF;
      cells[cy * g + cx] += ink ? 1 : 0;
      counts[cy * g + cx] += 1;
    }
  }
  return cells.map((c, i) => c / Math.max(1, counts[i]));
}

// Largest empty circles, measured with wrap-around so gaps that straddle an
// edge count as one gap.
function checkEmpty(ink: number[], w: number, h: number): Issue[] {
  const g = GRID;
  const empty = ink.map((v) => v < 0.02);
  if (empty.every(Boolean) || !empty.some(Boolean)) return [];

  // Distance (in cells) from each empty cell to the nearest inked cell.
  const dist = new Array<number>(g * g).fill(Infinity);
  const queue: number[] = [];
  empty.forEach((e, i) => {
    if (!e) {
      dist[i] = 0;
      queue.push(i);
    }
  });
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q];
    const x = i % g;
    const y = Math.floor(i / g);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ]) {
      const j = ((y + dy + g) % g) * g + ((x + dx + g) % g);
      const nd = dist[i] + (dx && dy ? Math.SQRT2 : 1);
      if (nd < dist[j] - 1e-9) {
        dist[j] = nd;
        queue.push(j);
      }
    }
  }

  const peaks: { x: number; y: number; r: number }[] = [];
  for (let i = 0; i < g * g; i++) {
    if (!empty[i]) continue;
    const x = i % g;
    const y = Math.floor(i / g);
    let isPeak = true;
    for (let dy = -1; dy <= 1 && isPeak; dy++) {
      for (let dx = -1; dx <= 1 && isPeak; dx++) {
        if (dist[((y + dy + g) % g) * g + ((x + dx + g) % g)] > dist[i])
          isPeak = false;
      }
    }
    if (isPeak) peaks.push({ x, y, r: dist[i] });
  }
  if (!peaks.length) return [];
  // Every separate gap (largest first, skipping ones inside a bigger gap).
  // A hole is a gap much wider than the pattern's typical gap.
  const gaps: { x: number; y: number; r: number }[] = [];
  for (const p of [...peaks].sort((a, b) => b.r - a.r)) {
    const inside = gaps.some((q) => {
      const dx = Math.min(Math.abs(p.x - q.x), g - Math.abs(p.x - q.x));
      const dy = Math.min(Math.abs(p.y - q.y), g - Math.abs(p.y - q.y));
      return Math.hypot(dx, dy) < q.r;
    });
    if (!inside) gaps.push(p);
  }
  // Ignore the tiny crevices between touching motifs; the typical gap is
  // taken from the upper range of the real gaps.
  const radii = gaps
    .map((p) => p.r)
    .filter((r) => r >= 2)
    .sort((a, b) => a - b);
  const typical = radii.length ? radii[Math.floor(radii.length * 0.75)] : 0;
  const limit = Math.max(g * 0.08, typical * 1.7);

  const cell = w / g;
  const cellH = h / g;
  const picked = gaps.filter((p) => p.r >= limit).slice(0, 6);
  if (!picked.length) return [];
  return [
    {
      kind: "empty",
      detail: `${picked.length} noticeably empty area${picked.length > 1 ? "s" : ""} that may read as holes once repeated.`,
      marks: picked.map((p) => ({
        type: "circle" as const,
        x: (p.x + 0.5) * cell,
        y: (p.y + 0.5) * cellH,
        r: p.r * Math.min(cell, cellH),
      })),
    },
  ];
}

// Ink per cell, smoothed with wrap-around; clumps well above average are
// flagged. Returns the issues and how evenly the weight is spread (0–1).
function checkWeight(
  ink: number[],
  w: number,
  h: number,
): { issues: Issue[]; evenness: number } {
  const g = WEIGHT_GRID;
  const per = GRID / g;
  const coarse = new Array<number>(g * g).fill(0);
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      coarse[Math.floor(y / per) * g + Math.floor(x / per)] +=
        ink[y * GRID + x] / (per * per);
    }
  }
  const smooth = coarse.map((_, i) => {
    const x = i % g;
    const y = Math.floor(i / g);
    let sum = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++)
        sum += coarse[((y + dy + g) % g) * g + ((x + dx + g) % g)];
    }
    return sum / 9;
  });
  const mean = smooth.reduce((a, b) => a + b, 0) / smooth.length;
  if (mean < 0.005) return { issues: [], evenness: 0 };
  const sd = Math.sqrt(
    smooth.reduce((a, b) => a + (b - mean) ** 2, 0) / smooth.length,
  );
  const evenness = Math.max(0, Math.min(1, 1 - sd / mean));

  const cw = w / g;
  const ch = h / g;
  const marks: Mark[] = [];
  smooth.forEach((v, i) => {
    if (v > mean + 2 * sd && v > mean * 1.6) {
      marks.push({
        type: "rect",
        x: (i % g) * cw,
        y: Math.floor(i / g) * ch,
        w: cw,
        h: ch,
      });
    }
  });
  const issues: Issue[] = marks.length
    ? [
        {
          kind: "crowded",
          detail: `${marks.length} area${marks.length > 1 ? "s are" : " is"} much heavier than the rest — motifs are bunching up.`,
          marks,
        },
      ]
    : [];

  // Whole halves out of balance.
  const half = (pick: (x: number, y: number) => boolean) =>
    coarse.reduce((s, v, i) => s + (pick(i % g, Math.floor(i / g)) ? v : 0), 0);
  const top = half((_, y) => y < g / 2);
  const bottom = half((_, y) => y >= g / 2);
  const left = half((x) => x < g / 2);
  const right = half((x) => x >= g / 2);
  const lean = (
    a: number,
    b: number,
    nameA: string,
    nameB: string,
    mark: Mark,
  ) => {
    const total = a + b;
    if (total > 0 && Math.abs(a - b) / total > 0.2) {
      issues.push({
        kind: "crowded",
        detail: `The ${a > b ? nameA : nameB} half carries ${Math.round((Math.max(a, b) / total) * 100)}% of the weight.`,
        marks: [mark],
      });
    }
  };
  lean(
    top,
    bottom,
    "top",
    "bottom",
    top > bottom
      ? { type: "rect", x: 0, y: 0, w, h: h / 2 }
      : { type: "rect", x: 0, y: h / 2, w, h: h / 2 },
  );
  lean(
    left,
    right,
    "left",
    "right",
    left > right
      ? { type: "rect", x: 0, y: 0, w: w / 2, h }
      : { type: "rect", x: w / 2, y: 0, w: w / 2, h },
  );

  return { issues, evenness };
}

export function analyzePattern(image: ImageData): Analysis {
  const { data, width: w, height: h } = image;
  const seams = checkEdges(data, w, h);
  const hairlines = checkHairlines(data, w, h);
  const ink = inkGrid(data, w, h, GRID);
  const empty = checkEmpty(ink, w, h);
  const weight = checkWeight(ink, w, h);

  const seamMarks = seams.reduce((n, i) => n + i.marks.length, 0);
  const hairMarks = hairlines.reduce((n, i) => n + i.marks.length, 0);
  const emptyMarks = empty.reduce((n, i) => n + i.marks.length, 0);
  const scores: CategoryScore[] = [
    {
      name: "Seams",
      score: Math.max(0, 100 - seamMarks * 8 - hairMarks * 10),
      summary:
        seamMarks || hairMarks
          ? "Some edges or joins need fixing before this will repeat cleanly."
          : "Edges line up and no hairline gaps were found.",
    },
    {
      name: "Spacing",
      score: Math.max(0, 100 - emptyMarks * 12),
      summary: emptyMarks
        ? "There are gaps that may read as holes."
        : "No noticeable holes.",
    },
    {
      name: "Balance",
      score: Math.round(weight.evenness * 100),
      summary:
        weight.evenness > 0.75
          ? "Weight is spread evenly."
          : weight.evenness > 0.5
            ? "Weight is fairly even, with some heavier spots."
            : "Weight is uneven — some areas are much busier than others.",
    },
  ];
  const overall = Math.round(
    scores.reduce((s, c) => s + c.score, 0) / scores.length,
  );

  return {
    width: w,
    height: h,
    issues: [...seams, ...hairlines, ...empty, ...weight.issues],
    scores,
    overall,
  };
}
