import { describe, expect, it, vi } from "vitest";
import { createSpacesStore } from "../store";
import { EDGE_GUTTER, GRID, HOME_CAMERA, OVERVIEW_ZOOM, WORLD, ZOOM, clampCamera, clearWorld, contains, frameRect, gridDots, gridSpacing, intersects, revealRect, screenToWorld, visibleWorld, worldToScreen, zoomAt, type Frame } from "./canvas";
import { DEFAULT_BUDGET, planLifecycles, seenWindowIds } from "./lifecycle";
import { createWorkspaceModel } from "./model";
import { TOOLS, TOOL_IDS } from "./tools";
import { INITIAL_WORKSPACE, MAX_TOOL_STATE, MAX_WINDOWS, applyLayout, closeWindow, cycleFocus, fitWorkspace, focusWindow, minimizeWindow, minimizedWindows, moveWindow, openWindow, openWindows, parseWorkspaceState, pinchOwner, pinchRegions, resizeWindow, restoreArrangement, restoreWindow, setToolState, windowTitle, type WorkspaceState } from "./windows";

const viewport = { width: 1280, height: 820 };
const frame: Frame = { viewport, insets: { top: 72, right: 16, bottom: 96, left: 16 } };
const opened = (state: WorkspaceState, ...tools: (typeof TOOL_IDS)[number][]) => tools.reduce((next, tool) => openWindow(next, tool, frame).state, state);
const memory = () => { const values = new Map<string, string>(); return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => void values.set(key, value), values }; };

describe("camera", () => {
  it("reaches every edge of the world and looks a little past it", () => {
    const corner = clampCamera({ x: -99999, y: -99999, zoom: 1 }, viewport);
    const seen = visibleWorld(corner, viewport);
    expect(seen.x).toBe(-EDGE_GUTTER);
    expect(seen.y).toBe(-EDGE_GUTTER);
    const far = visibleWorld(clampCamera({ x: 99999, y: 99999, zoom: 1 }, viewport), viewport);
    expect(far.x + far.width).toBe(WORLD.width + EDGE_GUTTER);
    expect(far.y + far.height).toBe(WORLD.height + EDGE_GUTTER);
  });

  it("holds zoom inside its limits and centers a world smaller than the view", () => {
    expect(clampCamera({ ...HOME_CAMERA, zoom: 99 }, viewport).zoom).toBe(ZOOM.max);
    const wide = { width: 4000, height: 3000 };
    const small = clampCamera({ x: 10, y: 10, zoom: 0.001 }, wide);
    expect(small).toEqual({ x: WORLD.width / 2, y: WORLD.height / 2, zoom: ZOOM.min });
  });

  it("keeps the point under a pinch still", () => {
    const camera = HOME_CAMERA;
    const focal = { x: 300, y: 240 };
    const before = screenToWorld(focal, camera, viewport);
    const next = zoomAt(camera, 1.7, focal, viewport);
    const after = worldToScreen(before, next, viewport);
    expect(after.x).toBeCloseTo(focal.x, 6);
    expect(after.y).toBeCloseTo(focal.y, 6);
  });

  it("round-trips between screen and world", () => {
    const camera = { x: 1234, y: 987, zoom: 0.63 };
    const point = worldToScreen(screenToWorld({ x: 111, y: 222 }, camera, viewport), camera, viewport);
    expect(point.x).toBeCloseTo(111, 8);
    expect(point.y).toBeCloseTo(222, 8);
  });

  it("frames a rectangle clear of chrome, never closer than asked", () => {
    const rect = { x: 2000, y: 1500, width: 600, height: 400 };
    const camera = frameRect(rect, frame);
    expect(camera.zoom).toBe(1);
    expect(contains(clearWorld(camera, frame), rect)).toBe(true);
    const huge = frameRect({ x: 100, y: 100, width: 4000, height: 3000 }, frame);
    expect(huge.zoom).toBeLessThan(0.3);
  });

  it("moves no further than it must to reveal something", () => {
    const camera = { x: 2800, y: 1820, zoom: 1 };
    expect(revealRect(camera, { x: 2700, y: 1800, width: 100, height: 100 }, frame)).toBe(camera);
    const moved = revealRect(camera, { x: 200, y: 200, width: 300, height: 300 }, frame);
    expect(moved.x).toBeLessThan(camera.x);
    expect(moved.zoom).toBe(1);
  });
});

describe("dot grid", () => {
  it("stays within one octave at every zoom, and its first tile starts off the top left", () => {
    for (let zoom = ZOOM.min; zoom <= ZOOM.max; zoom += 0.013) {
      for (const camera of [{ x: 0, y: 0, zoom }, { x: 3333, y: 1711, zoom }, { x: WORLD.width, y: WORLD.height, zoom }]) {
        const dots = gridDots(camera, viewport);
        expect(dots.spacing).toBeGreaterThanOrEqual(GRID);
        expect(dots.spacing).toBeLessThan(GRID * 2);
        expect(dots.x).toBeLessThanOrEqual(0);
        expect(dots.x).toBeGreaterThan(-dots.spacing);
        expect(dots.y).toBeLessThanOrEqual(0);
        expect(dots.y).toBeGreaterThan(-dots.spacing);
      }
    }
  });

  it("keeps dots locked to the world as the camera moves", () => {
    const zoom = 0.8;
    const a = gridDots({ x: 1000, y: 1000, zoom }, viewport);
    const b = gridDots({ x: 1000 + GRID * 2 * 8, y: 1000, zoom }, viewport);
    expect(a.x).toBeCloseTo(b.x, 6);
  });

  it("puts a dot on a window that sits on the grid", () => {
    for (const zoom of [0.3, 0.75, 1, 1.4, 2]) {
      const camera = { x: 2800, y: 1820, zoom };
      const dots = gridDots(camera, viewport);
      const point = worldToScreen({ x: GRID * 100, y: GRID * 65 }, camera, viewport);
      const offset = (((point.x - (dots.x + dots.spacing / 2)) % dots.spacing) + dots.spacing) % dots.spacing;
      expect(Math.min(offset, dots.spacing - offset)).toBeLessThan(1e-6);
    }
  });

  it("changes spacing with the zoom and nothing else moves it", () => {
    expect(gridSpacing(1).spacing).toBe(GRID);
    expect(gridSpacing(1.5).spacing).toBe(GRID * 1.5);
    expect(gridSpacing(0.5).level).toBe(1);
    expect(gridSpacing(2).level).toBe(-1);
  });
});

describe("who a pinch belongs to", () => {
  const regions = [
    { id: "calc", x: 300, y: 100, width: 100, height: 100, owned: false },
    { id: "note", x: 100, y: 100, width: 300, height: 300, owned: true },
  ];
  const inNote = { x: 120, y: 300 };
  const inCalc = { x: 350, y: 150 };
  const onCanvas = { x: 900, y: 900 };

  it("is the tool's only when both fingers are on a tool that zooms itself", () => {
    expect(pinchOwner(regions, inNote, { x: 200, y: 350 })).toBe("note");
    expect(pinchOwner(regions, inCalc, { x: 310, y: 120 })).toBeNull();
    expect(pinchOwner(regions, inNote, onCanvas)).toBeNull();
    expect(pinchOwner(regions, onCanvas, inNote)).toBeNull();
  });

  it("goes by the window on top", () => {
    expect(pinchOwner(regions, inCalc, inNote)).toBeNull();
    const state = openWindow(openWindow(INITIAL_WORKSPACE, "notes", frame).state, "calculator", frame).state;
    expect(pinchRegions(state).map((region) => region.owned)).toEqual([false, true]);
  });

  it("leaves minimized windows out", () => {
    const { state, id } = openWindow(INITIAL_WORKSPACE, "notes", frame);
    expect(pinchRegions(minimizeWindow(state, id as string))).toEqual([]);
  });

  it("names the tools that zoom their own content", () => {
    expect(TOOL_IDS.filter((tool) => TOOLS[tool].ownsPinch)).toEqual(["notes", "pdfs", "whiteboard"]);
  });
});

describe("tool contract", () => {
  it("gives every tool an owner and sane sizes on the grid", () => {
    for (const id of TOOL_IDS) {
      const spec = TOOLS[id];
      expect(spec.owner.length).toBeGreaterThan(4);
      for (const size of [spec.min, spec.preferred, spec.max]) {
        expect(size.width % GRID).toBe(0);
        expect(size.height % GRID).toBe(0);
      }
      expect(spec.min.width).toBeLessThanOrEqual(spec.preferred.width);
      expect(spec.preferred.height).toBeLessThanOrEqual(spec.max.height);
    }
  });
});

describe("windows", () => {
  it("opens tools side by side, clear of the chrome, with the camera following onto new ground", () => {
    let state = INITIAL_WORKSPACE;
    for (const tool of ["notes", "notes", "pdfs", "calculator"] as const) {
      state = openWindow(state, tool, frame).state;
      const newest = state.windows.at(-1)!;
      expect(contains(clearWorld(state.camera, frame), newest)).toBe(true);
      expect(newest.x % GRID).toBe(0);
      expect(newest.y % GRID).toBe(0);
    }
    state.windows.forEach((a, index) => state.windows.slice(index + 1).forEach((b) => expect(intersects(a, b)).toBe(false)));
  });

  it("uses free room in view before moving the camera", () => {
    const start = { ...INITIAL_WORKSPACE, camera: { ...HOME_CAMERA, zoom: 0.5 } };
    const state = opened(start, "notes", "pdfs", "calculator");
    expect(state.camera).toEqual(start.camera);
  });

  it("gives each instance its own id and a name that tells them apart", () => {
    const state = opened(INITIAL_WORKSPACE, "notes", "notes");
    expect(new Set(state.windows.map((window) => window.id)).size).toBe(2);
    expect(state.windows.map((window) => windowTitle(state, window))).toEqual(["Notes 1", "Notes 2"]);
  });

  it("brings a single-instance tool forward instead of opening a second", () => {
    let state = opened(INITIAL_WORKSPACE, "timer", "notes");
    const timer = state.windows[0].id;
    state = minimizeWindow(state, timer);
    const result = openWindow(state, "timer", frame);
    expect(result.id).toBe(timer);
    expect(result.state.windows.filter((window) => window.tool === "timer")).toHaveLength(1);
    expect(result.state.windows[0].minimized).toBe(false);
    expect(result.state.focused).toBe(timer);
  });

  it("stops at the limit without losing anything", () => {
    let state = INITIAL_WORKSPACE;
    for (let i = 0; i < MAX_WINDOWS; i++) state = openWindow(state, "calculator", frame).state;
    const full = openWindow(state, "notes", frame);
    expect(full.id).toBeNull();
    expect(full.state).toBe(state);
  });

  it("raises on focus, and does nothing when already in front", () => {
    let state = opened(INITIAL_WORKSPACE, "notes", "pdfs");
    const [first] = state.windows;
    state = focusWindow(state, first.id);
    expect(state.focused).toBe(first.id);
    expect(state.windows[0].z).toBeGreaterThan(state.windows[1].z);
    expect(focusWindow(state, first.id)).toBe(state);
    expect(state.recent[0]).toBe(first.id);
  });

  it("snaps a drop to the grid and keeps it in the world", () => {
    let state = opened(INITIAL_WORKSPACE, "notes");
    const { id } = state.windows[0];
    state = moveWindow(state, id, 1009, 1033);
    expect(state.windows[0].x).toBe(1008);
    expect(state.windows[0].y).toBe(1036);
    state = moveWindow(state, id, -500, 99999);
    expect(state.windows[0].x).toBe(0);
    expect(state.windows[0].y).toBe(WORLD.height - state.windows[0].height);
    expect(moveWindow(state, id, state.windows[0].x, state.windows[0].y)).toBe(state);
  });

  it("keeps a resize inside the tool's limits", () => {
    let state = opened(INITIAL_WORKSPACE, "calculator");
    const { id, x, y } = state.windows[0];
    state = resizeWindow(state, id, { x, y, width: 10, height: 10 });
    expect(state.windows[0].width).toBe(TOOLS.calculator.min.width);
    expect(state.windows[0].height).toBe(TOOLS.calculator.min.height);
    state = resizeWindow(state, id, { x, y, width: 5000, height: 5000 });
    expect(state.windows[0].width).toBe(TOOLS.calculator.max.width);
  });

  it("minimizes without closing, passes focus on, and restores in place", () => {
    let state = opened(INITIAL_WORKSPACE, "notes", "pdfs");
    const [notes, pdfs] = state.windows;
    state = minimizeWindow(state, pdfs.id);
    expect(state.focused).toBe(notes.id);
    expect(minimizedWindows(state).map((window) => window.id)).toEqual([pdfs.id]);
    state = restoreWindow(state, pdfs.id);
    expect(state.focused).toBe(pdfs.id);
    expect(state.windows[1]).toMatchObject({ x: pdfs.x, y: pdfs.y, width: pdfs.width, height: pdfs.height, minimized: false });
  });

  it("closes and passes focus to the last window used", () => {
    let state = opened(INITIAL_WORKSPACE, "notes", "pdfs", "calculator");
    const [notes, pdfs, calculator] = state.windows;
    state = focusWindow(state, pdfs.id);
    state = focusWindow(state, calculator.id);
    state = closeWindow(state, calculator.id);
    expect(state.focused).toBe(pdfs.id);
    state = closeWindow(state, pdfs.id);
    expect(state.focused).toBe(notes.id);
    expect(closeWindow(closeWindow(state, notes.id), notes.id).windows).toEqual([]);
  });

  it("cycles in a steady order, which stacking never changes", () => {
    let state = opened(INITIAL_WORKSPACE, "notes", "pdfs", "calculator");
    const [notes, pdfs, calculator] = state.windows;
    state = cycleFocus(state, 1);
    expect(state.focused).toBe(notes.id);
    state = cycleFocus(state, 1);
    expect(state.focused).toBe(pdfs.id);
    state = cycleFocus(state, -1);
    state = cycleFocus(state, -1);
    expect(state.focused).toBe(calculator.id);
  });

  it("keeps tool state per window, and refuses state too large to be a snapshot", () => {
    let state = opened(INITIAL_WORKSPACE, "calculator", "calculator");
    const [a, b] = state.windows;
    state = setToolState(state, a.id, { expression: "2+2" });
    expect(state.windows[0].state.expression).toBe("2+2");
    expect(state.windows[1].state).toEqual({});
    expect(setToolState(state, b.id, {})).toBe(state);
    const large = setToolState(state, a.id, { blob: "x".repeat(MAX_TOOL_STATE) });
    expect(large.windows[0].state).toEqual({ expression: "2+2" });
  });
});

describe("layouts", () => {
  it("Focus fills the view with one tool, minimizes the rest, and closes nothing", () => {
    const start = opened(INITIAL_WORKSPACE, "notes", "pdfs", "calculator");
    const state = applyLayout(start, "focus", frame);
    expect(state.layout).toBe("focus");
    expect(state.windows).toHaveLength(3);
    expect(openWindows(state).map((window) => window.tool)).toEqual(["calculator"]);
  });

  it("Focus sizes a large tool to the clear view, at 100%", () => {
    const state = applyLayout(opened(INITIAL_WORKSPACE, "notes"), "focus", frame);
    const [window] = openWindows(state);
    expect(state.camera.zoom).toBe(1);
    expect(contains(clearWorld(state.camera, { ...frame, insets: { ...frame.insets, bottom: GRID * 2 } }), window)).toBe(true);
    expect(window.width).toBeGreaterThan(1100);
    expect(window.height).toBeGreaterThan(600);
  });

  it("keeps a group together and centered when a tool has a size limit", () => {
    const state = applyLayout(opened(INITIAL_WORKSPACE, "calculator", "timer"), "split", frame);
    const [left, right] = [...openWindows(state)].sort((a, b) => a.x - b.x);
    expect(right.x).toBe(left.x + left.width + GRID);
    expect(left.width).toBeLessThanOrEqual(TOOLS[left.tool].max.width);
    expect(right.width).toBeLessThanOrEqual(TOOLS[right.tool].max.width);
    const middle = (left.x + right.x + right.width) / 2;
    expect(Math.abs(middle - state.camera.x)).toBeLessThanOrEqual(GRID);
  });

  it("Split puts two tools side by side, opening a companion if there is only one", () => {
    const state = applyLayout(opened(INITIAL_WORKSPACE, "notes"), "split", frame);
    const [left, right] = openWindows(state);
    expect(left.tool).toBe("notes");
    expect(right.tool).toBe("pdfs");
    expect(left.y).toBe(right.y);
    expect(left.height).toBe(right.height);
    expect(right.x).toBe(left.x + left.width + GRID);
    expect(Math.abs(left.width - right.width)).toBeLessThanOrEqual(GRID);
  });

  it("Assistant puts Sylvie beside the main tool, and keeps Sylvie the smaller", () => {
    const state = applyLayout(opened(INITIAL_WORKSPACE, "pdfs"), "assistant", frame);
    const [main, sylvie] = [...openWindows(state)].sort((a, b) => a.x - b.x);
    expect(main.tool).toBe("pdfs");
    expect(sylvie.tool).toBe("sylvie");
    expect(main.width).toBeGreaterThan(sylvie.width);
    expect(state.focused).toBe(main.id);
  });

  it("Assistant keeps Sylvie the smaller beside a tool with a size limit", () => {
    const state = applyLayout(opened(INITIAL_WORKSPACE, "calculator"), "assistant", frame);
    const [main, sylvie] = [...openWindows(state)].sort((a, b) => a.x - b.x);
    expect(main.tool).toBe("calculator");
    expect(sylvie.width).toBeLessThanOrEqual(main.width);
  });

  it("Assistant from Sylvie finds a main tool rather than doubling Sylvie", () => {
    const state = applyLayout(opened(INITIAL_WORKSPACE, "sylvie"), "assistant", frame);
    expect(openWindows(state).map((window) => window.tool).sort()).toEqual(["notes", "sylvie"]);
  });

  it("opens Notes when a preset is chosen on an empty canvas", () => {
    const state = applyLayout(INITIAL_WORKSPACE, "focus", frame);
    expect(openWindows(state).map((window) => window.tool)).toEqual(["notes"]);
  });

  it("gives back the arrangement a preset replaced", () => {
    const start = opened(INITIAL_WORKSPACE, "notes", "pdfs");
    const after = restoreArrangement(applyLayout(start, "focus", frame));
    expect(after.layout).toBe("free");
    expect(after.saved).toBeNull();
    expect(after.windows.map(({ x, y, width, height, minimized }) => ({ x, y, width, height, minimized }))).toEqual(start.windows.map(({ x, y, width, height, minimized }) => ({ x, y, width, height, minimized })));
    expect(after.camera).toEqual(start.camera);
  });

  it("remembers the first arrangement across preset changes", () => {
    const start = opened(INITIAL_WORKSPACE, "notes", "pdfs");
    const twice = applyLayout(applyLayout(start, "focus", frame), "split", frame);
    expect(restoreArrangement(twice).windows[0].x).toBe(start.windows[0].x);
  });

  it("makes a hand adjustment the person's own, and leaves the preset as it was", () => {
    const preset = applyLayout(opened(INITIAL_WORKSPACE, "notes", "pdfs"), "split", frame);
    const [window] = openWindows(preset);
    const adjusted = moveWindow(preset, window.id, window.x + 56, window.y);
    expect(adjusted.layout).toBe("free");
    expect(adjusted.saved).toBeNull();
    const again = applyLayout(adjusted, "split", frame);
    expect(openWindows(again).find((item) => item.id === window.id)?.width).toBe(window.width);
  });

  it("works near the edge of the world", () => {
    const start = { ...opened(INITIAL_WORKSPACE, "notes", "pdfs"), camera: { x: 40, y: 40, zoom: 1 } };
    const state = applyLayout(start, "split", frame);
    for (const window of openWindows(state)) expect(contains({ x: 0, y: 0, ...WORLD }, window)).toBe(true);
    expect(contains(clearWorld(state.camera, frame), openWindows(state)[0])).toBe(true);
  });

  it("fits every open window, or the world if there are none", () => {
    let state = opened(INITIAL_WORKSPACE, "notes", "pdfs");
    state = moveWindow(state, state.windows[1].id, 4000, 2800);
    const camera = fitWorkspace(state, frame);
    const area = clearWorld(camera, frame);
    for (const window of openWindows(state)) expect(contains(area, window)).toBe(true);
    expect(fitWorkspace(INITIAL_WORKSPACE, frame).zoom).toBeLessThan(0.3);
  });
});

describe("lifecycle", () => {
  it("keeps the focused tool active and what is seen running", () => {
    const state = opened(INITIAL_WORKSPACE, "notes", "pdfs");
    const plan = planLifecycles(state, state.windows.map((window) => window.id));
    expect(plan[state.focused as string]).toBe("active");
    expect(Object.values(plan).sort()).toEqual(["active", "visible"]);
  });

  it("stills what is out of sight, and suspends what is over budget, oldest first", () => {
    let state = INITIAL_WORKSPACE;
    for (let i = 0; i < 6; i++) state = openWindow(state, "calculator", frame).state;
    const plan = planLifecycles(state, [state.windows[5].id], { seen: 8, warm: 2 });
    expect(plan[state.windows[5].id]).toBe("active");
    expect(plan[state.windows[4].id]).toBe("background");
    expect(plan[state.windows[3].id]).toBe("background");
    expect(plan[state.windows[2].id]).toBe("suspended");
    expect(plan[state.windows[0].id]).toBe("suspended");
  });

  it("holds a minimized window out of the seen set", () => {
    let state = opened(INITIAL_WORKSPACE, "notes", "pdfs");
    state = minimizeWindow(state, state.windows[0].id);
    expect(seenWindowIds(state, viewport)).toEqual([state.windows[1].id]);
  });

  it("drops off-screen windows, keeps near ones, and shows nothing in overview", () => {
    let state = opened(INITIAL_WORKSPACE, "notes", "pdfs");
    state = moveWindow(state, state.windows[1].id, 200, 200);
    expect(seenWindowIds(state, viewport)).toEqual([state.windows[0].id]);
    expect(seenWindowIds({ ...state, camera: { ...state.camera, zoom: OVERVIEW_ZOOM - 0.01 } }, viewport)).toEqual([]);
  });

  it("caps what runs on screen when everything is in view", () => {
    let state = INITIAL_WORKSPACE;
    for (let i = 0; i < 12; i++) state = openWindow(state, "calculator", frame).state;
    const plan = planLifecycles(state, state.windows.map((window) => window.id));
    const counts = Object.values(plan).reduce<Record<string, number>>((all, value) => ({ ...all, [value]: (all[value] ?? 0) + 1 }), {});
    expect((counts.active ?? 0) + (counts.visible ?? 0)).toBe(DEFAULT_BUDGET.seen);
    expect(counts.background).toBe(DEFAULT_BUDGET.warm);
  });
});

describe("restoration", () => {
  it("round-trips through JSON", () => {
    const state = applyLayout(opened(INITIAL_WORKSPACE, "notes", "pdfs", "calculator"), "split", frame);
    expect(parseWorkspaceState(JSON.parse(JSON.stringify(state)))).toEqual({ ...state, windows: state.windows.map((window, index) => ({ ...window, z: [...state.windows].sort((a, b) => a.z - b.z).indexOf(window) + 1 + 0 * index })) });
  });

  it("survives anything", () => {
    for (const raw of [null, undefined, 3, "x", [], {}, { version: 2 }, { version: 1, windows: "no" }, { version: 1, camera: { x: "a" } }]) {
      expect(() => parseWorkspaceState(raw)).not.toThrow();
      expect(parseWorkspaceState(raw).windows).toEqual([]);
    }
  });

  it("drops what it cannot read and keeps the rest", () => {
    const state = parseWorkspaceState({ version: 1, focused: "gone", windows: [{ id: "a", tool: "notes", x: 0, y: 0, width: 400, height: 400 }, { id: "a", tool: "notes", x: 0, y: 0, width: 400, height: 400 }, { id: "b", tool: "game", x: 0, y: 0, width: 1, height: 1 }, { id: "c", tool: "notes", x: Number.NaN }] });
    expect(state.windows.map((window) => window.id)).toEqual(["a"]);
    expect(state.focused).toBeNull();
    expect(state.recent).toEqual(["a"]);
  });

  it("repairs values out of range", () => {
    const state = parseWorkspaceState({ version: 1, camera: { x: -5, y: 9e9, zoom: 400 }, windows: [{ id: "a", tool: "calculator", x: -100, y: 9e9, width: 1, height: 1e6 }] });
    expect(state.camera).toEqual({ x: 0, y: WORLD.height, zoom: ZOOM.max });
    const [window] = state.windows;
    expect(window.width).toBe(TOOLS.calculator.min.width);
    expect(window.height).toBe(TOOLS.calculator.max.height);
    expect(window.x).toBe(0);
    expect(window.y).toBe(WORLD.height - window.height);
  });

  it("does not trust a focused window that is minimized", () => {
    const state = parseWorkspaceState({ version: 1, focused: "a", windows: [{ id: "a", tool: "notes", x: 0, y: 0, width: 400, height: 400, minimized: true }] });
    expect(state.focused).toBeNull();
  });

  it("drops a saved arrangement's entries for windows that are gone", () => {
    const state = parseWorkspaceState({ version: 1, saved: { camera: HOME_CAMERA, windows: [{ id: "gone", x: 0, y: 0, width: 1, height: 1 }] }, windows: [] });
    expect(state.saved?.windows).toEqual([]);
  });
});

describe("the model", () => {
  const start = () => {
    const storage = memory();
    const store = createSpacesStore(storage, "tablet");
    const model = createWorkspaceModel(store);
    model.setFrame(frame);
    return { storage, store, model };
  };

  it("writes through the Spaces store and comes back after a restart", () => {
    vi.useFakeTimers();
    const { storage, model } = start();
    const id = model.open("notes", { title: "Complex numbers" }) as string;
    model.open("calculator");
    model.move(id, 280, 280);
    model.commitCamera({ x: 1000, y: 900, zoom: 0.8 });
    vi.advanceTimersByTime(300);
    const restarted = createWorkspaceModel(createSpacesStore(storage, "tablet"));
    restarted.setFrame(frame);
    const state = restarted.state();
    expect(state.windows.map((window) => window.tool)).toEqual(["notes", "calculator"]);
    expect(state.windows[0]).toMatchObject({ x: 280, y: 280, state: { title: "Complex numbers" } });
    expect(state.camera).toEqual({ x: 1000, y: 900, zoom: 0.8 });
    vi.useRealTimers();
  });

  it("keeps state when the Workspace is left and entered again", () => {
    const { store, model } = start();
    model.open("notes");
    store.select("home");
    store.select("workspace");
    expect(model.state().windows).toHaveLength(1);
  });

  it("notifies once per real change and not for a no-op", () => {
    const { model } = start();
    const listener = vi.fn();
    model.subscribe(listener);
    const id = model.open("notes") as string;
    expect(listener).toHaveBeenCalledTimes(1);
    model.focus(id);
    model.move(id, model.state().windows[0].x, model.state().windows[0].y);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("is not disturbed by Home's snapshot", () => {
    const { store, model } = start();
    const listener = vi.fn();
    model.subscribe(listener);
    store.setSpaceSnapshot("home", { destination: "focus", scroll: {} });
    expect(listener).not.toHaveBeenCalled();
  });

  it("keeps the camera inside the world when the window grows", () => {
    const { model } = start();
    model.commitCamera({ x: WORLD.width, y: WORLD.height, zoom: 1 });
    const { x } = model.state().camera;
    model.setFrame({ ...frame, viewport: { width: 2000, height: 1200 } });
    expect(model.state().camera.x).toBeLessThan(x);
  });

  it("zooms by steps around the middle and resets", () => {
    const { model } = start();
    model.zoomBy(ZOOM.step);
    expect(model.state().camera.zoom).toBeCloseTo(1.25);
    model.resetView();
    expect(model.state().camera).toEqual(HOME_CAMERA);
  });

  it("restores a minimized window into view", () => {
    const { model } = start();
    const id = model.open("notes") as string;
    model.minimize(id);
    model.commitCamera({ x: 300, y: 300, zoom: 1 });
    model.restore(id);
    const state = model.state();
    expect(contains(clearWorld(state.camera, frame), state.windows[0])).toBe(true);
  });

  it("clears everything on request", () => {
    const { model } = start();
    model.open("notes");
    model.clear();
    expect(model.state().windows).toEqual([]);
  });
});

describe("summoning a tool from outside Workspace", () => {
  const storage = () => { const data = new Map<string, string>(); return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } }; };
  const framed = { viewport: { width: 480, height: 700 }, insets: { top: 56, right: 12, bottom: 96, left: 12 } };
  it("waits for the canvas, then lands in the view it finds", () => {
    const model = createWorkspaceModel(createSpacesStore(storage(), "tablet"));
    model.summon("timer");
    expect(model.state().windows).toHaveLength(0);
    model.setFrame(framed);
    expect(model.state().windows.map((window) => window.tool)).toEqual(["timer"]);
    expect(model.state().focused).toBe(model.state().windows[0].id);
  });
  it("brings an open window forward rather than opening a second", () => {
    const model = createWorkspaceModel(createSpacesStore(storage(), "tablet"));
    model.setFrame(framed);
    const id = model.open("timer")!;
    model.minimize(id);
    model.detach();
    model.summon("timer");
    model.setFrame(framed);
    expect(model.state().windows).toHaveLength(1);
    expect(model.state().windows[0].minimized).toBe(false);
  });
});
