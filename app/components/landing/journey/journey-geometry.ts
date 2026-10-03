export interface JourneyPoint {
  x: number;
  y: number;
}

/** Snap the rendered raster origin, including its layout offset, to device pixels. */
export function snapPixelPosition(
  point: JourneyPoint,
  viewportOrigin: JourneyPoint,
  devicePixelRatio: number
): JourneyPoint {
  const ratio =
    Number.isFinite(devicePixelRatio) && devicePixelRatio > 0
      ? devicePixelRatio
      : 1;
  return {
    x:
      Math.round((point.x + viewportOrigin.x) * ratio) / ratio -
      viewportOrigin.x,
    y:
      Math.round((point.y + viewportOrigin.y) * ratio) / ratio -
      viewportOrigin.y,
  };
}

/**
 * Start at the actual hero waypoint even when the usual 68% reading line is
 * below it. The opening segment meets that existing reading line continuously
 * at the screenshot waypoint; all later scrolling keeps the original mapping.
 */
export function journeyYForScroll({
  scrollY,
  viewportHeight,
  origin,
  startY,
  endY,
  heroExitY,
}: {
  scrollY: number;
  viewportHeight: number;
  origin: number;
  startY: number;
  endY: number;
  heroExitY?: number;
}): number {
  const readingLine = viewportHeight * 0.68 - origin;
  let target = scrollY + readingLine;
  if (heroExitY !== undefined) {
    // A tall viewport still gets a real opening movement, never a one-pixel jump.
    const openingScroll = Math.max(160, heroExitY - readingLine);
    if (scrollY < openingScroll) {
      const progress = Math.max(0, scrollY) / openingScroll;
      target = startY + (openingScroll + readingLine - startY) * progress;
    }
  }
  return Math.max(startY, Math.min(endY, target));
}

/** Vertical cubic handles guarantee downward travel as the path changes sides. */
export function buildJourneyPath(points: JourneyPoint[]): string {
  return points.reduce((path, point, index) => {
    if (!index) return `M ${point.x} ${point.y}`;
    const previous = points[index - 1];
    const middle = (previous.y + point.y) / 2;
    return `${path} C ${previous.x} ${middle}, ${point.x} ${middle}, ${point.x} ${point.y}`;
  }, "");
}

/** Evaluate the same vertical-handle cubic without SVG geometry reads per frame. */
export function pointAtJourneyY(
  points: JourneyPoint[],
  y: number
): JourneyPoint {
  if (!points.length) return { x: 0, y: 0 };
  if (y <= points[0].y) return points[0];
  if (y >= points[points.length - 1].y) return points[points.length - 1];
  let low = 0,
    high = points.length - 1;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if (points[middle].y <= y) low = middle;
    else high = middle;
  }
  const a = points[low],
    b = points[high];
  const progress = (y - a.y) / (b.y - a.y);
  // These handles have normalized Y = t³ − 1.5t² + 1.5t. Its derivative
  // stays >= .75, so five bounded Newton steps converge without a lookup table.
  let t = progress;
  for (let i = 0; i < 5; i++) {
    t -=
      (t * t * t - 1.5 * t * t + 1.5 * t - progress) /
      (3 * t * t - 3 * t + 1.5);
  }
  return { x: a.x + (b.x - a.x) * t * t * (3 - 2 * t), y };
}

export type JourneyDistance = { y: number; length: number };

/** Reuse arc samples already read when placing growth marks, solely for their progress. */
export function journeyDistanceAtY(
  samples: JourneyDistance[],
  y: number
): number {
  if (!samples.length) return 0;
  if (y <= samples[0].y) return samples[0].length;
  if (y >= samples[samples.length - 1].y)
    return samples[samples.length - 1].length;
  let low = 0,
    high = samples.length - 1;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if (samples[middle].y <= y) low = middle;
    else high = middle;
  }
  const a = samples[low],
    b = samples[high];
  return a.length + ((b.length - a.length) * (y - a.y)) / (b.y - a.y);
}

/** Find arc length for document Y so the companion stays near the reader. */
export function lengthAtY(
  path: Pick<SVGPathElement, "getPointAtLength">,
  total: number,
  y: number
): number {
  let low = 0;
  let high = total;
  for (let iteration = 0; iteration < 18; iteration++) {
    const middle = (low + high) / 2;
    if (path.getPointAtLength(middle).y < y) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
}
