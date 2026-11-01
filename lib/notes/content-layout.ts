import * as Y from "yjs";
import type { TextBox } from "./text-boxes";
import { z } from "zod";
import type { InkRect } from "./ink-renderer";
export type ContentSelection = {
  pageId: string;
  boxes: string[];
  strokes: string[];
};
const groupsSchema = z.object({
  boxes: z.array(z.string()).max(64),
  strokes: z.array(z.uuid()).max(10000),
});
export function contentGroups(doc: Y.Doc) {
  return [...doc.getMap("content-groups").entries()].flatMap(([id, value]) => {
    const group = groupsSchema.safeParse(value);
    return group.success ? [{ id, ...group.data }] : [];
  });
}
export function snapBox(
  box: TextBox,
  peers: TextBox[],
  pageWidth: number,
  tolerance: number
) {
  const guides: { axis: "x" | "y"; value: number }[] = [];
  const next = { ...box };
  for (const axis of ["x", "y"] as const) {
    const size = axis === "x" ? "width" : "height";
    const targets = axis === "x" ? [20, pageWidth / 2, pageWidth - 20] : [20];
    for (const peer of peers)
      if (peer.id !== box.id)
        targets.push(
          peer[axis],
          peer[axis] + peer[size] / 2,
          peer[axis] + peer[size]
        );
    let distance = tolerance,
      delta = 0,
      guide: number | undefined;
    for (const target of targets)
      for (const offset of [0, box[size] / 2, box[size]]) {
        const d = target - box[axis] - offset;
        if (Math.abs(d) < distance) {
          distance = Math.abs(d);
          delta = d;
          guide = target;
        }
      }
    next[axis] += delta;
    if (guide !== undefined) guides.push({ axis, value: guide });
  }
  return { box: next, guides };
}
export function contentBounds(rects: InkRect[]): InkRect | undefined {
  if (!rects.length) return;
  const x = Math.min(...rects.map((r) => r.x)),
    y = Math.min(...rects.map((r) => r.y));
  return {
    x,
    y,
    width: Math.max(...rects.map((r) => r.x + r.width)) - x,
    height: Math.max(...rects.map((r) => r.y + r.height)) - y,
  };
}
