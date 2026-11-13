import * as Y from "yjs";
import { describe, expect, it } from "vitest";
import { InkScene } from "@sylf/notes";
import { brushOf, DEFAULT_TOOL, eraserRadius } from "./ink-types";
import { watchScene } from "./scene-face";

type Sample = [number, number, number, number, number, number, number, number];
const stroke = (scene: InkScene, y: number) => {
  scene.begin(brushOf(DEFAULT_TOOL, "pen"));
  scene.append(Array.from({ length: 8 }, (_, i): Sample => [20 + i * 20, y, 0.5, i * 8, 0, 0, 0, 0]));
  scene.end();
};

describe("watchScene", () => {
  it("tells the editor about the first stroke, and not about ink that changes nothing it shows", async () => {
    const settle = () => new Promise<void>((resolve) => queueMicrotask(resolve));
    const scene = new InkScene(new Y.Doc());
    let renders = 0;
    const stop = watchScene(scene, () => { renders++; });
    stroke(scene, 200);
    await settle();
    const afterFirst = renders;
    expect(afterFirst).toBeGreaterThan(0);
    // More ink above the lowest stroke: undo is already possible and the page ends where it did.
    stroke(scene, 100);
    stroke(scene, 150);
    await settle();
    expect(renders).toBe(afterFirst);
    // A sweep hides strokes many times a second; the editor hears once, when it changes what Undo or the page's end would show.
    scene.beginSweep();
    scene.eraseStrokes([{ x: 60, y: 100 }], 8);
    scene.eraseStrokes([{ x: 60, y: 150 }], 8);
    await settle();
    expect(renders).toBe(afterFirst);
    scene.endSweep();
    await settle();
    scene.undo();
    await settle();
    expect(renders).toBeGreaterThan(afterFirst);
    stop();
  });
});

describe("eraser settings", () => {
  it("keeps the eraser's size apart from the pen's", () => {
    expect(eraserRadius({ ...DEFAULT_TOOL, width: 8 })).toBe(eraserRadius({ ...DEFAULT_TOOL, width: 0.6 }));
    expect(eraserRadius({ ...DEFAULT_TOOL, eraserSize: 24 })).toBe(24);
    expect(eraserRadius({ ...DEFAULT_TOOL, eraserSize: 900 })).toBe(40);
  });
});
