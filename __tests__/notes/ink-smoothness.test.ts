// @vitest-environment jsdom
import "fake-indexeddb/auto";
import Dexie from "dexie";
import * as Y from "yjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  InkModel,
  type InkBrush,
  type InkSample,
} from "@/lib/notes/ink";
import { InkRenderer } from "@/lib/notes/ink-renderer";
import { InkController, type InkTools } from "@/lib/notes/ink-controller";
import { NotesLibrary } from "@/lib/notes/library";
import { IndexedDbNotesRepository } from "@/lib/notes/repository";
import { NotesSession } from "@/lib/notes/session";
import { recoverUnacknowledged } from "@/lib/notes/engine";
import { createNotesVault } from "@/lib/notes/vault";
import { digest } from "@/lib/notes/bytes";
import { newId } from "@/lib/notes/contracts";

class MockPath2D {
  readonly commands: string[] = [];
  readonly added: MockPath2D[] = [];
  constructor(d?: string | MockPath2D) {
    if (typeof d === "string" && d) this.commands.push(d);
    else if (d instanceof MockPath2D) this.added.push(d);
  }
  addPath(other: MockPath2D) {
    this.added.push(other);
  }
  moveTo() {}
  lineTo() {}
  quadraticCurveTo() {}
  bezierCurveTo() {}
  closePath() {}
  rect() {}
  arc() {}
}

type MockCtx = {
  canvas: HTMLCanvasElement;
  clearRect: ReturnType<typeof vi.fn>;
  getTransform: ReturnType<typeof vi.fn>;
  setTransform: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
  restore: ReturnType<typeof vi.fn>;
  fill: ReturnType<typeof vi.fn>;
  stroke: ReturnType<typeof vi.fn>;
  beginPath: ReturnType<typeof vi.fn>;
  closePath: ReturnType<typeof vi.fn>;
  clip: ReturnType<typeof vi.fn>;
  moveTo: ReturnType<typeof vi.fn>;
  lineTo: ReturnType<typeof vi.fn>;
  quadraticCurveTo: ReturnType<typeof vi.fn>;
  arc: ReturnType<typeof vi.fn>;
  rect: ReturnType<typeof vi.fn>;
  strokeRect: ReturnType<typeof vi.fn>;
  setLineDash: ReturnType<typeof vi.fn>;
  drawImage: ReturnType<typeof vi.fn>;
  fillRect: ReturnType<typeof vi.fn>;
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  lineCap: string;
  lineJoin: string;
  globalAlpha: number;
};

function createMockCtx(canvas?: HTMLCanvasElement): MockCtx {
  return {
    canvas: canvas ?? document.createElement("canvas"),
    clearRect: vi.fn(),
    getTransform: vi.fn(() => ({ a: 1, d: 1 })),
    setTransform: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    clip: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    arc: vi.fn(),
    rect: vi.fn(),
    strokeRect: vi.fn(),
    setLineDash: vi.fn(),
    drawImage: vi.fn(),
    fillRect: vi.fn(),
    fillStyle: "#000",
    strokeStyle: "#000",
    lineWidth: 1,
    lineCap: "round",
    lineJoin: "round",
    globalAlpha: 1,
  };
}

function makePointer(
  type: string,
  init: {
    pointerId?: number;
    pointerType?: string;
    button?: number;
    buttons?: number;
    clientX: number;
    clientY: number;
    pressure?: number;
    width?: number;
    height?: number;
    timeStamp?: number;
    coalesced?: PointerEvent[];
    predicted?: PointerEvent[];
  }
): PointerEvent {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: init.button ?? 0,
    buttons: init.buttons ?? (type === "pointerup" ? 0 : 1),
    clientX: init.clientX,
    clientY: init.clientY,
  });
  Object.defineProperties(event, {
    pointerId: { value: init.pointerId ?? 1 },
    pointerType: { value: init.pointerType ?? "pen" },
    pressure: { value: init.pressure ?? (type === "pointerup" ? 0 : 0.55) },
    width: { value: init.width ?? 1 },
    height: { value: init.height ?? 1 },
    tiltX: { value: 0 },
    tiltY: { value: 0 },
    twist: { value: 0 },
    tangentialPressure: { value: 0 },
    ...(init.timeStamp !== undefined
      ? { timeStamp: { value: init.timeStamp } }
      : {}),
    getCoalescedEvents: {
      value: () => init.coalesced ?? [event as unknown as PointerEvent],
    },
    getPredictedEvents: {
      value: () => init.predicted ?? [],
    },
  });
  return event as unknown as PointerEvent;
}

const defaultTools: InkTools = {
  tool: "pen",
  color: "#242830",
  width: 3,
  finger: false,
  nib: "ballpoint",
  opacity: 0.45,
  pressure: 1,
  smoothing: 0.65,
  lineStyle: "solid",
  straighten: false,
  eraserMode: "stroke",
  eraserSize: 12,
};

const penBrush: InkBrush = {
  tool: "pen",
  color: "#242830",
  width: 3,
  opacity: 0.45,
  input: "pen",
  brush: "perfect-freehand/1.2.3:sylf-1",
};

const cleanups: (() => void | Promise<unknown>)[] = [];

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  vi.stubGlobal("Path2D", MockPath2D);
  vi.stubGlobal("ResizeObserver", MockResizeObserver);
});

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function setupLibrary(
  fault?: NonNullable<ConstructorParameters<typeof IndexedDbNotesRepository>[0]["fault"]>
) {
  const adapter = await import("@/lib/notes/blocknote-adapter");
  const seedDoc = new Y.Doc();
  const seedBytes = Y.encodeStateAsUpdate(seedDoc);
  seedDoc.destroy();
  vi.spyOn(adapter, "initialRichTextUpdate").mockResolvedValue(seedBytes);
  const files = new Map<
    string,
    { id: string; hash: string; version: string; bytes: Uint8Array }
  >();
  vi.stubGlobal("fetch", async (input: string, init: RequestInit) => {
    const url = new URL(input, "https://synthetic.test");
    const json = (value: unknown) =>
      new Response(JSON.stringify(value), {
        headers: { "content-type": "application/json" },
      });
    if (url.searchParams.get("action") === "upload") {
      const bytes = new Uint8Array(init.body as ArrayBuffer);
      const file = { id: newId(), hash: await digest(bytes), version: "1", bytes };
      files.set(file.id, file);
      return json({
        file: { id: file.id, hash: file.hash, version: file.version },
      });
    }
    const body = JSON.parse(init.body as string);
    if (body.action === "list")
      return json({
        files: [...files.values()].map(({ id, hash, version }) => ({
          id,
          hash,
          version,
        })),
      });
    if (body.action === "read")
      return new Response(files.get(body.fileId)!.bytes.slice().buffer);
    throw new Error("Unexpected synthetic operation");
  });
  const libraryId = newId();
  const session = new NotesSession("1", () => "1");
  const name = `notes-smoothness-${newId()}`;
  const key = crypto.getRandomValues(new Uint8Array(32));
  const cipher = await createNotesVault(
    key.slice(),
    JSON.stringify(["1", libraryId]),
    session
  );
  const repo = new IndexedDbNotesRepository({
    session,
    libraryId,
    bindingGeneration: 1,
    databaseName: name,
    cipher,
    fault,
  });
  await repo.registerLibrary(
    {
      format: "sylf-notes",
      formatVersion: 1,
      minimumReaderVersion: 1,
      libraryId,
      ownerRef: "1",
      bindingGeneration: 1,
      extensions: {},
    },
    {
      provider: "google-drive",
      accountId: "synthetic",
      rootId: "root",
      generation: 1,
      verifiedAt: new Date().toISOString(),
      probeHash: "0".repeat(64),
    }
  );
  const identity = await repo.library();
  const library = await NotesLibrary.fromRepository(
    { ...identity, label: "synthetic", status: "ACTIVE" },
    repo
  );
  cleanups.push(async () => {
    library.close();
    session.close();
    repo.close();
    await Dexie.delete(name);
  });
  return { library, repo };
}

function setupControllerSurface(options?: {
  fixed?: boolean;
  finger?: boolean;
  getRect?: () => DOMRect;
  navigate?: (
    dx: number,
    dy: number,
    scale: number,
    focal?: { x: number; y: number },
    phase?: "live" | "end"
  ) => void;
}) {
  const contexts = new Map<HTMLCanvasElement, MockCtx>();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    function (this: HTMLCanvasElement) {
      let ctx = contexts.get(this);
      if (!ctx) {
        ctx = createMockCtx(this);
        contexts.set(this, ctx);
      }
      return ctx as unknown as RenderingContext;
    }
  );
  const host = document.createElement("div");
  const base = document.createElement("canvas");
  const live = document.createElement("canvas");
  host.append(base, live);
  document.body.appendChild(host);
  Object.defineProperties(host, {
    clientWidth: { value: 800, configurable: true },
    clientHeight: { value: 1000, configurable: true },
  });
  host.setPointerCapture = vi.fn();
  host.releasePointerCapture = vi.fn();
  host.hasPointerCapture = vi.fn(() => true);
  host.getBoundingClientRect = () =>
    options?.getRect?.() ?? new DOMRect(0, 0, 800, 1000);

  let rafCallback: FrameRequestCallback | undefined;
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
    rafCallback = cb;
    return 1;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {
    rafCallback = undefined;
  });

  const doc = new Y.Doc();
  const model = new InkModel(doc);
  const controller = new InkController(
    host,
    base,
    live,
    model,
    800,
    1100,
    () => true,
    () => {},
    (msg) => {
      throw new Error(msg);
    },
    undefined,
    {
      fixed: options?.fixed ?? true,
      fixedZoom: 1,
      viewport: { zoom: 1, x: 0, y: 0 },
      navigate: options?.navigate,
    }
  );
  controller.setTools({
    ...defaultTools,
    finger: options?.finger ?? false,
  });
  const flushFrame = () => {
    const cb = rafCallback;
    rafCallback = undefined;
    cb?.(performance.now());
  };
  flushFrame();
  cleanups.push(() => {
    controller.close();
    model.close();
    doc.destroy();
    host.remove();
  });
  return {
    host,
    base,
    live,
    baseCtx: contexts.get(base)!,
    liveCtx: contexts.get(live)!,
    model,
    controller,
    flushFrame,
  };
}

describe("Sylf Notes handwriting smoothness & zero-interruption invariants", () => {
  it("keeps memoryPending at 0 during healthy saving writes while surfacing failed journal writes and retained capsules", async () => {
    let failWrites = false;
    const { library, repo } = await setupLibrary((point) => {
      if (failWrites && point === "before-write") {
        throw new Error("QuotaExceededError: synthetic disk full");
      }
    });
    const docId = await library.create("Physics Lecture", "notebook", null, "ink");
    const layers = await library.ensurePageLayers(docId);
    const inkLease = await library.open(docId, layers.page.pageId, "ink");
    const ink = new InkModel(inkLease.stream.doc);

    // Normal in-flight stroke writes enter "saving" with pending updates,
    // which must NOT trigger unacknowledged recovery banners (memoryPending === 0).
    ink.begin(penBrush);
    ink.append(
      Array.from({ length: 80 }, (_, i) => [
        40 + i * 2,
        100 + Math.sin(i / 4) * 10,
        0.5,
        i * 8,
        0,
        0,
        0,
        0,
      ])
    );
    expect(inkLease.stream.status().pending).toBeGreaterThan(0);
    expect(library.snapshot().memoryPending).toBe(0);
    // Explicit recovery snapshot export still captures in-flight open streams.
    expect(library.recoverySnapshots().length).toBeGreaterThan(0);

    ink.finish();
    await inkLease.stream.flush();
    expect(library.snapshot().memoryPending).toBe(0);

    // Genuine storage/quota write failure MUST surface memoryPending > 0, and clear on retry.
    failWrites = true;
    ink.begin(penBrush);
    ink.append(
      Array.from({ length: 80 }, (_, i) => [
        50 + i * 2,
        220,
        0.6,
        i * 8,
        0,
        0,
        0,
        0,
      ])
    );
    ink.finish();
    await expect(inkLease.stream.flush()).rejects.toThrow(
      /Device persistence failed/
    );
    expect(inkLease.stream.status().state).toBe("failed");
    expect(library.snapshot().memoryPending).toBeGreaterThan(0);

    failWrites = false;
    await inkLease.stream.retry();
    expect(inkLease.stream.status().state).toBe("local-durable");
    expect(library.snapshot().memoryPending).toBe(0);

    // Releasing an unflushed stream retains a capsule (memoryPending > 0) until recovered.
    ink.begin(penBrush);
    ink.append(
      Array.from({ length: 80 }, (_, i) => [
        60 + i * 2,
        320,
        0.6,
        i * 8,
        0,
        0,
        0,
        0,
      ])
    );
    ink.close();
    inkLease.release();
    expect(library.snapshot().memoryPending).toBeGreaterThan(0);
    await recoverUnacknowledged(repo);
    await library.refresh();
    expect(library.snapshot().memoryPending).toBe(0);
  });

  it("renders clamped getPredictedEvents() transiently on the live overlay without persisting predicted points", () => {
    const { host, model, controller, flushFrame } = setupControllerSurface();
    const overlaySpy = vi.spyOn(controller.renderer, "overlay");

    host.dispatchEvent(
      makePointer("pointerdown", {
        clientX: 100,
        clientY: 120,
        timeStamp: 1000,
      })
    );
    const c1 = makePointer("pointermove", {
      clientX: 112,
      clientY: 124,
      timeStamp: 1008,
    });
    const c2 = makePointer("pointermove", {
      clientX: 124,
      clientY: 128,
      timeStamp: 1016,
    });
    const validPred = makePointer("pointermove", {
      clientX: 136,
      clientY: 132,
      timeStamp: 1024,
    });
    const wildOutlierPred = makePointer("pointermove", {
      clientX: 500,
      clientY: 600,
      timeStamp: 1032,
    });
    host.dispatchEvent(
      makePointer("pointermove", {
        clientX: 124,
        clientY: 128,
        timeStamp: 1016,
        coalesced: [c1, c2],
        predicted: [validPred, wildOutlierPred],
      })
    );
    flushFrame();

    const liveCall = overlaySpy.mock.calls.find((call) => !!call[0])?.[0];
    expect(liveCall).toBeDefined();
    expect(liveCall!.points.map((p) => p[0])).toEqual([100, 112, 124]);
    // Valid lookahead point is rendered transiently; 400px outlier jump is rejected.
    expect(liveCall!.predicted?.map((p) => p[0])).toEqual([136]);

    host.dispatchEvent(
      makePointer("pointerup", {
        clientX: 130,
        clientY: 130,
        timeStamp: 1024,
      })
    );
    flushFrame();

    const committed = model.strokes();
    expect(committed).toHaveLength(1);
    // Predicted point x=136 was NEVER persisted to Yjs InkModel.
    expect(committed[0].points.map((p) => p[0])).toEqual([100, 112, 124, 130]);
    expect(overlaySpy.mock.calls.at(-1)?.[0]).toBeUndefined();
  });

  it("keeps 1-finger pan monotonic and avoids full-canvas redraws when scrolling a fixed notebook surface", () => {
    let scrollTop = 200;
    const deltas: number[] = [];
    const { host, controller, flushFrame } = setupControllerSurface({
      fixed: true,
      finger: false,
      // Host sits inside .notebookScroll, so its viewport top shifts as scrollTop changes!
      getRect: () => new DOMRect(0, -scrollTop, 800, 1000),
      navigate: (_dx, dy, scale) => {
        if (scale === 1) {
          deltas.push(dy);
          scrollTop = Math.max(0, scrollTop - dy);
        }
      },
    });
    const drawSpy = vi.spyOn(controller.renderer, "draw");
    drawSpy.mockClear();

    host.dispatchEvent(
      makePointer("pointerdown", {
        pointerId: 5,
        pointerType: "touch",
        clientX: 400,
        clientY: 600,
        timeStamp: 100,
      })
    );
    // Finger moves steadily upward on screen (600 -> 580 -> 560 -> 540 -> 520).
    for (let step = 1; step <= 4; step++) {
      host.dispatchEvent(
        makePointer("pointermove", {
          pointerId: 5,
          pointerType: "touch",
          clientX: 400,
          clientY: 600 - step * 20,
          timeStamp: 100 + step * 16,
        })
      );
      flushFrame();
    }

    // Every pan step must be -20px (monotonic upward swipe, zero moving-host oscillation)
    // and fixed-surface panning must NEVER force full-canvas stroke redraws.
    expect(deltas).toEqual([-20, -20, -20, -20]);
    expect(drawSpy).not.toHaveBeenCalled();

    host.dispatchEvent(
      makePointer("pointerup", {
        pointerId: 5,
        pointerType: "touch",
        clientX: 400,
        clientY: 520,
        timeStamp: 170,
      })
    );
    flushFrame();

    // Momentum continues in the same negative dy direction without redrawing strokes.
    expect(deltas.length).toBeGreaterThan(4);
    expect(deltas.at(-1)!).toBeLessThan(0);
    expect(drawSpy).not.toHaveBeenCalled();
  });

  it("cancels accidental 1st-finger tap dots and emits stable live/end pinch phases on a moving host", () => {
    let hostTop = 0;
    let hostScale = 1;
    const events: {
      dx: number;
      dy: number;
      scale: number;
      phase?: "live" | "end";
    }[] = [];
    const { host, model, flushFrame } = setupControllerSurface({
      fixed: true,
      finger: true,
      getRect: () =>
        new DOMRect(0, hostTop, 800 * hostScale, 1000 * hostScale),
      navigate: (dx, dy, scale, _focal, phase) => {
        events.push({ dx, dy, scale, phase });
        hostScale *= scale;
        hostTop -= 35;
      },
    });

    // Finger 1 touches down while finger drawing is enabled, starting an unflushed tap.
    host.dispatchEvent(
      makePointer("pointerdown", {
        pointerId: 10,
        pointerType: "touch",
        clientX: 300,
        clientY: 400,
        timeStamp: 200,
      })
    );
    // Finger 2 touches down 100px to the right to start a pinch-zoom.
    host.dispatchEvent(
      makePointer("pointerdown", {
        pointerId: 11,
        pointerType: "touch",
        clientX: 400,
        clientY: 400,
        timeStamp: 212,
      })
    );
    expect(model.strokes()).toHaveLength(0);

    // Spread fingers from 100px apart (300..400) to 200px apart (250..450) even as host rect moves.
    host.dispatchEvent(
      makePointer("pointermove", {
        pointerId: 10,
        pointerType: "touch",
        clientX: 250,
        clientY: 400,
        timeStamp: 228,
      })
    );
    host.dispatchEvent(
      makePointer("pointermove", {
        pointerId: 11,
        pointerType: "touch",
        clientX: 450,
        clientY: 400,
        timeStamp: 228,
      })
    );
    flushFrame();

    const product = events
      .filter((e) => e.phase === "live")
      .reduce((acc, e) => acc * e.scale, 1);
    expect(product).toBeCloseTo(2, 5);

    host.dispatchEvent(
      makePointer("pointerup", {
        pointerId: 11,
        pointerType: "touch",
        clientX: 450,
        clientY: 400,
        timeStamp: 244,
      })
    );
    expect(events.at(-1)?.phase).toBe("end");
    expect(model.strokes()).toHaveLength(0);
  });

  it("allows immediate touch panning and pinching while a stylus hovers above the screen (buttons === 0)", () => {
    const deltas: number[] = [];
    const { host, flushFrame } = setupControllerSurface({
      fixed: true,
      finger: false,
      navigate: (_dx, dy, scale) => {
        if (scale === 1) deltas.push(dy);
      },
    });

    // Stylus hovers across the page without touching down (buttons: 0).
    host.dispatchEvent(
      makePointer("pointermove", {
        pointerId: 1,
        pointerType: "pen",
        buttons: 0,
        pressure: 0,
        clientX: 220,
        clientY: 300,
        timeStamp: 500,
      })
    );

    // Immediate 1-finger touch scroll must NOT be blocked by stylus hover.
    host.dispatchEvent(
      makePointer("pointerdown", {
        pointerId: 9,
        pointerType: "touch",
        clientX: 400,
        clientY: 500,
        timeStamp: 510,
      })
    );
    host.dispatchEvent(
      makePointer("pointermove", {
        pointerId: 9,
        pointerType: "touch",
        clientX: 400,
        clientY: 460,
        timeStamp: 526,
      })
    );
    flushFrame();

    expect(deltas).toEqual([-40]);
  });

  it("validates samples via fast numeric checks with exact schema parity and renders long live strokes with single-fill Path2D prefixes", () => {
    const doc = new Y.Doc();
    const ink = new InkModel(doc);
    cleanups.push(() => {
      ink.close();
      doc.destroy();
    });

    ink.begin(penBrush);
    expect(ink.cancelUnflushed()).toBe(true);
    expect(ink.strokes()).toHaveLength(0);
    expect(ink.records.size).toBe(0);

    ink.begin(penBrush);
    expect(() =>
      ink.append([[Number.NaN, 10, 0.5, 0, 0, 0, 0, 0] as InkSample])
    ).toThrow();
    expect(() =>
      ink.append([[10, 20, 1.5, 0, 0, 0, 0, 0] as InkSample])
    ).toThrow();
    expect(() =>
      ink.append([[10, 20, 0.5, 0, 95, 0, 0, 0] as InkSample])
    ).toThrow();
    ink.finish("interrupted");

    // Incremental live stroke overlay: 600 points with translucent brush must fill a single
    // combined Path2D per frame (no alpha seam double-blending) and clear only the dirty rect.
    const base = document.createElement("canvas");
    const live = document.createElement("canvas");
    const baseCtx = createMockCtx();
    const liveCtx = createMockCtx();
    vi.spyOn(base, "getContext").mockReturnValue(
      baseCtx as unknown as RenderingContext
    );
    vi.spyOn(live, "getContext").mockReturnValue(
      liveCtx as unknown as RenderingContext
    );
    const renderer = new InkRenderer(base, live, 800, 1100);
    renderer.resize(800, 1000);

    // Calling overlay(undefined) when already clean does zero clearRect work.
    liveCtx.clearRect.mockClear();
    renderer.overlay(undefined);
    expect(liveCtx.clearRect).not.toHaveBeenCalled();

    const longPoints: InkSample[] = Array.from({ length: 600 }, (_, i) => [
      60 + (i % 200) * 2.5,
      120 + Math.floor(i / 200) * 40 + Math.sin(i / 6) * 8,
      0.5,
      i * 4,
      0,
      0,
      0,
      0,
    ]);
    renderer.overlay({
      id: "live-stroke-1",
      style: penBrush,
      points: longPoints.slice(0, 500),
    });
    liveCtx.fill.mockClear();
    liveCtx.clearRect.mockClear();

    renderer.overlay({
      id: "live-stroke-1",
      style: penBrush,
      points: longPoints,
      predicted: [[565, 205, 0.5, 2404, 0, 0, 0, 0]],
    });
    expect(liveCtx.fill).toHaveBeenCalledTimes(1);
    expect(liveCtx.clearRect).toHaveBeenCalledTimes(1);
    const [, , clearedW, clearedH] = liveCtx.clearRect.mock.calls[0];
    expect(clearedW).toBeLessThan(live.width);
    expect(clearedH).toBeLessThan(live.height);

    liveCtx.clearRect.mockClear();
    renderer.overlay(undefined);
    expect(liveCtx.clearRect).toHaveBeenCalledTimes(1);
    liveCtx.clearRect.mockClear();
    renderer.overlay(undefined);
    expect(liveCtx.clearRect).not.toHaveBeenCalled();
  });
});
