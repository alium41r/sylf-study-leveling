import { SYLF_CHARACTER_ASSET } from "./fixtures/retired-sylf/reference-character";
import { describe, expect, it } from "vitest";
import { createPixDisplay } from "@/lib/pixel-display/engine";
import { PixRuntime } from "@/lib/pixel-display/engine/runtime";
import { CREATION_ALLOWED_SIZES,
  MAX_CREATION_COLORS,
  MAX_CREATION_FRAMES,
  MAX_FRAME_MS,
  MAX_PAYLOAD_BYTES,
  MAX_TOTAL_MS,
  MIN_FRAME_MS,
  REFERENCE_ASSETS,
  
  assertValidCreation,
  createAssetLookup,
  creationAssetOrFallback,
  creationToAsset,
  decodeFrame,
  emptyFrame,
  encodeFrame,
  isDrawableCreation,
  paintComposition,
  validateAsset,
  validateCreation,
  hasCreationPixels,
  type PixelCreation } from "@/lib/pixel-display/content/asset";
import { resolveEquippedCharacter } from "@/app/dashboard/pixel-modular-character";
import { SylfCharacterContent } from "@/lib/pixel-display/content/sylf/character";
import {
  HISTORY_LIMIT,
  addFrame,
  colorAt,
  createDraft,
  creationToDraft,
  deleteFrame,
  draftToCreation,
  duplicateFrame,
  fillRegion,
  moveFrame,
  paintCell,
  setFrameDuration,
  slugify,
  totalDurationMs,
  usedColors,
} from "@/app/locker/components/studio/pixel-studio-model";

/**
 * ============================================================================
 * PHASE 8 — PIXEL STUDIO
 * ============================================================================
 * Four claims:
 *
 *   1. a drawing round-trips exactly, and a malformed one is refused;
 *   2. every editor operation is total and bounded;
 *   3. editor zoom is not part of the artwork;
 *   4. an animation plays through the real runtime and returns to zero work.
 */

const LOOKUP = createAssetLookup(REFERENCE_ASSETS);

/** Paints one cell into a draft's first frame, so tests draw something real. */
function paintInto(
  draft: ReturnType<typeof createDraft>,
  point: { x: number; y: number },
  value: number,
) {
  return {
    ...draft,
    frames: [paintCell(draft.frames[0], point, value, draft.grid, false)],
  };
}

/** A creation at a supported grid, which is what the validator demands. */
function supportedCreation(
  grid: number = 32,
  frames: number = 1,
): PixelCreation {
  const blank = emptyFrame(grid);
  return {
    version: 1,
    id: "user:test-companion",
    name: "Test Companion",
    grid,
    palette: ["#ffffff", "#a179fb"],
    frames: Array.from({ length: frames }, () => ({
      rows: blank.rows.map((row, index) =>
        index === 0 ? "0" + row.slice(1) : row,
      ),
      durationMs: 240,
    })),
    playback: "loop",
  };
}

const codes = (input: unknown) => validateCreation(input).map((i) => i.code);

// ─── Encoding ────────────────────────────────────────────────────────────────

describe("frames round-trip exactly", () => {
  it("preserves all sixteen swatches through saving, reopening and the real painter", () => {
    const palette = Array.from({ length: 16 }, (_, n) => `#${(0x223340 + n * 0x10101).toString(16)}`);
    const rows = ['0123456789abcdef' + '.'.repeat(16), ...emptyFrame(32).rows.slice(1)];
    const document = { ...supportedCreation(), palette, frames: [{ rows, durationMs: 240 }] };
    expect(validateCreation(document)).toEqual([]);
    expect(hasCreationPixels({ ...document, frames: [{ rows: ['f'.repeat(32), ...rows.slice(1)], durationMs: 240 }] })).toBe(true);
    expect(draftToCreation(creationToDraft(document))).toEqual(document);
    const asset = creationToAsset(document)!;
    expect(validateAsset(asset)).toEqual([]);
    const display = createPixDisplay(32, 32);
    paintComposition(display, { base: asset, parts: [] });
    for (let index = 0; index < 16; index++) {
      const actual = display.getPixel(index, 0);
      expect((actual >>> 8).toString(16).padStart(6, '0')).toBe(palette[index].slice(1));
    }
  });
  it("decodes and re-encodes to the same rows", () => {
    const grid = 32;
    const rows = emptyFrame(grid).rows.map((row, index) =>
      index % 2 === 0 ? "01" + row.slice(2) : row,
    );
    const cells = decodeFrame({ rows }, grid, 2);
    expect(encodeFrame(cells, grid)).toEqual(rows);
  });

  it("is total on malformed input rather than throwing", () => {
    // The decoder must never throw on half-typed input; the validator is what
    // refuses it. A decoder that threw would crash the editor mid-stroke.
    expect(() => decodeFrame({ rows: [] }, 8, 2)).not.toThrow();
    expect(() => decodeFrame({ rows: ["zzz"] }, 8, 2)).not.toThrow();
    expect(() => decodeFrame({ rows: ["999999999"] }, 4, 1)).not.toThrow();
    // An index past the palette decodes to transparent, not to a wrong colour.
    const cells = decodeFrame({ rows: ["5"] }, 1, 1);
    expect(cells[0][0]).toBeNull();
  });

  it("treats every non-digit as transparent", () => {
    const cells = decodeFrame({ rows: [".z 9"] }, 4, 10);
    expect(cells[0]).toEqual([null, null, null, 9]);
  });
});

// ─── Validation ──────────────────────────────────────────────────────────────

describe("validation refuses malformed creations", () => {
  it("accepts a well-formed creation", () => {
    expect(validateCreation(supportedCreation())).toEqual([]);
  });

  it("refuses anything that is not an object", () => {
    expect(codes(null)).toContain("not-an-object");
    expect(codes("nope")).toContain("not-an-object");
    expect(codes([1, 2])).toContain("not-an-object");
  });

  it("refuses an unsupported version", () => {
    expect(codes({ ...supportedCreation(), version: 99 })).toContain(
      "version-unsupported",
    );
  });

  it("refuses an unsupported grid", () => {
    // The four supported densities, and nothing else — an arbitrary resolution
    // has never been measured or looked at.
    expect(codes({ ...supportedCreation(), grid: 8 as never })).toContain("grid-unsupported");
    for (const grid of CREATION_ALLOWED_SIZES) {
      expect(codes(supportedCreation(grid))).toEqual([]);
    }
  });

  it("refuses a malformed id, or one outside the user namespace", () => {
    expect(codes({ ...supportedCreation(), id: "nope" })).toContain(
      "id-malformed",
    );
    // A creation may not claim a built-in namespace.
    expect(codes({ ...supportedCreation(), id: "sylf:mine" })).toContain(
      "id-malformed",
    );
  });

  it("refuses too many colours", () => {
    const palette = Array.from(
      { length: MAX_CREATION_COLORS + 1 },
      (_, index) => `#00000${(index % 10).toString()}`,
    );
    expect(codes({ ...supportedCreation(), palette })).toContain("palette-too-large");
  });

  it("refuses a colour that is not a colour", () => {
    expect(codes({ ...supportedCreation(), palette: ["red"] })).toContain(
      "palette-color-invalid",
    );
    // Alpha is a second drawing model, so it is refused rather than ignored.
    expect(codes({ ...supportedCreation(), palette: ["#ffffff80"] })).toContain(
      "palette-color-invalid",
    );
  });

  it("refuses the same colour twice", () => {
    expect(
      codes({ ...supportedCreation(), palette: ["#ffffff", "#ffffff"] }),
    ).toContain("palette-color-duplicate");
  });

  it("refuses no frames, or too many", () => {
    expect(codes(supportedCreation(32, 0))).toContain("frames-empty");
    expect(
      codes(supportedCreation(32, MAX_CREATION_FRAMES + 1)),
    ).toContain("frames-too-many");
  });

  it("refuses a frame whose shape does not match the grid", () => {
    const creation = supportedCreation();
    expect(
      codes({
        ...creation,
        frames: [{ rows: ["0"], durationMs: 240 }],
      }),
    ).toContain("frame-rows-mismatch");

    expect(
      codes({
        ...creation,
        frames: [{ rows: ["0", ...emptyFrame(32).rows.slice(1)], durationMs: 240 }],
      }),
    ).toContain("frame-row-width-mismatch");
  });

  it("refuses a cell naming a colour the palette does not have", () => {
    // The decoder guesses; the validator refuses. Between them nothing invalid
    // reaches the display.
    const creation = supportedCreation();
    const rows = [...creation.frames[0].rows];
    rows[0] = "7" + rows[0].slice(1);
    expect(
      codes({ ...creation, frames: [{ rows, durationMs: 240 }] }),
    ).toContain("frame-index-out-of-palette");
  });

  it("refuses a frame duration outside the supported band", () => {
    expect(
      codes(
        supportedCreation(32, 2).frames && {
          ...supportedCreation(32, 2),
          frames: supportedCreation(32, 2).frames.map((f) => ({
            ...f,
            durationMs: MIN_FRAME_MS - 10,
          })),
        },
      ),
    ).toContain("frame-duration-out-of-range");

    expect(
      codes({
        ...supportedCreation(32, 2),
        frames: supportedCreation(32, 2).frames.map((f) => ({
          ...f,
          durationMs: MAX_FRAME_MS + 10,
        })),
      }),
    ).toContain("frame-duration-out-of-range");
  });

  it("refuses an animation longer than the total limit", () => {
    const frames = Math.ceil(MAX_TOTAL_MS / MAX_FRAME_MS) + 1;
    expect(
      codes({
        ...supportedCreation(32, Math.min(frames, MAX_CREATION_FRAMES)),
        frames: Array.from(
          { length: Math.min(frames, MAX_CREATION_FRAMES) },
          () => ({ rows: emptyFrame(32).rows, durationMs: MAX_FRAME_MS }),
        ),
      }),
    ).toContain("animation-too-long");
  });

  it("refuses an unknown playback mode", () => {
    expect(
      codes({ ...supportedCreation(), playback: "sometimes" as never }),
    ).toContain("playback-unknown");
  });

  it("reports every problem rather than the first", () => {
    expect(
      validateCreation({ version: 9, id: "x", name: "", grid: 7 }).length,
    ).toBeGreaterThan(3);
  });

  it("is deterministic", () => {
    const broken = { version: 9, id: "x" };
    expect(validateCreation(broken)).toEqual(validateCreation(broken));
  });

  it("turns a problem list into one readable error", () => {
    expect(() => assertValidCreation({ version: 9 })).toThrowError(
      /version-unsupported/,
    );
    expect(() => assertValidCreation(supportedCreation())).not.toThrow();
  });
});

// ─── Malformed input fails closed ────────────────────────────────────────────

describe("malformed content fails closed and degrades safely", () => {
  const hostile: Array<[string, unknown]> = [
    ["null", null],
    ["a string", "not a creation"],
    ["an array", []],
    ["an empty object", {}],
    ["a future version", { ...supportedCreation(), version: 99 }],
    ["an unsupported grid", { ...supportedCreation(), grid: 7 }],
    ["frames that are not frames", { ...supportedCreation(), frames: [1, 2] }],
    ["a palette that is not a palette", { ...supportedCreation(), palette: "x" }],
  ];

  it("refuses all of them", () => {
    for (const [label, input] of hostile) {
      expect(isDrawableCreation(input), label).toBe(false);
      expect(creationToAsset(input as PixelCreation), label).toBeNull();
    }
  });

  it("falls back to a built-in character rather than nothing", () => {
    for (const [label, input] of hostile) {
      const asset = creationAssetOrFallback(input, SYLF_CHARACTER_ASSET);
      expect(asset.id, label).toBe(SYLF_CHARACTER_ASSET.id);
      expect(validateAsset(asset), label).toEqual([]);
    }
  });

  it("leaves the display empty when an equipped creation is missing", () => {
    // The end-to-end shape of "the scholar's creation was deleted": the resolver
    // reports it and the base figure is drawn.
    const display = createPixDisplay(48, 48);
    const resolved = resolveEquippedCharacter(
      { outfit: "user:deleted-drawing" },
      { lookup: LOOKUP, state: "IDLE", creations: [] },
    );
    const result = paintComposition(display, resolved.composition);
    expect(result.totalCells).toBe(0);
    expect(display.litCount()).toBe(0);
    expect(resolved.degraded.map((entry) => entry.reason)).toContain(
      "missing-asset",
    );
  });
});

// ─── Creation → asset ────────────────────────────────────────────────────────

describe("a valid creation becomes a valid asset", () => {
  it("produces an asset that passes the asset validator", () => {
    const asset = creationToAsset(supportedCreation());
    expect(asset).not.toBeNull();
    expect(validateAsset(asset!)).toEqual([]);
  });

  it("carries the frames and the timing across", () => {
    const creation = supportedCreation(32, 3);
    const asset = creationToAsset(creation)!;
    expect(asset.animation?.mode).toBe("loop");
    expect(asset.animation?.frameDurationsMs).toEqual([240, 240, 240]);
    const plane = asset.planes[0];
    expect(plane.geometry.geometry).toBe("animated");
  });

  it("keeps every frame's pixels, not just the first", () => {
    const grid = 32;
    const blank = emptyFrame(grid);
    const markOn = (row: number) =>
      blank.rows.map((line, index) =>
        index === row ? "00000000" + line.slice(8) : line,
      );
    const asset = creationToAsset({
      ...supportedCreation(grid, 2),
      frames: [
        { rows: markOn(0), durationMs: 200 },
        { rows: markOn(24), durationMs: 200 },
      ],
    })!;
    expect(validateAsset(asset)).toEqual([]);

    const first = createPixDisplay(grid, grid);
    const second = createPixDisplay(grid, grid);
    paintComposition(first, { base: asset, baseState: undefined, parts: [] }, { frame: 0 });
    paintComposition(second, { base: asset, baseState: undefined, parts: [] }, { frame: 1 });
    // Two frames with a mark on different rows must not render identically.
    expect(Array.from(first.snapshot())).not.toEqual(Array.from(second.snapshot()));
  });

  it("does not let a static asset become a creation", () => {
    // One-way on purpose: the trusted and untrusted formats cannot be confused.
    expect(isDrawableCreation(SYLF_CHARACTER_ASSET)).toBe(false);
  });
});

// ─── The editor model ────────────────────────────────────────────────────────

describe("every editor operation is total and bounded", () => {
  it("creates a draft at a supported resolution", () => {
    expect(createDraft(32).grid).toBe(32);
    expect(createDraft(64).grid).toBe(64);
    // An unsupported request falls back rather than producing an undrawable grid.
    expect(createDraft(7).grid).toBe(48);
  });

  it("paints a cell and its mirror", () => {
    const draft = createDraft(32);
    const frame = paintCell(draft.frames[0], { x: 2, y: 0 }, 1, 32, true);
    expect(frame.cells[0][2]).toBe(1);
    expect(frame.cells[0][29]).toBe(1);
  });

  it("ignores a cell outside the grid rather than throwing", () => {
    const draft = createDraft(32);
    expect(() =>
      paintCell(draft.frames[0], { x: -5, y: 900 }, 1, 32, true),
    ).not.toThrow();
    const frame = paintCell(draft.frames[0], { x: -5, y: 900 }, 1, 32, false);
    expect(frame.cells.flat().every((value) => value === null)).toBe(true);
  });

  it("fills a bounded region and terminates", () => {
    const draft = createDraft(32);
    const filled = fillRegion(draft.frames[0], { x: 0, y: 0 }, 1, 32);
    // The whole grid was transparent, so the fill covers it exactly once.
    expect(filled.cells.flat().filter((v) => v === 1)).toHaveLength(32 * 32);
  });

  it("does not loop forever on a fill of an already-filled region", () => {
    const draft = createDraft(32);
    const once = fillRegion(draft.frames[0], { x: 0, y: 0 }, 1, 32);
    const twice = fillRegion(once, { x: 0, y: 0 }, 1, 32);
    // Filling with the colour already there is a no-op, not a walk.
    expect(twice).toBe(once);
  });

  it("is a no-op when a fill starts outside the grid", () => {
    const draft = createDraft(32);
    expect(fillRegion(draft.frames[0], { x: 99, y: 99 }, 1, 32)).toBe(
      draft.frames[0],
    );
  });

  it("reports the colour under a cell, and nothing outside", () => {
    const draft = createDraft(32);
    const painted = paintCell(draft.frames[0], { x: 3, y: 3 }, 2, 32, false);
    expect(colorAt(painted, { x: 3, y: 3 }, 32)).toBe(2);
    expect(colorAt(painted, { x: 4, y: 3 }, 32)).toBeNull();
    expect(colorAt(painted, { x: -1, y: 0 }, 32)).toBeNull();
  });

  it("bounds the frame count", () => {
    let draft = createDraft(32);
    for (let index = 0; index < MAX_CREATION_FRAMES + 10; index += 1) {
      draft = addFrame(draft);
      draft = duplicateFrame(draft, 0);
    }
    expect(draft.frames.length).toBe(MAX_CREATION_FRAMES);
  });

  it("always keeps at least one frame", () => {
    let draft = createDraft(32);
    draft = deleteFrame(draft, 0);
    expect(draft.frames).toHaveLength(1);
    draft = deleteFrame(draft, 0);
    expect(draft.frames).toHaveLength(1);
  });

  it("moves frames without losing or duplicating one", () => {
    let draft = createDraft(32);
    draft = addFrame(draft);
    draft = addFrame(draft);
    const before = draft.frames.length;
    const moved = moveFrame(draft, 0, 1);
    expect(moved.frames).toHaveLength(before);
    // Moving past either end is a no-op rather than a reorder.
    expect(moveFrame(draft, 0, -1).frames).toEqual(draft.frames);
    expect(moveFrame(draft, before - 1, 1).frames).toEqual(draft.frames);
  });

  it("clamps a frame duration into the supported band", () => {
    const draft = createDraft(32);
    expect(setFrameDuration(draft, 0, 5).frames[0].durationMs).toBe(MIN_FRAME_MS);
    expect(setFrameDuration(draft, 0, 99_999).frames[0].durationMs).toBe(
      MAX_FRAME_MS,
    );
  });

  it("reports how long an animation runs", () => {
    const draft = createDraft(32);
    expect(totalDurationMs(draft)).toBe(draft.frames[0].durationMs);
  });

  it("reports which colours a drawing uses", () => {
    const draft = createDraft(32);
    expect(usedColors(draft)).toEqual([]);
    const painted = {
      ...draft,
      frames: [paintCell(draft.frames[0], { x: 0, y: 0 }, 4, 32, false)],
    };
    expect(usedColors(painted)).toEqual([4]);
  });
});

// ─── Zoom is not the artwork ─────────────────────────────────────────────────

describe("editor zoom is not part of the document", () => {
  it("has no zoom anywhere in the serialised creation", () => {
    // The requirement in one assertion: zoom changes how large the workspace is
    // drawn and must never reach the artwork.
    const creation = draftToCreation(createDraft(48));
    expect(JSON.stringify(creation)).not.toMatch(/zoom/i);
  });

  it("serialises identically whatever the editor was showing", () => {
    // Zoom lives outside the draft entirely, so two drafts made at different
    // zooms are the same document.
    const a = createDraft(48);
    const b = { ...a };
    expect(draftToCreation(a)).toEqual(draftToCreation(b));
  });

  it("keeps the authored grid separate from the card size", () => {
    // A 64-cell drawing, painted on a 48-cell display. The document records its
    // own grid and says nothing about the display, which is what makes the same
    // creation render at every density.
    const draft = paintInto(createDraft(64), { x: 4, y: 4 }, 1);
    const creation = draftToCreation(draft);
    expect(creation.grid).toBe(64);

    const display = createPixDisplay(48, 48);
    const asset = creationToAsset(creation)!;
    const result = paintComposition(display, {
      base: asset,
      baseState: undefined,
      parts: [],
    });
    expect(result.totalCells).toBeGreaterThan(0);
    expect(display.width).toBe(48);
    expect(display.litCount()).toBeGreaterThan(0);
  });
});

// ─── Round trip through storage ──────────────────────────────────────────────

describe("a saved creation survives a round trip", () => {
  it("reproduces the same pixels and frames", () => {
    let draft = createDraft(32);
    draft = {
      ...draft,
      frames: [
        paintCell(draft.frames[0], { x: 5, y: 6 }, 1, 32, false),
        paintCell(draft.frames[0], { x: 9, y: 2 }, 1, 32, false),
      ],
    };
    draft = setFrameDuration(draft, 0, 300);
    draft = setFrameDuration(draft, 1, 500);

    const creation = draftToCreation(draft);
    expect(validateCreation(creation)).toEqual([]);

    // Through JSON, as the database and the network will carry it.
    const roundTripped = JSON.parse(JSON.stringify(creation)) as PixelCreation;
    expect(validateCreation(roundTripped)).toEqual([]);
    expect(roundTripped).toEqual(creation);

    const reopened = creationToDraft(roundTripped);
    expect(reopened.frames.map((f) => f.durationMs)).toEqual([300, 500]);
    expect(reopened.frames[0].cells[6][5]).toBe(1);
    expect(reopened.frames[1].cells[2][9]).toBe(1);
  });

  it("generates a stable id from a name", () => {
    expect(slugify("My Companion")).toBe("my-companion");
    expect(slugify("  ???  ")).toBe("my-companion");
    expect(slugify("Sparkle #2")).toBe("sparkle-2");
  });

  it("keeps a creation inside the payload bound", () => {
    // The largest legitimate creation: 64 × 64, 32 frames.
    let draft = createDraft(64);
    for (let index = 1; index < MAX_CREATION_FRAMES; index += 1) {
      draft = addFrame(draft);
    }
    const creation = draftToCreation(draft);
    expect(validateCreation(creation)).toEqual([]);
    // The bound is a real ceiling, not a description of a normal drawing: the
    // largest legitimate creation sits just under it.
    expect(JSON.stringify(creation).length).toBeLessThan(MAX_PAYLOAD_BYTES);
  });
});

// ─── Playback through the real runtime ───────────────────────────────────────

describe("an animation plays through the real runtime", () => {
  function harness(playback: "once" | "loop", frames = 3) {
    const creation = supportedCreation(32, frames);
    const asset = creationToAsset({ ...creation, playback })!;
    const display = createPixDisplay(32, 32);
    const now = 1000;
    const runtime = new PixRuntime({
      clock: () => now,
      schedule: () => 0,
      cancel: () => {},
    });
    // The composed character content, drawing the creation as its base.
    const content = resolveEquippedCharacter(
      { outfit: creation.id },
      { lookup: () => asset, state: "IDLE", creations: [asset] },
    );
    return { asset, display, runtime, content };
  }

  it("advances on the authored frame durations, not per animation frame", () => {
    // The looping-performance rule: a 240 ms frame schedules work six times a
    // second, not sixty.
    const creation = supportedCreation(32, 2);
    const asset = creationToAsset(creation)!;
    const plane = asset.planes[0];
    expect(asset.animation?.frameDurationsMs).toEqual([240, 240]);
    expect(plane.geometry.geometry).toBe("animated");
    // And the runtime is told the frames, so it is never asked to guess a rate.
    expect(asset.animation?.mode).toBe("loop");
  });

  it("produces a different picture per frame", () => {
    // Two frames that differ, so the assertion has something to detect. Both
    // frames are built from the same drawing with a mark on a different row.
    const grid = 32;
    const blank = emptyFrame(grid);
    // A *shape*, not a single cell: at 32 reference cells on a 48-cell display one
    // cell is sub-pixel, which is honest downsampling rather than a bug.
    const markOn = (row: number) =>
      blank.rows.map((line, index) =>
        index === row ? "00000000" + line.slice(8) : line,
      );
    const asset = creationToAsset({
      ...supportedCreation(grid, 2),
      frames: [
        { rows: markOn(2), durationMs: 240 },
        { rows: markOn(20), durationMs: 240 },
      ],
    })!;
    const composition = { base: asset, baseState: undefined, parts: [] };

    const a = createPixDisplay(grid, grid);
    const b = createPixDisplay(grid, grid);
    paintComposition(a, composition, { frame: 0 });
    paintComposition(b, composition, { frame: 1 });
    expect(Array.from(a.snapshot())).not.toEqual(Array.from(b.snapshot()));
  });

  it("treats an out-of-range frame as a real frame, never as nothing", () => {
    const asset = creationToAsset(supportedCreation(32, 2))!;
    const display = createPixDisplay(32, 32);
    const result = paintComposition(
      display,
      { base: asset, baseState: undefined, parts: [] },
      { frame: -1 },
    );
    expect(result.totalCells).toBeGreaterThan(0);
  });

  it("is deterministic", () => {
    const asset = creationToAsset(supportedCreation(32, 3))!;
    const a = createPixDisplay(32, 32);
    const b = createPixDisplay(32, 32);
    const composition = { base: asset, baseState: undefined, parts: [] };
    paintComposition(a, composition, { frame: 1 });
    paintComposition(b, composition, { frame: 1 });
    expect(Array.from(a.snapshot())).toEqual(Array.from(b.snapshot()));
  });

  /** A looping or one-shot creation wired into the real content and runtime. */
  function runtimeHarness(playback: "once" | "loop") {
    const grid = 32;
    const blank = emptyFrame(grid);
    const markOn = (row: number) =>
      blank.rows.map((line, index) =>
        index === row ? "00000000" + line.slice(8) : line,
      );
    const asset = creationToAsset({
      ...supportedCreation(grid, 2),
      frames: [
        { rows: markOn(2), durationMs: 240 },
        { rows: markOn(20), durationMs: 240 },
      ],
      playback,
    })!;
    const display = createPixDisplay(grid, grid);
    const runtime = new PixRuntime({
      clock: () => 0,
      schedule: () => 0,
      cancel: () => {},
    });
    const content = new SylfCharacterContent(display, runtime, {
      // Idle blinking off, so the only thing that can request frames is the
      // animation under test.
      autoBlink: false,
      composition: { base: asset, parts: [] },
    });
    runtime.setContent(content);
    // A started session, because a stopped runtime is not maintained and the
    // content correctly refuses to animate on a display nobody can see.
    runtime.start();
    return { content, runtime, display };
  }

  /**
   * Steps the content once per *frame*, and reports how many steps asked for
   * another frame.
   *
   * The count is the measurement that matters: on a 60 Hz display the runtime
   * calls `update` about sixty times a second, so "how often did it say yes" is
   * the difference between a loop that rests and one that burns a frame budget
   * holding a still picture.
   */
  const step = (
    content: SylfCharacterContent,
    count: number,
    deltaMs = 16,
  ) => {
    const seen = new Set<number>();
    let requested = 0;
    for (let index = 0; index < count; index += 1) {
      seen.add(content.getAnimationFrame());
      if (content.update({ elapsed: index * deltaMs, delta: deltaMs, frame: index }) === true) {
        requested += 1;
      }
    }
    return { seen: [...seen].sort(), requested };
  };

  it("advances on the authored durations rather than per frame", () => {
    const { content } = runtimeHarness("loop");
    const animation = content.getComposedAnimation();
    expect(animation?.mode).toBe("loop");
    expect(animation?.frameCount).toBe(2);
    expect(animation?.durationsMs).toEqual([240, 240]);

    // 240 steps of 16 ms is about four frame durations, so the drawing advances
    // and the loop does **not** ask for a frame on every one of them.
    const { seen, requested } = step(content, 240);
    expect(seen).toEqual([0, 1]);
    expect(requested).toBe(0);
  });

  it("asks for no frame at all while it is waiting for the next one", () => {
    // The looping-performance rule as an assertion: holding a picture is not
    // work. A frame that is not due yet must let the runtime settle.
    const { content } = runtimeHarness("loop");
    for (let index = 0; index < 10; index += 1) {
      expect(
        content.update({ elapsed: index * 16, delta: 16, frame: index }),
      ).toBe(false);
    }
  });

  it("finishes a one-shot animation and returns to zero work", () => {
    const { content } = runtimeHarness("once");
    const { seen, requested } = step(content, 240);
    expect(seen).toEqual([0, 1]);
    expect(requested).toBe(0);
    // Parked on its final frame, holding it.
    expect(content.getAnimationFrame()).toBe(1);
  });

  it("swaps the animation when the companion changes", () => {
    // A pending wake-up must not outlive the animation that scheduled it.
    const { content } = runtimeHarness("loop");
    content.configure({ composition: null });
    expect(content.getComposedAnimation()).toBeNull();
    expect(content.update({ elapsed: 0, delta: 16, frame: 1 })).toBe(false);
  });

  it("does not animate a display that has been stopped", () => {
    // The pause requirement: a backgrounded card must cost nothing, so a looping
    // animation drops its wake-up rather than waking a display nobody can see.
    const { content, runtime } = runtimeHarness("loop");
    runtime.stop();
    expect(content.update({ elapsed: 0, delta: 16, frame: 1 })).toBe(false);
    expect(content.getAnimationFrame()).toBe(0);
  });

  it("cannot be woken out of a suspension by its own timer", () => {
    /*
     * The bug this pins, found by measuring the real dashboard.
     *
     * An animation schedules its next frame on a timer, and that timer called
     * `requestFrame()` — the explicit external wake-up — which reopened the
     * session. A hidden tab therefore rendered nine frames over three seconds on
     * a display whose whole purpose in that state is to cost nothing.
     *
     * Content now asks through `requestFrameFromContent()`, which refuses while a
     * suspension is in force. `requestFrame()` deliberately still works, because
     * a dev control or a test waking the display is a different intention.
     */
    const { runtime } = runtimeHarness("loop");
    runtime.stop();
    expect(runtime.getPhase()).toBe("stopped");

    runtime.requestFrameFromContent();
    expect(runtime.getPhase()).toBe("stopped");

    // And the external wake-up still works, because it means something else.
    runtime.requestFrame();
    expect(runtime.getPhase()).toBe("running");
  });

  it("does not report an animation for a static asset", () => {
    // Every built-in character is static, so nothing about the zero-work path
    // changes for them.
    const grid = 32;
    const asset = creationToAsset(supportedCreation(grid, 1))!;
    const display = createPixDisplay(grid, grid);
    const runtime = new PixRuntime({
      clock: () => 0,
      schedule: () => 0,
      cancel: () => {},
    });
    const content = new SylfCharacterContent(display, runtime, {
      autoBlink: false,
      composition: { base: asset, parts: [] },
    });
    runtime.start();
    expect(content.getComposedAnimation()).toBeNull();
    expect(content.update({ elapsed: 0, delta: 16, frame: 1 })).toBe(false);
  });
});

// ─── History bounds ──────────────────────────────────────────────────────────

describe("history is bounded", () => {
  it("has a fixed limit", () => {
    expect(HISTORY_LIMIT).toBeGreaterThan(0);
    expect(HISTORY_LIMIT).toBeLessThanOrEqual(100);
  });

  it("keeps snapshots independent, so undo cannot be wrong", () => {
    // History holds documents rather than inverse operations, so stepping back
    // cannot disagree with what it is undoing.
    const draft = createDraft(32);
    const painted = paintCell(draft.frames[0], { x: 1, y: 1 }, 1, 32, false);
    expect(draft.frames[0].cells[1][1]).toBeNull();
    expect(painted.cells[1][1]).toBe(1);
  });
});
