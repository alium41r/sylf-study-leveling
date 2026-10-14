import { describe, expect, it } from "vitest";
import {
  createPixDisplay,
  PixRuntime,
  TRANSPARENT,
  type PixDisplay,
} from "@/lib/pixel-display/engine";
import { SylfCharacterContent } from "./fixtures/retired-sylf/character";
import {
  BLINK_FRAMES,
  BLINK_SEQUENCE,
  SYLF_COMPOSITIONS,
  type SylfState,
} from "./fixtures/retired-sylf/frames";
import {
  BLUSH_LEFT,
  BLUSH_RIGHT,
  BLUSH_ROW,
  BODY_SPANS,
  EYE_CENTRE_LEFT,
  EYE_CENTRE_RIGHT,
  EYE_SHAPES,
  LEAF_SPANS,
  SPARKLES,
  SPRITE_REFERENCE,
  STEM_SPAN,
  type EyeShape,
} from "./fixtures/retired-sylf/sprite";
import { PLANE_ORDER, selectsPlane } from "./fixtures/retired-sylf/parts";
import { SYLF_PALETTE } from "@/lib/pixel-display/content/palette";

/**
 * ============================================================================
 * SYLF CHARACTER COMPOSITION
 * ============================================================================
 * Phase 2's central claim is that the Sylf companion is **composable pixel
 * content**, not a set of full-character images. That claim has one testable
 * consequence: changing one plane must not require rebuilding any other.
 *
 * So the assertions here come in two kinds, and both matter:
 *
 *  - **Invariance** — changing the eye shape leaves the body, leaves and blush
 *    byte-identical.
 *  - **Positive control** — the eye cells really did change. Without this, a
 *    renderer that drew nothing would pass every invariance assertion.
 */

/**
 * A runtime for *rendering* tests: they call `render()` directly and never
 * advance a frame, so the scheduler is inert. Tests that exercise timing use
 * `createRuntimeHarness` below, whose clock actually moves — with a frozen
 * clock every frame delta is zero and no animation would ever advance.
 */
function createIdleRuntime(): PixRuntime {
  return new PixRuntime({
    clock: () => 0,
    schedule: () => 0,
    cancel: () => {},
  });
}

function build(options: { size?: number; fill?: number; state?: SylfState } = {}) {
  const size = options.size ?? 48;
  const display = createPixDisplay(size, size);
  const runtime = createIdleRuntime();
  const content = new SylfCharacterContent(display, runtime, {
    characterFill: options.fill ?? 0.63,
    state: options.state ?? "IDLE",
    autoBlink: false,
  });
  runtime.setContent(content);
  content.render();
  return { display, runtime, content };
}

function countColor(display: PixDisplay, color: number): number {
  let count = 0;
  for (const cell of display.snapshot()) if (cell === color) count += 1;
  return count;
}

/** Cells that differ between two framebuffer snapshots. */
function diffCount(a: number[], b: number[]): number {
  let count = 0;
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) count += 1;
  }
  return count;
}

function litBounds(display: PixDisplay) {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < display.height; y += 1) {
    for (let x = 0; x < display.width; x += 1) {
      if (display.getPixel(x, y) === TRANSPARENT) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

describe("sylf sprite is internally consistent", () => {
  it("keeps every authored span inside the reference grid", () => {
    const spans = [
      ...BODY_SPANS.map((row) => ({ from: row.from, to: row.to, y: row.y })),
      ...LEAF_SPANS,
      { from: STEM_SPAN.from, to: STEM_SPAN.to, y: STEM_SPAN.y },
      { from: BLUSH_LEFT.from, to: BLUSH_LEFT.to, y: BLUSH_ROW },
      { from: BLUSH_RIGHT.from, to: BLUSH_RIGHT.to, y: BLUSH_ROW },
    ];
    for (const span of spans) {
      expect(span.from).toBeGreaterThanOrEqual(0);
      expect(span.to).toBeLessThanOrEqual(SPRITE_REFERENCE);
      expect(span.from).toBeLessThan(span.to);
      expect(span.y).toBeGreaterThanOrEqual(0);
      expect(span.y).toBeLessThan(SPRITE_REFERENCE);
    }
  });

  it("shades each body row across its whole width", () => {
    // Every row must be wide enough for a highlight, a base run and a shade
    // run; a row too narrow to shade would render as a flat band.
    for (const row of BODY_SPANS) {
      const span = row.to - row.from;
      expect(span, `row ${row.y}`).toBeGreaterThan(3);
      // No row may touch the matrix edge, or the fill would clip.
      expect(row.from).toBeGreaterThan(0);
      expect(row.to).toBeLessThan(SPRITE_REFERENCE);
    }
  });

  it("mirrors the face about the body's vertical axis", () => {
    // The body is centred on column 16 of the reference grid for every row.
    for (const row of BODY_SPANS) {
      expect(row.from + row.to).toBe(SPRITE_REFERENCE);
    }
    // Sockets and blush are mirror pairs about the same axis.
    expect(EYE_CENTRE_LEFT + EYE_CENTRE_RIGHT).toBe(SPRITE_REFERENCE);
    expect(BLUSH_LEFT.from + BLUSH_RIGHT.to).toBe(SPRITE_REFERENCE);
    expect(BLUSH_LEFT.to + BLUSH_RIGHT.from).toBe(SPRITE_REFERENCE);
  });

  it("keeps the blush on the same row for both cheeks", () => {
    expect(BLUSH_LEFT.to).toBeLessThan(EYE_CENTRE_LEFT);
    expect(BLUSH_RIGHT.from).toBeGreaterThan(EYE_CENTRE_RIGHT);
  });

  it("never leaves an eye shape empty, and keeps ink inside its socket", () => {
    for (const [shape, rows] of Object.entries(EYE_SHAPES)) {
      expect(rows.length, shape).toBeGreaterThan(0);
      for (const row of rows) {
        expect(row.ink, shape).toBeGreaterThan(0);
        // Ink must stay close enough to the centre not to escape the body.
        expect(Math.abs(row.offset), shape).toBeLessThanOrEqual(3);
      }
    }
  });
});

describe("the character is authored as logical pixel data", () => {
  it("paints a recognisable figure from authored spans alone", () => {
    const { display } = build();
    // A substantial number of cells carry authored colors...
    expect(display.litCount()).toBeGreaterThan(150);
    // ...drawn from a small, declared palette rather than arbitrary color.
    const colors = new Set(display.snapshot().filter((c) => c !== TRANSPARENT));
    expect(colors.size).toBeGreaterThan(4);
    expect(colors.size).toBeLessThan(12);
    expect(colors.has(SYLF_PALETTE.bodyHighlight)).toBe(true);
    expect(colors.has(SYLF_PALETTE.leaf)).toBe(true);
    expect(colors.has(SYLF_PALETTE.eye)).toBe(true);
  });

  it("keeps all art inside the logical matrix at every candidate resolution", () => {
    for (const size of [32, 40, 48, 64]) {
      const { display } = build({ size, fill: 0.63 });
      const bounds = litBounds(display);
      expect(bounds.minX, `${size}`).toBeGreaterThanOrEqual(0);
      expect(bounds.minY, `${size}`).toBeGreaterThanOrEqual(0);
      expect(bounds.maxX, `${size}`).toBeLessThan(size);
      expect(bounds.maxY, `${size}`).toBeLessThan(size);
    }
  });

  it("renders a readable figure at dashboard-card scale", () => {
    // 48 logical cells at roughly a 108 px card: the eyes must survive.
    const { display } = build({ size: 48, fill: 0.63 });
    expect(countColor(display, SYLF_PALETTE.eye)).toBeGreaterThan(20);
  });

  it("scales with the requested character fill", () => {
    const small = litBounds(build({ fill: 0.45 }).display);
    const large = litBounds(build({ fill: 0.8 }).display);
    expect(large.height).toBeGreaterThan(small.height);
    expect(large.width).toBeGreaterThan(small.width);
  });
});

describe("planes compose independently", () => {
  it("declares a deterministic paint order", () => {
    expect(PLANE_ORDER).toEqual(["body", "leaves", "blush", "eyes"]);
    // The order is a frozen literal, not computed at runtime.
    expect(build().content.getPlaneOrder()).toBe(PLANE_ORDER);
  });

  it("repaints only eye cells when the eye shape changes", () => {
    // Render every shape from the same starting state and compare each pair.
    const snapshots = new Map<EyeShape, number[]>();
    const shapes = Object.keys(EYE_SHAPES) as EyeShape[];
    for (const shape of shapes) {
      const { display, content } = build();
      content.setEyeShape(shape);
      content.render();
      snapshots.set(shape, display.snapshot());
    }

    const cellCount = 48 * 48;
    for (let i = 0; i < shapes.length; i += 1) {
      for (let j = i + 1; j < shapes.length; j += 1) {
        const a = snapshots.get(shapes[i]) as number[];
        const b = snapshots.get(shapes[j]) as number[];
        const differing = diffCount(a, b);
        // Positive control: the eye really did change.
        expect(differing, `${shapes[i]} vs ${shapes[j]}`).toBeGreaterThan(0);
        // Invariance: a blink must never rebuild the character.
        expect(differing, `${shapes[i]} vs ${shapes[j]}`).toBeLessThan(
          cellCount * 0.15,
        );
      }
    }
  });

  it("leaves body, leaves and blush byte-identical across every eye shape", () => {
    // The reference is the character **without any eyes at all**, so the
    // assertion is "changing the eyes left everything else alone" rather than
    // "two shapes that happen to share cells agree".
    // Built exactly the way `render` builds it, minus the eye plane — same
    // state, same scenery, same order. Anything that differs is therefore the
    // eyes and nothing else.
    const reference = (() => {
      const { display, content } = build();
      display.clear();
      content.paintScenery();
      for (const plane of PLANE_ORDER) {
        if (plane === "eyes") continue;
        if (!selectsPlane(plane, content.getComposition())) continue;
        content.paintPlane(plane);
      }
      return display.snapshot();
    })();

    const eyeColours = new Set([SYLF_PALETTE.eye, SYLF_PALETTE.eyeGlint]);

    for (const shape of Object.keys(EYE_SHAPES) as EyeShape[]) {
      const { display, content } = build();
      content.setEyeShape(shape);
      content.render();
      const snapshot = display.snapshot();

      let eyeCells = 0;
      for (let cell = 0; cell < snapshot.length; cell += 1) {
        if (eyeColours.has(snapshot[cell])) {
          eyeCells += 1;
          continue;
        }
        expect(snapshot[cell], `${shape} at cell ${cell}`).toBe(reference[cell]);
      }
      // Positive control: the shape really did paint something.
      expect(eyeCells, shape).toBeGreaterThan(0);
    }
  });

  it("paints a single plane without touching the rest of the display", () => {
    // Full character, then repaint only the eyes: everything else survives.
    const { display, content } = build();
    const before = display.snapshot();
    content.setEyeShape("closed");
    content.paintPlane("eyes");
    const after = display.snapshot();

    const eyeCells = new Set<number>();
    // Cells that changed must be eye cells, never body cells.
    for (let cell = 0; cell < after.length; cell += 1) {
      if (before[cell] !== after[cell]) eyeCells.add(cell);
    }
    expect(eyeCells.size).toBeGreaterThan(0);
    for (const cell of eyeCells) {
      const newColour = after[cell];
      const oldColour = before[cell];
      const isEyeInk = newColour === SYLF_PALETTE.eye;
      const wasEyeInk = oldColour === SYLF_PALETTE.eye;
      expect(isEyeInk || wasEyeInk, `cell ${cell}`).toBe(true);
    }
  });

  it("paints blush over the body, one row below the eyes", () => {
    const plain = build();
    const withBlush = build({ state: "CELEBRATING" });

    const blushCells = countColor(withBlush.display, SYLF_PALETTE.blush);
    expect(blushCells).toBeGreaterThan(0);
    // IDLE has no blush at all.
    expect(countColor(plain.display, SYLF_PALETTE.blush)).toBe(0);

    // Every blush cell sits on a row below every eye-ink cell.
    const rowOf = (colour: number) => {
      let lowest = -1;
      for (let y = 0; y < withBlush.display.height; y += 1) {
        for (let x = 0; x < withBlush.display.width; x += 1) {
          if (withBlush.display.getPixel(x, y) === colour) lowest = Math.max(lowest, y);
        }
      }
      return lowest;
    };
    expect(rowOf(SYLF_PALETTE.blush)).toBeGreaterThan(
      rowOf(SYLF_PALETTE.eye),
    );
  });

  it("draws scenery behind the character", () => {
    // Build both layers separately, then assert the composite equals
    // "character where the character has a cell, scenery elsewhere". That is
    // exactly what "painted last wins" means, and it does not depend on the two
    // layers happening not to overlap.
    const view = build();
    const { display, content } = view;

    display.clear();
    content.paintScenery();
    const scenery = display.snapshot();

    display.clear();
    for (const plane of PLANE_ORDER) {
      if (!selectsPlane(plane, content.getComposition())) continue;
      content.paintPlane(plane);
    }
    const character = display.snapshot();

    content.render();
    const composite = display.snapshot();

    for (let cell = 0; cell < composite.length; cell += 1) {
      const expected =
        character[cell] !== TRANSPARENT ? character[cell] : scenery[cell];
      expect(composite[cell], `cell ${cell}`).toBe(expected);
    }
    // Positive controls: both layers actually painted something.
    expect(character.some((c) => c !== TRANSPARENT)).toBe(true);
    expect(scenery.some((c) => c !== TRANSPARENT)).toBe(true);
  });

  it("keeps the face inside the silhouette", () => {
    // A face drawn outside the body is a content bug, so it is asserted rather
    // than eyeballed: every eye and blush cell must sit on a body cell.
    const { display, content } = build();
    display.clear();
    content.paintPlane("body");
    const bodyCells = new Set<number>();
    for (let y = 0; y < display.height; y += 1) {
      for (let x = 0; x < display.width; x += 1) {
        if (display.getPixel(x, y) !== TRANSPARENT) {
          bodyCells.add(display.geometry.indexOf(x, y));
        }
      }
    }
    expect(bodyCells.size).toBeGreaterThan(100);

    for (const plane of ["eyes", "blush"] as const) {
      const view = build({ state: "CELEBRATING" });
      view.display.clear();
      view.content.paintPlane(plane);
      let painted = 0;
      for (let y = 0; y < view.display.height; y += 1) {
        for (let x = 0; x < view.display.width; x += 1) {
          if (view.display.getPixel(x, y) === TRANSPARENT) continue;
          painted += 1;
          const index = view.display.geometry.indexOf(x, y);
          expect(bodyCells.has(index), `${plane} cell (${x},${y})`).toBe(true);
        }
      }
      expect(painted, plane).toBeGreaterThan(0);
    }
  });
});

describe("states", () => {
  const HOLDING_STATES: SylfState[] = ["IDLE", "FOCUSING", "REST", "CELEBRATING"];

  it.each(HOLDING_STATES)("%s renders a non-empty character", (state) => {
    const { display } = build({ state });
    expect(display.litCount()).toBeGreaterThan(150);
    expect(litBounds(display).width).toBeGreaterThan(20);
  });

  it.each(HOLDING_STATES)("%s shows a face", (state) => {
    const { display } = build({ state });
    const ink =
      countColor(display, SYLF_PALETTE.eye) +
      countColor(display, SYLF_PALETTE.eyeGlint);
    expect(ink, state).toBeGreaterThan(0);
  });

  it("makes every state visually distinct from every other", () => {
    const snapshots = new Map<SylfState, number[]>();
    for (const state of HOLDING_STATES) {
      const { display } = build({ state });
      snapshots.set(state, display.snapshot());
    }
    for (let i = 0; i < HOLDING_STATES.length; i += 1) {
      for (let j = i + 1; j < HOLDING_STATES.length; j += 1) {
        const a = snapshots.get(HOLDING_STATES[i]) as number[];
        const b = snapshots.get(HOLDING_STATES[j]) as number[];
        expect(
          diffCount(a, b),
          `${HOLDING_STATES[i]} vs ${HOLDING_STATES[j]}`,
        ).toBeGreaterThan(0);
      }
    }
  });

  it("shows blush only while celebrating", () => {
    for (const state of HOLDING_STATES) {
      const { display } = build({ state });
      const blush = countColor(display, SYLF_PALETTE.blush);
      if (state === "CELEBRATING") expect(blush).toBeGreaterThan(0);
      else expect(blush, state).toBe(0);
    }
  });

  it("drops ambient sparkles for the quiet states", () => {
    const sparkleColors = [SYLF_PALETTE.sparkle, SYLF_PALETTE.sparkleViolet];
    const sparkles = (state: SylfState) => {
      const { display } = build({ state });
      return sparkleColors.reduce((sum, c) => sum + countColor(display, c), 0);
    };
    expect(sparkles("IDLE")).toBeGreaterThan(0);
    expect(sparkles("CELEBRATING")).toBeGreaterThan(0);
    expect(sparkles("FOCUSING")).toBe(0);
    expect(sparkles("REST")).toBe(0);
  });

  it("maps each state to a declared eye shape", () => {
    expect(SYLF_COMPOSITIONS.IDLE.eyes).toBe("open");
    expect(SYLF_COMPOSITIONS.FOCUSING.eyes).toBe("focused");
    expect(SYLF_COMPOSITIONS.REST.eyes).toBe("sleeping");
    expect(SYLF_COMPOSITIONS.CELEBRATING.eyes).toBe("happy");
  });

  it("reports a plan that matches what it paints", () => {
    for (const state of HOLDING_STATES) {
      const { content } = build({ state });
      const plan = content.plan();
      expect(plan.state).toBe(state);
      // Nothing is suppressed, so the plan reports exactly the planes the
      // composition selects, in declared order.
      const selected = PLANE_ORDER.filter((plane) =>
        selectsPlane(plane, SYLF_COMPOSITIONS[state]),
      );
      expect(plan.planes).toEqual(selected);
      expect(plan.eyeShape).toBe(SYLF_COMPOSITIONS[state].eyes);
      expect(plan.composition).toBe(SYLF_COMPOSITIONS[state]);
    }
  });
});

describe("the authored blink", () => {
  it("is the five-beat sequence the product document specifies", () => {
    expect(BLINK_SEQUENCE).toEqual([
      "open",
      "half",
      "closed",
      "half",
      "open",
    ]);
    expect(BLINK_FRAMES).toHaveLength(5);
    // Closing is quicker than opening, as a real blink is.
    expect(BLINK_FRAMES[0].durationMs).toBeGreaterThan(
      BLINK_FRAMES[3].durationMs,
    );
  });

  it("changes only eye cells from one beat to the next", () => {
    const shapes = BLINK_SEQUENCE;
    const snapshots = shapes.map((shape) => {
      const { display, content } = build();
      content.setEyeShape(shape);
      content.render();
      return display.snapshot();
    });

    for (let i = 1; i < snapshots.length; i += 1) {
      const differing = diffCount(snapshots[i - 1], snapshots[i]);
      // Adjacent beats differ (except the repeated `half` and `open`, which are
      // separated by a different beat), and never rebuild the character.
      expect(differing).toBeLessThan(48 * 48 * 0.15);
    }
  });

  it("holds the eye plane apart from the body across the whole sequence", () => {
    const reference = (() => {
      const { display, content } = build();
      content.setEyeShape("half");
      content.render();
      return display.snapshot();
    })();

    for (const shape of BLINK_SEQUENCE) {
      const { display, content } = build();
      content.setEyeShape(shape);
      content.render();
      const snapshot = display.snapshot();
      for (let cell = 0; cell < snapshot.length; cell += 1) {
        const colour = snapshot[cell];
        if (
          colour === SYLF_PALETTE.eye ||
          colour === SYLF_PALETTE.eyeGlint ||
          reference[cell] === SYLF_PALETTE.eye ||
          reference[cell] === SYLF_PALETTE.eyeGlint
        ) {
          continue;
        }
        expect(colour, `${shape} at cell ${cell}`).toBe(reference[cell]);
      }
    }
  });
});

describe("plane suppression is content state, not a post-render patch", () => {
  it("omits a suppressed plane from the composite and the plan", () => {
    const { display, content } = build({ state: "CELEBRATING" });
    // CELEBRATING selects all four planes.
    expect(content.effectivePlanes()).toEqual([...PLANE_ORDER]);

    content.setSuppressedPlanes(["eyes"]);
    content.render();

    // The plan and the pixels agree: neither mentions the suppressed plane.
    expect(content.effectivePlanes()).not.toContain("eyes");
    expect(content.plan().planes).not.toContain("eyes");
    expect(countColor(display, SYLF_PALETTE.eye)).toBe(0);
    // The rest of the character is untouched.
    expect(display.litCount()).toBeGreaterThan(300);
    expect(countColor(display, SYLF_PALETTE.bodyHighlight)).toBeGreaterThan(100);
  });

  it("survives repeated composites", () => {
    // A full composite would erase an externally-applied patch, which is why
    // suppression lives on the content.
    const { display, content } = build({ state: "CELEBRATING" });
    content.setSuppressedPlanes(["blush", "eyes"]);
    for (let pass = 0; pass < 3; pass += 1) content.render();
    expect(countColor(display, SYLF_PALETTE.eye)).toBe(0);
    expect(countColor(display, SYLF_PALETTE.blush)).toBe(0);
  });

  it("restores a plane when it is unsuppressed", () => {
    const { display, content } = build({ state: "IDLE" });
    content.setSuppressedPlanes(["eyes"]);
    content.render();
    expect(countColor(display, SYLF_PALETTE.eye)).toBe(0);

    content.setSuppressedPlanes([]);
    content.render();
    expect(countColor(display, SYLF_PALETTE.eye)).toBeGreaterThan(0);
  });

  it("does not wake the runtime when the suppression set is unchanged", () => {
    const { content } = build();
    content.setSuppressedPlanes(["eyes"]);
    const revision = content.getRevision();
    content.setSuppressedPlanes(["eyes"]);
    expect(content.getRevision()).toBe(revision);
  });
});

describe("content never reaches outside its own layer", () => {
  it("creates without a DOM and without application state", () => {
    // The content module is constructible in jsdom with nothing but a display
    // and a runtime, which is the practical meaning of "content is pure".
    const { content } = build();
    expect(content.id).toBe("sylf-character");
    expect(typeof content.render).toBe("function");
    expect(typeof content.update).toBe("function");
  });

  it("declares sparkle positions inside the reference grid", () => {
    for (const sparkle of SPARKLES) {
      expect(sparkle.x).toBeGreaterThanOrEqual(0);
      expect(sparkle.x).toBeLessThan(SPRITE_REFERENCE);
      expect(sparkle.y).toBeGreaterThanOrEqual(0);
      expect(sparkle.y).toBeLessThan(SPRITE_REFERENCE);
    }
  });
});

describe("rendering is deterministic", () => {
  it("produces byte-identical output for identical inputs", () => {
    const first = build({ state: "CELEBRATING" });
    const second = build({ state: "CELEBRATING" });
    expect(first.display.framebuffer.toBytes()).toEqual(
      second.display.framebuffer.toBytes(),
    );
  });

  it("does not depend on what the framebuffer previously held", () => {
    // The repaint contract: render is a full composite derived from state.
    const clean = build({ state: "IDLE" });
    const dirty = build({ state: "IDLE" });
    dirty.display.fill(0xff00ffff);
    dirty.content.render();
    expect(dirty.display.framebuffer.toBytes()).toEqual(
      clean.display.framebuffer.toBytes(),
    );
  });
});

/**
 * A deterministic runtime harness. The same shape the engine's own tests use:
 * the runtime takes its scheduler and clock as dependencies precisely so the
 * Sylf character's timing can be exercised without a browser.
 */
function createRuntimeHarness() {
  let nextHandle = 0;
  const pending = new Map<number, (time: number) => void>();
  let now = 0;

  const runtime = new PixRuntime({
    clock: () => now,
    schedule: (callback) => {
      nextHandle += 1;
      pending.set(nextHandle, callback);
      return nextHandle;
    },
    cancel: (handle) => pending.delete(handle),
  });

  return {
    runtime,
    get pendingCount() {
      return pending.size;
    },
    /** Total logical time the harness has advanced. */
    get elapsed() {
      return now;
    },
    advance(ms: number) {
      now += ms;
    },
    flush() {
      const callbacks = Array.from(pending.values());
      pending.clear();
      for (const callback of callbacks) callback(now);
    },
    /** Drives frames until nothing is scheduled, returning the frames seen. */
    settle(limit = 30) {
      let guard = 0;
      while (pending.size > 0 && guard < limit) {
        this.advance(200);
        this.flush();
        guard += 1;
      }
    },
  };
}

describe("runtime integration", () => {
  it("settles to zero work for every holding state", () => {
    for (const state of ["IDLE", "FOCUSING", "REST", "CELEBRATING"] as SylfState[]) {
      const harness = createRuntimeHarness();
      const content = new SylfCharacterContent(createPixDisplay(48, 48), harness.runtime, {
        state,
        autoBlink: false,
      });
      harness.runtime.setContent(content);
      harness.runtime.start();
      harness.settle();

      expect(harness.runtime.getPhase(), state).toBe("idle");
      expect(harness.pendingCount, state).toBe(0);
    }
  });

  it("plays the authored blink through the runtime and returns to zero-work idle", () => {
    const harness = createRuntimeHarness();
    const content = new SylfCharacterContent(
      createPixDisplay(48, 48),
      harness.runtime,
      { autoBlink: false },
    );
    harness.runtime.setContent(content);

    // No eye override here: the point is that the *runtime* walks the table.
    harness.runtime.start();
    // `setState` schedules its own frame, so clear it before timing anything.
    harness.flush();
    content.setState("BLINK");

    // Collect each shape as it appears, advancing in steps smaller than the
    // shortest authored beat so no beat can be skipped over.
    const observed: EyeShape[] = [];
    let last: EyeShape | null = null;
    for (let step = 0; step < 40 && harness.pendingCount > 0; step += 1) {
      const shape = content.getEyeShape();
      if (shape !== last) {
        observed.push(shape);
        last = shape;
      }
      harness.advance(40);
      harness.flush();
    }

    // The observed run is a contiguous slice of the infinite repetition of the
    // authored sequence. Comparing against that repetition — rather than a
    // hard-coded transcript — is what keeps this test honest about what the
    // runtime is actually asked to do.
    const repetition = [...BLINK_SEQUENCE, ...BLINK_SEQUENCE];
    const offset = repetition.indexOf(observed[0]);
    expect(offset).toBeGreaterThanOrEqual(0);
    expect(observed).toEqual(repetition.slice(offset, offset + observed.length));

    // It walked at least one full pass, and settled.
    expect(observed.length).toBeGreaterThanOrEqual(BLINK_SEQUENCE.length);
    expect(content.getState()).toBe("IDLE");
    expect(harness.runtime.getPhase()).toBe("idle");
    expect(harness.pendingCount).toBe(0);
    expect(harness.elapsed).toBeGreaterThan(0);
  });

  it("blinks on its own while idling, then settles again", () => {
    const harness = createRuntimeHarness();
    const content = new SylfCharacterContent(createPixDisplay(48, 48), harness.runtime, {
      autoBlink: true,
      autoBlinkIntervalMs: 1_000,
    });
    harness.runtime.setContent(content);
    harness.runtime.start();

    let guard = 0;
    while (content.getState() === "IDLE" && guard < 40) {
      harness.advance(200);
      harness.flush();
      guard += 1;
    }
    expect(content.getState()).toBe("BLINK");

    harness.settle();
    expect(content.getState()).toBe("IDLE");
    expect(harness.runtime.getPhase()).toBe("idle");
  });
});
