import * as Y from "yjs";
import { describe, expect, it } from "vitest";
import { InkScene, brushFor } from "./index";

type Sample = [number, number, number, number, number, number, number, number];
const sample = (x: number, y: number, t: number): Sample => [x, y, 0.5, t, 0, 0, 0, 0];
const brush = brushFor("pen", { color: "#1f2a44", width: 2.6, input: "pen" });
/** A horizontal stroke at height `y`, from x = 20 to x = 220. */
function line(scene: InkScene, y: number) {
  scene.begin(brush);
  scene.append(Array.from({ length: 11 }, (_, i) => sample(20 + i * 20, y, i * 8)));
  scene.end();
}
const page = (count: number) => {
  const scene = new InkScene(new Y.Doc());
  for (let i = 0; i < count; i++) line(scene, 40 + i * 40);
  return scene;
};

describe("InkScene erasing", () => {
  it("leaves every untouched stroke as it was when one is erased", () => {
    const scene = page(6);
    const before = scene.strokes();
    scene.eraseStrokes([{ x: 120, y: 40 }], 8);
    const after = scene.strokes();
    expect(after).toHaveLength(5);
    // The same objects, so a renderer redraws nothing and the outlines are not computed again.
    for (const stroke of after) expect(before).toContain(stroke);
  });

  it("erases every stroke a fast sweep crosses, however far apart its samples are", () => {
    const scene = page(6);
    scene.beginSweep();
    scene.eraseStrokes([{ x: 120, y: 0 }, { x: 120, y: 400 }], 6);
    expect(scene.strokes()).toHaveLength(0);
    scene.endSweep();
    expect(scene.strokes()).toHaveLength(0);
  });

  it("makes one sweep of the stroke eraser one undo step", () => {
    const scene = page(4);
    scene.beginSweep();
    scene.eraseStrokes([{ x: 120, y: 30 }, { x: 120, y: 90 }], 6);
    scene.eraseStrokes([{ x: 120, y: 90 }, { x: 120, y: 170 }], 6);
    scene.endSweep();
    expect(scene.strokes()).toHaveLength(0);
    scene.undo();
    expect(scene.strokes()).toHaveLength(4);
  });

  it("makes one sweep of the precise eraser one undo step, and leaves the last stroke written alone", () => {
    const scene = page(3);
    const whole = scene.strokes().map((stroke) => stroke.d);
    scene.beginSweep();
    scene.erasePrecisely([{ x: 100, y: 30 }, { x: 100, y: 60 }], 6);
    scene.erasePrecisely([{ x: 100, y: 60 }, { x: 100, y: 95 }], 6);
    scene.endSweep();
    const cut = scene.strokes();
    expect(cut).toHaveLength(3);
    expect(cut[0].d === whole[0] || cut[1].d === whole[1]).toBe(false);
    // Only the strokes the eraser crossed were projected again.
    expect(cut[2].d === whole[2]).toBe(true);
    scene.undo();
    expect(scene.strokes().every((stroke, i) => stroke.d === whole[i])).toBe(true);
    // The sweep did not swallow the stroke before it into its undo step.
    scene.undo();
    expect(scene.strokes()).toHaveLength(2);
  });

  it("writes after a sweep that was never closed", () => {
    const scene = page(2);
    scene.beginSweep();
    scene.eraseStrokes([{ x: 120, y: 40 }], 8);
    line(scene, 300);
    expect(scene.strokes()).toHaveLength(2);
    expect(scene.strokes().some((stroke) => stroke.bounds.y > 250)).toBe(true);
  });

  it("moves a selection without projecting the rest of the page again", () => {
    const scene = page(5);
    const before = scene.strokes();
    scene.move([before[0].id], 10, 10);
    const after = scene.strokes();
    expect(after[0]).not.toBe(before[0]);
    for (const stroke of after.slice(1)) expect(before).toContain(stroke);
  });
});
