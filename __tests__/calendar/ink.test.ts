import { describe, expect, it } from "vitest";
import {
  emptyInk,
  simplifyInkPoints,
  editableDocument,
  strokePath,
  hitStroke,
  projectStroke,
  type InkStroke,
} from "@/lib/calendar/ink";
import { noteInputSchema } from "@/lib/calendar/contracts";
const stroke: InkStroke = {
  id: "548335cf-214b-41d5-a234-58b629929423",
  tool: "pen",
  color: "INK",
  width: 3,
  points: [
    [0, 0, 0.2],
    [10, 10, 0.8],
    [20, 5, 0.6],
  ],
};
describe("editable ink documents", () => {
  it("upgrades v1 notes without mutating the original text", () => {
    const old = { version: 1 as const, text: "A thought" };
    expect(editableDocument(old)).toEqual({
      version: 2,
      text: "A thought",
      mode: "note",
      ink: emptyInk(),
    });
    expect(old).toEqual({ version: 1, text: "A thought" });
  });
  it("validates mixed text/ink and rejects hostile and oversized geometry", () => {
    const data = {
      dateKey: "2026-10-18",
      title: "Math",
      document: {
        version: 2,
        text: "E=mc²",
        mode: "note",
        ink: { ...emptyInk(), strokes: [stroke] },
      },
    };
    expect(noteInputSchema.safeParse(data).success).toBe(true);
    for (const bad of [
      { ...stroke, color: "url(https://bad)" },
      { ...stroke, points: [[NaN, 0, 0.5]] },
      { ...stroke, points: Array(4097).fill([0, 0, 0.5]) },
      { ...stroke, width: -1 },
    ])
      expect(
        noteInputSchema.safeParse({
          ...data,
          document: {
            ...data.document,
            ink: { ...emptyInk(), strokes: [bad] },
          },
        }).success
      ).toBe(false);
  });
  it("keeps annotation primary anchors on the owning date", () => {
    const anchored = {
      ...stroke,
      anchor: { key: "2026-10-18/date", width: 26, height: 26 },
    };
    const data = {
      dateKey: "2026-10-18",
      title: "",
      document: {
        version: 2,
        text: "",
        mode: "annotation",
        ink: { ...emptyInk(), strokes: [anchored] },
      },
    };
    expect(noteInputSchema.safeParse(data).success).toBe(true);
    expect(
      noteInputSchema.safeParse({ ...data, dateKey: "2026-10-19" }).success
    ).toBe(false);
    expect(
      noteInputSchema.safeParse({
        ...data,
        document: { ...data.document, mode: "note" },
      }).success
    ).toBe(false);
  });
  it("generates a smooth pressure ribbon and detects stroke erasure between samples", () => {
    expect(strokePath(stroke)).toContain("Q");
    expect(strokePath({ ...stroke, points: [[1, 1, 0.5]] })).toContain("a");
    expect(
      strokePath({
        ...stroke,
        points: stroke.points.map(([x, y]) => [x, y, 1]),
      })
    ).not.toBe(strokePath(stroke));
    expect(hitStroke(stroke, [5, 5, 0.5], 1)).toBe(true);
    expect(hitStroke(stroke, [400, 400, 0.5], 1)).toBe(false);
  });
  it("preserves circles with uniform anchor scaling and routes connectors to semantic endpoints", () => {
    const anchored = {
      ...stroke,
      anchor: { key: "2026-10-18/date", width: 26, height: 26 },
    };
    const boxes = new Map([
      ["2026-10-18/date", { x: 100, y: 200, width: 52, height: 52 }],
      ["2026-10-19/date", { x: 10, y: 500, width: 26, height: 26 }],
    ]);
    const projected = projectStroke(anchored, boxes)!;
    expect(projected.points[1]).toEqual([120, 220, 0.8]);
    expect(projected.width).toBe(6);
    const connector = projectStroke(
      {
        ...anchored,
        endAnchor: {
          key: "2026-10-19/date",
          width: 26,
          height: 26,
          point: [4, 5, 0.6],
        },
      },
      boxes
    )!;
    expect(connector.points.at(-1)).toEqual([14, 505, 0.6]);
    expect(projectStroke(anchored, new Map())).toBeNull();
  });
  it('compacts straight samples while preserving pressure and corner changes',()=>{
    expect(simplifyInkPoints([[0,0,.5],[1,0,.5],[2,0,.5],[3,0,.5]])).toEqual([[0,0,.5],[3,0,.5]]);
    expect(simplifyInkPoints([[0,0,.5],[1,1,.9],[2,0,.5]])).toHaveLength(3);
  });

});
