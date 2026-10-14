/**
 * ============================================================================
 * PIXEL CREATION — WHAT A USER DRAWS
 * ============================================================================
 * The authored format Pixel Studio produces, and the validation that stands
 * between it and the display.
 *
 * WHY THIS IS NOT A `PixelAsset`
 *   A `PixelAsset` is a *developer* description: named planes, anchors, states,
 *   attachments, a reference grid chosen per asset. A user drawing is much
 *   smaller than that — a grid, some colours, some frames — and much more
 *   dangerous: it arrives from a client.
 *
 *   So this is a separate, minimal, **versioned** format with hard bounds, and it
 *   is converted into a `PixelAsset` only after it validates. The conversion is
 *   one-way: a creation can become an asset, and an asset can never become a
 *   creation. That keeps the trusted and untrusted sides apart, which is the
 *   whole point.
 *
 * EVERYTHING HERE TREATS ITS INPUT AS HOSTILE
 *   Bounds are checked before anything is decoded, the decoder is total (it never
 *   throws), and validation fails closed with a reason per problem. Nothing in
 *   this module executes user input, and nothing allocates unboundedly from it.
 *
 * PIXELS ARE STORED AS PALETTE INDICES
 *   A frame is rows of digits, one digit per cell, indexing the creation's own
 *   palette. `.` is never a digit, so transparent is unambiguous and a frame's
 *   rows are exactly as wide as the grid. Indices keep a 48 × 48 × 8-frame
 *   creation under 20 KB of JSON, which is what makes storing it in one column
 *   reasonable.
 * ============================================================================
 */

import {
  PIXEL_ASSET_VERSION,
  type PixelAsset,
  type PixelPalette,
} from "./types";

/** The creation format's own version, separate from the asset contract's. */
export const PIXEL_CREATION_VERSION = 1;

/**
 * The logical resolutions a creation may use.
 *
 * The **same four** the density presets offer, so a creation is authored at a
 * resolution the engine has been measured and tested at, and so a scholar's
 * density preference and their drawing agree by construction.
 */
export const CREATION_ALLOWED_SIZES = [32, 40, 48, 64] as const;
export type CreationSize = (typeof CREATION_ALLOWED_SIZES)[number];

/**
 * Hard bounds.
 *
 * Every one of these is enforced before decode and again on validate. They exist
 * because a creation is stored, served, rendered in a loop on a production
 * surface, and written by a client that could be anything.
 */
export const MAX_CREATION_FRAMES = 16;
export const MAX_CREATION_COLORS = 16;
export const MIN_FRAME_MS = 60;
export const MAX_FRAME_MS = 2000;
export const MAX_TOTAL_MS = 30_000;
/**
 * The stored-size bound.
 *
 * Measured, not guessed: the largest legitimate creation — 64 × 64 at the
 * sixteen-frame ceiling, written as JSON — is about 70 KB, so the bound sits just
 * above it. It exists so a malformed or hostile payload cannot ask a database row
 * or a client response to carry something unbounded, not to constrain a scholar
 * who is drawing normally.
 */
export const MAX_PAYLOAD_BYTES = 128 * 1024;

/** One palette entry. `null` means "not a colour", which is never stored. */
export interface CreationColor {
  /** `#rrggbb`, lowercase, no alpha. Alpha would be a second drawing model. */
  readonly hex: string;
}

/**
 * A frame.
 *
 * `rows` are exactly `grid × grid` digits, top to bottom. Digit `n` indexes
 * `palette[n]`; `.` is transparent. There is no other encoding, because there
 * does not need to be one and a second encoding would be a second thing to
 * validate.
 */
export interface CreationFrame {
  readonly rows: readonly string[];
  /** How long this frame is held, in milliseconds. */
  readonly durationMs: number;
}

export type CreationPlayback = "once" | "loop";

export interface PixelCreation {
  readonly version: number;
  /** `user:<slug>`. The `user:` namespace keeps user content distinguishable. */
  readonly id: string;
  readonly name: string;
  /** Square, and one of `CREATION_ALLOWED_SIZES`. */
  readonly grid: number;
  /** Indices 0..15 use single hexadecimal digits; all sixteen colors are drawable. */
  readonly palette: readonly string[];
  readonly frames: readonly CreationFrame[];
  readonly playback: CreationPlayback;
}

// ─── Encoding ────────────────────────────────────────────────────────────────

/** The digits a frame may use, in index order. */
export const PALETTE_DIGITS = "0123456789abcdef";

/** One cell of a decoded frame: a palette index, or `null` for transparent. */
export type CellValue = number | null;

/**
 * Decodes a frame into cells.
 *
 * **Total.** Every row, every character, including rows of the wrong length and
 * characters that are not digits, produces a value rather than an exception.
 * Out-of-range indices decode to transparent instead of pointing past the palette
 * — the safe direction, because a wrong colour is a bug and a crash is an outage.
 */
export function decodeFrame(
  frame: { rows: readonly string[] },
  grid: number,
  paletteLength: number,
): CellValue[][] {
  const cells: CellValue[][] = [];
  for (let y = 0; y < grid; y += 1) {
    const row = frame.rows[y] ?? "";
    const line: CellValue[] = [];
    for (let x = 0; x < grid; x += 1) {
      const character = row[x] ?? ".";
      const index = PALETTE_DIGITS.indexOf(character);
      line.push(index >= 0 && index < paletteLength ? index : null);
    }
    cells.push(line);
  }
  return cells;
}

/** Encodes cells back into rows. The inverse of `decodeFrame`. */
export function encodeFrame(
  cells: readonly (readonly CellValue[])[],
  grid: number,
): string[] {
  const rows: string[] = [];
  for (let y = 0; y < grid; y += 1) {
    let row = "";
    for (let x = 0; x < grid; x += 1) {
      const value = cells[y]?.[x];
      row +=
        value === null || value === undefined || !Number.isInteger(value) || value < 0 || value >= PALETTE_DIGITS.length
          ? "."
          : PALETTE_DIGITS[value];
    }
    rows.push(row);
  }
  return rows;
}

/** An empty frame. */
export function emptyFrame(grid: number, durationMs = 240): CreationFrame {
  return {
    rows: Array.from({ length: grid }, () => ".".repeat(grid)),
    durationMs,
  };
}

// ─── Validation ──────────────────────────────────────────────────────────────

export type CreationIssueCode =
  | "not-an-object"
  | "version-unsupported"
  | "id-missing"
  | "id-malformed"
  | "name-missing"
  | "name-too-long"
  | "grid-unsupported"
  | "palette-too-large"
  | "palette-color-invalid"
  | "palette-color-duplicate"
  | "frames-empty"
  | "frames-too-many"
  | "frame-rows-mismatch"
  | "frame-row-width-mismatch"
  | "frame-index-out-of-palette"
  | "frame-duration-out-of-range"
  | "animation-too-long"
  | "playback-unknown"
  | "payload-too-large";

export interface CreationIssue {
  readonly code: CreationIssueCode;
  readonly path: string;
  readonly message: string;
}

const ID_PATTERN = /^user:[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HEX_PATTERN = /^#[0-9a-f]{6}$/;

/**
 * Validates a creation. Returns every problem, in a stable order.
 *
 * Deliberately strict where the encoder is lenient: the encoder must not throw on
 * half-typed input, and the validator must not accept it. Between them, nothing
 * invalid reaches the display.
 */
export function validateCreation(input: unknown): CreationIssue[] {
  const issues: CreationIssue[] = [];
  const push = (code: CreationIssueCode, path: string, message: string) => {
    issues.push({ code, path, message });
  };

  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    push("not-an-object", "", "A creation must be an object.");
    return issues;
  }

  const creation = input as Partial<PixelCreation>;

  if (creation.version !== PIXEL_CREATION_VERSION) {
    push(
      "version-unsupported",
      "version",
      `Creation declares version ${String(creation.version)}; this build understands ${PIXEL_CREATION_VERSION}.`,
    );
  }
  if (typeof creation.id !== "string" || !ID_PATTERN.test(creation.id)) {
    push(
      "id-malformed",
      "id",
      `Creation id must be "user:name" in lowercase kebab-case; got ${JSON.stringify(creation.id)}.`,
    );
  }
  if (typeof creation.name !== "string" || creation.name.trim().length === 0) {
    push("name-missing", "name", "A creation needs a name.");
  } else if (creation.name.length > 32) {
    push("name-too-long", "name", "A name may be at most 32 characters.");
  }

  // Bounds first, because everything below indexes by them.
  const grid = creation.grid;
  const gridOk =
    typeof grid === "number" &&
    (CREATION_ALLOWED_SIZES as readonly number[]).includes(grid);
  if (!gridOk) {
    push(
      "grid-unsupported",
      "grid",
      `Grid must be one of ${CREATION_ALLOWED_SIZES.join(", ")}; got ${String(grid)}.`,
    );
  }

  const palette = creation.palette;
  if (!Array.isArray(palette)) {
    push("palette-color-invalid", "palette", "A creation needs a palette.");
  } else {
    if (palette.length > MAX_CREATION_COLORS) {
      push(
        "palette-too-large",
        "palette",
        `${palette.length} colours exceeds the limit of ${MAX_CREATION_COLORS}.`,
      );
    }
    const seen = new Set<string>();
    for (let index = 0; index < palette.length; index += 1) {
      const colour = palette[index];
      if (typeof colour !== "string" || !HEX_PATTERN.test(colour)) {
        push(
          "palette-color-invalid",
          `palette[${index}]`,
          `Colours are lowercase #rrggbb; got ${JSON.stringify(colour)}.`,
        );
        continue;
      }
      if (seen.has(colour)) {
        push(
          "palette-color-duplicate",
          `palette[${index}]`,
          `${colour} appears more than once, which would make the drawing ambiguous.`,
        );
      }
      seen.add(colour);
    }
  }

  const paletteLength = Array.isArray(palette) ? palette.length : 0;
  const frames = creation.frames;
  if (!Array.isArray(frames) || frames.length === 0) {
    push("frames-empty", "frames", "A creation needs at least one frame.");
  } else {
    if (frames.length > MAX_CREATION_FRAMES) {
      push(
        "frames-too-many",
        "frames",
        `${frames.length} frames exceeds the limit of ${MAX_CREATION_FRAMES}.`,
      );
    }
    let total = 0;
    for (let index = 0; index < frames.length; index += 1) {
      const frame = frames[index];
      const path = `frames[${index}]`;
      if (typeof frame !== "object" || frame === null) {
        push("frame-rows-mismatch", path, "A frame must be an object.");
        continue;
      }
      if (!Array.isArray(frame.rows) || frame.rows.length !== grid) {
        push(
          "frame-rows-mismatch",
          `${path}.rows`,
          `A frame has one row per grid line: expected ${String(grid)}, got ${Array.isArray(frame.rows) ? frame.rows.length : "none"}.`,
        );
      } else {
        for (let row = 0; row < frame.rows.length; row += 1) {
          const line = frame.rows[row];
          if (typeof line !== "string" || line.length !== grid) {
            push(
              "frame-row-width-mismatch",
              `${path}.rows[${row}]`,
              `Every row is ${String(grid)} cells wide; row ${row} is ${typeof line === "string" ? line.length : "not a string"}.`,
            );
            continue;
          }
          // A digit the palette does not define is a real authoring mistake —
          // unlike the encoder, the validator refuses it rather than guessing.
          for (let column = 0; column < line.length; column += 1) {
            const character = line[column];
            const value = PALETTE_DIGITS.indexOf(character);
            if (value >= 0 && value >= paletteLength) {
              push(
                "frame-index-out-of-palette",
                `${path}.rows[${row}]`,
                `Row ${row}, column ${column} uses colour ${value}, but the palette has ${paletteLength}.`,
              );
            } else if (value < 0 && character !== ".") {
              push(
                "frame-row-width-mismatch",
                `${path}.rows[${row}]`,
                `Row ${row}, column ${column} is ${JSON.stringify(character)}; cells are a palette digit or ".".`,
              );
            }
          }
        }
      }

      const duration = frame.durationMs;
      if (
        typeof duration !== "number" ||
        !Number.isInteger(duration) ||
        duration < MIN_FRAME_MS ||
        duration > MAX_FRAME_MS
      ) {
        push(
          "frame-duration-out-of-range",
          `${path}.durationMs`,
          `Frame duration must be a whole number of milliseconds between ${MIN_FRAME_MS} and ${MAX_FRAME_MS}; got ${String(duration)}.`,
        );
      } else {
        total += duration;
      }
    }

    if (frames.length > 1 && total > MAX_TOTAL_MS) {
      push(
        "animation-too-long",
        "frames",
        `The animation runs for ${total}ms, over the ${MAX_TOTAL_MS}ms limit.`,
      );
    }
  }

  if (creation.playback !== "once" && creation.playback !== "loop") {
    push(
      "playback-unknown",
      "playback",
      `Playback must be "once" or "loop"; got ${JSON.stringify(creation.playback)}.`,
    );
  }

  // The stored size, not the decoded size: what a database row has to carry.
  const bytes = approximatePayloadBytes(input);
  if (bytes > MAX_PAYLOAD_BYTES) {
    push(
      "payload-too-large",
      "",
      `The creation is about ${Math.round(bytes / 1024)} KB, over the ${MAX_PAYLOAD_BYTES / 1024} KB limit.`,
    );
  }

  return issues;
}

/** Throws one readable error when a creation is invalid. */
export function assertValidCreation(input: unknown): PixelCreation {
  const issues = validateCreation(input);
  if (issues.length > 0) {
    throw new Error(
      `Pixel creation is invalid:\n${issues
        .map((issue) => `  - [${issue.code}] ${issue.path}: ${issue.message}`)
        .join("\n")}`,
    );
  }
  return input as PixelCreation;
}

/**
 * Roughly how many bytes a creation occupies when serialised.
 *
 * Measured on the stringified form rather than estimated from the frame count,
 * because the frames *are* the payload and an estimate that disagreed with the
 * database would be worse than no check.
 */
export function approximatePayloadBytes(input: unknown): number {
  try {
    return JSON.stringify(input).length;
  } catch {
    // A value that cannot be serialised is a value that cannot be stored.
    return Number.MAX_SAFE_INTEGER;
  }
}

/** Whether a value is a creation this build can draw. */
export function isDrawableCreation(input: unknown): input is PixelCreation {
  return validateCreation(input).length === 0;
}

/** Valid artwork with at least one authored opaque cell (blank drafts remain saveable). */
export function hasCreationPixels(value: unknown): value is PixelCreation {
  return validateCreation(value).length === 0 && (value as PixelCreation).frames.some(frame => frame.rows.some(row => /[0-9a-f]/.test(row)));
}
