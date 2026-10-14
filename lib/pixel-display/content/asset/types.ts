/**
 * ============================================================================
 * PIXEL ASSET — THE AUTHORING CONTRACT
 * ============================================================================
 * One versioned, declarative description of a piece of Pixel Display content.
 *
 * WHY THIS EXISTS
 *   Before Phase 5, adding content meant writing coordinate code against
 *   `createPlaneMapping`, `setPixel` and the plane registry — reading the
 *   engine's source to find out what a legal coordinate was. That is fine for an
 *   engine and wrong for an authoring workflow: a person or an agent should be
 *   able to describe *what the thing looks like* without knowing how it is
 *   rasterised.
 *
 *   So this module knows only authoring concepts. It has no renderer, no
 *   runtime, no DOM, no application module, and it never rasterises anything —
 *   it describes, and it validates descriptions.
 *
 * WHAT IS DELIBERATELY ABSENT
 *   No scene graph, no inheritance, no scripting, no expressions, no conditional
 *   geometry. An asset is data a reviewer can read top to bottom. The roadmap is
 *   explicit that a DSL is not to be invented without evidence, and nothing in
 *   the reference assets needs one.
 *
 * THE THREE KINDS
 *   Only the kinds the reference assets demonstrate — `character`, `wearable`,
 *   `held`. A kind is not a behaviour; it is a statement about what the asset is
 *   for, which is what lets an attachment rule ask for "a held thing" without
 *   naming a specific weapon.
 * ============================================================================
 */

// ─── Vocabulary ───────────────────────────────────────────────────────────────

/**
 * The contract's version.
 *
 * Bumped when a change would make an existing asset mean something different or
 * stop validating. Additive changes with defaults do not need a bump.
 */
export const PIXEL_ASSET_VERSION = 1;

/**
 * What an asset is for.
 *
 * `pedestal` and `aura` were added in Phase 6, and only because a real cosmetic
 * category needed them. The existing catalogue has a pedestal slot and an aura
 * slot, and neither is a wearable or a held item: a pedestal is *under* the
 * character and an aura is *around* it. Forcing either into an existing kind
 * would have meant an anchor that lied about what it attached to.
 *
 * This is the smallest extension that made the real catalogue expressible. It is
 * deliberately not a taxonomy: there is no `hat`, `cape`, `trail` or `emote`,
 * because no existing cosmetic key needs one.
 */
export type PixelAssetKind =
  | "character"
  | "wearable"
  | "held"
  | "pedestal"
  | "aura";

/**
 * A palette: one character standing for one colour.
 *
 * Single characters because geometry is authored as text. `.` is always
 * transparent and may not be redefined, so empty space reads the same in every
 * asset.
 */
export type PixelPalette = Readonly<Record<string, string>>;

export const TRANSPARENT_TOKEN = ".";

// ─── Geometry ─────────────────────────────────────────────────────────────────

/**
 * Geometry as rows of tokens.
 *
 * The preferred form, and the reason this contract is authorable: a row of text
 * is something a person or an agent can write, read and diff, and a row of the
 * wrong length is visible rather than silently wrong. Rows run top to bottom,
 * columns left to right, exactly as they read.
 */
export interface PixelRasterGeometry {
  readonly geometry: "raster";
  readonly rows: readonly string[];
}

/**
 * Geometry that changes per animation frame.
 *
 * THE CONTRACT EXTENSION PHASE 8 NEEDED, AND THE MISMATCH THAT REQUIRED IT
 *   A `PixelAsset` as Phase 5 defined it is a **static** description: one set of
 *   planes, one picture. A user-drawn animation is the same drawing changing over
 *   time, and the concrete failure was exact — there was no way to say "these
 *   pixels at 240 ms, those pixels at 240 ms" without either declaring one plane
 *   per frame (which would make an 8-frame drawing an 8-plane asset and would
 *   defeat plane selection entirely) or creating a second kind of content with
 *   its own renderer.
 *
 *   So the smallest extension that closes it: geometry may name a list of frames,
 *   and an asset may declare timing. Everything else about the contract is
 *   unchanged — a frame is still rows of tokens, still validated the same way,
 *   still painted by the same code.
 *
 * WHY FRAMES LIVE ON THE GEOMETRY AND NOT ON THE ASSET
 *   A user creation has exactly one drawing that changes; a hand-authored asset
 *   with several planes might animate only one of them. Putting frames on the
 *   geometry means both are expressible and neither is a special case.
 */
export interface PixelAnimatedGeometry {
  readonly geometry: "animated";
  /** At least one frame. Frame order is play order. */
  readonly frames: readonly PixelRasterGeometry[];
  /**
   * Frames to play, when that differs from `frames`.
   *
   * This is the "share unchanged data" affordance: a 6-frame drawing where four
   * frames are identical declares four frames and a play order of six, instead of
   * storing the same rows six times.
   */
  readonly order?: readonly number[];
}

/**
 * How an animated asset plays.
 *
 * A deliberately small vocabulary. A saved creation is **not** wired to task
 * completion, level-ups or AI-thinking — those remain system behaviours — so the
 * only question is whether the animation runs once on demand or loops while it is
 * equipped.
 */
export interface PixelAnimation {
  readonly mode: "once" | "loop";
  /** Milliseconds each frame is held. One entry per frame, or one for all. */
  readonly frameDurationsMs: readonly number[];
}

/**
 * A horizontal run on one row, with optional authored shading.
 *
 * The alternative to a raster, for shapes easier to describe as spans: a
 * symmetric silhouette, or one whose shading is derived from its own width
 * rather than from authored characters. `shaded` marks a run lit from its
 * leading edge — the painter splits it into highlight, mid tone and shade by
 * proportion, which is what the Sylf body uses.
 */
export interface PixelSpanRow {
  readonly y: number;
  readonly from: number;
  /** Exclusive. */
  readonly to: number;
  readonly key: string;
  /** Split this run into highlight / mid / shade by proportion. */
  readonly shaded?: boolean;
  /** Render the final column in the shade key, for a closing edge. */
  readonly deepEdge?: boolean;
}

export interface PixelSpanGeometry {
  readonly geometry: "spans";
  readonly rows: readonly PixelSpanRow[];
}

export type PixelGeometry =
  | PixelRasterGeometry
  | PixelSpanGeometry
  | PixelAnimatedGeometry;

// ─── Planes, anchors, states ──────────────────────────────────────────────────

/**
 * One flat plane.
 *
 * Planes paint in array order, first to last, so later planes sit on top. That
 * ordering **is** the composition model: no z-index, no parent, no layer
 * hierarchy, and nothing to resolve. An asset that needs something in front
 * declares it later.
 */
export interface PixelPlane {
  /** Unique within the asset. Referenced by states and by review tooling. */
  readonly id: string;
  /** Shown in review tooling. Not used for composition. */
  readonly label?: string;
  /**
   * Whether this plane may paint only where an earlier plane already painted.
   *
   * The face on a character is the motivating case: cheeks and eyes are authored
   * independently and could otherwise land beside the silhouette. `true` makes
   * the earlier planes the authority for what counts as "on the asset".
   */
  readonly clippedToPrevious?: boolean;
  readonly geometry: PixelGeometry;
  /**
   * Which frame of an `animated` geometry the initial composite shows.
   *
   * Zero for every hand-authored asset, which is why it is optional.
   */
  readonly initialFrame?: number;
  /**
   * Keys this plane uses that are not in the asset palette.
   *
   * A plane may bring its own colours when they are not shared — a weapon's
   * grip, say. Merged over the asset palette, so an asset palette stays the
   * common vocabulary and a plane's is the exception.
   */
  readonly palette?: PixelPalette;
}

/**
 * A named logical point in the asset's own reference space.
 *
 * Anchors are the entire attachment model. A character declares where a held
 * thing belongs; a held thing declares where it is gripped. Both are authored in
 * reference coordinates, so neither knows anything about a display, a CSS size,
 * a device pixel ratio or a density — the runtime mapping is applied once, at
 * paint time.
 *
 * There is deliberately **no universal socket taxonomy**. Only the anchors the
 * reference assets need exist. A later phase adds vocabulary when a real asset
 * demonstrates the need, which is the opposite of guessing a full skeleton now.
 */
export interface PixelAnchor {
  readonly id: string;
  /** Reference-space column. May be fractional for fine alignment. */
  readonly x: number;
  /** Reference-space row. */
  readonly y: number;
  readonly label?: string;
}

/**
 * A named presentation of the asset.
 *
 * States select **planes and nothing else**. A state is never a separate set of
 * pixels for the whole asset: `{ show: ["body", "eyes-happy"] }` means "swap
 * which planes are visible", not "here is another drawing of the character".
 * That is what keeps an asset's parts reusable across all of its states.
 */
export interface PixelAssetState {
  readonly id: string;
  /** Shown in review tooling. */
  readonly label?: string;
  /**
   * Plane ids in paint order. Omitted means every plane in declared order, which
   * is the right default for an asset with only one presentation.
   */
  readonly show?: readonly string[];
  /**
   * Plane ids to leave out, applied after `show`. The dev surface uses this for
   * isolation; an asset can use it for a state that is "the usual thing, minus
   * one part".
   */
  readonly hide?: readonly string[];
}

// ─── The asset ────────────────────────────────────────────────────────────────

/**
 * How an asset attaches to another.
 *
 * Two anchors are named and nothing else: where the host offers a position, and
 * where the attached asset wants to be held. Resolution is one subtraction in
 * reference space, which is the smallest model that makes "a weapon sits in the
 * character's hand" expressible without hardcoding a coordinate anywhere.
 */
export interface PixelAttachment {
  /**
   * Anchor on the **host** asset that this asset attaches to.
   *
   * `hostKind` says what sort of host is acceptable, so a held item can require
   * a character without this module knowing what a character is.
   */
  readonly hostKind?: PixelAssetKind;
  /** Anchor id on the host. */
  readonly hostAnchor: string;
  /** Anchor id **on this asset** that meets `hostAnchor`. Named `pivot`. */
  readonly pivot: string;
}

/**
 * Looks an asset up by id.
 *
 * A function rather than a map, so a consumer never depends on where assets come
 * from, and so a test can inject a deliberately broken catalogue.
 */
export type AssetLookup = (id: string) => PixelAsset | undefined;

/**
 * A complete Pixel Asset.
 *
 * Everything needed to validate it, preview it, and paint it — and nothing else.
 */
export interface PixelAsset {
  /** Content revision, independent of the format version and persistent ID. */
  readonly revision?: number;
  /** Contract version this asset was authored against. */
  readonly version: number;
  /**
   * Stable identity, `namespace:name` with a lowercase kebab name.
   *
   * Namespaced because built-in, agent-authored and eventually user-authored
   * assets must be able to share one catalogue without collisions.
   */
  readonly id: string;
  readonly kind: PixelAssetKind;
  /** Human-readable name for review tooling. */
  readonly name: string;
  /** Shown in review tooling. */
  readonly description?: string;
  /**
   * The logical grid this asset's coordinates live on.
   *
   * Authoring-only. The painter maps it onto whatever display it is asked to
   * paint on, so one asset renders at every density and every physical size
   * without change.
   */
  readonly reference: { readonly width: number; readonly height: number };
  /**
   * How the reference grid maps into the display.
   *
   * `"fit-short-side"` scales the reference so its *short* side occupies
   * `scaleShare` of the display's short side — the behaviour every Phase 0–4
   * asset has, and the reason one asset looks right at 110 px and at 640 px.
   * Vertical placement is a share of the leftover space, so an asset whose art
   * sits low in its grid keeps sitting low at every size.
   */
  readonly framing?: {
    readonly scale?: "fit-short-side";
    readonly scaleShare?: number;
    readonly verticalBias?: number;
    readonly horizontalBias?: number;
  };
  readonly palette: PixelPalette;
  /**
   * Whether a palette colour nothing paints is an error.
   *
   * `"strict"` — the default — keeps hand-authored assets honest: a colour that
   * rots in a palette is a colour nobody trusts.
   *
   * `"allow-unused"` exists for **user creations**. A scholar's palette is a tool
   * they have chosen, not a description of the drawing, so `#a179fb` sitting
   * unused until they need it is correct rather than a mistake. Rejecting it
   * would mean a creation became invalid the moment its last purple pixel was
   * erased, which is not a rule anyone could keep.
   */
  readonly paletteMode?: "strict" | "allow-unused";
  readonly planes: readonly PixelPlane[];
  readonly anchors?: readonly PixelAnchor[];
  /**
   * Named presentations. Omitted means a single implicit `default` state showing
   * every plane, which is correct for an asset with one look — an accessory does
   * not need a state table to exist.
   */
  readonly states?: readonly PixelAssetState[];
  readonly attachment?: PixelAttachment;
  /** Present only when a plane carries `animated` geometry. */
  readonly animation?: PixelAnimation;
}
