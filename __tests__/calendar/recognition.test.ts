import { describe, it, expect } from "vitest";
import {
  inkBounds,
  inkSource,
  selectedInk,
  recognitionLines,
} from "@/lib/calendar/recognition-geometry";
import {
  noteSearchSchema,
  recognitionWriteSchema,
} from "@/lib/calendar/recognition-contracts";
import type { InkStroke } from "@/lib/calendar/ink";
const a: InkStroke = {
  id: "08109029-312e-49f1-b461-402b996f153a",
  tool: "pen",
  color: "INK",
  width: 2,
  points: [
    [10, 10, 0.5],
    [40, 30, 0.5],
  ],
};
describe("non-destructive local recognition geometry", () => {
  it("selects intersecting strokes and groups lines independently of input order", () => {
    const b = {
      ...a,
      id: "ad07a236-8a8a-4cd7-b971-0276f9ed2cc8",
      points: [
        [60, 10, 0.5],
        [70, 30, 0.5],
      ] as typeof a.points,
    };
    const c = {
      ...a,
      id: "f615eabc-dff6-42ee-9cb4-341f1632e8b2",
      points: [
        [10, 100, 0.5],
        [50, 120, 0.5],
      ] as typeof a.points,
    };
    const before = JSON.stringify([a, b, c]);
    expect(recognitionLines([c, b, a]).map((l) => l.length)).toEqual([2, 1]);
    expect(
      selectedInk([a, b, c], { x: 0, y: 0, width: 50, height: 50 })
    ).toEqual([a.id]);
    expect(JSON.stringify([a, b, c])).toBe(before);
  });
  it("hash input ignores object key order and selected stroke order but tracks geometry", () => {
    const b = { ...a, id: "ad07a236-8a8a-4cd7-b971-0276f9ed2cc8" };
    expect(inkSource([a, b], [b.id, a.id])).toBe(
      inkSource([b, a], [a.id, b.id])
    );
    expect(inkSource([a], [a.id])).not.toBe(
      inkSource([{ ...a, width: 3 }], [a.id])
    );
  });
  it("bounds maximum-size documents without spreading points on the stack", () => {
    const large = {
      ...a,
      points: Array.from(
        { length: 50000 },
        (_, i) => [i, i, 0.5] as [number, number, number]
      ),
    };
    expect(inkBounds([large])?.width).toBe(50003);
  });
  it("rejects invalid dates, unbounded queries and duplicate stroke selections", () => {
    expect(noteSearchSchema.safeParse({ start: "2026-02-30" }).success).toBe(
      false
    );
    expect(
      noteSearchSchema.safeParse({ start: "2026-10-19", end: "2026-10-18" })
        .success
    ).toBe(false);
    expect(noteSearchSchema.safeParse({ query: "x".repeat(161) }).success).toBe(
      false
    );
    expect(
      recognitionWriteSchema.shape.strokeIds.safeParse([a.id, a.id]).success
    ).toBe(false);
  });
});
