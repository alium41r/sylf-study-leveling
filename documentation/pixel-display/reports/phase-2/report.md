# Phase 2 — Sylf character as composable pixel content

**Status:** complete.
**Scope:** replace the Phase 0 placeholder with the first real Sylf pixel
character, built as flat composable planes. No engine changes, no production
integration.
**Evidence:** [evidence/](evidence/).
**Contract:** [Pixel Display contract](../../pixel-display-contract.md).

---

## 1. The Sylf content model

The companion is authored entirely as logical pixel data. There is no PNG, no
SVG, no sprite sheet and no texture — every cell is a span on a 32 × 32
reference grid, resolved to a palette color at draw time.

```
lib/pixel-display/content/sylf/
  sprite.ts      authored spans: body rows, leaf rows, stem, blush, eye shapes
  frames.ts      the state vocabulary, compositions and authored timing
  parts.ts       the four plane painters and the plane registry
  character.ts   composition + animation, implementing PixContent
```

### Composition: a flat, ordered list

```
body → leaves → blush → eyes
```

That list is the whole model. A plane is a named function that paints reference
spans; composing is painting them in order. There is **no scene graph, no layer
hierarchy, no z-index, no compositing algebra and no generic part system.** The
doc's requirement is that a state must not become a separate full-character image
(§13), and that needs exactly two properties: planes can be selected
independently, and their order is declared rather than incidental.

A state is a **plane selection**:

| State | Eyes | Blush | Ambience |
| --- | --- | --- | --- |
| `IDLE` | `open` | off | on |
| `FOCUSING` | `focused` | off | off |
| `REST` | `sleeping` | off | off |
| `CELEBRATING` | `happy` | on | on |
| `BLINK` | walks the table | off | on |

`selectsPlane(plane, plan)` is the single rule deciding what a state shows, so
the full composite and any partial repaint agree by construction.

### The eye vocabulary is six shapes, not two

`open`, `focused`, `half`, `closed`, `sleeping`, `happy` — because each carries a
different meaning. `closed` and `sleeping` are deliberately different shapes: a
state meaning "asleep" must not be visually identical to one frame of a blink, or
REST and a mid-blink would be indistinguishable.

Every shape is required to occupy a **distinct set of cells**. That is asserted,
because two shapes sharing cells would mean swapping them produced no visual
change at all — a blink that never blinked, with the palette test still passing.

### The authored blink

`open → half → closed → half → open`, exactly the sequence the product document
names. Closing beats are quicker than opening ones, as a real blink is:

| Beat | 1 | 2 | 3 | 4 | 5 |
| --- | --- | --- | --- | --- | --- |
| Eyes | open | half | closed | half | open |
| Duration | 70 ms | 60 ms | 110 ms | 60 ms | 100 ms |

One authored pass, then settle. Eye animation is independent of the rest of the
character: `advanceFrame`, `setEyeShape` and the eye plane touch nothing else.

### Zero work when settled

Four of the five states are `hold` — a single frame that requests no further
frames. Only `BLINK` animates, and it settles the moment its final beat
completes. That is what lets the companion simply *exist* at no cost.

---

## 2. Composition behaviour, and how it is proven

Phase 2's central claim has one testable consequence: **changing one plane must
not require rebuilding another.** The tests assert it two ways, and both matter:

- **Invariance** — changing the eye shape leaves body, leaves and blush
  byte-identical. The reference is built exactly as `render` builds it *minus the
  eye plane*, so anything that differs is the eyes and nothing else.
- **Positive control** — the eye cells really did change, and came from a
  declared palette of fewer than twelve colors. Without this, a renderer that
  drew nothing would pass every invariance assertion.

Also asserted:

- **Paint order is deterministic** and a frozen literal, not computed.
- **A single plane can be repainted alone** — repainting `eyes` changes only eye
  cells.
- **The face stays inside the silhouette.** Blush and eye cells are clipped to
  the body's own cells, so a cheek can never land beside the figure.
- **All four states are visually distinct from each other.**
- **Rendering is deterministic** and independent of what the framebuffer
  previously held — the clarified repaint contract, re-verified against real
  content.

### Three real defects found while proving it

1. **The composition table gated nothing.** `render` painted every plane
   unconditionally, so `composition.blush` was decoration: every state drew
   blush, including `IDLE`. Fixed by routing all painting through
   `selectsPlane`, so a state's selection is the only thing deciding what is
   drawn.
2. **`focused` was geometrically identical to `open`.** Swapping them changed
   nothing, which would have made FOCUSING indistinguishable from IDLE. Every
   shape now occupies distinct cells, and a test enforces it.
3. **Plane hiding was applied as a post-render patch and immediately undone.**
   `render` is a full composite, so erasing cells from outside was repainted on
   the very next frame. Suppression is now **content state**: hidden planes are
   simply not painted by the composite, and the behaviour survives repeated
   frames. This is the repaint contract doing its job — the naive approach failed
   for exactly the reason the contract predicts.

A fourth, smaller one: a sparkle sat underneath the character's hem, which made
the scenery-order assertion ambiguous. The sparkle moved.

---

## 3. Visual findings

Captured at a 456 px preview and a 108 px dashboard card, in dark and light
modes; see [evidence/](evidence/).

| Finding | Detail |
| --- | --- |
| The character reads | A soft bell with a two-leaf sprout, wide-set dark eyes with a glint, and pink cheeks. Recognisable from 108 px up. |
| The silhouette needed work | The first authored body was a near-triangle: its right-side shade run was wider than its left highlight, so the form was visibly lopsided. The bell now tapers inward at the hem and both sides are mirror pairs. |
| Shading had to become proportional | A fixed highlight split made the narrow crown rows almost entirely highlight while the wide bell rows were mostly shade — a flat, banded form. The split is now a share of each row's own width, so the falloff stays parallel to the silhouette. |
| A deep-edge bug put shade outside the figure | The hem's deep column was painted as a run *past* the row's end, widening the silhouette by a column. It is now the last column inside the shade run. |
| The eye glint earns its place | At 4 × 3 with a single-cell glint the eye reads as an eye; without it, as a hole. |
| The face planes must clip | Blush and eyes are anchored independently in reference space and round to logical cells on their own, so a run flush with the silhouette can land a cell outside it at some fills. Clipping to the body's cells states the invariant once instead of tuning spans per resolution. |

### Presentation candidates: **retained, not closed**

The character was rendered against every Phase 0 candidate and none was
invalidated:

- **Cell gap 0.12** still reads as an ordered matrix of lit squares, and now
  clearly separates the eye ink from the body at 108 px.
- **Inactive cells fully off** still reads as a powered display. A faint grid
  reintroduced a graph-paper feel against real character content too.
- **Character fill 0.63** suits the new silhouette: the sprout clears the top and
  the ground sits below the hem.
- **48 × 48** carries the eyes and glint at card size. At 32 the eye ink and the
  glint merge and the face stops reading — the same conclusion Phase 0 reached,
  now confirmed with the real character rather than a placeholder.
- **Deep navy backdrop** still reads as a screen.

None of these is closed. Phase 2 produced *consistency* with Phase 0's
candidates, not evidence sufficient to freeze them, and O1/O2 remain open.

---

## 4. Verification

| Gate | Result |
| --- | --- |
| `npm run test -- --run __tests__/pixel-display` | **211 passed / 11 files**, 0 failed (Phase 1: 191/12) |
| `npx tsc --noEmit` | **0 errors** |
| `npm run typecheck:engine` | **0 errors** — the engine is still DOM-free |
| `npx eslint lib/pixel-display app/dev` | clean |
| `npm run build` | succeeds |
| `GET /dev/pixel-display` in production | **404**, no dev-control markup |
| Existing companion regression (`__tests__/landing`, `__tests__/sylvs`) | **179 passed / 20 files**, unchanged |
| Engine has no Sylf dependency | boundary tests pass; a new test asserts every engine module imports only from inside the engine, so deleting `content/sylf/**` cannot break it |

Live browser checks, against the real dev surface rather than only in jsdom:

| Check | Result |
| --- | --- |
| States render distinctly | Eye cells: IDLE 24, FOCUSING 16, REST 6, CELEBRATING 10; blush only in CELEBRATING (5 cells) |
| Plane isolation | Hiding eyes → 0 eye cells, blush intact. Hiding both → 0 and 0. Body and leaves untouched throughout. |
| README claim: readouts | Every holding state reports phase `idle` with no scheduled work |

The Phase 0 placeholder was replaced, not kept alongside: `content/placeholder/`
is gone and its two tests were superseded by `sylf-composition.test.ts`, which
covers strictly more. The placeholder's `IDLE`/`BLINK` behaviour is preserved by
the Sylf states.

---

## 5. What Phase 2 did not do

No application or landing adapter. The state vocabulary lives entirely in the
content layer; nothing maps an application signal onto it. No dashboard
integration, no particles, no procedural animation, no cosmetics or equipment,
no persistence, no Pixel Studio, no third-party dependencies, and no change to
the engine, renderer, runtime or React host — Phases 0 and 1 needed no fix, so
none was made.

`proxy.ts` and `package.json` remain the only pre-existing tracked files this
feature has modified, both from earlier phases.

---

## 6. Open decisions

None were closed by assertion. Two gained evidence, one is now narrower.

| # | Decision | Status after Phase 2 |
| --- | --- | --- |
| O1 | Logical resolution | **Open, better evidenced.** 48 × 48 carries the real character's face at card size; 32 does not. Still a perceptual and product call. |
| O2 | Inactive-cell presentation | **Open.** Re-confirmed against real content; not closed. |
| O3 | Frame data representation | **Open.** Full materialized planes still suffice; nothing in the real character created pressure for diffs. |
| O4 | Runtime scheduling model | **Open, unchanged.** The Phase 1 machine needed no change to drive a five-beat blink. |
| O5 | Renderer backend | **Open.** No evidence gathered this phase. |
| O11 | Packed framebuffer | **Open, unpressured.** |
| O12 | Presentation size range | **Open, narrowed.** Verified 108–456 px with the real character, plus a 640 px slot that the dev layout clamped to 464 px — the *supported* range is still a product decision. |
| O13 | High-DPI verification | **Open gap, unchanged.** No live 2×/3× observation was possible in either environment available. |

New and deliberately left open:

| # | Decision | Why it is open |
| --- | --- | --- |
| O14 | Character proportions and fill | The silhouette was authored, reviewed and revised once. Whether 0.63 fill and these proportions are right for a real dashboard card is a product judgement no dev-surface review can settle. |
| O15 | Eye-glint behaviour at small sizes | The single-cell glint reads well at 48 × 48 and merges at 32. Whether to drop it below a threshold, or to hold the resolution so it never has to, depends on O1. |
