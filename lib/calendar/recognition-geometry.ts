import type { InkStroke } from "./ink";
export interface InkBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}
export function inkBounds(strokes: InkStroke[]): InkBounds | null {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const stroke of strokes)
    for (const [x, y] of stroke.points) {
      minX = Math.min(minX, x - stroke.width);
      minY = Math.min(minY, y - stroke.width);
      maxX = Math.max(maxX, x + stroke.width);
      maxY = Math.max(maxY, y + stroke.width);
    }
  return Number.isFinite(minX)
    ? {
        x: minX,
        y: minY,
        width: Math.max(1, maxX - minX),
        height: Math.max(1, maxY - minY),
      }
    : null;
}
/** Canonical cross-runtime input. JSONB key order never changes recognition identity. */
export function inkSource(strokes: InkStroke[], ids: string[]) {
  const wanted = new Set(ids);
  return JSON.stringify(
    strokes
      .filter((s) => wanted.has(s.id))
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((s) => [s.id, s.tool, s.color, s.width, s.points])
  );
}
export function selectedInk(strokes: InkStroke[], rect: InkBounds) {
  return strokes
    .filter((s) => {
      const b = inkBounds([s])!;
      return (
        b.x <= rect.x + rect.width &&
        b.x + b.width >= rect.x &&
        b.y <= rect.y + rect.height &&
        b.y + b.height >= rect.y
      );
    })
    .map((s) => s.id);
}
/** Group horizontally written lines; keep a small selection rather than guessing
 * columns, equations or diagrams. Long vertical strokes cannot silently split. */
export function recognitionLines(strokes: InkStroke[]): InkStroke[][] {
  const entries = strokes
    .filter((s) => s.tool === "pen")
    .map((s) => ({ stroke: s, bounds: inkBounds([s])! }))
    .sort((a, b) => a.bounds.y - b.bounds.y);
  const lines: { strokes: InkStroke[]; bounds: InkBounds }[] = [];
  for (const item of entries) {
    let line = lines.find((l) => {
      const a = l.bounds,
        b = item.bounds;
      return (
        Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) >=
        Math.min(a.height, b.height) * 0.2
      );
    });
    if (!line) {
      line = { strokes: [], bounds: item.bounds };
      lines.push(line);
    }
    line.strokes.push(item.stroke);
    line.bounds = inkBounds(line.strokes)!;
  }
  return lines.sort((a, b) => a.bounds.y - b.bounds.y).map((l) => l.strokes);
}
export async function inkHash(strokes: InkStroke[], ids: string[]) {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(inkSource(strokes, ids))
  );
  return [...new Uint8Array(hash)]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
}
