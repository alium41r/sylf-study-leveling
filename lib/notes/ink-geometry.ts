import type { InkBrush, InkSample, InkStroke } from "./ink";

export const inkOpacity = (style: InkBrush) =>
  style.opacity ??
  (style.tool === "highlighter" ? 0.28 : style.nib === "pencil" ? 0.65 : 1);
const mix = (a: InkSample, b: InkSample, t: number): InkSample =>
  a.map((v, i) => v + (b[i] - v) * t) as InkSample;
/** Authored samples stay intact; these bounded derived points are shared by screen, hit testing and print. */
export function inkGeometry(
  points: readonly InkSample[],
  style: InkBrush
): InkSample[] {
  if (points.length < 2) return [...points];
  const a = points[0],
    b = points.at(-1)!;
  let shape = style.shape;
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (
    !shape &&
    style.straighten &&
    length > 24 &&
    points.every(
      (p) =>
        Math.abs(
          (b[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (b[1] - a[1])
        ) /
          length <
        Math.max(4, length * 0.035)
    )
  )
    shape = "line";
  if (!shape) return [...points];
  const at = (x: number, y: number): InkSample => [x, y, 0.5, b[3], 0, 0, 0, 0];
  if (shape === "line") return [at(a[0], a[1]), at(b[0], b[1])];
  if (shape === "rectangle")
    return [
      at(a[0], a[1]),
      at(b[0], a[1]),
      at(b[0], b[1]),
      at(a[0], b[1]),
      at(a[0], a[1]),
    ];
  const cx = (a[0] + b[0]) / 2,
    cy = (a[1] + b[1]) / 2,
    rx = (b[0] - a[0]) / 2,
    ry = (b[1] - a[1]) / 2;
  return Array.from({ length: 97 }, (_, i) =>
    at(
      cx + rx * Math.cos((i * Math.PI) / 48),
      cy + ry * Math.sin((i * Math.PI) / 48)
    )
  );
}
/** Split by arc length, including interpolation of pressure at each dash boundary. */
export function inkSegments(
  points: readonly InkSample[],
  style: InkBrush
): InkSample[][] {
  const source = inkGeometry(points, style);
  if (!style.lineStyle || style.lineStyle === "solid" || source.length < 2)
    return [source];
  const dash =
      style.lineStyle === "dotted"
        ? Math.max(0.15, style.width * 0.12)
        : Math.max(6, style.width * 4),
    gap = Math.max(4, style.width * 2.5);
  const result: InkSample[][] = [];
  let segment: InkSample[] = [source[0]],
    remaining = dash,
    visible = true;
  for (let i = 1; i < source.length; i++) {
    let a = source[i - 1];
    const b = source[i];
    let distance = Math.hypot(b[0] - a[0], b[1] - a[1]);
    while (distance > remaining && result.length < 12000) {
      const end = mix(a, b, remaining / distance);
      if (visible) {
        segment.push(end);
        result.push(segment);
      }
      visible = !visible;
      segment = visible ? [end] : [];
      distance -= remaining;
      a = end;
      remaining = visible ? dash : gap;
    }
    if (visible) segment.push(b);
    remaining -= distance;
  }
  if (segment.length) result.push(segment);
  return result;
}
export interface EraseCircle {
  x: number;
  y: number;
  radius: number;
}
/** Analytic circle/segment clipping keeps sparse lines erasable without resampling their entire length. */
export function cutInk(
  points: readonly InkSample[],
  circles: readonly EraseCircle[]
): InkSample[][] {
  let pieces: InkSample[][] = [[...points]];
  for (const c of circles) {
    const next: InkSample[][] = [];
    for (const piece of pieces) {
      if (piece.length === 1) {
        if (Math.hypot(piece[0][0] - c.x, piece[0][1] - c.y) > c.radius)
          next.push(piece);
        continue;
      }
      let current: InkSample[] = [];
      for (let i = 1; i < piece.length; i++) {
        const a = piece[i - 1],
          b = piece[i],
          dx = b[0] - a[0],
          dy = b[1] - a[1],
          ox = a[0] - c.x,
          oy = a[1] - c.y;
        const A = dx * dx + dy * dy,
          B = 2 * (ox * dx + oy * dy),
          C = ox * ox + oy * oy - c.radius * c.radius,
          D = B * B - 4 * A * C;
        const roots =
          D > 0 && A > 0
            ? [(-B - Math.sqrt(D)) / (2 * A), (-B + Math.sqrt(D)) / (2 * A)]
            : [];
        const stops = [0, ...roots.filter((t) => t > 0 && t < 1), 1];
        for (let j = 1; j < stops.length; j++) {
          const lo = stops[j - 1],
            hi = stops[j],
            mid = mix(a, b, (lo + hi) / 2);
          if (Math.hypot(mid[0] - c.x, mid[1] - c.y) >= c.radius) {
            if (!current.length) current.push(mix(a, b, lo));
            current.push(mix(a, b, hi));
          } else if (current.length) {
            next.push(current);
            current = [];
          }
        }
      }
      if (current.length) next.push(current);
    }
    pieces = next;
  }
  return pieces;
}

/** Every consumer uses the same discontinuous geometry; eraser gaps are never bridged. */
export function inkStrokeSegments(stroke: InkStroke) {
  return stroke.segments
    ? stroke.segments.flatMap((points) =>
        inkSegments(points, {
          ...stroke.style,
          shape: undefined,
          straighten: false,
        })
      )
    : inkSegments(stroke.points, stroke.style);
}
export function strokePieces(stroke: InkStroke) {
  return stroke.segments || [inkGeometry(stroke.points, stroke.style)];
}
