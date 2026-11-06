import { beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { InkScene, liveOutline } from "@sylf/notes";
import { inkGeometry, inkOutline, type InkSample } from "@sylf/shared";
import { brushOf, DEFAULT_TOOL, type InkToolState } from "./ink-types";
import { addPaletteInk, inkPages } from "./pen-palettes";

const prefs = vi.hoisted(() => new Map<string, string>());
vi.mock("@sylf/native-platform", () => ({ nativePreferences: () => ({ getItem: (k: string) => prefs.get(k) ?? null, setItem: (k: string, v: string) => void prefs.set(k, v) }) }));
vi.mock("@sylf/platform", () => ({ detectCapabilities: () => ({ input: { stylus: false } }) }));

/** The same wave written at one pressure throughout. */
const stroke = (pressure: number): InkSample[] => Array.from({ length: 30 }, (_, i) => [10 + i * 6, 40 + Math.sin(i / 4) * 12, pressure, i * 8, 0, 0, 0, 0]);
/** Light, then hard, then light. */
const varied = (): InkSample[] => stroke(0).map((p, i) => [p[0], p[1], 0.1 + 0.85 * Math.sin((i / 29) * Math.PI), p[3], 0, 0, 0, 0]);
const outline = (points: InkSample[], tool: InkToolState) => inkOutline.inkOutline(points, brushOf(tool, "pen"));
const subpaths = (d: string) => d.split("M ").length - 1;

describe("pen pressure", () => {
  it("off: every pen kind has no thinning, so the stroke is as wide however hard the pen presses", () => {
    for (const nib of ["ballpoint", "fountain", "brush", "pencil", "fineliner"] as const) {
      const tool = { ...DEFAULT_TOOL, nib, pressure: false };
      expect(brushOf(tool, "pen").pressure).toBe(0);
      expect(inkOutline.inkThinning(brushOf(tool, "pen"))).toBe(0);
      expect(outline(stroke(0.05), tool)).toEqual(outline(stroke(1), tool));
    }
  });

  it("on: a harder press writes wider, as before", () => {
    const tool = { ...DEFAULT_TOOL, pressure: true };
    expect(brushOf(tool, "pen").pressure).toBeUndefined();
    expect(inkOutline.inkThinning(brushOf(tool, "pen"))).toBeGreaterThan(0);
    expect(outline(stroke(0.05), tool)).not.toEqual(outline(stroke(1), tool));
  });

  it("off: the live stroke and the finished stroke are the same constant width, from fingers too", () => {
    const tool = { ...DEFAULT_TOOL, pressure: false };
    for (const input of ["pen", "touch", "mouse"] as const) {
      const style = brushOf(tool, input);
      expect(inkOutline.inkOutline(varied(), style)).toEqual(inkOutline.inkOutline(stroke(0.5), style));
    }
    const scene = new InkScene(new Y.Doc());
    scene.begin(brushOf(tool, "pen"));
    scene.append(varied());
    scene.end();
    const [finished] = scene.strokes();
    expect(finished.d).toBe(inkOutline.outlineSvg(inkOutline.inkOutline(stroke(0.5), brushOf(tool, "pen"))));
  });

  it("is a sylf-ink/1 brush the web's ink model accepts, in every combination the panel offers", () => {
    for (const lineStyle of ["solid", "dashed", "dotted"] as const)
      for (const pressure of [true, false]) {
        const scene = new InkScene(new Y.Doc());
        scene.begin(brushOf({ ...DEFAULT_TOOL, nib: "fountain", lineStyle, pressure, straighten: true }, "pen"));
        scene.append(varied());
        scene.end();
        expect(scene.strokes()).toHaveLength(1);
      }
  });
});

describe("pen settings", () => {
  it("a dashed or dotted pen writes its dashes live as it will finish them", () => {
    for (const lineStyle of ["dashed", "dotted"] as const) {
      const style = brushOf({ ...DEFAULT_TOOL, lineStyle }, "pen");
      const pieces = inkGeometry.inkSegments(varied(), style).length;
      expect(pieces).toBeGreaterThan(3);
      expect(subpaths(liveOutline(varied(), style))).toBe(pieces);
    }
    expect(subpaths(liveOutline(varied(), brushOf(DEFAULT_TOOL, "pen")))).toBe(1);
  });

  it("straightens a nearly straight line only when asked", () => {
    const wobble: InkSample[] = Array.from({ length: 20 }, (_, i) => [i * 10, 50 + (i % 2), 0.5, i * 8, 0, 0, 0, 0]);
    expect(inkGeometry.inkGeometry(wobble, brushOf({ ...DEFAULT_TOOL, straighten: true }, "pen"))).toHaveLength(2);
    expect(inkGeometry.inkGeometry(wobble, brushOf(DEFAULT_TOOL, "pen"))).toHaveLength(20);
  });

  it("keeps line style, straightening and kind to the pen; a shape is one even line and a highlighter stays a highlighter", () => {
    const fancy = { ...DEFAULT_TOOL, nib: "pencil" as const, lineStyle: "dotted" as const, straighten: true, pressure: false };
    const shape = brushOf({ ...fancy, tool: "shape" }, "pen");
    expect(shape).toMatchObject({ nib: "ballpoint", shape: "rectangle", pressure: 0 });
    expect(shape.lineStyle).toBeUndefined();
    expect(shape.straighten).toBeUndefined();
    const highlighter = brushOf({ ...fancy, tool: "highlighter" }, "pen");
    expect(highlighter).toMatchObject({ tool: "highlighter", nib: "fineliner", opacity: 0.28, straighten: true });
    expect(highlighter.lineStyle).toBeUndefined();
    expect(inkGeometry.inkOpacity(brushOf(fancy, "pen"))).toBe(0.65);
  });

  it("offers colours in sets, with the ones you mixed last and only once", () => {
    expect(inkPages("pen", []).map((p) => p.label)).toEqual(["Ink", "Bright", "Soft"]);
    expect(inkPages("pen", ["#123456"]).at(-1)).toEqual({ label: "Yours", inks: ["#123456"] });
    const added: string[] = [];
    addPaletteInk("#E53935", inkPages("pen", []), (hex) => added.push(hex));
    addPaletteInk("#123456", inkPages("pen", []), (hex) => added.push(hex));
    expect(added).toEqual(["#123456"]);
  });
});

describe("pen settings are kept", () => {
  beforeEach(() => { prefs.clear(); vi.resetModules(); });
  const load = async () => (await import("./ink-tool")).inkTools;

  it("restores a surface's pen after a restart, but not the tool in hand or the finger setting", async () => {
    let tools = await load();
    const start = tools.get("page", DEFAULT_TOOL);
    expect(start).toEqual(DEFAULT_TOOL);
    tools.set("page", { ...start, tool: "eraser", penOnly: true, pressure: false, nib: "fountain", width: 4.2, color: "#e53935", lineStyle: "dashed", straighten: true });
    tools.set("board", { ...DEFAULT_TOOL, width: 1.2 });
    expect(JSON.parse(prefs.get("sylf.notes.pens.v1")!).tools.page).toMatchObject({ pressure: false, nib: "fountain", width: 4.2 });

    vi.resetModules();
    tools = await load();
    expect(tools.get("page", DEFAULT_TOOL)).toEqual({ ...DEFAULT_TOOL, pressure: false, nib: "fountain", width: 4.2, color: "#e53935", lineStyle: "dashed", straighten: true });
    expect(tools.get("board", DEFAULT_TOOL).width).toBe(1.2);
    expect(tools.get("pdf", { ...DEFAULT_TOOL, tool: "highlighter", color: "#e4b930" }).color).toBe("#e4b930");
  });

  it("keeps mixed colours newest first, without repeats, eight at most", async () => {
    let tools = await load();
    for (let i = 0; i < 10; i++) tools.addInk(`#00000${i}`);
    tools.addInk("#ABCDEF");
    tools.addInk("#abcdef");
    tools.addInk("not a colour");
    expect(tools.inks()).toHaveLength(8);
    expect(tools.inks()[0]).toBe("#abcdef");
    vi.resetModules();
    tools = await load();
    expect(tools.inks()[0]).toBe("#abcdef");
    expect(new Set(tools.inks()).size).toBe(8);
  });

  it("ignores a store it cannot read, and any kept value that is out of range", async () => {
    prefs.set("sylf.notes.pens.v1", "{not json");
    expect((await load()).get("page", DEFAULT_TOOL)).toEqual(DEFAULT_TOOL);
    vi.resetModules();
    prefs.set("sylf.notes.pens.v1", JSON.stringify({ tools: { page: { width: 99, nib: "quill", color: "blue", pressure: "no", lineStyle: "wavy", straighten: true } }, inks: ["#zzzzzz", 4] }));
    const tools = await load();
    expect(tools.get("page", DEFAULT_TOOL)).toEqual({ ...DEFAULT_TOOL, straighten: true });
    expect(tools.inks()).toEqual([]);
  });
});
