# Phase 5 — Pixel Content Authoring System

**Status:** complete.
**Guide for authors:** [authoring-guide.md](../../authoring-guide.md) — the
agent-facing contract.
**Evidence:** [evidence/](evidence/).
**Contract:** [Pixel Display contract](../../pixel-display-contract.md).

---

## 1. The Pixel Asset format

One versioned, declarative object. One file, one export, no build step, no
manifest, no sidecar image.

```ts
const PRACTICE_WAND_ASSET: PixelAsset = {
  version: PIXEL_ASSET_VERSION,
  id: "sylf:practice-wand",
  kind: "held",
  name: "Practice Wand",
  reference: { width: 5, height: 15 },
  framing: { scale: "fit-short-side", scaleShare: 0.55, verticalBias: 0.2 },
  palette: { w: "#b98a5c", o: "#7d5636", k: "#46301f", h: "#a179fb" },
  planes: [
    { id: "shaft",   geometry: { geometry: "raster", rows: SHAFT_ROWS } },
    { id: "crystal", geometry: { geometry: "raster", rows: CRYSTAL_ROWS } },
  ],
  anchors: [{ id: "pivot", x: 2, y: 12 }],
  states: [
    { id: "idle",     show: ["shaft", "crystal"] },
    { id: "charging", show: ["shaft", "crystal", "glow"] },
  ],
  attachment: { hostKind: "character", hostAnchor: "hold-right", pivot: "pivot" },
};
```

| Concept | How it is expressed |
| --- | --- |
| Identity / version | `id` (`namespace:name`, kebab), `version` |
| Kind | `character` \| `wearable` \| `held` |
| Reference dimensions | `reference: { width, height }` in cells |
| Palette | single-character keys → `#rgb`/`#rrggbb`/`#rrggbbaa`; `.` is transparent |
| Geometry | `raster` (rows of tokens) or `spans` (runs, optionally `shaded`) |
| Planes | an ordered array; **order is the composition** |
| Bounds | the reference grid; validation rejects anything outside it |
| Origin / pivot | an anchor, authored in reference space |
| Anchors / sockets | a named list; only what an asset actually needs |
| States / variants | a **plane selection** — `show` / `hide` |
| Metadata for validation | `name`, `description`, `label` on planes and states |

### What is deliberately absent

No scene graph, no inheritance, no scripting, no expressions, no conditional
geometry, no z-index, no groups. The roadmap forbids inventing a DSL without
evidence, and none of the three reference assets needed one.

### Geometry is two forms, and only two

A **raster** is rows of tokens — the preferred form, because a row of text is
something a person or an agent can write, read and diff, and a row of the wrong
length is visible rather than silently wrong.

**Spans** exist for the one thing a raster cannot express: a run whose shading is
derived from its own width. The Sylf body is the entire justification, and the
guide tells an author to use spans only when they need `shaded`.

---

## 2. Supported asset categories

Three, and the contract is honest that a kind is not a behaviour — it is a
statement about what an asset is *for*, which is what lets an attachment rule ask
for "a held thing" without knowing what a weapon is.

| Kind | Reference asset | Demonstrates |
| --- | --- | --- |
| `character` | `sylf:sylf-character` | wrapping derived geometry, a plane per eye shape, clipping, six states |
| `wearable` | `sylf:study-scarf` | raster planes in paint order, an attachment, a plane-local palette |
| `held` | `sylf:practice-wand` | a pivot that is not the centre, two states differing by one plane |

---

## 3. Authoring workflow

The workflow the guide gives an agent is five steps, and it needs no renderer
knowledge:

1. copy a reference asset;
2. change `id`, `reference`, `palette`, `planes`;
3. register it in `reference/index.ts`;
4. run the asset test suite;
5. look at it in `/dev/pixel-display` → Asset review.

Structured data over imperative coordinate functions, as the roadmap prefers:
an asset declares rows and spans, and `resolveGeometry` turns them into cells.
No asset ever calls `setPixel`.

---

## 4. Validation

`validateAsset` returns **every** problem as data, in a stable order; a test
asserts determinism. `assertValidAsset` turns a non-empty list into one readable
multi-line error for module-scope content.

24 issue codes cover: contract version; asset id presence, format and uniqueness;
kind; reference grid validity and size limits; plane identity and emptiness;
raster width and height against the grid; span bounds, emptiness and integrality;
palette keys missing, unused, ill-formed, or redefining `.`; plane-local palette
keys; anchor identity, bounds and finiteness; state identity, unknown plane
references and emptiness; attachment wiring.

**It fails closed.** An unknown token is an error even though the resolver skips
it — a mistyped palette key that silently paints nothing is precisely the failure
mode this module exists to prevent, and a rendering bug is much harder to find
than a validation message that names the row and column.

---

## 5. The attachment model

Two anchors and one subtraction:

```
offset = host.anchor − attachment.pivot        (reference space)
```

The offset asset is then painted with the **host's own origin and scale**, so it
is sized by what holds it rather than by its own reference grid.

That is the whole model. There is no socket taxonomy, no bone, no transform
hierarchy, and no coordinate that knows about a display. The vocabulary is
`hold-right` and `wear-neck` on Sylf, `pivot` and `tip` on the wand — only what
the reference assets needed, as the roadmap requires.

`resolveAttachment` returns problems as **data** rather than throwing, because
review tooling wants to *show* a broken attachment: a pivot typo is far easier to
fix while looking at the two assets side by side than in a stack trace. A test
asserts a missing host anchor is reported **by name and with the anchors that do
exist**, which is what makes the message actionable.

### The defect this phase found, and why it matters

The first implementation gave a placed asset the host's **scale but not its
origin**. The attachment offset is a reference-space delta, so with the origin at
zero it silently became a *display* coordinate: the wand rendered across the
character's face at the wrong size.

It is worth recording because the numbers looked plausible at every step — the
scale was right, the offset was right, the pivot was right — and the only way to
see it was to compare the painter's output against the anchors it claimed to
honour. The fix is that a placed asset inherits a whole `placement`, not a scale,
and the guide now spells out why both halves matter.

---

## 6. Reference assets

All three validate, paint, and are reviewable. They are engineering reference
assets, and the guide says plainly: copy the structure, not the pixels.

| Asset | Reference | Planes | States | Painted cells |
| --- | --- | --- | --- | --- |
| `sylf:sylf-character` | 32 × 32 | 11 | 6 | 420–447 |
| `sylf:study-scarf` | 16 × 15 | 3 | 1 | 108 |
| `sylf:practice-wand` | 5 × 15 | 3 | 2 | 50 / 60 |

### The existing character was wrapped, not rewritten

The requirement was that built-in character content be expressible through the
contract **without an engine redesign**. It is, and the reason is worth stating:
the character's body is a shaded silhouette whose highlight boundary is computed
from each row's own width, and its eyes are a vocabulary of six shapes selected
by state. Rewriting those as character strings would either lose the derived
shading or freeze it at one size — a worse asset, not a cleaner one.

So the spans geometry exists, and the existing tables are wrapped by it. Six
tests assert the wrap is faithful: every authored Sylf state has an asset state,
the face is still separate planes rather than whole-character frames, every state
still composes the body, and a spot check confirms the widest body row is still
30 columns. **The character renders identically; nothing about it changed.**

---

## 7. Agent instructions

[authoring-guide.md](../../authoring-guide.md) is written for a coding agent and
covers exactly the nine things the roadmap asks for:

1. **what files constitute an asset** — one file, one export, and which imports
   are legal;
2. **the coordinate system** — reference space, top-left origin, integers, `to`
   exclusive, nothing outside the grid;
3. **valid palette usage** — single characters, `.` reserved, every key used, the
   reserved `H`/`B`/`S`/`D` shading vocabulary;
4. **how planes and states work** — order is the composition; a state selects
   planes and never reorders them;
5. **how attachment anchors work** — the subtraction, why a pivot is not a
   centre, and the origin-and-scale trap;
6. **prohibited architecture dependencies** — a table of forbidden modules and
   globals, plus the design prohibitions the scanner cannot enforce;
7. **how to preview** — the review panel, control by control;
8. **how to validate** — the API and all 24 issue codes;
9. **what evidence to accompany a new asset** — six required tests and visual
   evidence at two sizes.

Plus a copyable checklist. An agent following only the guide can add a valid
asset without opening the renderer or the runtime.

---

## 8. Preview and review tooling

The dev surface gained an **Asset review** panel. It is developer-facing and
deliberately not Pixel Studio: it reads the catalogue and draws it. There is no
editing, no saving, no colour picking and no naming UI, and nothing on it writes
an asset.

| Capability | How |
| --- | --- |
| Asset by itself | asset buttons across all three kinds |
| Planes | `hide <plane>`, applied *during* the composite so the remainder is something the asset could actually have made |
| States / variants | state buttons, driven by the asset's own table |
| Anchors / sockets | marks drawn from **the painter's own mapping**, so a mark cannot disagree with where the asset put its anchor |
| Attachment positioning | `attach held item` places the held asset on the character |
| Multiple densities | 32/40/48/64 **at a fixed presentation size** |
| Minimum production-card size | the same display in the 110 px card on the dashboard |
| Larger review size | 458 px review slot |
| Validation | live issue count and a full issue list when non-empty |

Everything it renders goes through `paintAsset`, the same entry point any
production consumer uses, so what is reviewed is what ships.

---

## 9. Architectural limitations discovered

**The flat-plane model held.** Nothing in the reference assets needed a scene
graph, a hierarchy or an inheritance mechanism — including a held item attached
to a character, which is the case most likely to have needed one. Paint order
plus two anchors was sufficient.

**Ambient scenery is not an attachment.** Sylf's sparkles and grass are planes of
the character asset, and they are not conceptually *part* of a character. That is
fine for now — it means one asset describes the whole presentation — but it is a
real modelling observation: if scenery becomes shared or reusable across
characters, it wants to be its own asset painted first. Recorded, not acted on,
because no reference asset demonstrates the need yet.

**A reference grid is authored per asset, so a tiny asset has a tiny grid.** The
wand's grid is 5 × 15, which makes its rows easy to read but means its coordinates
have nothing to do with the character's. Attachment is what bridges them, and it
works precisely because both are reference-space. Worth knowing when authoring: a
pivot's meaning is entirely relative to its own asset's grid.

**Validation cannot check semantic intent.** It proves an anchor is in bounds and
a pivot exists; it cannot prove the wand's grip is where a hand would go. The
review panel is the answer to that class of mistake, not the validator, and the
guide says so.

---

## 10. Verification

| Gate | Result |
| --- | --- |
| `npm run test -- --run __tests__/pixel-display __tests__/dashboard` | **314 passed / 14 files**, 0 failed (Phase 4: 263/13) |
| Companion regression | **202 passed / 24 files**, 0 failed |
| `npx tsc --noEmit` | 0 errors |
| `npm run typecheck:engine` | 0 errors — the engine is still DOM-free and asset-free |
| `npx eslint` on changed files | 0 errors |
| `npm run build` | succeeds |
| `npm run mobile:build` + `mobile:verify` | succeeds / **PASSED** |
| `GET /dev/pixel-display` in production | **404**, no dev markup |
| `GET /dashboard` in production | 307 (still protected) |

New: **51 asset tests** covering the contract, validation (every issue code has a
failing case, and the minimal valid asset is asserted valid so the mutations mean
something), resolution and composition, attachment, painting across five
densities, and the wrapped character.

Boundary tests continue to enforce that asset code imports nothing from the
engine, renderers, React, the DOM or `@/app/**`.

### What Phase 5 did not change

The engine, renderer, runtime, React host, Sylf content, effects, dashboard
integration and all 11 other `CharacterRenderer` consumers are untouched. No
persistence, no Pixel Studio, no Character Customizer, no cosmetics migration, no
Sylf redesign. No dependency was added.

---

## 11. Open decisions

None closed. Phase 5 informed none of O1–O18 directly, and two new items are
deferred.

| # | Decision | Status after Phase 5 |
| --- | --- | --- |
| O1–O16 | — | **Unchanged.** Authoring created no pressure on resolution, presentation, scheduling, the renderer backend or the framebuffer. |
| O17 | Whether the production card animates at rest | **Unchanged.** |
| O18 | Effect vocabulary growth | **Unchanged.** |
| **O19** | **Whether scenery becomes its own asset kind** | **New.** Sylf's sparkles and grass are character planes. If scenery is ever shared between characters, or authored independently, it wants to be a separate asset painted first. No reference asset demonstrates the need, so nothing was built. |
| **O20** | **Whether an asset may compose another asset** | **New.** Today an asset is flat: planes, anchors, states. Attachment is the only cross-asset relationship, and it is positional only. A future asset that genuinely wants to *include* another — a character with a built-in accessory — would need composition, which is a real extension of the contract. Deferred until an asset needs it, per the roadmap's evidence rule. |

### Also deferred

- A **catalogue index or discovery mechanism** beyond a hand-written list. At
  three assets, explicit is better; at thirty it will not be, and that is the
  phase that should decide it.
- **Asset versioning beyond a single contract version.** `version` answers "was
  this written against the current contract". Per-asset revision history is a
  persistence concern, and persistence is explicitly out of scope.
