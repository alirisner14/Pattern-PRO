import { mulberry32 } from "./rng";
import { generateCandidateLattice, type Point } from "./lattice";
import { farthestPointSample } from "./sampling";
import { RADIUS_RATIO } from "./constants";
import type {
  ElementClass,
  ElementClassConfig,
  LayoutParams,
  PlacedElement,
} from "./types";

function letterFor(index: number): string {
  let s = "";
  let n = index;
  do {
    s = String.fromCharCode(97 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

function labelsFor(classNumber: number, count: number): string[] {
  if (count <= 0) return [];
  if (count === 1) return [String(classNumber)];
  return Array.from({ length: count }, (_, i) => `${classNumber}${letterFor(i)}`);
}

export function generateLayout(params: LayoutParams): PlacedElement[] {
  const { widthPx, heightPx, repeatStyle, alignment, density, seed, hero, secondary, filler } =
    params;
  const rng = mulberry32(seed);

  const totalCount = hero.count + secondary.count + filler.count;
  if (totalCount <= 0) return [];

  const candidates = generateCandidateLattice(widthPx, heightPx, repeatStyle, totalCount);
  const basePoints = farthestPointSample(candidates, totalCount, rng);

  let pool = [...basePoints];
  const heroPoints = farthestPointSample(pool, hero.count, rng);
  pool = pool.filter((p) => !heroPoints.includes(p));
  const secondaryPoints = farthestPointSample(pool, secondary.count, rng);
  pool = pool.filter((p) => !secondaryPoints.includes(p));
  const fillerPoints = farthestPointSample(pool, filler.count, rng);

  const minSpacing = Math.min(widthPx, heightPx) / Math.sqrt(totalCount + 1);
  const maxJitter = alignment === "scattered" ? density * minSpacing * 0.6 : 0;

  const placed: PlacedElement[] = [];

  function place(
    points: Point[],
    config: ElementClassConfig,
    className: ElementClass,
    classNumber: number
  ) {
    const labels = labelsFor(classNumber, points.length);
    const radius = minSpacing * RADIUS_RATIO[className];

    points.forEach((point, i) => {
      let { x, y } = point;

      for (let attempt = 0; attempt < 5 && maxJitter > 0; attempt++) {
        const angle = rng() * Math.PI * 2;
        const dist = rng() * maxJitter;
        const candidateX = point.x + Math.cos(angle) * dist;
        const candidateY = point.y + Math.sin(angle) * dist;
        const collides = placed.some(
          (other) =>
            Math.hypot(other.x - candidateX, other.y - candidateY) <
            other.radius + radius + 4
        );
        if (!collides) {
          x = candidateX;
          y = candidateY;
          break;
        }
      }

      placed.push({
        id: `${className}-${i}`,
        class: className,
        label: labels[i],
        x,
        y,
        radius,
        color: config.color,
      });
    });
  }

  place(heroPoints, hero, "hero", 1);
  place(secondaryPoints, secondary, "secondary", 2);
  place(fillerPoints, filler, "filler", 3);

  return placed;
}
