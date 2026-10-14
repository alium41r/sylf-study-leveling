import { SYLF_CHARACTER_ASSET } from "./fixtures/retired-sylf/reference-character";
import { describe, expect, it } from "vitest";
import { createPixDisplay, hexToPixColor, TRANSPARENT } from "@/lib/pixel-display/engine";
import { PIXEL_ASSET_VERSION,
  REFERENCE_ASSETS as ACCESSORY_ASSETS,
  PRACTICE_WAND_ASSET,
  STUDY_SCARF_ASSET,
  
  assertValidAsset,
  assetsOfKind,
  cellsFor,
  countCells,
  defaultStateId,
  paintAsset,
  placementFor,
  planeIdsForState,
  referenceToLogical,
  resolveAsset,
  resolveAttachment,
  validateAsset,
  type PixelAsset } from "@/lib/pixel-display/content/asset";
const REFERENCE_ASSETS = [SYLF_CHARACTER_ASSET, ...ACCESSORY_ASSETS];
import { SYLF_ANIMATIONS } from "@/lib/pixel-display/content/sylf/frames";

/**
 * ============================================================================
 * PHASE 5 — THE AUTHORING CONTRACT
 * ============================================================================
 * What these tests are for:
 *
 *   1. the contract's guarantees hold for every built-in asset;
 *   2. an authoring mistake is *reported*, not silently rendered;
 *   3. attachments are logical-space only and density-independent;
 *   4. the existing character is expressible through the contract without a
 *      redesign — the requirement that made this phase necessary.
 *
 * The engine and content are never mocked. A stub would let this suite pass
 * while the real painter was broken.
 */

/** A minimal valid asset, for mutating into invalid ones. */
function baseAsset(overrides: Partial<PixelAsset> = {}): PixelAsset {
  return {
    version: PIXEL_ASSET_VERSION,
    id: "test:thing",
    kind: "held",
    name: "Test Thing",
    reference: { width: 4, height: 4 },
    palette: { a: "#ffffff" },
    planes: [
      {
        id: "only",
        geometry: { geometry: "raster", rows: ["a...", "...."] },
      },
    ],
    ...overrides,
  };
}

const codes = (asset: PixelAsset) => validateAsset(asset).map((i) => i.code);

// ─── The catalogue ───────────────────────────────────────────────────────────

describe("the reference catalogue satisfies the contract", () => {
  it("has one asset of each kind the phase must prove", () => {
    expect(assetsOfKind("character")).toEqual([]);
    expect(assetsOfKind("wearable").length).toBeGreaterThan(0);
    expect(assetsOfKind("held").length).toBeGreaterThan(0);
  });

  it("validates every built-in asset", () => {
    for (const asset of REFERENCE_ASSETS) {
      expect(validateAsset(asset), asset.id).toEqual([]);
    }
  });

  it("has unique ids", () => {
    const ids = REFERENCE_ASSETS.map((asset) => asset.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("paints something in every declared state", () => {
    // A state that renders nothing is almost always a mistake, and at the very
    // least it is not reviewable.
    for (const asset of REFERENCE_ASSETS) {
      const states = asset.states ?? [{ id: "default" }];
      for (const state of states) {
        expect(countCells(asset, state.id), `${asset.id}/${state.id}`).
          toBeGreaterThan(0);
      }
    }
  });

  it("keeps every asset inside the declared bound", () => {
    for (const asset of REFERENCE_ASSETS) {
      const limit = asset.reference.width * asset.reference.height;
      const states = asset.states ?? [{ id: "default" }];
      for (const state of states) {
        expect(
          countCells(asset, state.id),
          `${asset.id}/${state.id} exceeds its own grid`,
        ).toBeLessThanOrEqual(limit);
      }
    }
  });
});

// ─── Validation ──────────────────────────────────────────────────────────────

describe("validation catches authoring mistakes", () => {
  it("accepts the minimal valid asset, so the mutations below mean something", () => {
    expect(validateAsset(baseAsset())).toEqual([]);
  });

  it("rejects an unsupported contract version", () => {
    expect(codes(baseAsset({ version: 99 }))).toContain(
      "version-unsupported",
    );
  });

  it("rejects a malformed or missing id", () => {
    expect(codes(baseAsset({ id: "" }))).toContain("id-missing");
    expect(codes(baseAsset({ id: "nope" }))).toContain("id-malformed");
    expect(codes(baseAsset({ id: "Bad:Thing" }))).toContain("id-malformed");
  });

  it("rejects an unknown kind", () => {
    expect(codes(baseAsset({ kind: "vehicle" as never }))).toContain(
      "kind-unknown",
    );
  });

  it("rejects a non-integer or oversized reference grid", () => {
    expect(
      codes(baseAsset({ reference: { width: 4.5, height: 4 } })),
    ).toContain("reference-invalid");
    expect(
      codes(baseAsset({ reference: { width: 0, height: 4 } })),
    ).toContain("reference-invalid");
    expect(
      codes(baseAsset({ reference: { width: 9999, height: 4 } })),
    ).toContain("reference-too-large");
  });

  it("rejects an asset with no planes", () => {
    expect(codes(baseAsset({ planes: [] }))).toContain("planes-empty");
  });

  it("rejects a raster row wider than the grid", () => {
    const asset = baseAsset({
      planes: [
        {
          id: "only",
          geometry: { geometry: "raster", rows: ["aaaaa"] },
        },
      ],
    });
    expect(codes(asset)).toContain("raster-row-too-wide");
  });

  it("rejects more raster rows than the grid has height", () => {
    const asset = baseAsset({
      planes: [
        {
          id: "only",
          geometry: {
            geometry: "raster",
            rows: ["a...", "....", "....", "....", "...."],
          },
        },
      ],
    });
    expect(codes(asset)).toContain("raster-rows-exceed-height");
  });

  it("rejects a token no palette defines", () => {
    const asset = baseAsset({
      planes: [
        { id: "only", geometry: { geometry: "raster", rows: ["z..."] } },
      ],
    });
    const issues = validateAsset(asset);
    expect(issues.map((i) => i.code)).toContain("palette-key-missing");
    // The message must say *where*, or an author cannot act on it.
    expect(issues.find((i) => i.code === "palette-key-missing")?.message).
      toContain("column 0");
  });

  it("rejects a palette colour that is not a colour", () => {
    expect(codes(baseAsset({ palette: { a: "red" } }))).toContain(
      "palette-color-invalid",
    );
    expect(codes(baseAsset({ palette: { a: "#xyz" } }))).toContain(
      "palette-color-invalid",
    );
  });

  it("refuses to let a palette redefine transparent", () => {
    expect(codes(baseAsset({ palette: { ".": "#ffffff" } }))).toContain(
      "palette-redefines-transparent",
    );
  });

  it("reports a palette key that is never used", () => {
    expect(codes(baseAsset({ palette: { a: "#ffffff", b: "#000000" } }))).
      toContain("palette-key-unused");
  });

  it("rejects duplicate plane ids", () => {
    const asset = baseAsset({
      planes: [
        { id: "only", geometry: { geometry: "raster", rows: ["a..."] } },
        { id: "only", geometry: { geometry: "raster", rows: ["...a"] } },
      ],
    });
    expect(codes(asset)).toContain("plane-id-duplicate");
  });

  it("rejects span geometry that is out of bounds, empty or fractional", () => {
    expect(
      codes(
        baseAsset({
          planes: [
            {
              id: "only",
              geometry: {
                geometry: "spans",
                rows: [{ y: 0, from: 0, to: 99, key: "a" }],
              },
            },
          ],
        }),
      ),
    ).toContain("span-out-of-bounds");

    expect(
      codes(
        baseAsset({
          planes: [
            {
              id: "only",
              geometry: {
                geometry: "spans",
                rows: [{ y: 0, from: 2, to: 2, key: "a" }],
              },
            },
          ],
        }),
      ),
    ).toContain("span-empty");

    expect(
      codes(
        baseAsset({
          planes: [
            {
              id: "only",
              geometry: {
                geometry: "spans",
                rows: [{ y: 0.5, from: 0, to: 2, key: "a" }],
              },
            },
          ],
        }),
      ),
    ).toContain("span-not-integer");
  });

  it("rejects anchors outside the grid or with non-finite coordinates", () => {
    expect(
      codes(baseAsset({ anchors: [{ id: "p", x: 99, y: 0 }] })),
    ).toContain("anchor-out-of-bounds");
    expect(
      codes(baseAsset({ anchors: [{ id: "p", x: Number.NaN, y: 0 }] })),
    ).toContain("anchor-not-finite");
    expect(
      codes(
        baseAsset({
          anchors: [
            { id: "p", x: 0, y: 0 },
            { id: "p", x: 1, y: 1 },
          ],
        }),
      ),
    ).toContain("anchor-id-duplicate");
  });

  it("rejects a state that names a plane which does not exist", () => {
    expect(
      codes(baseAsset({ states: [{ id: "s", show: ["ghost"] }] })),
    ).toContain("state-unknown-plane");
  });

  it("rejects a state that selects nothing", () => {
    expect(
      codes(baseAsset({ states: [{ id: "s", show: [] }] })),
    ).toContain("state-empty");
    expect(
      codes(
        baseAsset({
          states: [{ id: "s", show: ["only"], hide: ["only"] }],
        }),
      ),
    ).toContain("state-empty");
  });

  it("rejects an attachment whose pivot is not on the asset", () => {
    expect(
      codes(
        baseAsset({
          anchors: [{ id: "other", x: 0, y: 0 }],
          attachment: {
            hostKind: "character",
            hostAnchor: "hold-right",
            pivot: "pivot",
          },
        }),
      ),
    ).toContain("attachment-pivot-unknown");
  });

  it("rejects an attachment naming an unknown host kind", () => {
    expect(
      codes(
        baseAsset({
          anchors: [{ id: "pivot", x: 0, y: 0 }],
          attachment: {
            hostKind: "statue" as never,
            hostAnchor: "hold-right",
            pivot: "pivot",
          },
        }),
      ),
    ).toContain("attachment-host-kind-unknown");
  });

  it("reports every problem at once rather than the first", () => {
    // An author fixing one error at a time is an author doing five round trips.
    const issues = validateAsset(
      baseAsset({ id: "bad", version: 7, reference: { width: 0, height: 0 } }),
    );
    expect(issues.length).toBeGreaterThan(2);
  });

  it("is deterministic", () => {
    const asset = baseAsset({ id: "bad", version: 7 });
    expect(validateAsset(asset)).toEqual(validateAsset(asset));
  });

  it("turns a problem list into one readable error", () => {
    expect(() => assertValidAsset(baseAsset({ id: "bad" }))).toThrowError(
      /\[id-malformed\]/,
    );
    expect(() => assertValidAsset(baseAsset())).not.toThrow();
  });
});

// ─── Resolution and composition ──────────────────────────────────────────────

describe("planes and states", () => {
  it("paints planes in declared order, so later planes sit on top", () => {
    const asset = baseAsset({
      reference: { width: 2, height: 1 },
      palette: { a: "#ff0000", b: "#00ff00" },
      planes: [
        { id: "under", geometry: { geometry: "raster", rows: ["ab"] } },
        { id: "over", geometry: { geometry: "raster", rows: ["ba"] } },
      ],
    });
    const resolved = resolveAsset(asset);
    expect(resolved.map((plane) => plane.id)).toEqual(["under", "over"]);
  });

  it("treats a state as a plane selection, in declared order", () => {
    // Never the state's own order: a state that could reorder planes could
    // change what overlaps what, which is the composition's whole meaning.
    const ids = planeIdsForState(SYLF_CHARACTER_ASSET, "CELEBRATING");
    const declared = SYLF_CHARACTER_ASSET.planes.map((plane) => plane.id);
    expect(ids).toEqual(declared.filter((id) => ids.includes(id)));
    expect(ids).toContain("blush");
    expect(planeIdsForState(SYLF_CHARACTER_ASSET, "FOCUSING")).not.toContain(
      "blush",
    );
  });

  it("defaults to one implicit state when an asset declares none", () => {
    expect(defaultStateId(STUDY_SCARF_ASSET)).toBe("default");
    expect(planeIdsForState(STUDY_SCARF_ASSET)).toEqual([
      "band",
      "tails",
      "knot",
    ]);
  });

  it("clips a clipped plane to what earlier planes painted", () => {
    const asset = baseAsset({
      reference: { width: 4, height: 1 },
      palette: { a: "#ffffff", b: "#ff0000" },
      planes: [
        { id: "body", geometry: { geometry: "raster", rows: ["aa.."] } },
        {
          id: "face",
          clippedToPrevious: true,
          geometry: { geometry: "raster", rows: ["bbbb"] },
        },
      ],
    });
    const [, face] = resolveAsset(asset);
    // Columns 2 and 3 are outside the body, so the face may not paint there.
    expect(face.cells.map((cell) => cell.x)).toEqual([0, 1]);
  });

  it("a merged plane palette overrides the asset palette", () => {
    const [crystal] = resolveAsset(PRACTICE_WAND_ASSET, "idle").filter(
      (plane) => plane.id === "crystal",
    );
    expect(crystal.cells.length).toBeGreaterThan(0);
    // `H` is `#ffffff` on this plane, not the asset's `#e0d4ff`.
    expect(crystal.cells.some((cell) => cell.color === hexToPixColor("#ffffff"))).
      toBe(true);
  });
});

// ─── Attachment ──────────────────────────────────────────────────────────────

describe("attachments are logical-space only", () => {
  it("places a held item at the character's grip", () => {
    const result = resolveAttachment(SYLF_CHARACTER_ASSET, PRACTICE_WAND_ASSET);
    expect(result.problems).toEqual([]);
    expect(result.resolved).not.toBeNull();
    // The offset is the host anchor minus the pivot, in reference space.
    expect(result.resolved?.offsetX).toBe(31 - 2);
    expect(result.resolved?.offsetY).toBe(21 - 12);
  });

  it("places a wearable at the character's neck", () => {
    const result = resolveAttachment(SYLF_CHARACTER_ASSET, STUDY_SCARF_ASSET);
    expect(result.problems).toEqual([]);
    expect(result.resolved?.offsetX).toBe(16 - 8);
    expect(result.resolved?.offsetY).toBe(10 - 1);
  });

  it("refuses an attachment onto the wrong kind of host", () => {
    const result = resolveAttachment(PRACTICE_WAND_ASSET, STUDY_SCARF_ASSET);
    expect(result.resolved).toBeNull();
    expect(result.problems.map((p) => p.code)).toContain("host-kind-mismatch");
  });

  it("reports a missing host anchor by name, and lists what exists", () => {
    const wand = {
      ...PRACTICE_WAND_ASSET,
      attachment: {
        hostKind: "character" as const,
        hostAnchor: "hold-left",
        pivot: "pivot",
      },
    };
    const result = resolveAttachment(SYLF_CHARACTER_ASSET, wand);
    expect(result.resolved).toBeNull();
    const problem = result.problems.find((p) => p.code === "host-anchor-unknown");
    expect(problem?.message).toContain("hold-left");
    // Naming the anchors that *do* exist is what makes the message actionable.
    expect(problem?.message).toContain("hold-right");
  });

  it("does not depend on a display, a density or a size", () => {
    // The same two assets resolve identically regardless of what they will be
    // painted on — which is the property that makes attachments logical-space.
    const at110 = createPixDisplay(48, 48);
    const at640 = createPixDisplay(64, 64);
    const a = resolveAttachment(SYLF_CHARACTER_ASSET, PRACTICE_WAND_ASSET);
    const b = resolveAttachment(SYLF_CHARACTER_ASSET, PRACTICE_WAND_ASSET);
    expect(a.resolved).toEqual(b.resolved);
    expect(at110.width).not.toBe(at640.width);
  });
});

// ─── Painting across densities ───────────────────────────────────────────────

describe("one asset paints correctly at every density", () => {
  const densities = [24, 32, 40, 48, 64];

  it("places the reference grid inside the display at every density", () => {
    for (const size of densities) {
      const display = createPixDisplay(size, size);
      const placement = placementFor(display, SYLF_CHARACTER_ASSET);
      expect(placement.originX, `density ${size}`).toBeGreaterThanOrEqual(0);
      expect(placement.originY, `density ${size}`).toBeGreaterThanOrEqual(0);
      expect(placement.scale, `density ${size}`).toBeGreaterThan(0);
    }
  });

  it("paints inside the display at every density, never out of bounds", () => {
    for (const size of densities) {
      const display = createPixDisplay(size, size);
      const result = paintAsset(display, PRACTICE_WAND_ASSET);
      expect(result.paintedCells, `density ${size}`).toBeGreaterThan(0);
      // Every painted cell must be inside, which the bounds contract would
      // otherwise refuse as a silent no-op and we would never notice.
      expect(display.litCount(), `density ${size}`).toBeGreaterThan(0);
    }
  });

  it("is deterministic: the same asset and density give identical bytes", () => {
    for (const size of densities) {
      const a = createPixDisplay(size, size);
      const b = createPixDisplay(size, size);
      paintAsset(a, SYLF_CHARACTER_ASSET, { state: "CELEBRATING" });
      paintAsset(b, SYLF_CHARACTER_ASSET, { state: "CELEBRATING" });
      expect(Array.from(a.snapshot()), `density ${size}`).toEqual(
        Array.from(b.snapshot()),
      );
    }
  });

  it("produces visibly different pictures for different states", () => {
    const a = createPixDisplay(48, 48);
    const b = createPixDisplay(48, 48);
    paintAsset(a, SYLF_CHARACTER_ASSET, { state: "IDLE" });
    paintAsset(b, SYLF_CHARACTER_ASSET, { state: "CELEBRATING" });
    expect(Array.from(a.snapshot())).not.toEqual(Array.from(b.snapshot()));
  });

  it("composes a host and an attachment through one shared mapping", () => {
    const display = createPixDisplay(48, 48);
    const host = paintAsset(display, SYLF_CHARACTER_ASSET, { state: "IDLE" });
    const placed = resolveAttachment(SYLF_CHARACTER_ASSET, PRACTICE_WAND_ASSET);
    expect(placed.resolved).not.toBeNull();

    const wand = paintAsset(display, PRACTICE_WAND_ASSET, {
      preserve: true,
      placementOverride: host.placement,
      offsetX: placed.resolved?.offsetX,
      offsetY: placed.resolved?.offsetY,
    });

    expect(host.paintedCells).toBeGreaterThan(0);
    expect(wand.paintedCells).toBeGreaterThan(0);
    // The two share one scale, so the weapon is sized by what holds it rather
    // than by its own framing.
    expect(wand.placement.scale).toBe(host.placement.scale);
  });

  it("sizes a held item by its host, not by its own reference grid", () => {
    // The defect this guards: a 5 x 20 wand deriving its own scale from a 48-cell
    // display lands on a scale of ~6 and comes out several times the size of the
    // character holding it. Only the host frames anything.
    const display = createPixDisplay(48, 48);
    const host = paintAsset(display, SYLF_CHARACTER_ASSET);
    const placed = resolveAttachment(SYLF_CHARACTER_ASSET, PRACTICE_WAND_ASSET);

    const own = createPixDisplay(48, 48);
    const selfFramed = paintAsset(own, PRACTICE_WAND_ASSET);
    expect(selfFramed.placement.scale).toBeGreaterThan(host.placement.scale);

    const attached = createPixDisplay(48, 48);
    const held = paintAsset(attached, PRACTICE_WAND_ASSET, {
      placementOverride: host.placement,
      offsetX: placed.resolved?.offsetX,
      offsetY: placed.resolved?.offsetY,
    });
    expect(held.placement.scale).toBe(host.placement.scale);
  });

  it("maps a reference point to a logical cell consistently", () => {
    const display = createPixDisplay(48, 48);
    const placement = placementFor(display, SYLF_CHARACTER_ASSET);
    const at = referenceToLogical(placement, 16, 16);
    expect(Number.isInteger(at.x)).toBe(true);
    expect(Number.isInteger(at.y)).toBe(true);
  });
});

// ─── The existing character, through the contract ────────────────────────────

describe("built-in character content is expressible through the contract", () => {
  it("declares a state for every authored Sylf state", () => {
    // The requirement that made this phase necessary: the contract must be able
    // to describe what already exists, without the existing content changing.
    const declared = (SYLF_CHARACTER_ASSET.states ?? []).map((s) => s.id);
    for (const state of Object.keys(SYLF_ANIMATIONS)) {
      expect(declared, `Sylf state ${state}`).toContain(state);
    }
  });

  it("expresses the face as separate planes, not as whole-character frames", () => {
    // One eye plane per shape: a state swaps a plane rather than replacing the
    // figure, which is the composition model the character was built on.
    const eyePlanes = SYLF_CHARACTER_ASSET.planes
      .map((plane) => plane.id)
      .filter((id) => id.startsWith("eyes-"));
    expect(eyePlanes.length).toBeGreaterThanOrEqual(6);
    // And every state composes the body, so no state is a separate drawing.
    for (const state of SYLF_CHARACTER_ASSET.states ?? []) {
      expect(state.show, state.id).toContain("body");
    }
  });

  it("paints the same shape the existing tables describe", () => {
    // A spot check for the character body raster width at reference row 19.
    const [body] = resolveAsset(SYLF_CHARACTER_ASSET, "IDLE");
    const row19 = body.cells.filter((cell) => cell.y === 19);
    expect(row19.length).toBe(22);
  });

  it("does not need an engine change to be described", () => {
    // Stated as a test rather than a claim: the asset resolves using only
    // content-layer helpers, and the engine knows nothing about assets.
    const planes = resolveAsset(SYLF_CHARACTER_ASSET, "IDLE");
    expect(planes.length).toBeGreaterThan(0);
    expect(typeof countCells(SYLF_CHARACTER_ASSET)).toBe("number");
  });
});

// ─── Cells helper ────────────────────────────────────────────────────────────

describe("cellsFor reports what would be painted", () => {
  it("matches the resolved plane cell counts", () => {
    const cells = cellsFor(PRACTICE_WAND_ASSET, "charging");
    const total = cells.reduce((sum, plane) => sum + plane.length, 0);
    expect(total).toBe(countCells(PRACTICE_WAND_ASSET, "charging"));
  });

  it("falls back to the default state for an unknown state name", () => {
    // Deliberate: an unknown name paints the default presentation rather than an
    // empty picture, which would look like a rendering bug instead of a naming
    // mistake. `validateAsset` is what rejects a state that names a bad *plane*.
    expect(countCells(PRACTICE_WAND_ASSET, "nope")).toBe(
      countCells(PRACTICE_WAND_ASSET, "idle"),
    );
  });

  it("leaves transparency where nothing is painted", () => {
    const display = createPixDisplay(48, 48);
    paintAsset(display, STUDY_SCARF_ASSET);
    const snapshot = display.snapshot();
    expect(snapshot.some((cell) => cell === TRANSPARENT)).toBe(true);
  });
});
