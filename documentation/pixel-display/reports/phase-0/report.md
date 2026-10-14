# Phase 0 — Visual validation and minimal working foundation

**Status:** complete.
**Scope:** the first production-quality Pixel Display foundation, plus the visual
comparison needed to choose its presentation values.
**Evidence:** [evidence/](evidence/) — captures, `results.json`, `tests.log`,
`typecheck.log`.
**Resulting contract:** [Pixel Display contract](../../pixel-display-contract.md).

---

## 1. What was built

One foundation, in four layers, following the roadmap's Phase 0 scope exactly.

### Engine — `lib/pixel-display/engine/`

| Module | Responsibility |
| --- | --- |
| `geometry.ts` | Logical bounds, row-major index arithmetic, one `contains` predicate |
| `framebuffer.ts` | Canonical `Uint8ClampedArray` RGBA storage, revision counter |
| `display.ts` | `PixDisplay` — the public API, and the single authority on bounds |
| `color.ts` | `0xRRGGBBAA` packing, hex parsing, alpha scaling |
| `runtime.ts` | Minimal scheduler: idle, wake, frame, stop |
| `index.ts` | The engine's only supported import path |

DOM-free, React-free, and Sylf-free.

### Renderers — `lib/pixel-display/renderers/`

`canvas-2d.ts` is the only layer that knows about physical pixels: device-aware
backing store, whole-device-pixel boundary snapping, and the gap / inactive-cell
/ backdrop treatment. `grid-presentation.ts` holds those presentation candidates
as data rather than constants buried in drawing code.

### React host — `lib/pixel-display/react/`

`PixelDisplay.tsx` owns one `<canvas>` and hands lifecycle to `usePixRuntime`,
which binds the canvas, tracks the container with a `ResizeObserver`, watches
device-pixel-ratio changes, and suspends the runtime when the display is
off-screen or the document is hidden. No render-time pixel state.

### Content — `lib/pixel-display/content/`

The placeholder character as **authored pixel data**: a 32 × 32 reference grid of
row spans, a legend, a palette sampled from the reference artwork, and step-based
animation tables. Planes are painted in a declared order
(sparkles → ground → body → leaves → blush → eyes).

### Development surface — `app/dev/pixel-display/`

The isolated validation surface the roadmap requires, with every candidate the
roadmap lists as a live control.

---

## 2. Verification

| Gate | Result |
| --- | --- |
| `npx tsc --noEmit` | Clean — **0 errors repository-wide** |
| `npx eslint lib/pixel-display app/dev proxy.ts` | Clean — 0 errors, 0 warnings |
| `npm run test -- --run __tests__/pixel-display` | **115 passed / 8 files**, 0 failed |
| `npm run build` | Success; 89 static pages |
| Production `GET /dev/pixel-display` | **404**, no dev-control markup |
| Routes unaffected | `/` 200, `/login` 200, `/companion-prototype` 200 |

### The doc's §27 demonstrations

| Requirement | Evidence |
| --- | --- |
| A fixed logical pixel matrix | 48 × 48, 2,304 cells, 9,216 B framebuffer |
| Individually addressable pixels | `setPixel` / `getPixel` asserted per cell, including both corners |
| Crisp responsive rendering | Whole-device-pixel snapping at DPR 1, 2, 3; one surface |
| A character created from pixel information | Placeholder rendered from authored spans, not an image |
| Simple runtime animation | 5-beat blink, 400 ms: open → half → closed → half → open |
| Direct modification of individual cells | Click-to-paint, composited on a viewer layer |

### The idle-to-zero-work guarantee, measured

Not asserted — read from a live browser session:

| Scenario | Frames | Scheduled work |
| --- | --- | --- |
| Auto-blink active (Full) | 110 → 236 over 2.5 s | frame pending |
| Auto-blink suppressed | 237 → **237** over a further 2 s | **none** |
| Runtime explicitly stopped | 224 → **224** over 2.5 s | **none** |

The runtime readout stays `active` while scheduling nothing at all, which is the
distinction the guarantee is about: idle is the absence of a loop, not a loop
that does nothing.

### Bugs found and fixed during verification

Recorded because they are the failure modes this architecture is meant to
surface, and each now has regression coverage:

1. **Fractional logical coordinates were silently dropped.** The reference-to-
   display mapping produced `23.06`, and the bounds contract correctly refused a
   non-integer cell — so the character rendered as an empty grid. The mapping was
   wrong, not the contract; the mapping now rounds to whole cells. This is the
   contract working as designed.
2. **A limiting-loop animation never settled.** The settle check could not be
   reached, so a blink left a frame permanently scheduled. The animation now
   settles the moment its final beat completes.
3. **`half` and `closed` eye shapes rendered identically**, so the blink showed a
   pixel-identical frame. A test now asserts that every authored eye shape paints
   a visually distinct eye.
4. **Direct pixel edits were erased by the next content pass.** Content clears
   the framebuffer every frame, so an edit must live on a viewer layer composited
   after content. The engine now has an explicit `PixOverlay` concept; edits
   survive repaints and never become part of the character's authored data.

---

## 3. Chosen configuration and the evidence for it

Recorded as **candidates**, not frozen requirements. The full comparison is on
the dev surface; the captures are in [evidence/](evidence/).

| Constant | Candidate | Why |
| --- | --- | --- |
| Logical resolution | **48 × 48** | At 32 the eye ink merges and the face stops reading. At 40 it is legible but tight. At 48 silhouette, eyes and ground all read. At 64 shading is richest but cells are small at real card sizes. |
| Cell gap | **0.12** of the pitch | Reads as an ordered matrix of lit squares. Above ~0.25 the cells separate into a dotted grid and the character stops reading as a solid form. |
| Inactive-cell opacity | **0.0** | Any visible inactive cell reintroduced a graph-paper feel; fully off keeps it premium. |
| Character fill | **0.63** of the short side | Leaves deliberate margin above the sprout and below the ground. Above ~0.75 the leaves approach the edge; below ~0.5 the character floats. |
| Backdrop | **`#0b1220`** deep navy | Reads as a powered screen. OLED black reads as a hole and loses the physical-display impression. |

Colors were sampled from the reference artwork rather than invented; the palette
table is in the contract.

---

## 4. Verification limits and blockers

Stated so they are not mistaken for full coverage.

- **jsdom cannot render Canvas.** The engine is pure and asserted
  deterministically; the Canvas renderer is verified against a recording 2D
  context double. Visual correctness is verified by the recorded captures and
  human review — it does **not** replace the deterministic tests, and the
  deterministic tests do not prove visual correctness.
- **The connected browser reports DPR 1**, so live rendering at 2×/3× was not
  observed. Whole-device-pixel snapping at 1×, 2× and 3× is covered by
  `canvas-renderer.test.ts`, including a 110 px slot where naive maths produces
  fractional edges. Phase 1 extended this to 1 / 1.5 / 2 / 2.5 / 3 across ten
  presentation sizes but still could not observe a live high-DPI surface.
- **No keyboard grid cursor.** Direct pixel editing is pointer-driven. The paint
  overlay is a real `<button>` and reaches focus, but there is no arrow-key cell
  navigation. Not required by Phase 0; noted because the doc's accessibility
  requirements will apply once the display is interactive in production.
- **Pre-existing suite failures.** A full-suite run reports 43 failures across 14
  files in unrelated domains (ai, planner, auth, economy, settings, security,
  surface, mobile). These are **not** caused by this phase: stashing the only
  tracked file this phase changed (`proxy.ts`) and re-running three of the
  failing suites produced identical failures. The untracked `pixel-display` tests
  and `app/dev/` cannot affect those domains.
- **The working tree contained pre-existing unrelated modifications** to
  `lib/planner/v2/**`, `dist/planner-worker/**`, and planner documentation. They
  were left untouched, per the instruction to preserve unrelated working-tree
  changes.

> **Superseded in part by [Phase 1](../phase-1/report.md).** Phase 1 added a
> repeatable performance baseline across the planned presentation sizes, replaced
> the ad-hoc boundary checks with mechanical enforcement, and formalised the
> runtime's phase machine. The DPR gap below remains **open** — recorded as O13 in
> the contract — because no environment available to either phase could force a
> device pixel ratio above 1. Phase 0's own figures and findings are preserved as
> the historical record of that phase.

---

## 5. Boundaries held

Every boundary from the roadmap, and how it was kept:

| Boundary | How it was kept |
| --- | --- |
| Engine ⟂ content | `engine/**` imports no content, app, or product module |
| Engine ⟂ DOM | No `window`, `document`, or canvas reference in `engine/**` |
| Logical space ⟂ presentation | Content receives only logical cells; a resize test asserts the framebuffer is byte-identical across a size matrix |
| App ⟂ pixels | No application feature touches the framebuffer; there is no production integration yet |
| State ⟂ renderer | The renderer reads a framebuffer and owns no state |
| Adapters at the integration boundary | No landing adapter exists; nothing imports `app/components/landing/companion/**` |
| Additive, never subtractive | `CharacterRenderer`, `characterConfig`, the landing companion, the Locker, and the pixel-companion assets are unmodified |
| No persistence | No schema, migration, API route, or stored user content |
| Renderer substitution by test double | The recording double exists only in `__tests__/`; no second production renderer |

### Non-goals confirmed absent

No editor, no scene/layer model, no particles or procedural effects, no animation
authoring system, no `Uint32Array` framebuffer, no WebGL/WebGPU, no new
dependency, no production integration, no real Sylf character, and no Pixel
Studio.

---

## 6. What remains open

Unchanged by this phase, and deliberately so:

| # | Decision | Status after Phase 0 |
| --- | --- | --- |
| O1 | Logical resolution | 48 × 48 is a candidate; 32/40/64 remain valid, and no real card size was tested |
| O2 | Inactive-cell presentation | 0.0 chosen; faint variants uncompared at real card sizes |
| O3 | Frame data representation | Full materialized planes; declarative diffs unexplored |
| O4 | Runtime scheduling model | rAF + dirty flag; fixed timestep unexplored |
| O5 | Renderer backend | Canvas 2D; alternatives unmeasured |
| O11 | Packed framebuffer | `Uint8ClampedArray` only; not profiled |

Not exercised at all: production integration, particles, persistence, an editor,
a second production renderer, and performance on real hardware beyond a
development machine.
