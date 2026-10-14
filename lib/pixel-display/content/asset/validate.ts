/**
 * ============================================================================
 * PIXEL ASSET — VALIDATION
 * ============================================================================
 * Deterministic checks over an authored asset, reported as data.
 *
 * WHY DATA AND NOT EXCEPTIONS
 *   An authoring mistake should tell an author *everything* wrong with the asset,
 *   not just the first thing a throw happened to reach. `validateAsset` returns a
 *   list; `assertValidAsset` turns a non-empty list into one clear error for
 *   call sites that want to fail fast.
 *
 * WHY FAIL CLOSED
 *   Invalid content must fail during development rather than quietly rendering
 *   something wrong. A mistyped palette key that silently paints nothing is the
 *   exact failure mode this module exists to prevent, so an unknown key is an
 *   error here — even though the resolver skips it rather than throwing.
 *
 * NO RENDERER, NO RUNTIME, NO DOM. Validation is a property of the description.
 * ============================================================================
 */

import {
  PIXEL_ASSET_VERSION,
  TRANSPARENT_TOKEN,
  type PixelAnimatedGeometry,
  type PixelAsset,
  type PixelAssetKind,
  type PixelPlane,
  type PixelSpanRow,
} from "./types";

export type PixelAssetIssueCode =
  | "version-unsupported"
  | "id-missing"
  | "id-malformed"
  | "id-duplicate"
  | "kind-unknown"
  | "reference-invalid"
  | "reference-too-large"
  | "planes-empty"
  | "plane-id-missing"
  | "plane-id-duplicate"
  | "plane-geometry-empty"
  | "raster-row-too-wide"
  | "raster-rows-exceed-height"
  | "span-out-of-bounds"
  | "span-empty"
  | "span-not-integer"
  | "palette-key-missing"
  | "plane-palette-key-missing"
  | "palette-key-unused"
  | "palette-color-invalid"
  | "palette-redefines-transparent"
  | "anchor-id-missing"
  | "anchor-id-duplicate"
  | "anchor-out-of-bounds"
  | "anchor-not-finite"
  | "state-id-missing"
  | "state-id-duplicate"
  | "state-unknown-plane"
  | "state-empty"
  | "attachment-pivot-unknown"
  | "attachment-missing"
  | "attachment-host-kind-unknown"
  | "animation-too-many-frames"
  | "animation-order-empty"
  | "animation-order-out-of-range"
  | "animation-durations-mismatch"
  | "animation-duration-out-of-range"
  | "animation-too-long"
  | "animation-without-frames"
  | "animation-without-mode";

export interface PixelAssetIssue {
  readonly code: PixelAssetIssueCode;
  /** Where in the asset, in terms an author can act on. */
  readonly path: string;
  readonly message: string;
}

/**
 * The largest asset the contract accepts.
 *
 * Bounded so an authoring mistake — or a generated asset — cannot ask the
 * painter to consider an unbounded grid. The reference assets are 32 × 32, so
 * this is generous while still being a real ceiling.
 */
export const MAX_ASSET_CELLS = 128 * 128;
export const MAX_REFERENCE_SIDE = 256;

/**
 * The animation ceiling.
 *
 * Bounded because an animation is a *loop that runs on a production surface*:
 * the cost of a frame is paid every time it comes round, forever, on a card that
 * is never absent. Thirty-two frames of a 48 × 48 drawing is already far more
 * than a companion needs, and it keeps a malformed payload from being able to ask
 * the runtime for unbounded work.
 */
export const MAX_ANIMATION_FRAMES = 32;
export const MIN_FRAME_DURATION_MS = 60;
export const MAX_FRAME_DURATION_MS = 2000;
export const MAX_TOTAL_DURATION_MS = 30_000;

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*:[a-z0-9]+(?:-[a-z0-9]+)*$/;
const LOCAL_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** `#rgb`, `#rrggbb`, `#rrggbbaa`. */
const COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

const KNOWN_KINDS: readonly PixelAssetKind[] = [
  "character",
  "wearable",
  "held",
  "pedestal",
  "aura",
];

/**
 * Validates an asset. Returns every issue found, in a stable order.
 *
 * Deterministic: the same asset always produces the same list in the same order,
 * which is what makes it usable from a test.
 */
export function validateAsset(asset: PixelAsset): PixelAssetIssue[] {
  const issues: PixelAssetIssue[] = [];
  const push = (code: PixelAssetIssueCode, path: string, message: string) => {
    issues.push({ code, path, message });
  };

  // ── Identity ───────────────────────────────────────────────────────────────
  if (asset.version !== PIXEL_ASSET_VERSION) {
    push(
      "version-unsupported",
      "version",
      `Asset declares version ${asset.version}; this build understands ${PIXEL_ASSET_VERSION}.`,
    );
  }
  if (!asset.id) {
    push("id-missing", "id", "Asset needs an id.");
  } else if (!ID_PATTERN.test(asset.id)) {
    push(
      "id-malformed",
      "id",
      `Asset id ${JSON.stringify(asset.id)} must be "namespace:name" in lowercase kebab-case, e.g. "sylf:practice-wand".`,
    );
  }
  if (!KNOWN_KINDS.includes(asset.kind)) {
    push(
      "kind-unknown",
      "kind",
      `Unknown kind ${JSON.stringify(asset.kind)}. Known kinds: ${KNOWN_KINDS.join(", ")}.`,
    );
  }

  // ── Reference grid ─────────────────────────────────────────────────────────
  const width = asset.reference?.width;
  const height = asset.reference?.height;
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0
  ) {
    push(
      "reference-invalid",
      "reference",
      `Reference grid must be positive whole numbers; got ${width} × ${height}.`,
    );
  } else if (width > MAX_REFERENCE_SIDE || height > MAX_REFERENCE_SIDE) {
    push(
      "reference-too-large",
      "reference",
      `Reference grid ${width} × ${height} exceeds the ${MAX_REFERENCE_SIDE}-cell limit per side.`,
    );
  } else if (width * height > MAX_ASSET_CELLS) {
    push(
      "reference-too-large",
      "reference",
      `Reference grid ${width} × ${height} exceeds the ${MAX_ASSET_CELLS}-cell limit.`,
    );
  }
  const boundsKnown = Number.isInteger(width) && Number.isInteger(height);

  // ── Palette ────────────────────────────────────────────────────────────────
  for (const [key, color] of Object.entries(asset.palette ?? {})) {
    if (key === TRANSPARENT_TOKEN) {
      push(
        "palette-redefines-transparent",
        `palette.${key}`,
        `"." is always transparent and may not be redefined.`,
      );
    }
    if (key.length !== 1) {
      push(
        "palette-color-invalid",
        `palette.${key}`,
        `Palette keys are single characters; ${JSON.stringify(key)} has ${key.length}.`,
      );
    }
    if (!COLOR_PATTERN.test(color)) {
      push(
        "palette-color-invalid",
        `palette.${key}`,
        `Colour ${JSON.stringify(color)} must be #rgb, #rrggbb or #rrggbbaa.`,
      );
    }
  }

  // ── Planes ─────────────────────────────────────────────────────────────────
  const planes = asset.planes ?? [];
  if (planes.length === 0) {
    push("planes-empty", "planes", "An asset needs at least one plane.");
  }

  const planeIds = new Set<string>();
  for (let index = 0; index < planes.length; index += 1) {
    const plane = planes[index];
    const at = `planes[${index}]`;

    if (!plane.id) {
      push("plane-id-missing", `${at}.id`, "Every plane needs an id.");
    } else if (planeIds.has(plane.id)) {
      push(
        "plane-id-duplicate",
        `${at}.id`,
        `Plane id ${JSON.stringify(plane.id)} is used more than once.`,
      );
    } else {
      planeIds.add(plane.id);
      if (!LOCAL_ID_PATTERN.test(plane.id)) {
        push(
          "plane-id-missing",
          `${at}.id`,
          `Plane id ${JSON.stringify(plane.id)} must be lowercase kebab-case.`,
        );
      }
    }

    const palette = { ...(asset.palette ?? {}), ...(plane.palette ?? {}) };
    for (const [key, color] of Object.entries(plane.palette ?? {})) {
      if (!COLOR_PATTERN.test(color)) {
        push(
          "palette-color-invalid",
          `${at}.palette.${key}`,
          `Colour ${JSON.stringify(color)} must be #rgb, #rrggbb or #rrggbbaa.`,
        );
      }
    }

    validateGeometry(plane, palette, boundsKnown ? { width, height } : null, at, push);
  }

  // Every asset-level key must be used somewhere, so a palette does not rot.
  const used = new Set<string>();
  for (const plane of planes) {
    const geometry = plane.geometry;
    if (geometry?.geometry === "raster") {
      for (const row of geometry.rows) {
        for (const token of row) {
          if (token !== TRANSPARENT_TOKEN) used.add(token);
        }
      }
    } else if (geometry?.geometry === "animated") {
      // An animation's palette is the union of its frames', so every frame counts.
      // Frame geometry is validated separately with the raster rules, so a
      // malformed row is reported there rather than silently skipping a colour.
      for (const frame of geometry.frames ?? []) {
        for (const row of frame.rows ?? []) {
          for (const token of row) {
            if (token !== TRANSPARENT_TOKEN) used.add(token);
          }
        }
      }
    } else if (geometry?.geometry === "spans") {
      for (const row of geometry.rows) {
        used.add(row.key);
        if (row.shaded) {
          used.add("H");
          used.add("B");
          used.add("S");
          // A closing edge resolves against `D`, so an asset that declares it is
          // using it.
          if (row.deepEdge) used.add("D");
        }
      }
    }
  }
  if (asset.paletteMode !== "allow-unused") {
    for (const key of Object.keys(asset.palette ?? {})) {
      if (!used.has(key)) {
        push(
          "palette-key-unused",
          `palette.${key}`,
          `Palette key ${JSON.stringify(key)} is never used.`,
        );
      }
    }
  }

  // ── Anchors ────────────────────────────────────────────────────────────────
  const anchorIds = new Set<string>();
  const anchors = asset.anchors ?? [];
  for (let index = 0; index < anchors.length; index += 1) {
    const anchor = anchors[index];
    const at = `anchors[${index}]`;
    if (!anchor.id) {
      push("anchor-id-missing", `${at}.id`, "Every anchor needs an id.");
    } else if (anchorIds.has(anchor.id)) {
      push(
        "anchor-id-duplicate",
        `${at}.id`,
        `Anchor id ${JSON.stringify(anchor.id)} is used more than once.`,
      );
    } else {
      anchorIds.add(anchor.id);
    }
    if (!Number.isFinite(anchor.x) || !Number.isFinite(anchor.y)) {
      push(
        "anchor-not-finite",
        at,
        `Anchor ${JSON.stringify(anchor.id)} must have finite x and y; got (${anchor.x}, ${anchor.y}).`,
      );
      continue;
    }
    if (
      boundsKnown &&
      (anchor.x < 0 || anchor.y < 0 || anchor.x > width || anchor.y > height)
    ) {
      push(
        "anchor-out-of-bounds",
        at,
        `Anchor ${JSON.stringify(anchor.id)} at (${anchor.x}, ${anchor.y}) is outside the ${width} × ${height} reference grid.`,
      );
    }
  }

  // ── States ─────────────────────────────────────────────────────────────────
  const stateIds = new Set<string>();
  const states = asset.states ?? [];
  for (let index = 0; index < states.length; index += 1) {
    const state = states[index];
    const at = `states[${index}]`;
    if (!state.id) {
      push("state-id-missing", `${at}.id`, "Every state needs an id.");
    } else if (stateIds.has(state.id)) {
      push(
        "state-id-duplicate",
        `${at}.id`,
        `State id ${JSON.stringify(state.id)} is used more than once.`,
      );
    } else {
      stateIds.add(state.id);
    }
    for (const ref of [...(state.show ?? []), ...(state.hide ?? [])]) {
      if (!planeIds.has(ref)) {
        push(
          "state-unknown-plane",
          at,
          `State ${JSON.stringify(state.id)} references plane ${JSON.stringify(ref)}, which does not exist.`,
        );
      }
    }
    // A state that selects nothing would render an invisible asset, which is
    // almost always a mistake rather than an intention.
    const shown = state.show ?? [...planeIds];
    const hidden = new Set(state.hide ?? []);
    if (shown.filter((id) => !hidden.has(id)).length === 0) {
      push(
        "state-empty",
        at,
        `State ${JSON.stringify(state.id)} selects no planes.`,
      );
    }
  }

  // ── Animation timing ───────────────────────────────────────────────────────
  const animatedPlanes = planes.filter(
    (plane) => plane.geometry?.geometry === "animated",
  );
  if (asset.animation) {
    if (animatedPlanes.length === 0) {
      push(
        "animation-without-frames",
        "animation",
        "Timing is declared but no plane has animated geometry.",
      );
    }
    const durations = asset.animation.frameDurationsMs ?? [];
    // One duration applies to every frame; otherwise there must be exactly one
    // per frame, or the timing is ambiguous.
    const frameTotal = animatedPlanes.reduce((most, plane) => {
      const geometry = plane.geometry as PixelAnimatedGeometry;
      const count =
        geometry.order && geometry.order.length > 0
          ? geometry.order.length
          : geometry.frames.length;
      return Math.max(most, count);
    }, 0);
    if (durations.length !== 1 && durations.length !== frameTotal) {
      push(
        "animation-durations-mismatch",
        "animation.frameDurationsMs",
        `${durations.length} durations for ${frameTotal} frames. Give one duration for all frames, or one per frame.`,
      );
    }
    for (const duration of durations) {
      if (
        !Number.isInteger(duration) ||
        duration < MIN_FRAME_DURATION_MS ||
        duration > MAX_FRAME_DURATION_MS
      ) {
        push(
          "animation-duration-out-of-range",
          "animation.frameDurationsMs",
          `Frame duration ${duration}ms is outside ${MIN_FRAME_DURATION_MS}–${MAX_FRAME_DURATION_MS}ms.`,
        );
      }
    }
    const total = durations.reduce((sum, value) => sum + value, 0);
    if (durations.length > 1 && total > MAX_TOTAL_DURATION_MS) {
      push(
        "animation-too-long",
        "animation.frameDurationsMs",
        `The animation runs for ${total}ms, over the ${MAX_TOTAL_DURATION_MS}ms limit.`,
      );
    }
  } else if (animatedPlanes.length > 0) {
    push(
      "animation-without-mode",
      "animation",
      "An animated plane needs timing and a playback mode.",
    );
  }

  // ── Attachment ─────────────────────────────────────────────────────────────
  if (asset.attachment) {
    if (!asset.attachment.pivot) {
      push(
        "attachment-missing",
        "attachment.pivot",
        "An attachment needs the pivot anchor on this asset.",
      );
    } else if (!anchorIds.has(asset.attachment.pivot)) {
      push(
        "attachment-pivot-unknown",
        "attachment.pivot",
        `Attachment pivot ${JSON.stringify(asset.attachment.pivot)} is not an anchor on this asset.`,
      );
    }
    if (!asset.attachment.hostAnchor) {
      push(
        "attachment-missing",
        "attachment.hostAnchor",
        "An attachment needs the host anchor to attach to.",
      );
    }
    if (
      asset.attachment.hostKind !== undefined &&
      !KNOWN_KINDS.includes(asset.attachment.hostKind)
    ) {
      push(
        "attachment-host-kind-unknown",
        "attachment.hostKind",
        `Unknown host kind ${JSON.stringify(asset.attachment.hostKind)}.`,
      );
    }
  }

  return issues;
}

type Push = (code: PixelAssetIssueCode, path: string, message: string) => void;

/**
 * Animated geometry.
 *
 * Checked frame by frame with the *same* rules a single raster gets, so an
 * animation cannot smuggle in a row that would be rejected on its own. The play
 * order is checked separately, because an order that names a frame which does not
 * exist is a different mistake from a frame that is malformed.
 */
function validateAnimatedGeometry(
  geometry: PixelAnimatedGeometry,
  palette: Record<string, string>,
  bounds: { width: number; height: number } | null,
  at: string,
  push: Push,
): void {
  const frames = geometry.frames ?? [];
  if (frames.length === 0) {
    push(
      "plane-geometry-empty",
      `${at}.geometry.frames`,
      "An animated plane needs at least one frame.",
    );
    return;
  }
  if (frames.length > MAX_ANIMATION_FRAMES) {
    push(
      "animation-too-many-frames",
      `${at}.geometry.frames`,
      `${frames.length} frames exceeds the limit of ${MAX_ANIMATION_FRAMES}.`,
    );
  }

  for (let index = 0; index < frames.length; index += 1) {
    const frame = frames[index];
    if (!frame || !Array.isArray(frame.rows)) {
      push(
        "plane-geometry-empty",
        `${at}.geometry.frames[${index}]`,
        `Frame ${index} has no rows.`,
      );
      continue;
    }
    validateGeometry(
      { id: `${at}-frame-${index}`, geometry: frame },
      palette,
      bounds,
      `${at}.geometry.frames[${index}]`,
      push,
    );
  }

  if (geometry.order) {
    if (geometry.order.length === 0) {
      push(
        "animation-order-empty",
        `${at}.geometry.order`,
        "A play order with no entries would show nothing.",
      );
    }
    if (geometry.order.length > MAX_ANIMATION_FRAMES) {
      push(
        "animation-too-many-frames",
        `${at}.geometry.order`,
        `A play order of ${geometry.order.length} exceeds the limit of ${MAX_ANIMATION_FRAMES}.`,
      );
    }
    for (const entry of geometry.order) {
      if (!Number.isInteger(entry) || entry < 0 || entry >= frames.length) {
        push(
          "animation-order-out-of-range",
          `${at}.geometry.order`,
          `Play order names frame ${entry}, but there are ${frames.length} frames.`,
        );
      }
    }
  }
}

function validateGeometry(
  plane: PixelPlane,
  palette: Record<string, string>,
  bounds: { width: number; height: number } | null,
  at: string,
  push: Push,
): void {
  const geometry = plane.geometry;
  if (!geometry) {
    push("plane-geometry-empty", `${at}.geometry`, "A plane needs geometry.");
    return;
  }

  if (geometry.geometry === "animated") {
    validateAnimatedGeometry(geometry, palette, bounds, at, push);
    return;
  }

  if (geometry.geometry === "raster") {
    const rows = geometry.rows ?? [];
    if (rows.length === 0) {
      push("plane-geometry-empty", `${at}.geometry.rows`, "Raster has no rows.");
    }
    if (bounds && rows.length > bounds.height) {
      push(
        "raster-rows-exceed-height",
        `${at}.geometry.rows`,
        `Raster has ${rows.length} rows but the reference grid is ${bounds.height} tall.`,
      );
    }
    for (let y = 0; y < rows.length; y += 1) {
      const row = rows[y];
      if (bounds && row.length > bounds.width) {
        push(
          "raster-row-too-wide",
          `${at}.geometry.rows[${y}]`,
          `Row ${y} is ${row.length} tokens wide but the reference grid is ${bounds.width} wide.`,
        );
      }
      for (let x = 0; x < row.length; x += 1) {
        const token = row[x];
        if (token === TRANSPARENT_TOKEN) continue;
        if (palette[token] === undefined) {
          push(
            "palette-key-missing",
            `${at}.geometry.rows[${y}]`,
            `Row ${y}, column ${x} uses token ${JSON.stringify(token)}, which no palette defines.`,
          );
        }
      }
    }
    return;
  }

  const rows: readonly PixelSpanRow[] = geometry.rows ?? [];
  if (rows.length === 0) {
    push("plane-geometry-empty", `${at}.geometry.rows`, "Spans are empty.");
  }
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const rowAt = `${at}.geometry.rows[${index}]`;
    if (
      !Number.isInteger(row.y) ||
      !Number.isInteger(row.from) ||
      !Number.isInteger(row.to)
    ) {
      push(
        "span-not-integer",
        rowAt,
        `Span coordinates must be whole numbers; got y=${row.y}, from=${row.from}, to=${row.to}.`,
      );
      continue;
    }
    if (row.to <= row.from) {
      push(
        "span-empty",
        rowAt,
        `Span has no width: from=${row.from}, to=${row.to} (to is exclusive).`,
      );
    }
    if (palette[row.key] === undefined) {
      push(
        "palette-key-missing",
        rowAt,
        `Span uses key ${JSON.stringify(row.key)}, which no palette defines.`,
      );
    }
    if (row.shaded) {
      const required = row.deepEdge ? ["H", "B", "S", "D"] : ["H", "B", "S"];
      for (const key of required) {
        if (palette[key] === undefined) {
          push(
            "plane-palette-key-missing",
            rowAt,
            `Shaded span${row.deepEdge ? " with a closing edge" : ""} needs ${JSON.stringify(key)} in the palette.`,
          );
        }
      }
    }
    if (bounds) {
      if (
        row.y < 0 ||
        row.y >= bounds.height ||
        row.from < 0 ||
        row.to > bounds.width
      ) {
        push(
          "span-out-of-bounds",
          rowAt,
          `Span y=${row.y}, ${row.from}..${row.to} is outside the ${bounds.width} × ${bounds.height} reference grid.`,
        );
      }
    }
  }
}

/**
 * Throws a single readable error when an asset is invalid.
 *
 * For call sites that load content at module scope, where the alternative is
 * rendering something subtly wrong.
 */
export function assertValidAsset(asset: PixelAsset): void {
  const issues = validateAsset(asset);
  if (issues.length === 0) return;
  const lines = issues.map(
    (issue) => `  - [${issue.code}] ${issue.path}: ${issue.message}`,
  );
  throw new Error(
    `Pixel asset ${asset.id ?? "<no id>"} is invalid:\n${lines.join("\n")}`,
  );
}
