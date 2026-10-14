# Phase 4 design note — animation, effects and display density

**Written before implementation**, from the evidence of Phases 0–3. This is the
short design note the roadmap requires; it is a design input, not a description
of what shipped. The [Phase 4 report](reports/phase-4/report.md) records what
actually happened, including where this note was wrong.

---

## 1. The density model

Phase 3 exposed a conflation. Three independent quantities were in play, and only
two of them had names:

| Quantity | What it means | Currently named by |
| --- | --- | --- |
| **Physical display size** | How many CSS pixels the display occupies | The host's slot (`110px`) |
| **Logical resolution** | How many cells the matrix has (`48 × 48`) | `PixelDisplay.width` / `height` |
| **Character fill** | What share of the matrix the character occupies (`0.90`) | `SylfContentOptions.characterFill` |

The missing idea is **density**: cells per unit of physical size. Phase 3 changed
physical size and logical resolution together, because a card-sized slot and a
48-cell matrix happened to be the pair under test. Nothing in the engine requires
that coupling, and the roadmap is right that it should not exist.

### What already holds, and what must be proven

Reading the Phase 1 renderer, the separation is **already structurally true**:

```
host slot (CSS px)  →  CanvasPixRenderer.fit(cssWidth, cssHeight)
                    →  side = min(cssWidth, cssHeight)          ← physical size
                    →  deviceSide = round(side × dpr)           ← backing store
                    →  cellPitch = deviceSide / display.width   ← density
```

`fit` derives the backing store from the **slot**, never from the matrix. So:

- changing `width`/`height` changes `cellPitch` and nothing else;
- the canvas keeps its CSS size, so the surrounding card cannot move.

That last claim is the one Phase 4 must **prove rather than assert**. A latent
risk exists: `PixelDisplay.module.css` sets `.slot { inline-size: 100% }`, so if
a host ever let the display's slot size itself from the canvas, changing density
would push the layout around. The dashboard card pins an explicit
`--pixel-card-size`, which is why Phase 3 was stable — but stability by accident
of the current host is not stability.

**Therefore:** Phase 4 adds a `density` prop alongside `size` on the production
card, asserts in tests that the slot box is identical for every density, and adds
a dev control that holds presentation size constant while sweeping density. The
requirement "changing pixel density must not resize the surrounding card" becomes
a test, not a hope.

Resolution stays in **cells**, and the visible pixel size changes as a
consequence. This is not CSS zoom and not canvas resizing: the canvas's CSS and
backing sizes are byte-identical across densities, and only the logical matrix
changes. A CSS `zoom` or a stretched canvas would break `image-rendering:
pixelated` and put logical coordinates back in the hands of the compositor, which
boundary B3 forbids.

## 2. The animation and effects architecture

### What exists, and what is missing

`PixContent` already provides the whole seam Phase 4 needs:

- `render(timeline)` — a full composite from state alone;
- `update(timeline) → boolean` — the **only** way content keeps a frame alive.

So **no engine change is required**, and none is planned. Effects are a content
layer concern, and the runtime never learns they exist. If Phase 4 needed a new
engine primitive, that would be a finding to record, not a step to take quietly.

### Two authored kinds, one mechanism

The roadmap asks for authored character animation **and** bounded procedural
effects. The dividing line:

| | Authored | Procedural |
| --- | --- | --- |
| What it is | A frame table: eyes/blush/sparkles per beat | A pure function of `(frame, seed)` |
| Used when | The character is *being* something | Something must *happen* to it |
| Examples | Blink, THINKING loop | Sparkle wave, body pulse |
| Determinism | Inherent — it is data | Must be proven: same frame and seed ⇒ identical output |

A derived state is `base state (authored) + optional transient effect
(procedural)`. Effects do **not** join the state vocabulary: a state is what the
companion *is*, an effect is what is briefly *happening*. Adding four
`*_EFFECT` states would double the table and blur exactly the distinction the
composition model was built on.

### The flat-plane model is sufficient — for now

The roadmap requires that any evolution of the flat-plane model be justified by
recorded evidence rather than anticipation. This note's position is that **the
current model is sufficient**, because every effect below is expressible as a
modulation of planes that already exist:

- the sparkle wave modulates the cells the `sparkles` scenery plane already owns;
- the body pulse modulates the tone the `body` plane already painted.

Both are "paint the same planes, with a per-cell intensity that varies with
effect progress". Neither needs a new plane, a hierarchy, or a compositing
algebra. **If implementation contradicts this, the concrete failure gets
documented before any change to the model.**

### Boundaries

```
application signal → feature adapter → Sylf reaction (state + effect) → content → runtime
                     ^^^^^^^^^^^^^^^
```

- The adapter is the only module that knows both vocabularies — the Phase 3 rule,
  unchanged. Four new signals extend its mapping; they do not add a second seam.
- **Application code never sees an effect.** It emits a semantic signal; the
  adapter chooses the reaction.
- Effects are addressed in **logical cell coordinates only**. An effect cannot
  read a CSS size, a device pixel ratio, or a cell pitch (boundary B3).
- The renderer is not modified. No speculative optimization.

## 3. The four reactions

Named for what the application means, not for what is drawn.

| Signal | Base state | Effect | Why this shape |
| --- | --- | --- | --- |
| `LEVEL_UP` | `CELEBRATING` (authored) | sparkle wave | The celebration already exists; the wave gives it a visible beginning. |
| `TASK_COMPLETE` | `IDLE` (authored) | **body pulse** | "Received, done." Acknowledgment, deliberately quieter than a level-up — a task is not a level. |
| `STREAK_EXTENDED` | `CELEBRATING` (authored) | sparkle wave | A streak is a run continuing, so it reuses the celebration rather than inventing a state. |
| `AI_THINKING` | `THINKING` (authored) | none | Sustained and indeterminate. A pulsing effect would imply progress that does not exist. |

`THINKING` is the one **new authored state**: a `loop` whose beats move the gaze
between `focused` and `half`, so the companion looks like it is working rather
than frozen. It is the only state that loops indefinitely — which is correct,
because the thing it represents is genuinely ongoing — and it therefore ends only
when the signal is withdrawn.

`TASK_COMPLETE` and `STREAK_EXTENDED` carry matching **application reactions**:
the base states are chosen so the two read differently at a glance despite both
being brief and positive.

Two effects, not four, because two are genuinely different in kind — an
ambient-cell effect and a whole-body effect. Inventing a third and fourth to give
each signal its own would be decoration, not architecture.

## 4. Bounds, determinism, reduced motion, zero work

**Bounded complexity.** The sparkle wave iterates the authored `SPARKLES` table
(a fixed seven positions); the body pulse iterates the body's occupied cells.
Both are bounded by data already in the content layer. No effect allocates
particles, no effect grows with elapsed time, and tests assert both facts.

**Determinism.** Each effect is a pure function of `(effectFrame, seed)`.
Progress is quantized to integer steps and intensity comes from a small lookup
table, so no effect needs floating-point accumulation and none depends on wall
time. A test renders the same frame twice and asserts byte-identical
framebuffers, and renders two different seeds and asserts they differ.

**No per-frame allocation.** Effect descriptors are preallocated and reused;
`render` writes into the existing framebuffer. Tests assert a stable allocation
profile by construction — each effect's step count is fixed and known up front.

**Reduced motion.** Every reaction keeps its *state* and drops its *motion*: the
sparkle wave becomes a static brief highlight, the body pulse a single-frame
tone lift, and `THINKING` holds one frame instead of looping. Nothing becomes
invisible, because a reaction that never appeared would hide the information
rather than reduce the motion — the same rule Phase 3 applied to the level-up.

**Zero work.** Every effect has a finite frame count and reduces its progress to
zero; `update` then returns `false` and the runtime settles into `idle`. The one
exception is `THINKING`, whose loop is held deliberately and ends when the
application withdraws the signal — a bounded, externally-terminated animation,
not an open one.

## 5. Non-goals, restated so they stay non-goals

No Pixel Studio, no persistence, no asset-authoring tools, no cosmetics, no
character redesign, no landing integration, no scripting, no generated assets, no
sharing. No WebGL/WebGPU/OffscreenCanvas: Phases 1 and 3 measured frame cost at
p50 0.3 ms and p95 0.5 ms at the real card, and the roadmap is explicit that a
renderer backend change needs profiling evidence that does not yet exist.

## 6. What Phase 4 will not close

O1/O2/O3/O4/O5/O11–O16 stay open unless this phase produces direct evidence. The
density work is expected to inform **O1** (resolution) and **O16** (production
presentation range) most directly, and the heaviest Phase 4 scene is expected to
inform **O4** (scheduling model) — but informing is not closing, and none will be
closed on anticipation.
