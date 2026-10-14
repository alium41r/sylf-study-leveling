# Pixel Asset authoring guide

**For coding agents and developers.** Everything needed to add a valid Pixel
Display asset without reading the canvas renderer, the runtime, or any existing
coordinate code.

Contract source: [`lib/pixel-display/content/asset/`](../../lib/pixel-display/content/asset/)
· Types: [`types.ts`](../../lib/pixel-display/content/asset/types.ts)
· Validate: [`validate.ts`](../../lib/pixel-display/content/asset/validate.ts)

---

## Current creation and presentation rules

The [current contract](pixel-display-contract.md#current-product-contract) owns
native sampling, density, revisions and target-user delivery. User-authored
`PixelCreation` is a version-1 document on immutable 32/40/48/64 grids;
`creationToAsset` places it at scaleShare **1**. Original density copies cells
one-to-one. Explicit density resamples destination centers deterministically;
never change the source document to implement a display setting or editor zoom.

Use the shared explicit `PixelCompanion` presenter for previews. Drive Studio's
selected frame/playhead explicitly; a thumbnail holds frame one. Equal input
owner/revision/frame/density/parts must yield equal logical bytes on all surfaces.
Creation conversion/content identity caches assume immutable input objects.
Revision changes are metadata, but same-ID geometry/palette/timing changes must
also invalidate content.

Creations have a **stage ground anchor only**, not inferred body anatomy.
Unsupported wearables/tools must degrade with feedback. Creation effects use the
occupied mask and never invent Sylf ambience. Do not infer eye roles from a user's
palette. Existing Sylf pulse preserves its authored eye ink. `referenceWrites`
counts source writes; framebuffer bytes/occupied masks prove visual correctness.

Save uses stable name-independent identity and expected revision; authoring does
not redefine persistence, ownership or privacy. New art/forms require an explicit
product decision; this consolidation adds no final-art redesign or catalog promises.

PixelCreation rows encode palette indices with0123456789abcdef (`.` transparent),
supporting all16 unique RGB colors. Selecting a spectrum/hex/recent brush color
never recolors saved pixels; palette allocation and history occur with painting.
A fully used palette refuses additional colors. The editor shows black with
accurate authored-cell grid borders. `pixelGap` and `displayBorder` are separate
CharacterConfig presentation fields; zero gap and unclipped edges preserve native
user artwork. Never serialize them or editor zoom into the creation document.

---

## 0. The short version

1. Copy an existing asset in
   [`content/asset/reference/`](../../lib/pixel-display/content/asset/reference/).
2. Change the `id`, `reference`, `palette` and `planes`.
3. Register it in
   [`reference/index.ts`](../../lib/pixel-display/content/asset/reference/index.ts).
4. Run `npm run test -- --run __tests__/pixel-display/pixel-asset.test.ts`.
5. Look at it in `/dev/pixel-display` → **Asset review**.

That is the whole workflow. Everything below is detail.

---

## 1. What files constitute a Pixel Asset

**One TypeScript file exporting one `PixelAsset` object.** That is the entire
unit. There is no build step, no manifest, no sidecar image, no registration
beyond adding it to the catalogue list.

```
lib/pixel-display/content/asset/
  types.ts        the contract — read this to know what fields exist
  resolve.ts      geometry → cells
  validate.ts     every rule, as data
  attachment.ts   host anchor − pivot
  paint.ts        reference space → logical cells
  reference/      the built-in catalogue
    sylf-character.ts   character   (wrapped, not raster-authored)
    study-scarf.ts      wearable    ← best starting point
    practice-wand.ts    held        ← second best
    index.ts            the catalogue list
```

An asset file may `import` **only** from the content layer. It must not import
`pixel-display/engine`, `pixel-display/renderers`, `pixel-display/react`, React,
the DOM, or anything under `app/`. Boundary tests enforce this.

---

## 2. The coordinate system

Every coordinate in an asset is in **reference space**: a grid you declare
yourself, measured in cells, origin at the **top-left**, `x` rightwards and `y`
downwards.

```
reference: { width: 20, height: 13 }
```

```
        x →  0  1  2  3 …
   y  ┌──────────────────
   ↓ 0│  (0,0)
     1│
     2│
```

Three rules:

1. **Integers only**, except an anchor's `x`/`y`, which may be fractional for
   fine alignment.
2. **`to` is exclusive.** A span `{ from: 1, to: 4 }` paints columns 1, 2 and 3.
3. **Nothing may leave the grid.** A row wider than `reference.width`, a row
   index at or past `reference.height`, or a span outside the grid is a
   validation error.

You never write a logical cell, a CSS pixel or a device pixel. The painter maps
your reference grid onto whatever display it is given, at every density and every
physical size.

### Framing

```ts
framing: { scale: "fit-short-side", scaleShare: 0.63, verticalBias: 0.2 }
```

- `scaleShare` — the reference grid's **short** side occupies this share of the
  display's short side. `0.63` is the historical authored Sylf default; production composes it at
  `0.9`. User creations require `1` for native fidelity.
- `verticalBias` — `0` sits at the top, `1` at the bottom, `0.2` matches Sylf's
  low-in-frame composition.
- `horizontalBias` — `0.5` centres.

Omit `framing` entirely to get `0.63 / 0.2 / 0.5`.

---

## 3. Valid palette usage

A palette maps **one character** to a colour. Geometry is authored as text, so
tokens are single characters.

```ts
palette: { h: "#d98a6a", k: "#b86b4e", s: "#8f4f38" }
```

- **`.` is always transparent** and may never be redefined.
- Colours are `#rgb`, `#rrggbb` or `#rrggbbaa`. Use `#rrggbbaa` when an asset
  needs partial transparency; the framebuffer is RGBA.
- **Every declared key must be used**, or validation reports
  `palette-key-unused`. A palette that rots is a palette nobody trusts.
- **A plane may carry its own palette**, merged over the asset's. Use it for a
  colour only that plane needs.

Pick tokens that read: `h`/`s` for a highlight and its shade, `k` for an outline
or ink. Single letters keep rows narrow enough to read at 80 columns.

### The reserved shading vocabulary

A `spans` geometry run marked `shaded: true` resolves against `H`, `B`, `S` and
optionally `D`:

| Key | Meaning |
| --- | --- |
| `H` | highlight — the leading share of the run |
| `B` | base — the middle |
| `S` | shade — the trailing share |
| `D` | deep edge — the final column, only when `deepEdge: true` |

Declare all of them if you use `shaded`. A run whose palette lacks them paints
flat in its own `key` instead, so shading is opt-in.

---

## 4. How planes and states work

### Planes

Planes are declared in an array, and **painted in that order** — first is behind,
last is in front. That ordering is the entire composition model. There is no
`zIndex`, no parent, no group, no layer tree, and nothing to resolve.

```ts
planes: [
  { id: "band",  geometry: { geometry: "raster", rows: BAND_ROWS } },
  { id: "knot",  geometry: { geometry: "raster", rows: KNOT_ROWS } }, // in front
]
```

An asset that needs something in front **declares it later**. That is the only
mechanism.

### Geometry: two forms

**Raster** — the preferred form. Rows top to bottom, one string per row.

```ts
geometry: { geometry: "raster", rows: [".ooo.", ".www.", ".www."] }
```

A row of the wrong length is visible in review and is a validation error if it
exceeds the grid. Use `""` for an empty row and pad with `.`.

Rasters for different planes may have different lengths; a plane's rows start at
its own `y = 0`. To push a plane down, prefix empty rows:

```ts
rows: [...Array.from({ length: 3 }, () => ""), ...KNOT_ROWS]
```

**Spans** — for a shape whose shading is derived from its own width, which is the
one thing a raster cannot express.

```ts
geometry: {
  geometry: "spans",
  rows: [{ y: 9, from: 12, to: 20, key: "B", shaded: true }],
}
```

Only use spans if you need `shaded`. Otherwise write a raster.

### States

A state is a **selection of planes**, never a separate drawing.

```ts
states: [
  { id: "idle",     show: ["shaft", "crystal"] },
  { id: "charging", show: ["shaft", "crystal", "glow"] },
]
```

- `show` — plane ids, in **declared order** regardless of the order you list them
  in. A state cannot reorder the composition.
- `hide` — plane ids to leave out, applied after `show`.
- Omit `states` entirely for an asset with one look; it gets an implicit
  `default` state showing every plane.
- A state that selects nothing is a validation error.

The first state is the default. An unrecognised state name paints the first
state, not an empty picture.

Order `show` for readability, but expect paint order to follow `planes`.

---

## 5. How attachment anchors work

Two anchors and one subtraction. Nothing else.

```ts
// On the character:
anchors: [{ id: "hold-right", x: 31, y: 21 }]

// On the weapon:
anchors: [{ id: "pivot", x: 2, y: 12 }]
attachment: { hostKind: "character", hostAnchor: "hold-right", pivot: "pivot" }
```

Placement is `offset = hostAnchor − pivot`, in **reference space**. The painter
then maps the offset asset with the **host's own origin and scale**, so an
attached item is exactly as large as the thing holding it and sits exactly at the
anchor.

Three consequences worth knowing:

1. **A pivot is not a centre.** The wand's grip is near the bottom, because that
   is where a hand closes. Getting this right is why a pivot is authored.
2. **The attachment offset is a reference-space delta.** It is added to reference
   coordinates before mapping. (Taking only the host's scale and not its origin
   is a real bug that was made and fixed in Phase 5 — the offset becomes a
   display coordinate and the item lands somewhere unrelated.)
3. **Anchors are logical.** None of this knows about a display, a density or a
   CSS size, which is why an attachment works identically at 110 px and at 640 px.

Place a pair with:

```ts
const host = paintAsset(display, characterAsset, { state: "IDLE" });
const placed = resolveAttachment(characterAsset, heldAsset);
if (placed.resolved) {
  paintAsset(display, heldAsset, {
    preserve: true,
    placementOverride: host.placement,
    offsetX: placed.resolved.offsetX,
    offsetY: placed.resolved.offsetY,
  });
}
```

`resolveAttachment` reports problems as data rather than throwing, so review
tooling can show a broken attachment — a pivot typo is easier to fix while
looking at both assets than in a stack trace.

**Do not invent anchors you do not need.** The vocabulary is deliberately tiny:
`hold-right` and `wear-neck` on Sylf, `pivot` and `tip` on the wand. Add one when
a real asset needs it, not in anticipation of a skeleton.

---

## 6. Prohibited architecture dependencies

An asset file and anything it imports must not reach:

| Forbidden | Why |
| --- | --- |
| `pixel-display/engine` | assets describe; the engine rasterises |
| `pixel-display/renderers` | physical pixels are not an authoring concern |
| `pixel-display/react` | assets are data, not components |
| `react`, `react-dom` | same |
| `next/*` | same |
| `@/app/**` | application code must never leak into content |
| DOM globals | `window`, `document`, `HTMLElement`, `getContext`, `devicePixelRatio`, … |

Boundary tests in [`__tests__/pixel-display/boundaries.test.ts`](../../__tests__/pixel-display/boundaries.test.ts)
scan for all of these and will fail your change. The global scan is a **plain
name match**, deliberately — so do not name a local `window` or `document`.

Also prohibited by design, not by scanner:

- no arbitrary code, expressions or scripting inside an asset;
- no conditional geometry;
- no inheritance or asset composition beyond planes and attachment;
- no scene graph. If you believe you need one, **stop and write down the concrete
  asset that cannot be expressed** — the flat-plane model has so far been
  sufficient, and evolving it requires recorded evidence rather than anticipation.

---

## 7. How to preview an asset

```
npm run dev
open http://localhost:3000/dev/pixel-display
```

Scroll to **Asset review**. It offers:

| Control | Use |
| --- | --- |
| asset buttons | switch between catalogue entries |
| state buttons | step the asset's states |
| `hide <plane>` | isolate a plane; the composite is rebuilt without it |
| `show anchors` | draw anchor marks, positioned by the painter's own mapping |
| `attach held item` | place the held reference asset on the character |
| density buttons | 32/40/48/64 **at a fixed presentation size** |

`/dev/pixel-display` returns **404 in production**, is `noindex`, and no
production route imports it.

---

## 8. How to validate an asset

Validation is deterministic and returns **every** problem, not the first.

```ts
import { validateAsset } from "@/lib/pixel-display/content/asset";

const issues = validateAsset(myAsset); // [] when valid
```

`assertValidAsset(myAsset)` throws one readable multi-line error instead, for
module-scope content that must not render wrong.

### What it checks

| Code | Catches |
| --- | --- |
| `version-unsupported` | an asset written against a different contract version |
| `id-missing` / `id-malformed` | missing, or not `namespace:name` kebab-case |
| `id-duplicate` | two assets claiming one id |
| `kind-unknown` | a kind outside `character` / `wearable` / `held` |
| `reference-invalid` / `reference-too-large` | non-integer, zero, or over 256 per side / 16 384 cells |
| `planes-empty`, `plane-id-missing`, `plane-id-duplicate` | plane identity |
| `plane-geometry-empty` | a plane with no rows |
| `raster-row-too-wide`, `raster-rows-exceed-height` | raster outside the grid |
| `span-out-of-bounds`, `span-empty`, `span-not-integer` | span geometry |
| `palette-key-missing` | a token no palette defines, with row and column |
| `plane-palette-key-missing` | a `shaded` run without `H`/`B`/`S` (and `D`) |
| `palette-key-unused` | a declared key nothing uses |
| `palette-color-invalid` | a colour that is not `#rgb`/`#rrggbb`/`#rrggbbaa` |
| `palette-redefines-transparent` | redefining `.` |
| `anchor-id-missing`, `anchor-id-duplicate` | anchor identity |
| `anchor-out-of-bounds`, `anchor-not-finite` | anchor position |
| `state-id-missing`, `state-id-duplicate` | state identity |
| `state-unknown-plane`, `state-empty` | state references and emptiness |
| `attachment-missing`, `attachment-pivot-unknown`, `attachment-host-kind-unknown` | attachment wiring |

**Fail closed.** Invalid content must fail during development rather than render
something subtly wrong — an unknown token that silently paints nothing is the
exact failure this exists to prevent.

---

## 9. Tests and evidence required with a new asset

Add to [`__tests__/pixel-display/pixel-asset.test.ts`](../../__tests__/pixel-display/pixel-asset.test.ts)
or a sibling:

1. **It validates.** `expect(validateAsset(asset)).toEqual([])` — the catalogue
   test already covers anything registered in `reference/index.ts`.
2. **Every state paints something.** A state that renders nothing is not
   reviewable.
3. **It stays inside its own grid.** Painted cells ≤ `width × height` per state.
4. **Its id is unique** across the catalogue.
5. **If it attaches:** `resolveAttachment(host, asset)` returns no problems, and
   a test asserts the resolved offset — so a pivot change is a deliberate change.
6. **Visual evidence.** A screenshot from `/dev/pixel-display` at the review size
   and at the smallest supported production size, in the mode you expect it to be
   used.

If your asset is the first of a new *kind*, that is a contract change: update
`PixelAssetKind`, the validator's `KNOWN_KINDS`, this guide, and the report.

---

## 10. Reference assets to copy

| Asset | Kind | Best for learning |
| --- | --- | --- |
| [`study-scarf.ts`](../../lib/pixel-display/content/asset/reference/study-scarf.ts) | wearable | a raster asset with several planes and an attachment |
| [`practice-wand.ts`](../../lib/pixel-display/content/asset/reference/practice-wand.ts) | held | a pivot that is not the centre, a plane-local palette, two states |
| [`sylf-character.ts`](../../lib/pixel-display/content/asset/reference/sylf-character.ts) | character | wrapping derived/span geometry, a state per eye shape, clipping |

All three are engineering reference assets, not production art. Copy the
structure, not the pixels.

---

## 11. Checklist

- [ ] `version: PIXEL_ASSET_VERSION`
- [ ] `id` is `namespace:name`, lowercase kebab-case, unique
- [ ] `kind` is `character`, `wearable` or `held`
- [ ] `reference` is positive integers and big enough for every row
- [ ] every palette key is used; every used token is in a palette
- [ ] `.` is not redefined
- [ ] planes are in the order you want them painted, back to front
- [ ] every state selects at least one plane and names only real planes
- [ ] anchors are inside the grid and each id is used once
- [ ] an attachment names a real pivot and a real host anchor
- [ ] `validateAsset` returns `[]`
- [ ] registered in `reference/index.ts`
- [ ] tests added; screenshots captured
