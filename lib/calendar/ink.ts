import { z } from "zod";
import { GOAL_COLOR_TOKENS } from "@/lib/goal-theme";

export const inkColors = ["INK", ...GOAL_COLOR_TOKENS] as const;
export const inkPointSchema = z.tuple([
  z.number().finite().min(-100000).max(100000),
  z.number().finite().min(-100000).max(100000),
  z.number().min(0).max(1),
]);
export type InkPoint = z.infer<typeof inkPointSchema>;
// Anchors identify semantic calendar elements, never viewport coordinates.
export const inkAnchorSchema = z
  .object({
    key: z
      .string()
      .regex(
        /^\d{4}-\d{2}-\d{2}\/(day|date|event:[\w-]+(?:@\d{4}-\d{2}-\d{2})?|quest:\d+|goal:\d+)$/
      ),
    width: z.number().positive().max(10000),
    height: z.number().positive().max(10000),
  })
  .strict();
export const inkStrokeSchema = z
  .object({
    id: z.uuid(),
    tool: z.enum(["pen", "highlighter"]),
    color: z.enum(inkColors),
    width: z.number().min(0.5).max(40),
    points: z.array(inkPointSchema).min(1).max(4096),
    anchor: inkAnchorSchema.optional(),
    endAnchor: z
      .object({ ...inkAnchorSchema.shape, point: inkPointSchema })
      .strict()
      .optional(),
  })
  .strict();
export const inkDocumentSchema = z
  .object({
    width: z.literal(1000),
    height: z.literal(1400),
    strokes: z.array(inkStrokeSchema).max(2000),
  })
  .strict()
  .superRefine((ink, ctx) => {
    if (
      ink.strokes.reduce((sum, stroke) => sum + stroke.points.length, 0) > 50000
    )
      ctx.addIssue({
        code: "custom",
        message: "This page is full. Start another note to keep writing.",
      });
  });
export type InkStroke = z.infer<typeof inkStrokeSchema>;
export type InkDocument = z.infer<typeof inkDocumentSchema>;
export type InkTool = "pen" | "highlighter" | "eraser" | "hand" | "select";
export const emptyInk = (): InkDocument => ({
  width: 1000,
  height: 1400,
  strokes: [],
});
export const inkV2Schema = z
  .object({
    version: z.literal(2),
    text: z.string().max(50000),
    mode: z.enum(["note", "annotation"]),
    ink: inkDocumentSchema,
  })
  .strict();
export type InkNoteDocument = z.infer<typeof inkV2Schema>;
export function editableDocument(
  document: { version: 1; text: string } | InkNoteDocument
): InkNoteDocument {
  return document.version === 2
    ? document
    : { version: 2, text: document.text, mode: "note", ink: emptyInk() };
}
export function isAnnotation(document: {
  version: number;
  mode?: string;
}): boolean {
  return document.version === 2 && document.mode === "annotation";
}
export function inkColor(color: InkStroke["color"]): string {
  return color === "INK"
    ? "var(--text-primary)"
    : `var(--goal-${color.toLowerCase()}, var(--accent-primary))`;
}
/** A pressure ribbon with quadratic joins. One filled path per stroke avoids
 * highlighter seams and keeps document rendering identical to live ink. */
export function strokePath(stroke: InkStroke): string {
  const points = stroke.points;
  const radius = (p: InkPoint) =>
    stroke.width * (stroke.tool === "highlighter" ? 0.5 : 0.15 + p[2] * 0.65);
  if (points.length === 1) {
    const [x, y] = points[0],
      r = radius(points[0]);
    return `M${x - r},${y}a${r},${r} 0 1,0 ${r * 2},0a${r},${r} 0 1,0 ${-r * 2},0`;
  }
  const left: number[][] = [],
    right: number[][] = [];
  points.forEach((point, i) => {
    const before = points[Math.max(0, i - 1)],
      after = points[Math.min(points.length - 1, i + 1)];
    const dx = after[0] - before[0],
      dy = after[1] - before[1],
      length = Math.hypot(dx, dy) || 1,
      r = radius(point);
    left.push([point[0] - (dy / length) * r, point[1] + (dx / length) * r]);
    right.push([point[0] + (dy / length) * r, point[1] - (dx / length) * r]);
  });
  const outline = [...left, ...right.reverse()];
  let path = `M${outline[0].join(",")}`;
  for (let i = 1; i <= outline.length; i++) {
    const p = outline[i % outline.length],
      next = outline[(i + 1) % outline.length];
    path += `Q${p[0]},${p[1]} ${(p[0] + next[0]) / 2},${(p[1] + next[1]) / 2}`;
  }
  return path + "Z";
}
export function hitStroke(
  stroke: InkStroke,
  point: InkPoint,
  radius: number
): boolean {
  const within = (a: InkPoint, b: InkPoint) => {
    const dx = b[0] - a[0],
      dy = b[1] - a[1];
    const t = Math.max(
      0,
      Math.min(
        1,
        ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) /
          (dx * dx + dy * dy || 1)
      )
    );
    return (
      Math.hypot(point[0] - a[0] - dx * t, point[1] - a[1] - dy * t) <=
      radius + stroke.width
    );
  };
  return stroke.points.some((p, i) =>
    within(p, stroke.points[Math.max(0, i - 1)])
  );
}
export type AnchorBox = { x: number; y: number; width: number; height: number };
export function projectStroke(
  stroke: InkStroke,
  anchors: Map<string, AnchorBox>
): InkStroke | null {
  if (!stroke.anchor) return stroke;
  const box = anchors.get(stroke.anchor.key);
  if (!box) return null;
  const scale = Math.min(
    box.width / stroke.anchor.width,
    box.height / stroke.anchor.height
  );
  const points: InkPoint[] = stroke.points.map(([x, y, p]) => [
    box.x + x * scale,
    box.y + y * scale,
    p,
  ]);
  if (stroke.endAnchor) {
    const end = anchors.get(stroke.endAnchor.key);
    if (!end) return { ...stroke, width: stroke.width * scale, points };
    const es = Math.min(
        end.width / stroke.endAnchor.width,
        end.height / stroke.endAnchor.height
      ),
      last = points[points.length - 1];
    const dx = end.x + stroke.endAnchor.point[0] * es - last[0],
      dy = end.y + stroke.endAnchor.point[1] * es - last[1];
    points.forEach((p, i) => {
      const t = i / Math.max(1, points.length - 1);
      p[0] += dx * t;
      p[1] += dy * t;
    });
  }
  return { ...stroke, width: stroke.width * scale, points };
}

/** Subpixel simplification at stroke boundaries reduces document/backup size.
 * Keep corners and pressure changes; never simplify in the live input loop. */
export function simplifyInkPoints(
  points: InkPoint[],
  tolerance = 0.35
): InkPoint[] {
  if (points.length < 3) return points;
  const keep = new Set([0, points.length - 1]),
    stack: [[number, number]] | [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    if (b - a < 2) continue;
    const start = points[a],
      end = points[b],
      dx = end[0] - start[0],
      dy = end[1] - start[1],
      length = dx * dx + dy * dy;
    let largest = 1,
      index = -1;
    for (let i = a + 1; i < b; i++) {
      const p = points[i],
        t = Math.max(
          0,
          Math.min(
            1,
            ((p[0] - start[0]) * dx + (p[1] - start[1]) * dy) / (length || 1)
          )
        );
      const geometry =
        Math.hypot(p[0] - start[0] - t * dx, p[1] - start[1] - t * dy) /
        tolerance;
      const pressure =
        Math.abs(p[2] - (start[2] + (end[2] - start[2]) * t)) / 0.035;
      const error = Math.max(geometry, pressure);
      if (error > largest) {
        largest = error;
        index = i;
      }
    }
    if (index !== -1) {
      keep.add(index);
      stack.push([a, index], [index, b]);
    }
  }
  return [...keep].sort((a, b) => a - b).map((i) => points[i]);
}
