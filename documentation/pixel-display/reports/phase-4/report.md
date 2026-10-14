# Phase 4 — Animation, effects and display density

**Status:** complete.
**Design note:** [design-note.md](design-note.md) — written before implementation, and
wrong about one thing, recorded in §5 below.
**Evidence:** [evidence/](evidence/).
**Contract:** [Pixel Display contract](../../pixel-display-contract.md).

---

## 1. The density model

Three quantities were conflated by Phase 3; they now have three names and are
independently controllable.

| Quantity | Meaning | Named by |
| --- | --- | --- |
| **Physical display size** | CSS pixels the display occupies | the host's slot |
| **Logical resolution** | cells in the matrix | `PixelDisplay.width` / `height` |
| **Density** | cells per unit of physical size | the relation between the two |
| **Character fill** | share of the matrix the character occupies | `characterFill` |

**Nothing in the engine had to change.** Reading the Phase 1 renderer before
writing any code showed the separation was already structural:

```
host slot (CSS px) → fit(cssWidth, cssHeight)
                   → side = min(cssWidth, cssHeight)        ← physical size
                   → deviceSide = round(side × dpr)         ← backing store
                   → cellPitch = deviceSide / display.width ← density
```

`fit` derives the backing store from the **slot**, never from the matrix. So
Phase 4's work was to name density at the surface, expose it for comparison, and
**prove the independence** rather than assert it.

Proven in the browser, on the dev surface's density sweep:

| Density | Slot box | Canvas CSS | Canvas backing | Device px per cell |
| --- | --- | --- | --- | --- |
| 32 × 32 | 263 × 263 | 258 | **258** | 8.063 |
| 40 × 40 | 263 × 263 | 258 | **258** | 6.450 |
| 48 × 48 | 263 × 263 | 258 | **258** | 5.375 |
| 64 × 64 | 263 × 263 | 258 | **258** | 4.031 |

The presentation box and the canvas's backing store are **byte-identical across a
4× change in logical resolution**. Only `cellPitch` moves. That is the whole
requirement, and it is visible in
[the sweep capture](evidence/density-sweep-constant-physical-size.png): a logical
pixel shrinks while the surface stays exactly where it is.

This is **not** CSS zoom and **not** a resized canvas. The card's presentation
size is one custom property that density plays no part in, and a test renders the
card at five densities and asserts the produced box is the same value every time
(`new Set(sizes).size === 1`).

The production card exposes `resolution` (density) alongside `size` (physical)
and `characterFill`. Nothing was persisted, as required.

---

## 2. The animation and effects architecture

**No engine change.** `PixContent` already provided the seam: `render(timeline)`
for a full composite, `update(timeline) → boolean` as the only way content keeps
a frame alive. Effects are a content-layer concern and the runtime never learns
they exist.

### Two kinds, one mechanism

| | Authored | Procedural |
| --- | --- | --- |
| What it is | a frame table | a pure function of `(frame, seed)` |
| Used when | the character *is* something | something *happens* to it |
| In Phase 4 | `CELEBRATING`, `THINKING`, blink | sparkle wave, body pulse |

A derived reaction is `base state (authored) + optional transient effect
(procedural)`. **Effects are not states** — no `*_EFFECT` entries were added to
the state table, because a state is what the companion *is* and an effect is what
is briefly *happening*. Adding them would have doubled the table and blurred the
distinction the composition model is built on.

### Effects post-process; they do not paint

This is the finding that kept the flat-plane model sufficient:

> An effect has no planes, no paint order and no z-index. It modulates cells the
> composite has already painted, so it **cannot** invent geometry or change what
> a state means.

The sparkle wave brightens authored `SPARKLES` positions; the body pulse lifts
the silhouette the body plane already computed. **The flat-plane model was not
evolved, because implementation produced no evidence that it needed to be.** The
design note's position held.

### Boundaries held

The adapter is still the only module importing both vocabularies. Two new static
checks enforce the Phase 4 additions: no dashboard file imports effect internals,
and `engine/**` still imports nothing from `@/app/**`. Application code names a
*signal*; it never names a state, an effect, a plane or a pixel.

### One deliberate exception to a rule

Every other animation is finite, because the thing it represents finishes.
`THINKING` is authored **without** a `loops` limit, so it is held until the
application withdraws the signal — the only externally-terminated animation in
the system, and correct because a long-running task genuinely is ongoing. A test
asserts `THINKING` is the only loop that outlives its own table, and proves it
behaviourally by showing `BLINK` — also authored without `loops` — completes its
single pass and settles.

---

## 3. The four signal paths

All four are application *semantics*. Nothing upstream names a state or an effect.

| Signal | State (authored) | Effect (procedural) | Why this shape |
| --- | --- | --- | --- |
| `LEVEL_UP` | `CELEBRATING` | sparkle wave | The celebration already existed; the wave gives it a visible beginning. |
| `TASK_COMPLETE` | `IDLE` | **body pulse** | "Received, done." Deliberately quieter than a level-up: a task is not a level. |
| `STREAK_EXTENDED` | `CELEBRATING` | sparkle wave, different seed | A run continuing, not a new achievement — so the state is reused and the seed differentiates it. |
| `AI_THINKING` | `THINKING` | none | Sustained and indeterminate. A pulse would imply progress, and this signal exists precisely when progress cannot be known. |

The roadmap asked for at least one authored and one procedural reaction; there
are two of each, and the split is principled rather than decorative. Two effects,
not four, because two are genuinely different in kind — an ambient-cell effect and
a whole-body effect. Giving each signal its own would have been decoration.

`LEVEL_UP`'s mapping is byte-for-byte the Phase 3 behaviour, kept as a named
function so a Phase 3 surface cannot regress.

---

## 4. Determinism, bounds, termination, reduced motion

**Deterministic.** Each effect is a pure function of `(frame, seed)`. Tests prove
the same inputs give a byte-identical framebuffer across all 24 frames of a wave;
that two different seeds give a *different* picture (so the seed parameter is not
a lie); and that **the frame reached by one long step equals the frame reached by
five short ones** — no floating-point drift.

**Bounded.** The sparkle table is
`SPARKLES.length × frameCount` = 7 × 24 = 168 integers, computed once per wave and
reused; nothing allocates while an effect plays, and nothing grows with elapsed
time. Tests assert the table's size is fixed and every intensity is an integer in
`[0, 100]`. The body pulse is a 12-entry ramp. A test proves the wave lights **no
cell the ambience does not already own** — an effect cannot invent geometry.

**Terminating.** Both effects end after a fixed frame count and contribute
nothing thereafter. Verified against the runtime: the harness advances a
controllable clock, ticks, and asserts the phase reaches `idle`.

**Reduced motion** shortens every reaction without removing it — 24 frames become
4, 12 become 2 — because a reaction that never appeared would hide the information
rather than reduce the motion. A test asserts the picture still changes.

---

## 5. Where the design note was wrong

The note said the only latent risk was a host letting the display's slot size
itself from the canvas. **That was not the risk.** The real defect was elsewhere
and only appeared under test.

### A unit bug that made an effect invisible

`cellKey` returns a cell's index in the framebuffer's **byte** space (four bytes
per cell), because `PixDisplay`'s API speaks bytes. `paintBodyPulse` treated that
value as a cell index, so it decoded coordinates from a quarter of the real
offset and addressed the wrong part of the grid. The effect ran, terminated
correctly, and changed **zero pixels**.

The reduced-motion test caught it: it asserted the picture *changes*, and got two
identical framebuffers. Every determinism, bounds and termination test passed
while the effect did nothing visible — which is exactly the failure mode those
tests cannot catch on their own, and why that one assertion exists.

Fixed by dividing by the four bytes a cell occupies, with `cellIndexFromKey`
exported so the conversion is written once instead of at each call site.

### A boundary scanner false positive

The content boundary test flagged `content/sylf/effects.ts` for referencing the
DOM global `window`. It was a local variable. Three attempts to teach the scanner
scope-sensitivity made it *worse* — and one attempt broke the engine's own
existing fixture, which asserts `canvas.getContext('2d')` must be flagged.

The honest resolution: the scanner is a **plain name match**, deliberately, and
that is now documented at the function. A local called `window` fails the check
too, and that is the intended trade — the name is reserved by the platform, so
the rule forbids the collision rather than teaching the scanner to out-parse
TypeScript. The local was renamed to `litSpan`, the scanner was restored to its
simple form, and two tests record both the strictness and the trade.

Both changes are in the **test** layer; no engine invariant was weakened.

---

## 6. Performance

Heaviest realistic Phase 4 scene — `THINKING` looping with a sparkle wave, at
64 × 64, 652 lit cells, CPU-rasterised headless Chrome, 200 samples.

| Stage | p50 | p95 | max |
| --- | --- | --- | --- |
| Clear + full composite | 0.1 ms | 0.1 ms | 1.1 ms |
| Clear + composite + rasterise | 0.3 ms | 0.4 ms | 4.7 ms |
| **Heaviest Phase 4 frame** | **0.3 ms** | **0.3 ms** | 4.8 ms |

**The procedural effect costs nothing measurable.** The heaviest Phase 4 scene is
indistinguishable from an idle frame at the same density — the wave's per-frame
work is a bounded iteration over seven authored positions.

Against the baselines: Phase 1 measured p50 0.1–0.2 ms at a 48-cell matrix; Phase
3 measured p50 0.3 ms / p95 0.5 ms on the real card. Phase 4's heaviest scene at a
*64*-cell matrix is p50 0.3 / p95 0.3. **No renderer optimization was introduced,
and none is justified** — which is also why WebGL/OffscreenCanvas remains
unwarranted (O5).

### Zero work, on the real production card

| State | Window | Frames |
| --- | --- | --- |
| Resting, card mounted | 5 008 ms | **0** |
| `THINKING` + sparkle wave | 4 008 ms | 241 (~60 fps) |
| After the sustained signal is withdrawn | 4 008 ms | **0** |

The display still reaches a genuine zero-work idle while permanently mounted in
production, and returns to it after a sustained animation ends.

---

## 7. Verification

| Gate | Result |
| --- | --- |
| `npm run test -- --run __tests__/pixel-display __tests__/dashboard` | **263 passed / 13 files**, 0 failed (Phase 3: 231/12) |
| Companion regression | **202 passed / 24 files**, 0 failed |
| `npx tsc --noEmit` | 0 errors |
| `npm run typecheck:engine` | 0 errors — the engine is still DOM-free and Sylf-free |
| `npx eslint` on changed files | 0 errors |
| `npm run build` | succeeds |
| `npm run mobile:build` + `mobile:verify` | succeeds / **PASSED** |
| `GET /dev/pixel-display` in production | **404**, no dev-surface markup |
| `GET /dashboard` in production | 307 (still protected) |

New tests: **21** effect tests (determinism, bounds, termination, reduced motion)
and **12** adapter tests for the four signals and density invariance.

Visual QA at: dashboard 1440 × 950 dark; light mode with a custom accent
(`#0f766e`); mobile 390 × 800 (card stacks, display holds its 110 px box);
dev-surface density sweep at 32/40/48/64 all pinned to the same 320 px slot.

---

## 8. What Phase 4 did not do

No Pixel Studio, persistence, asset-authoring tools, cosmetics, character
redesign, landing integration, scripting, generated assets or sharing. No WebGL,
WebGPU or OffscreenCanvas. No speculative renderer optimization. No scene graph
or layer hierarchy — the flat-plane model was **not** evolved, because no
recorded evidence justified it.

Existing Sylf states, the dashboard integration and all 11 other
`CharacterRenderer` consumers are unaffected. No dependency was added.

---

## 9. Open decisions

**None closed.** The density work informed O1 and O16 most directly and the
heaviest scene informed O4, but informing is not closing.

| # | Decision | Status after Phase 4 |
| --- | --- | --- |
| O1 | Logical resolution | **Open, better informed — and now separable.** Density is independently controllable and proven not to disturb layout, so resolution can be decided as a *perceptual* question without a layout cost attached. The sweep shows 64 × 64 is legible at review size and 32 × 32 is chunky but coherent. |
| O2 | Inactive-cell presentation | **Open, unchanged.** Re-confirmed across all four densities in the sweep. |
| O3 | Frame data representation | **Open, unpressured.** Full materialized planes plus precomputed effect tables remain sufficient; the procedural effect added no pressure for diffs. |
| O4 | Runtime scheduling model | **Open, better informed.** The rAF-plus-continuation model drove a 4-beat authored loop, a 24-frame procedural effect and a sustained loop with no change. The one new datum: an effect and a state can both want frames and the OR is sufficient — no scheduler change was needed for two independent animation sources. |
| O5 | Renderer backend | **Open, now with negative evidence.** The heaviest Phase 4 scene costs p50 0.3 ms. There is no profiling case for a different backend. |
| O11 | Packed framebuffer | **Open, unpressured.** |
| O12 | Presentation size range | **Open.** Density is now separable from size, which changes the question: a larger slot is no longer the only way to get more detail. |
| O13 | High-DPI verification | **Still an open gap.** `devicePixelRatio` was 1 in every environment available. |
| O14 | Character proportions and fill | **Open.** Unchanged — the character was not redesigned, as required. |
| O15 | Eye-glint behaviour at small sizes | **Open, and now has a second lever.** At the real 110 px card with 48 cells the glint is one device pixel. The density work means the *slot* is no longer the only variable: a lower density at the same physical size makes every cell larger. That is a genuinely new option this phase created, and it should be evaluated before either the slot grows or the eye design changes. |
| O16 | Production presentation range | **Open, better informed.** Density may now vary while production size stays fixed, so "which sizes" and "which densities" are two decisions rather than one. |

### New, and deliberately left open

| # | Decision | Why it is open |
| --- | --- | --- |
| O17 | Whether the production card should animate at rest | Phase 3 measured auto-blink at ~54 fps and turned it off; Phase 4 adds a real sustained loop that is on only while a task runs. Whether a card-mounted companion should ever idle-animate is a product judgement that neither measurement settles, and the machinery to turn it back on already exists. |
| O18 | Effect vocabulary growth | Two effects cover four signals today. Whether a fifth signal needs a third effect — or whether the existing two compose — is a question for the phase that brings the fifth signal, not for anticipation. |
