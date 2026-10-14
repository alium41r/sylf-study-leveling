import { SYLF_CHARACTER_ASSET } from "./fixtures/retired-sylf/reference-character";
/**
 * ============================================================================
 * AUDIT REGRESSIONS — COMPOSITION PAINTING
 * ============================================================================
 * Two defects found while auditing the composition path, both of which the
 * existing suite could not see because it asserted what the painter *reported*
 * (`paintedCells`) rather than what survived in the framebuffer, and because no
 * test drove a composition through the Sylf content at a non-default state.
 *
 *   1. `paintComposition` cleared the display *after* painting the pedestal, so
 *      a composition's ground was erased on the very frame that drew it.
 *   2. The composition path ignored the content's state: it painted the base's
 *      own first state (`IDLE`) whatever the companion was doing, so a level-up
 *      sparkle wave played over a resting posture.
 *
 * Evidence for both is the framebuffer itself, never a returned count.
 */

import { describe, expect, it } from "vitest";
import { createPixDisplay } from "@/lib/pixel-display/engine/display";
import { createPixRuntime } from "@/lib/pixel-display/engine/runtime";
import { createSylfContent } from "@/lib/pixel-display/content";
import { SYLF_PALETTE } from "@/lib/pixel-display/content/palette";
import { MEADOW_PEDESTAL_ASSET,
  
  creationToAsset,
  emptyFrame,
  paintAsset,
  paintComposition,
  validateAsset,
  validateCreation } from "@/lib/pixel-display/content/asset";
import { unpackRgba } from "@/lib/pixel-display/engine";
import {
  BODY_PULSE_FRAMES,
  BODY_PULSE_MS,
  SPARKLE_WAVE_FRAMES,
  SPARKLE_WAVE_MS,
} from "@/lib/pixel-display/content";

const SIZE = 48;

/** A display with a creation's asset painted on it, for cell-count checks. */
function displayWith(asset: ReturnType<typeof creationToAsset>) {
  const display = createPixDisplay(SIZE, SIZE);
  paintAsset(display, asset!, {});
  return display;
}

function cellCount(display: ReturnType<typeof createPixDisplay>) {
  let lit = 0;
  for (let y = 0; y < display.height; y += 1) {
    for (let x = 0; x < display.width; x += 1) {
      if (display.getPixel(x, y) !== 0) lit += 1;
    }
  }
  return lit;
}

function litCells(display: ReturnType<typeof createPixDisplay>) {
  const cells: Array<[number, number, number]> = [];
  for (let y = 0; y < display.height; y += 1) {
    for (let x = 0; x < display.width; x += 1) {
      const color = display.getPixel(x, y);
      if (color !== 0) cells.push([x, y, color]);
    }
  }
  return cells;
}

describe("a composition keeps every part that painted", () => {
  it("does not erase the pedestal when it paints the character", () => {
    const display = createPixDisplay(SIZE, SIZE);
    const result = paintComposition(display, {
      base: SYLF_CHARACTER_ASSET,
      parts: [{ slot: "pedestal", asset: MEADOW_PEDESTAL_ASSET }],
    });

    // Where the pedestal *would* paint, measured on its own so this test cannot
    // be satisfied by the character happening to cover the same cells.
    const alone = createPixDisplay(SIZE, SIZE);
    const painted = paintAsset(alone, MEADOW_PEDESTAL_ASSET, {
      placementOverride: result.placement,
    });
    expect(painted.paintedCells).toBeGreaterThan(0);
    const measured = litCells(alone);
    expect(measured.length).toBeGreaterThan(0);

    // Every logical cell the pedestal paints on its own must still be there,
    // in its own colour, in the composed picture.
    const survived = measured.filter(
      ([x, y, color]) => display.getPixel(x, y) === color,
    );
    expect(survived.length).toBe(measured.length);
  });

  it("reports the pedestal's painted cells truthfully", () => {
    const display = createPixDisplay(SIZE, SIZE);
    const result = paintComposition(display, {
      base: SYLF_CHARACTER_ASSET,
      parts: [{ slot: "pedestal", asset: MEADOW_PEDESTAL_ASSET }],
    });
    const pedestal = result.parts.find((part) => part.slot === "pedestal");
    expect(pedestal?.paintedCells).toBeGreaterThan(0);
    // The report and the picture must agree about how much is on screen.
    expect(litCells(display).length).toBeGreaterThanOrEqual(
      pedestal?.paintedCells ?? 0,
    );
  });
});

describe("a composition follows the state the content is in", () => {
  function drawn(state: "IDLE" | "CELEBRATING") {
    const display = createPixDisplay(SIZE, SIZE);
    const runtime = createPixRuntime();
    const content = createSylfContent(display, runtime, {
      characterFill: 0.9,
      autoBlink: false,
      composition: {
        base: SYLF_CHARACTER_ASSET,
        parts: [{ slot: "pedestal", asset: MEADOW_PEDESTAL_ASSET }],
      },
    });
    content.setState(state);
    content.render();
    return display;
  }

  it("draws a different picture for CELEBRATING than for IDLE", () => {
    const idle = Array.from(drawn("IDLE").snapshot());
    const celebrating = Array.from(drawn("CELEBRATING").snapshot());
    const changed = idle.reduce(
      (count, value, index) => (value === celebrating[index] ? count : count + 1),
      0,
    );
    expect(changed).toBeGreaterThan(0);
  });

  it("shows the celebration's blush only while celebrating", () => {
    const blush = unpackRgba(SYLF_PALETTE.blush);
    const isBlush = (color: number) => {
      const { r, g, b, a } = unpackRgba(color);
      return a > 0 && r === blush.r && g === blush.g && b === blush.b;
    };
    expect(litCells(drawn("CELEBRATING")).some(([, , c]) => isBlush(c))).toBe(true);
    expect(litCells(drawn("IDLE")).some(([, , c]) => isBlush(c))).toBe(false);
  });
});

describe("an effect modulates the cells the composite actually painted", () => {
  function composed(options: { effect?: "bodyPulse" | "sparkleWave" }) {
    const display = createPixDisplay(SIZE, SIZE);
    const runtime = createPixRuntime();
    const content = createSylfContent(display, runtime, {
      characterFill: 0.9,
      autoBlink: false,
      composition: {
        base: SYLF_CHARACTER_ASSET,
        parts: [{ slot: "pedestal", asset: MEADOW_PEDESTAL_ASSET }],
      },
    });
    content.render();
    const before = Array.from(display.snapshot());
    if (options.effect) content.startEffect({ kind: options.effect, seed: 0 });
    return { display, content, before };
  }

  /** The rows the pedestal owns, so a pulse reaching them is reaching the ground. */
  const GROUND_ROW = 28;

  it("keeps the body pulse off the ground the composite painted", () => {
    const { display, content, before } = composed({ effect: "bodyPulse" });
    for (let frame = 0; frame < 6; frame += 1) {
      content.advanceEffect(BODY_PULSE_MS / BODY_PULSE_FRAMES);
      content.render();
    }
    const after = Array.from(display.snapshot());
    const touchedGround = before.reduce(
      (count, color, index) =>
        color !== after[index] && Math.floor(index / SIZE) >= GROUND_ROW
          ? count + 1
          : count,
      0,
    );
    expect(touchedGround).toBe(0);
  });

  it("keeps the sparkle wave inside the composite's own geometry", () => {
    const { display, content, before } = composed({ effect: "sparkleWave" });
    let invented = 0;
    for (let frame = 0; frame < SPARKLE_WAVE_FRAMES; frame += 1) {
      content.render();
      const after = Array.from(display.snapshot());
      invented = Math.max(
        invented,
        before.reduce(
          (count, color, index) =>
            color === 0 && after[index] !== 0 ? count + 1 : count,
          0,
        ),
      );
      content.advanceEffect(SPARKLE_WAVE_MS / SPARKLE_WAVE_FRAMES);
    }
    expect(invented).toBe(0);
  });
});

describe("an effect declared when the content is created", () => {
  it("is the effect that is happening", () => {
    const declared = createPixDisplay(SIZE, SIZE);
    const declaredRuntime = createPixRuntime();
    const declaredContent = createSylfContent(declared, declaredRuntime, {
      characterFill: 0.9,
      autoBlink: false,
      composition: { base: SYLF_CHARACTER_ASSET, parts: [] },
      effect: { kind: "bodyPulse", seed: 0 },
    });

    expect(declaredContent.isEffectRunning()).toBe(true);

    // And it is visible: a few beats into the ramp the picture differs from the
    // same content with no effect at all.
    for (let frame = 0; frame < 4; frame += 1) {
      declaredContent.advanceEffect(BODY_PULSE_MS / BODY_PULSE_FRAMES);
    }
    declaredContent.render();

    const plain = createPixDisplay(SIZE, SIZE);
    const plainContent = createSylfContent(plain, createPixRuntime(), {
      characterFill: 0.9,
      autoBlink: false,
      composition: { base: SYLF_CHARACTER_ASSET, parts: [] },
    });
    plainContent.render();

    const changed = Array.from(declared.snapshot()).reduce(
      (count, color, index) =>
        color === Array.from(plain.snapshot())[index] ? count : count + 1,
      0,
    );
    expect(changed).toBeGreaterThan(0);
  });
});

describe("a creation converted into an asset", () => {
  it("validates, even at the accepted colour bound", () => {
    // `validateCreation` accepts up to sixteen colours; the frame alphabet is
    // ten digits. Keys past the alphabet made the derived asset fail its own
    // validator, and the resolver treats an invalid asset as one whose anchors
    // cannot be trusted.
    const grid = 48;
    const palette = Array.from(
      { length: 16 },
      (_, index) => `#${(index + 1).toString(16).padStart(2, "0")}0000`,
    );
    const creation = {
      version: 1,
      id: "user:audit-sixteen",
      name: "Sixteen",
      grid,
      palette,
      frames: [
        { rows: emptyFrame(grid).rows.map((row) => `0${row.slice(1)}`), durationMs: 240 },
      ],
      playback: "loop" as const,
    };
    expect(validateCreation(creation)).toEqual([]);
    const asset = creationToAsset(creation);
    expect(asset).not.toBeNull();
    expect(validateAsset(asset!)).toEqual([]);
    // The drawing is unchanged: the referenced colour still paints.
    expect(cellCount(displayWith(asset!))).toBeGreaterThan(0);
  });
});

describe("a surface re-declaring the resting state", () => {
  it("does not invent an automatic blink for an empty display", () => {
    const display = createPixDisplay(SIZE, SIZE);
    const content = createSylfContent(display, createPixRuntime(), { autoBlink: true });
    content.update({ delta: 10000 } as never);
    content.configure({ state: 'IDLE' });
    content.render();
    expect(content.getState()).toBe('IDLE');
    expect(display.litCount()).toBe(0);
  });

  it("does apply a real state change", () => {
    const display = createPixDisplay(SIZE, SIZE);
    const runtime = createPixRuntime();
    const content = createSylfContent(display, runtime, {
      characterFill: 0.9,
      autoBlink: false,
      state: "IDLE",
    });
    content.configure({ state: "FOCUSING" });
    expect(content.getState()).toBe("FOCUSING");
  });
});
