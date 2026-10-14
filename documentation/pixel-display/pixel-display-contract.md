# Sylf Pixel Display contract

**Status:** current production contract after the approved Pixel consolidation,
8 October 2026. The engine sections below retain the original rationale; the
following product rules supersede historical candidate sizes/catalog statements.
User-artwork-only presentation supersedes every historical built-in character rule.
Implementation evidence: [consolidation report](reports/phase-2-consolidation/report.md).

## Current product contract

### Four independent quantities

- **Authored grid** is immutable document geometry: 32, 40, 48 or 64 square cells.
- **Display density** is a presentation choice. **Original** uses the selected
  drawing's authored grid; an empty display has no artwork density. Explicit Chunky/Balanced/Detailed/
  Finest select 32/40/48/64. A missing density on an existing user drawing is Original.
- **Physical display size** is CSS layout. Dashboard uses a framed square of
  approximately 230–254px on desktop and 94–146px in its compact layout;
  Customizer fills its available square. DPR changes the backing canvas only.
- **Editor zoom** is Fit or 4/6/8/12 CSS pixels per authored cell with square
  geometry and scrolling/panning. Zoom never changes artwork or display density.

The dashboard groups the framed companion, slanted segmented XP/HP meters, and
level/total-focus/today's-quota metrics in one overview. Desktop metrics sit below
the meters beside the artwork. At narrow content widths, artwork and meters share
the first row and metrics span the row below; this also accounts for the sidebar.
The frame sits outside the artwork and its saved border. Meter decoration does
not change progression values, and both meters expose accessible numeric values.
See the [presentation report](reports/dashboard-presentation/report.md).

### Native rendering and deterministic sampling

`creationToAsset` uses scaleShare 1 with no transparent-border crop. At matching
source/output grids every authored palette-index cell, transparent hole and edge
maps one-to-one. Framing stays stable between frames. No built-in character is supplied by the
renderer, resolver or catalogue.

For deliberate resampling, each destination cell center selects source
`floor((destination + 0.5 - origin) / scale)` independently on x/y. Equivalent
inverse source intervals use `ceil(origin + edge * scale - 0.5)` at both edges.
Collapsed source intervals paint zero cells. There is no minimum-one-cell overlap
or paint-order collision bias. Downsampling can lose thin detail; it never writes
back into the stored document. Upsampling repeats source cells deterministically.

Studio Artwork preview is native; Studio Dashboard preview uses the saved
configuration/density and current editor playhead, scaled to its available square.
Customizer and its comparisons hold frame one, with an explicit animation caption;
Dashboard runs the saved animation. Both use the same resolver, composition and presenter. Equal
owner/document revision/frame/density/parts produce equal logical framebuffer
bytes regardless of CSS size/DPR. Thumbnails explicitly hold frame one.

Content identity includes geometry, palette, framing, parts and animation timing,
not merely IDs. Immutable identities/conversions are cached per object. Same-ID
edits configure new content without a rename or full serialization on every
unrelated React render. `referenceWrites` diagnostics count reference-space
writes, **not surviving pixels**; deprecated `paintedCells`/`totalCells` aliases
remain for diagnostic compatibility. Verify fidelity from framebuffer/mask data.

### Display styling and paint selection

Original user drawings default to zero pixel spacing and square, unclipped edges.
`CharacterConfig.pixelGap` is a finite number from0 to0.3 (percentage of cell
pitch); user artwork defaults to0 when absent. `displayBorder` is `none` or a
six-digit RGB hex. The2px outline sits outside the canvas; it cannot consume
painted pixels or change physical artwork size. All previews/target descriptors
use these same normalized presentation fields. Save applies changed styling;
Save & equip applies it together with the owned artwork reference. Recovery and
history retain draft styling, but `PixelCreation` never stores display metadata.

The paint picker selects a brush RGB for future strokes without mutating the
artwork or undo history. Recent colors contain only colors actually used in the document; spectrum
traversal never adds swatches. Session-local order updates when painting. Palette allocation occurs on painting, grouped with the
stroke. Used swatches cannot be implicitly replaced. A seventeenth used color
is refused until a slot is unused across every frame. Version-1 rows use
`0123456789abcdef` for all16 palette entries and `.` for transparency; existing
digit-only documents remain compatible.

### Playback and arbitrary-drawing compatibility

Pixel Studio is a viewport-contained workspace. Its paint shelf, drawing tools,
undo/redo, canvas and animation strip remain within reach without scrolling the
document. Fit uses both available canvas dimensions and the workspace padding;
explicit zoom scrolls within the canvas. Pan (H) moves that viewport without
painting or creating history. A pointer stroke focuses the canvas so Ctrl/⌘ Z
and Ctrl/⌘ Shift Z work immediately; B/E/G/I select tools. Shortcuts do not
intercept text inputs, selects or open dialogs. Space on the canvas toggles Play.

Desktop preview/display settings can be collapsed. Compact viewports open them
in a drawer with a focus trap, Escape to close, restored focus and inert drawing
controls behind it. The frame strip can be collapsed independently and starts
collapsed below 700px viewport height. Editor controls use semantic appearance
tokens and shared motion timing, with reduced-motion overrides. These layout
controls are session-local and do not change artwork or saved appearance.
See the [workspace presentation report](reports/studio-workspace/report.md).

Automatic creation animation respects authored timing, Once/Repeat and reduced
motion. Reduced motion holds frame one and schedules no automatic frame timer.
Studio's explicit Play advances a shared selected-frame playhead even under
reduced motion; Pause holds, Once finishes, and Play replays a completed Once.
Hidden/offscreen hosts suspend the existing runtime. No default character or automatic blink is rendered. Do not add polling to
create ambient motion for an empty display.

User drawings expose a stage-relative ground anchor only. A garment/tool requiring
hand/neck/core anchors is unsupported; show compatibility feedback and preserve
ownership/stat bonuses. Effects use existing occupied cells on drawings, never
invent ambience pixels. Ground remains optional and independent. Artwork uses a black backdrop; empty
displays use semantic appearance surfaces.

### Identity, saving and data ownership

A creation's `user:<slug>` is stable and independent of its display name. Existing
legacy slugs stay readable. A new editor document gets a UUID-based slug; rename
edits it, Save as copy gets another identity. `PixelCreation.revision` starts at 1.
The document format remains version 1; revision is persistence metadata.

Save/delete require the expected revision. Identical retry after a lost response
is idempotent; a different stale edit returns 409. Authored grid cannot be changed
in place. Save, equip, quota and delete serialize on the same owner row within a
transaction. The 24-document limit holds across simultaneous writers.

Save persists artwork. Save & equip persists artwork then commits its owned
saved reference. A failed equip reports that artwork was saved and permits retry
without duplicate rows. An existing equipped drawing keeps its chosen density;
a newly selected drawing defaults to Original. Blank drafts may be saved but
cannot be equipped or replace the currently equipped drawing with empty content.
Missing/unowned references are rejected; deleting an equipped drawing commits
an empty selection (`none`/Original) atomically. Profile cosmetics and inventory are separate.

The owner library is subscribed, deduplicated and uses shared API transport/cache
boundaries. Mutations invalidate mounted readers; BroadcastChannel carries
owner-only invalidations, focus/visibility revalidate. Artwork is not persisted
in the generic client cache. Recoverable editor drafts are owner-keyed local
storage, include full document/timing/selection/baseline/revision, and are cleared
on logout; the session epoch prevents unmount from resurrecting cleared drafts.
Customization responses merge safely into Auth stats rather than replacing HP,
currency or appearance with a partial projection. Older in-flight stats reads
cannot roll back a later mutation or restore a previous owner after logout.

PixelCreation RLS is enabled; anon/authenticated direct grants remain revoked.
Protected API sessions and owner checks remain required. Authorized profile,
friend and party owners return a bounded **selected companion descriptor** with
owner ID, safe config, selected artwork and revision. They batch selected reads,
never return the private library, and apply current privacy/block/membership
rules first. Small social thumbnails receive frame one; full authorized profiles
may receive the bounded animation. The presenter reads no viewer library or
viewer level-up state. Equal slugs for different owners cannot collide.

### Sole in-app system and compatibility

Characters come exclusively from users' saved nonempty drawings. There is no
built-in character choice, automatic fallback, or default companion. New users
start with `outfit: none` and no ground. Existing retired character/form keys
resolve to an empty composition, retaining stored ownership and cosmetic data.
An empty composition paints no character or accessories. Missing artwork is
reported without substituting another drawing.

The own dashboard presents “Your canvas awaits” with a Create artwork action that
opens Pixel Studio. Compact viewports retain a 44px Create control. The Customizer
and Hub guide creation and selection; display settings are available with equipped
artwork. Clear display is a draft selection change until Apply. Loading an owned
selection and unavailable artwork are distinct from first-time empty content.
Foreign-user displays show a neutral No artwork/Artwork unavailable placeholder
and never expose the viewer's creation action or library.

Both retired Pixel characters are absent from app bundles. Their geometry remains
only in test fixtures for generic-medium regression coverage. Raster preview
assets and controls are removed; old `/companion-prototype` and development
`/dev/pixel-display` bookmarks open Pixel Studio. The landing SVG illustration
remains separate from the user-artwork system; old raster flags cannot enable it.
Inventory product icons, reward/ownership records, profile cosmetics and all user
artwork remain. `view=character-studio` resolves to Customizer for compatibility.
See the [user artwork report](reports/user-artwork-only/report.md).

---

## 1. Layer boundaries

The engine is split so that each later phase can change one layer without
touching the others. These boundaries are **enforced by tests**, not convention.

| Layer | Location | Knows about | Must never know about |
| --- | --- | --- | --- |
| **Engine** | `lib/pixel-display/engine/**` | Logical cells, framebuffer bytes, scheduling | Sylf, characters, DOM, React, canvas |
| **Renderers** | `lib/pixel-display/renderers/**` | Physical pixels, device pixel ratio, canvas | Sylf, characters, engine internals |
| **React host** | `lib/pixel-display/react/**` | Lifecycle, visibility, reduced motion | Pixels, characters, Sylf |
| **Content** | `lib/pixel-display/content/**` | Characters, palettes, animation tables | Sylf product state, application modules |
| **Surface** | `app/dev/pixel-display/**` | Dev controls, probes | — (development only) |

Answers each layer owns:

- **Engine** — *how are pixels displayed?*
- **Content** — *what should those pixels currently show?*

### How these boundaries are enforced

Review does not hold these; mechanisms do. Three of them, each independently able
to fail:

| Mechanism | What it catches | Where |
| --- | --- | --- |
| **Compile-time** | A DOM type — `HTMLElement`, `CanvasRenderingContext2D`, `ImageData`, `ResizeObserver`, `MediaQueryList` — appearing anywhere in `engine/**`. The engine is typechecked against a lib set with no DOM, so it is a type error, not a naming convention. | `tsconfig.pixel-engine.json`, `npm run typecheck:engine` |
| **Source scan** | Forbidden imports across layers (`engine → content/renderers/react/app/product`, `content → app`, `renderers → content/app`) and unguarded use of the frame-loop globals in the engine. | [`boundaries.test.ts`](../../__tests__/pixel-display/boundaries.test.ts) |
| **Fixture proof** | The scanners themselves. Each rule is asserted against a violating snippet, so a scanner that silently stopped matching would fail. | same file |

The engine's allowed platform globals are declared explicitly in
[`pix-engine-globals.d.ts`](../../lib/pixel-display/engine/pix-engine-globals.d.ts).
That file is the single, auditable list of what the engine may touch; widening it
is a deliberate, reviewable act.

The engine's public surface is **engine-only**. It deliberately does not re-export
renderer or presentation types: doing so would make the engine depend on a
renderer, and through it on the DOM.

A viewer layer (a direct pixel edit) is composited by the **runtime**, after
content, and is not part of the content's picture.

---

## 2. Logical model

| Property | Value |
| --- | --- |
| Logical resolution | **48 × 48** (candidate) |
| Addressable cells | 2,304 |
| Total byte size | 9,216 B (9.0 KiB) |

The logical resolution is **independent of physical presentation**. The same
matrix renders at a 110 px dashboard card, a 390 px mobile card, and a 458 px
desktop slot with no change to any logical coordinate. 32 × 32, 40 × 40, and
64 × 64 were also rendered from identical art and are compared on the dev
surface.

### Coordinate system

- Origin `(0, 0)` is the top-left cell; `x` increases right, `y` increases down.
- Content operates **exclusively** in logical cell coordinates. No CSS pixel,
  viewport size, device pixel ratio or card width may reach a `Draw` callback.
- A logical coordinate is a **cell index**. Fractional coordinates are not
  cells and are refused (see §3).

---

## 3. Framebuffer

| Property | Value |
| --- | --- |
| Representation | One `Uint8ClampedArray`, RGBA byte order |
| Bytes per cell | 4 (`R`, `G`, `B`, `A`) |
| Ordering | Row-major from the logical origin |
| "Off" pixel | Alpha `0` (transparent) |

No packed/integer view (`Uint32Array`) is introduced. That optimization is
deferred until profiling demonstrates it is the bottleneck.

### Bounds contract — deterministic no-op

A write outside the logical grid is **refused**:

- `setPixel` returns `false` and leaves the framebuffer **byte-identical**.
- It never throws, never wraps to the next row, and **never clamps** onto a
  neighbouring edge cell. Clamping would silently paint the wrong pixel, which
  is strictly worse than refusing the write.
- `getPixel` outside the grid returns the canonical off color.
- `inBounds(x, y)` is the single predicate behind all of the above, and it
  requires integer coordinates. Non-integer and non-finite values are refused by
  the same rule.

**Consequence for content:** a coordinate mapping must emit whole cells. A
mapping that produces `23.06` is producing a coordinate the display will refuse,
and the resulting silent drop is exactly the bug class this contract surfaces.

---

## 4. Runtime

Three phases, not two:

```
   stopped ──start()/resume()/requestFrame()──► running ──(frame)──► idle
      ▲                                                                │
      └────────────────────── stop() ◄─────────────────────────────────┘
```

| Phase | Meaning |
| --- | --- |
| `stopped` | No frame is scheduled and none will be until a caller explicitly wakes it. `stop()` lands here. |
| `running` | Exactly one frame is scheduled or executing. |
| `idle` | A session is live, the display is on screen and correct, and no frame is scheduled because nothing needs to change. |

`idle` and `stopped` are **both zero work** but they are not the same state, and
collapsing them was the ambiguity Phase 1 removed. `idle` means "maintained and
costing nothing"; `stopped` means "not being maintained at all" — which is what a
display scrolled out of view should be. `isIdle()` is false while stopped.

| Guarantee | Behaviour |
| --- | --- |
| **Idle is zero work** | When idle, **no timer and no animation frame is scheduled at all.** Idle is not a loop that decides to do nothing; it is the absence of a loop. |
| **One wake, one frame** | `requestFrame()` schedules exactly one frame and is a no-op while a frame is already pending, so wakes cannot stack. |
| **Stop is observable** | `stop()` cancels any in-flight frame, so a suspended display is measurably stopped rather than merely unrendered. |
| **Stop wins inside a frame** | A `stop()` that happens during a frame is not overridden by content asking to continue, so a torn-down display cannot resurrect itself. |
| **Session survives a stop** | A stopped display has not ended its session. Only `start()` rebases logical time. |
| **Time is logical** | Content advances by accumulated frame delta, so a single long frame advances one beat rather than several. |
| **No 60 FPS assumption** | A static state stops asking for frames and the runtime stops scheduling. |

### `start()` and `resume()` are different operations

- **`start()`** begins a **new session**: logical time rebases to now and the
  opening frame is scheduled. Use it when a display enters service, so suspended
  wall-clock time does not leak into `elapsed`.
- **`resume()`** continues the existing session **without** rebasing, so a display
  returning from off-screen or a backgrounded tab picks up its animation where it
  left off. Scrolling away and back must not restart an animation.

Time rebasing happens in exactly one place (`beginSession`), so every path out of
`stopped` behaves identically.

Suspension policy: off-screen (an `IntersectionObserver`) or backgrounded
(`document.hidden`) calls `stop()`, and returning calls `resume()`. Reduced
motion does **not** stop the runtime — it suppresses automatic idle animation
inside content, so essential state changes stay visible.

---

## 5. Rendering

- **One Canvas 2D surface.** A 48 × 48 display is one DOM node, never 2,304.
- The backing store is sized in **device pixels**; CSS size stays in CSS pixels,
  so the browser never resamples the result.
- **Cell boundaries are snapped to whole device pixels.** Boundaries are
  rounded, not cell sizes, so consecutive cells share an edge and the grid never
  develops a stray seam at the far edge. A cell is always fully on or fully off.
- Image smoothing is disabled; the physical path never interpolates.

---

## 6. Presentation (candidate values)

These are historical Phase 0 candidates, compared live on the dev surface at
multiple resolutions, gap values, fill ratios, and viewports. The current product
contract at the top of this document supersedes these presentation values.

| Constant | Candidate | Notes |
| --- | --- | --- |
| Logical resolution | **48 × 48** | Compared against 32, 40, 64 at identical art and presentation size. |
| Cell gap | **0.12** of the pitch | Separator is a fraction of the *cell pitch*, so the ratio survives any presentation size. |
| Inactive-cell opacity | **0.0** | Unlit cells are fully invisible; the grid reads as an ordered matrix of lit squares. |
| Lit-cell intensity | **1.0** | |
| Character fill | **0.63** of the short side | Compared at 0.40–0.85. |
| Screen backdrop | **`#0b1220`** (deep navy) | Sampled from the reference artwork. Compared against `#05070d` and `#000000`. |

### Colors sampled from the reference artwork

| Token | Value | Use |
| --- | --- | --- |
| `displayBackdrop` | `#0b1220` | Screen behind the matrix |
| `bodyHighlight` | `#dcebfd` | Lit side of the body |
| `body` | `#c0d8f0` | Body mid |
| `bodyShade` | `#a8c0f0` | Trailing side |
| `bodyDeep` | `#7890c0` | Deep shade |
| `leaf` / `leafShade` | `#43e1b0` / `#48c0a8` | Sprout, ground |
| `sparkle` / `sparkleViolet` | `#5ac9d1` / `#a179fb` | Ambient sparkles |
| `blush` | `#fbd6ff` | Cheek blush (celebration) |
| `eye` | `#20243f` | Eye ink |

The display's backdrop is a **content constant, not a theme token**: a physical
pixel matrix keeps its dark screen in light mode. Everything around it uses
Sylf's semantic tokens.

---

## 7. Content — the Sylf character

Authored as pixel data — no image, no SVG, no sprite sheet, no texture. Every cell
is a span on a 32 × 32 reference grid, resolved to a palette color at draw time.

Lives in `lib/pixel-display/content/sylf/`:

| File | Holds |
| --- | --- |
| `sprite.ts` | The authored spans: body rows, leaves, stem, blush, eye shapes |
| `frames.ts` | The state vocabulary, per-state composition, authored timing |
| `parts.ts` | The four plane painters and the plane registry |
| `character.ts` | Composition and animation, implementing `PixContent` |

### Composition is a flat ordered list

```
scenery:  sparkles → ground      (painted first, so the character is in front)
character: body → leaves → blush → eyes
```

There is **no scene graph, no layer hierarchy, no z-index, no compositing algebra
and no generic part system**. A plane is a named function that paints reference
spans; composing is painting them in order. That list is the entire model, and
`PLANE_ORDER` is a frozen literal rather than something computed.

### A state is a plane selection

| State | Eyes | Blush | Ambience |
| --- | --- | --- | --- |
| `IDLE` | `open` | off | on |
| `FOCUSING` | `focused` | off | off |
| `REST` | `sleeping` | off | off |
| `CELEBRATING` | `happy` | on | on |
| `BLINK` | walks the authored table | off | on |

`selectsPlane(plane, plan)` is the single rule for what a state shows. All
painting routes through it, so the full composite and a partial repaint cannot
disagree.

**A state selects planes; it never replaces the figure.** That is the difference
between this and a set of full-character images, and it is asserted: changing the
eye shape leaves body, leaves and blush byte-identical, with a positive control
proving the eyes really changed.

### Eye vocabulary

Six shapes — `open`, `focused`, `half`, `closed`, `sleeping`, `happy`.

Every shape must occupy a **distinct set of cells**, which is enforced. Two
shapes sharing cells would mean swapping them produced no visual change: a blink
that never blinked, with the palette test still passing. `closed` and `sleeping`
are deliberately different shapes so that "asleep" is never mistaken for one
frame of a blink.

### Authored blink

`open → half → closed → half → open`, one pass, then settle.

| Beat | 1 | 2 | 3 | 4 | 5 |
| --- | --- | --- | --- | --- | --- |
| Eyes | open | half | closed | half | open |
| Duration | 70 ms | 60 ms | 110 ms | 60 ms | 100 ms |

There is no interpolation, no easing function and no procedural motion. Closing
beats are quicker than opening ones, as a real blink is.

### Blush and eyes are clipped to the silhouette

The body records the cells it occupies; the face planes clip to them. The planes
are anchored independently in reference space and each rounds to a logical cell
on its own, so a run flush with the silhouette can otherwise land a cell outside
it at some character fills. Clipping states the invariant once instead of tuning
spans per resolution.

### Plane suppression is content state

An editor or viewer may ask the content to leave planes unpainted
(`setSuppressedPlanes`). This is deliberately **not** a post-render pixel patch:
`render` is a full composite, so an external erasure would be undone on the very
next frame. Suppressed planes are simply not painted, and `effectivePlanes()`
reports what the composite will actually draw.

### Repaint model

Phase 0's contract and its implementation disagreed here, and Phase 1 settled it.
Two different things were being described as one:

| | Meaning | What is true |
| --- | --- | --- |
| **Composite boundary** | How much of the framebuffer one `render` call writes | **Every frame is a full composite.** `render` writes the whole picture, derived from content state alone; the runtime guarantees nothing about what survives between frames. |
| **State diff** | How much of the picture differs between two content states | **Plane-local.** Changing the eye shape changes eye cells only. |

So the correct statement is *not* "a blink repaints only the eye cells". It is:

> A blink changes **only the eye cells**, but the frame that shows it is a full
> composite.

This matters because it fixes expectations for later phases. There is no
incremental composite, no damage tracking and no layer invalidation, and nothing
should assume otherwise. Confusing the two would also have hidden a real
optimisation opportunity: because the composite is per-frame and unconditional,
the cost is paid whether or not the picture changed — which is why a `hold` state
that requests no further frames is the cheapest state, and why any future
dirty-region work belongs behind evidence rather than assumption.

---

## 8. Testing strategy

jsdom has no canvas implementation, and this repository deliberately does not
depend on a native canvas package. The strategy follows from that:

- The **engine is pure and DOM-free**, so framebuffer, bounds, runtime and
  content behaviour are asserted directly and deterministically.
- The **Canvas renderer** — the only layer that touches the DOM — is verified
  against a **recording 2D context test double**. No second production renderer
  exists or is planned.
- Visual validation is a recorded, human-reviewed artifact and **does not
  replace** the deterministic tests.
- The **recording renderer** in `__tests__/pixel-display/support/` implements the
  same `PixRenderer` interface as the Canvas renderer, which is how renderer
  replaceability is proven without shipping a second renderer.
- **Boundaries are tested, not trusted** (see §1), including proof that each
  scanner can fail.

Coverage after Phase 8, updated by the
[engineering audit](reports/engineering-audit/report.md): **457 tests across 20
files** across `__tests__/pixel-display/` and `__tests__/dashboard/`, plus the
`npm run typecheck:engine` compile-time boundary check and the four static
application-boundary scans. The audit added three suites
(`audit-composition-regressions`, `audit-react-host-regressions`,
`pixel-creation-surfaces`) that assert on the framebuffer rather than on what a
painter returns, because a returned count is what let two composition defects
hide.

---

## 9. Performance baseline

Recorded, not targeted. Full measurements and method:
[performance.json](reports/phase-1/evidence/performance.json).

At a 48 × 48 logical resolution, on a CPU-rasterised headless browser:

| Presentation | Device px per cell | Frame p50 | Frame p95 |
| --- | --- | --- | --- |
| 108 px | 2.25 | 0.2 ms | 0.3 ms |
| 318 px | 6.63 | 0.2 ms | 0.5 ms |
| 456 px | 9.50 | 0.2 ms | 0.4 ms |
| 595 px | 12.40 | 0.1 ms | 0.5 ms |

**The finding: frame cost is command-bound, not area-bound.** Cost is flat across
a 5.5× change in device pixels per cell, so it tracks the fixed 2,304 per-cell
draw commands rather than the physical area filled. The clear, content composite
and overlay stages are each below the measurement clock's 0.05 ms granularity;
the Canvas fill pass dominates.

**Idle is exactly free**: measured over 1.5 s windows, both `idle` and `stopped`
produced **0 frames**.

Two honest caveats: occasional 6–16 ms single-frame maxima appear (GC or
compositor contention under CPU rasterisation), which are not the steady cost
since p95 stays at or below 0.5 ms; and the forced device pixel ratio was not
honoured by this environment, so the high-DPI rows describe a 1×-rasterised
surface of that CSS size rather than a true 2× one.

No optimization follows from this. In particular the per-frame full clear was the
obvious candidate and the measurements do not justify touching it.

---

## 10. The application boundary

Phase 3 added the display's first production surface. The boundary it established
is the one every later integration follows:

```
application signal → feature adapter → Sylf state → runtime → framebuffer → renderer
                     ^^^^^^^^^^^^^^
```

The dashboard adapter translates application signals. A bounded, tested allowlist
also permits the shared companion presenters, Studio, Customizer and development
review surface to resolve content. Static source scans enforce these boundaries:

- no dashboard file imports `pixel-display/engine`, `pixel-display/renderers`, or
  a character-plane module;
- the dashboard reaches the display through the shared companion presenter,
  React host and content types;
- application/content integrations must appear in the explicit allowlist in the
  boundary regression tests; adding a consumer does not authorize rasterization
  inside application code;
- `engine/**` and `content/**` import nothing from `@/app/**`.

**Application code emits semantics only.** It names a state; it never touches a
framebuffer, a renderer, or a plane. The translation from an application fact to
a character state is a pure exported function so it can be read and tested
without React.

### Reactions

A reaction is deliberately the minimum that works: one active reaction, a timer,
and a return to a base state. There is no queue, no priority scale and no
interruption algebra, because exactly one reaction exists. Adding those for a
single case would be inventing architecture for behaviour that is not there.

Reactions are keyed by a `runId` supplied by the application signal, so one
occurrence cannot fire twice — including across a remount — and two occurrences
arriving close together cannot be collapsed into one.

### The application signal owner

`LevelUpProvider` owns level-up detection. It exposes `lastLevelUp` as a durable
record, separate from `isLevelUpVisible`, because closing the celebration overlay
must not erase the fact that a level-up happened. Consumers react to the event;
they do not re-derive it, and they do not duplicate the provider's baseline,
login-suppression or downgrade-repair logic.

### Production posture

| Property | Value |
| --- | --- |
| Dashboard slot | 278–300 px CSS on desktop; 258 px on the tested mobile layout. The backing store follows DPR. |
| Character fill | Sylf composition framing is 0.90. User creations occupy their complete authored grid with framing 1.00; no content bounding-box crop. |
| Self-triggered idle animation | **off** for the static built-in; a saved creation uses its authored playback. |
| Idle cost, permanently mounted | **0 frames** over the final 1.5 s static-idle measurement; animation suspends off-screen and under reduced motion. |
| Runtime CPU sample | Final native 48-grid sample: p50 0.10 ms, p95 0.40 ms across 300 ticks. This excludes layout/GPU and is not full-dirty throughput. |
| Canvas accessibility | `role=img` with a companion label; a separate `role=status` sentence carries a level-up reaction. |

The display is decorative in the sense that no task depends on seeing it, but a
reaction reports something that happened to the scholar — so the card exposes a
non-visual equivalent, and that equivalent survives reduced motion, which
shortens the reaction to 1.8 s rather than removing it.

## 11. Density, animation and effects

Added by Phase 4.

### Density is separate from size

Four quantities, independently controllable:

| Quantity | Meaning | Set by |
| --- | --- | --- |
| Physical display size | CSS pixels the display occupies | the host's slot |
| Logical resolution | cells in the matrix | `PixelDisplay.width` / `height` |
| **Density** | cells per unit of physical size | the relation between them |
| Character fill | share of the matrix the character occupies | `characterFill` |

The renderer already enforced this: `fit` derives the backing store from the
**slot**, never from the matrix, so `cellPitch` is the only quantity resolution
changes. Verified across 32/40/48/64 at a pinned presentation size — the canvas's
backing store is identical in every case and only device pixels per cell move.

**This is not CSS zoom and not a resized canvas.** Both would put logical
coordinates back in the hands of the compositor, which boundary B3 forbids. The
canvas's CSS size and device-pixel size are the same at every density.

### Effects are not states

A state is what the companion **is**. An effect is what is briefly **happening**
to it. Keeping them separate is why there are no `*_EFFECT` states.

| | Authored | Procedural |
| --- | --- | --- |
| What it is | a frame table | a pure function of `(frame, seed)` |
| Used when | the character *is* something | something *happens* to it |

An effect **post-processes**: it has no planes, no paint order and no z-index, and
it modulates cells the composite has already painted. That is what keeps the
flat-plane model sufficient — an effect cannot invent geometry or change what a
state means.

### Effect guarantees

- **Deterministic.** Same `(frame, seed)` ⇒ byte-identical framebuffer. Two seeds
  give different pictures. No floating-point drift: a frame reached by one long
  step equals the same frame reached by several short ones.
- **Bounded.** The sparkle table is `SPARKLES.length × frameCount` and is computed
  once; the body pulse is a fixed ramp. Nothing allocates per frame and nothing
  grows with elapsed time.
- **Non-inventive.** A test asserts the wave leaves every previously-empty cell
  empty, so an effect cannot paint outside the content's own geometry. That holds
  because the state's ambience plane paints those reference cells. Two gaps the
  audit measured: a level-up over a **scholar's own drawing** (which has no
  ambience plane) lights up to 8 cells the drawing never painted, and the wave
  paints sparkle cells even in states that select no ambience. Making the wave
  skip cells that are not already lit would satisfy the guarantee everywhere — a
  visible change, recorded rather than made (audit §4).
- **Terminating.** Fixed frame counts, after which an effect contributes nothing.
- **Logical only.** Effects never read a CSS size, a device pixel ratio or a cell
  pitch.

### The reactions

| Signal | State | Effect |
| --- | --- | --- |
| `LEVEL_UP` | `CELEBRATING` | sparkle wave |
| `TASK_COMPLETE` | `IDLE` | body pulse |
| `STREAK_EXTENDED` | `CELEBRATING` | sparkle wave, different seed |
| `AI_THINKING` | `THINKING` | none — a pulse would imply progress |

`THINKING` is the **only animation authored without a `loops` limit**, so it is
held until the application withdraws the signal. Every other animation is finite.
It is the single deliberate exception to the rule that content always settles
itself, and it is correct because a long-running task genuinely is ongoing.

Reduced motion shortens every reaction — 24 frames become 4, 12 become 2 — and
never removes one, because a reaction that never appeared would hide the
information rather than reduce the motion.

## 12. The authoring contract

Added by Phase 5. Full guide for authors:
**[authoring-guide.md](authoring-guide.md)**.

A **Pixel Asset** is one versioned, declarative object in one file. It describes
what a thing looks like; it does not rasterise anything.

```
lib/pixel-display/content/asset/
  types.ts        the contract
  resolve.ts      geometry → reference cells
  validate.ts     every rule, as data
  attachment.ts   host anchor − pivot
  paint.ts        reference space → logical cells
  reference/      the built-in catalogue
```

| Concept | Expression |
| --- | --- |
| Identity / version | `id` (`namespace:name`), `version` |
| Kind | `character` \| `wearable` \| `held` |
| Reference dimensions | `reference: { width, height }`, in cells |
| Palette | single-character keys; `.` is transparent |
| Geometry | `raster` (rows of tokens) or `spans` (runs, optionally `shaded`) |
| Planes | an ordered array — **order is the composition** |
| Bounds | the reference grid; validation rejects anything outside it |
| Origin / pivot | an anchor in reference space |
| States | a **plane selection**, never a separate drawing |

**No scene graph, no inheritance, no scripting, no expressions, no z-index.**
Nothing in the reference assets needed one.

### Attachment

```
offset = host.anchor − attachment.pivot        (reference space)
```

The placed asset is then painted with the **host's placement — its origin *and*
its scale** — so an attachment is sized by what holds it. Taking only the scale
is a real bug that Phase 5 made and fixed: with the origin at zero the offset
stops being a reference-space delta and becomes a display coordinate.

There is no socket taxonomy. Only the anchors the reference assets need exist.

### Validation

`validateAsset` returns **every** problem as data, deterministically; 24 issue
codes cover version, identity, kind, reference grid, plane identity, raster and
span bounds, palette references and usage, anchors, states and attachment wiring.
It **fails closed** — an unknown token is an error even though the resolver skips
it, because a mistyped key that silently paints nothing is the failure mode being
prevented.

### What an asset may import

Nothing from `engine`, `renderers`, `react`, React, `next`, `@/app/**`, or the
DOM. Boundary tests enforce it. An asset declares rows and spans and never calls
`setPixel`.

## 13. Modular composition and cosmetics

Added by Phase 6.

### The five kinds

```
character | wearable | held | pedestal | aura
```

`pedestal` and `aura` were added because the real catalogue has an equipped slot
for each and neither is a wearable or a held item: a pedestal is *under* the
character, an aura *surrounds* it. Forcing either into an existing kind would have
meant an anchor that lied about what it attached to.

There is deliberately no `hat`, `cape`, `trail` or `emote`, because no existing
cosmetic key needs one.

### Composition is one level deep

```
composition = { base, parts: [{ slot, asset, state }] }
```

- **one host** — the character — and a **flat list of parts**;
- a part is an asset, and an asset has no slot list, so composition **cannot
  recurse, cannot cycle, and needs no traversal**;
- declaring a slot twice paints it once.

This is a deliberate ceiling. Nothing in the real catalogue needed more, and a
part that hosted its own parts would be a different feature argued for on its own
evidence.

**Paint order:** `pedestal → character → wearable → aura → held`. Ground behind,
then the figure, then what surrounds it, then what it holds. An aura paints after
the body because it is clipped to it.

### One placement per composition

Every part is painted with the **base's placement** — its origin *and* its scale —
so parts scale together and cannot drift. Because that placement maps a reference
grid onto whatever display it is given, composition is independent of physical
size and logical density for free. Measured: reference-space offsets are
byte-identical at 24, 32, 40, 48 and 64 logical cells.

### Clipping is per asset, and it means something

A part whose asset has a `clippedToPrevious` plane clips to the **base's
silhouette** (a glow inside the body). A part without one does not, because ground
is legitimately outside the figure.

### Ground ownership

Ground belongs to the **pedestal**, not the character: `CharacterConfig.pedestal`
is an equipped slot, so the ground is chosen and can change. The character keeps
only its own ambience, which nothing equips.

### The application boundary

```
persisted keys → cosmetic registry → asset ids → composition → content → display
```

The registry is the only place that knows both vocabularies. It does not price,
unlock, rank-gate or own anything, and the display receives a **composition**, not
a Shop concept. Boundary tests assert both directions: the display layer may not
import `character-traits`, `shop`, `locker` or `asset-manifest`, and the content
layer may not import the registry.

### Fallback

Three outcomes, and the difference matters:

| Outcome | Meaning | Visual result |
| --- | --- | --- |
| `asset` | mapped | paints |
| `unequipped` | deliberately nothing (`none`, `relic_none`) | nothing, no notice |
| `unknown` | never heard of | the slot's fallback, plus a notice |

An unknown **form** falls back to the base figure — a character with no body is
broken, not degraded. An unknown **accessory** falls back to nothing. No
configuration, including none at all, produces a blank card.

## 14. The Character Customizer

Added by Phase 7. The scholar-facing surface over everything above.

### Where it lives, and what it is not

Locker → Identity → Studio Hub → **Companion**. It shares the Identity tab's
existing draft model and is **not a writer**: it raises changes upward and asks to
save, so the application still has one persistence path.

### Nothing implementation-facing reaches a scholar

No asset ids, planes, anchors, pivots, coordinates, state names or matrix sizes.
Unlock requirements are rephrased — `RANK E` becomes "Rank E". A test asserts
every category label, hint and option label is free of that vocabulary.

### A category must earn its place

A category is shown when it offers **a real choice**. The character gallery offers
Sylf and the owner's saved, nonblank drawings. Ground offers None and Meadow.
Unsupported legacy slots fall back safely without offering placeholder choices
or promises of unfinished content. Blank documents remain editable in Studio.

### Pixel density is a preference

Original preserves a drawing's authored grid. Four additional bounded presets
use deterministic sampling without changing the stored artwork:

| Preset | Resolution |
| --- | --- |
| Original (default for drawings) | Authored grid |
| Chunky | 32 |
| Balanced | 40 |
| Detailed (default for Sylf) | 48 |
| Finest | 64 |

Stored at `CharacterConfig.density`, inside the existing JSON; missing density
resolves to Original for drawings and Detailed for Sylf. The density preference
needs no schema migration. The separate consolidation migration adds creation
revision/RLS protections. Physical size stays fixed across density changes:
verified at the 278 px dashboard slot and equal 96 px comparison slots. Only the
logical grid and cell pitch change; authored rows, grid and revision remain intact.

### Equipped means what is showing

When a stored key is one the companion cannot draw, the figure falls back to the
base and **the base reads as selected**, because that is what is on screen.
Marking nothing would leave a scholar unable to tell what they are wearing.

### The change comparison

The draft/save readout compares **only the fields the companion draws from, with
density resolved on both sides**. A whole-object comparison reports "Unsaved" for
every scholar who never opened the customizer, because the preview resolves a
density the saved configuration does not carry. "Unsaved" must mean *the companion
would look different*.

## 15. User-created content (Pixel Studio)

Added by Phase 8.

### The authored format

`PixelCreation` — separate from `PixelAsset`, versioned, minimal, and treated as
**hostile input**:

```
{ version, id: "user:<slug>", name, grid, palette[], frames[{ rows, durationMs }], playback }
```

Pixels are **single hexadecimal palette indices (`0`–`f`)** (`.` transparent), so a 64 × 64 × 16-frame
drawing fits the payload bound. `creationToAsset` converts a validated creation
into an asset; the conversion is **one-way**, so the trusted and untrusted formats
cannot be confused.

### Animation, as a contract extension

A static asset could not express a frame animation without one plane per frame, so:

```ts
geometry: { geometry: "animated", frames: [...], order?: [...] }
animation: { mode: "once" | "loop", frameDurationsMs: [...] }
```

Frames live on the **geometry**, so a multi-plane asset can animate one plane.
`paletteMode: "allow-unused"` exists because a scholar's palette is a tool rather
than a description — under the strict default a creation became invalid the moment
its last pixel of a colour was erased. The strict default is unchanged.

### Bounds

Grid 32/40/48/64 only · ≤ 16 frames · 60–2000 ms per frame · ≤ 30 s total ·
≤ 16 unique `#rrggbb` colours · ≤ 128 KB payload. Validation returns every problem
and **fails closed**; the decoder is total and never throws, so half-typed input
cannot crash the editor.

### Storage

A dedicated `PixelCreation` table, because a creation is artwork (up to ~70 KB)
while `characterConfig` is read by the dashboard data hook, the stats route,
conversations and profile views. `characterConfig` **references** a creation by id
(`user:<slug>`) rather than containing it.

### The looping rule

A user-equipped loop is the one explicit exception to zero-work idle, and its cost
is bounded rather than hidden:

- frames advance on the **authored durations**, not the refresh rate;
- while a frame is not due the content returns `false`, so the runtime settles to
  `idle` and one timer wakes it when the frame is genuinely due;
- content asks through `requestFrameFromContent()`, which **refuses while a
  suspension is in force** — so a hidden or off-screen display animates nothing.
  `requestFrame()` still wakes the display, because that is an external intention.

Measured on the real card: 14 frames over 5 s for a 400/240 ms loop (~2.8/s),
**0 frames** while hidden, **0 frames** when unequipped.

## 16. Remaining decisions and verified scope

The historical Phase 0–8 reports retain their original open-decision tables.
Current dispositions:

| Area | Current decision |
| --- | --- |
| Resolution / size / fill (O1/O12/O14/O16) | Original drawing grid or explicit 32/40/48/64; fluid square physical size; presentation-only Sylf 0.9 fill |
| Catalog / migration (O21/O23/O24) | One truthful Sylf catalog plus saved drawings; all legacy consumers migrated; unsupported inventory visuals degrade explicitly |
| Motion (O17/O27) | Auto-blink off; reduced motion freezes autoplay; explicit Studio playback available |
| High DPI (O13) | Real Chrome touch emulation at DPR3 verified; physical Android/iOS hardware remains outside this run |
| Sharing (O26) | Selected artwork on already-authorized social surfaces only; no marketplace/library sharing |
| Asset expansion (O20/O22/O25) | New forms, nested scenes, authored equipment and procedural systems deferred |
| Renderer / buffers / timing (O3/O4/O5/O11) | Existing bounded Canvas2D runtime retained; GPU/packed buffers/new catch-up architecture deferred absent a measured consumer need |
| Mixed per-plane clipping | Deferred until a real asset requires mixed clipped/unclipped planes |

Native/sampling, browser parity, desktop/touch flow, target-user authorization,
transaction/RLS checks and production/mobile bundle verification are recorded in
the [implementation evidence](reports/phase-2-consolidation/evidence/README.md).
