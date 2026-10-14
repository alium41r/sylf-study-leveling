# Phase 8 — Easy Pixel Studio

**Status:** complete.
**Evidence:** [evidence/](evidence/).
**Contract:** [Pixel Display contract](../../pixel-display-contract.md) ·
**Authoring:** [authoring-guide.md](../../authoring-guide.md).

---

## 1. The editor

Locker → Identity → Studio Hub → **Companion** → *Open Pixel Studio*.

A scholar sees a large canvas, four tools, a palette, a small timeline, and a
preview. Nothing else, and the restraint is the design — no planes, no anchors,
no coordinates, no asset ids, no JSON, no matrix sizes.

| Tool | Behaviour |
| --- | --- |
| **Draw** | Paints cells, drag to paint a stroke |
| **Erase** | Clears cells back to transparent |
| **Fill** | Bounded flood fill of the connected region |
| **Pick** | Takes a colour from the drawing and returns to Draw |
| **Undo / Redo** | Bounded history, one entry per **stroke** |
| **Zoom** | 4× / 6× / 8× / 12×, editor-only |
| **Mirror** | Horizontal symmetry for drawing faces |

Verified in the browser: a drag paints 10 cells and reports one colour used;
undo removes the stroke; redo restores it; toggling onion skin twice leaves the
drawing byte-identical.

### The drawing model

The grid is painted imperatively to **one `<canvas>` at the authored size**, then
enlarged by CSS with `image-rendering: pixelated`. A 48 × 48 drawing drawn as
elements would be 2,304 nodes with 2,304 handlers and a subtree re-render per
stroke. This is one node, one paint per change, and the artwork is never
resampled — the same technique the Pixel Display renderer already uses.

Input is **pointer** events, so mouse, touch and pen share one path; the surface
declares `touch-action: none` so a stroke cannot scroll the page, and captures the
pointer so a stroke that leaves the canvas ends cleanly.

### Three concepts, kept distinct

| Concept | Where it lives | Persisted? |
| --- | --- | --- |
| **Authored grid** | the document, one of 32/40/48/64 | **yes** |
| **Editor zoom** | the editor only | no |
| **Production card size** | the surface that renders it | no |

A test asserts the serialised creation contains no zoom at all, and that two
drafts made at different zooms are the same document.

---

## 2. The timeline

Add, duplicate, delete, reorder, and set a per-frame hold from 60 ms to 1000 ms.
Reorder is **buttons, not drag**, so it is reachable by keyboard — a drag-only
reorder excludes anyone not using a pointer.

Frame durations are authored, so the animation plays on *its* timing rather than
the display's refresh rate. A two-frame drawing at 300 ms + 400 ms reports 0.6 s.

**Onion skin** draws the previous frame at 28% and the next at 16% into the
canvas as a wash. It is never written into the draft, and a test asserts toggling
it leaves the drawing unchanged.

**Playback** in the editor uses one `setTimeout` per frame rather than a frame
loop, for the same reason the display does: holding a picture is not work.

---

## 3. Animation representation, and the contract extension

### The mismatch, stated first

A `PixelAsset` as Phase 5 defined it is **static**: one set of planes, one
picture. There was no way to say "these pixels at 240 ms, those pixels at 240 ms"
without either declaring one plane per frame — which would make an 8-frame
drawing an 8-plane asset and defeat plane selection entirely — or creating a
second kind of content with its own renderer, which the constraints forbid.

### The smallest extension that closes it

```ts
geometry: { geometry: "animated", frames: [...], order?: [...] }
animation: { mode: "once" | "loop", frameDurationsMs: [...] }
```

A frame is still rows of tokens, validated by the same rules; `order` lets six
played frames be stored as four drawings. Frames live on the **geometry** rather
than the asset, so a hand-authored asset with several planes could animate just
one of them and neither case is special.

One more field was needed, and it was found by testing rather than design:
`paletteMode: "allow-unused"`. A scholar's palette is a **tool**, not a
description — `#a179fb` waiting to be used is correct. Under the strict default a
creation became invalid the moment its last purple pixel was erased, which is not
a rule anyone could keep. The default is unchanged, so built-in assets stay strict.

### The authored format

`PixelCreation` — a separate, versioned, minimal document, with pixels as
**palette indices** (`.` transparent, digits otherwise) so a 64 × 64 × 16-frame
drawing fits under the payload bound.

It is **one-way**: a creation becomes an asset, and an asset can never become a
creation. The trusted and untrusted formats cannot be confused, and a test asserts
a built-in asset is not a drawable creation.

---

## 4. Persistence

**A dedicated table, and the schema change is justified.**

| | |
| --- | --- |
| Model | `PixelCreation` (`userId`, `slug`, `name`, `grid`, `version`, `data` Json) |
| Migration | `20261005000000_pixel_creations`, applied successfully |
| `SCHEMA_BUILD_VERSION` | **27 → 28** |
| `characterConfig` | unchanged in shape; references a creation by id (`user:ember-wisp`) |

### Why `characterConfig` was insufficient

1. **Size.** A creation is up to ~70 KB of authored frames. `characterConfig` is
   read by `useDashboardData`, the stats route, conversation payloads and profile
   views. Putting artwork in it would make every one of those carry the artwork.
2. **Ownership and lifecycle.** A creation is a thing a scholar *has*, in possibly
   several instances, independent of what they wear. `characterConfig` records a
   *choice*, which is why it references a creation rather than containing it.

The artwork is a versioned JSON document rather than normalised frame rows,
because frames are small, self-contained, always read together, and their shape is
owned by the Pixel Display contract — normalising would spread a content format
across the schema and make every future version bump a migration.

---

## 5. Validation

`validateCreation` returns **every** problem as data and **fails closed**:

| Bound | Limit |
| --- | --- |
| Grid | 32 / 40 / 48 / 64 only — the tested densities |
| Frames | ≤ 16 |
| Frame duration | 60–2000 ms |
| Total duration | ≤ 30 s |
| Palette | ≤ 16 colours, unique, `#rrggbb` |
| Payload | ≤ 128 KB (the largest legitimate creation is ~70 KB) |

Malformed input is refused at **every** layer: the client validator gates the save
button, the API refuses with per-problem reasons before storing, and the decoder is
**total** — it never throws, so half-typed input cannot crash the editor
mid-stroke. Between the lenient decoder and the strict validator, nothing invalid
reaches the display.

---

## 6. Playback, and the two defects measurement found

### Once and Loop

- **Loop** repeats while equipped.
- **Once** plays through, parks on its final frame, and **returns to zero work**
  by itself — asserted as `update` returning `false`.

A saved animation is **not** wired to task completion, level-ups or AI-thinking.
Those remain system behaviours, and a test asserts a static asset reports no
animation at all so every built-in character's zero-work path is untouched.

### Defect 1 — the loop ran at 60 fps

The first implementation returned `true` from `update` whenever the animation was
not finished, which asks the runtime for another frame immediately. A 400 ms frame
therefore produced hundreds of frames of work to hold one picture.

Measured on the real dashboard: **181 frames over 3 seconds (~60 fps)** for a
two-frame loop at 400/240 ms.

The fix: when a frame is not yet due, the content returns `false` — letting the
runtime settle into `idle` — and schedules a single timer for the remaining
duration. Behaviour is identical; the work is not.

### Defect 2 — a hidden tab kept animating

That new timer called `requestFrame()`, the explicit external wake-up, which
reopened a suspended session. A backgrounded card rendered **9 frames over 3
seconds** on a display whose entire purpose in that state is to cost nothing.

The fix is a second, content-facing entry point: `requestFrameFromContent()`
refuses while a suspension is in force. `requestFrame()` deliberately still wakes
the display, because a dev control or a test doing so is a different intention —
and an existing Phase 1 test asserts exactly that, which is how the distinction
was found rather than invented.

### Measured on the real dashboard

A two-frame creation at 400 ms + 240 ms, equipped, on the production card:

| State | Window | Frames | Phase |
| --- | --- | --- | --- |
| Visible, looping | 5 005 ms | **14** (~2.8/s) | `idle` between frames |
| Tab hidden | 4 004 ms | **0** | `stopped` |
| Returned to view | 4 006 ms | **13** | `idle`, loop resumes |
| Loop unequipped | 5 007 ms | **0** | `idle` |

14 frames over 5 seconds is 2.8 a second — exactly the authored 1/0.64 s. The
loop costs what its frames say and nothing more, and every zero-work path returns.

---

## 7. Preview

Both previews go through the production `PixelCompanionCard` with the in-progress
drawing resolved by the **same resolver** the dashboard uses, so a preview cannot
show something saving would not produce.

| Preview | Size |
| --- | --- |
| Editing canvas | 4×–12× zoom over the authored grid |
| **Dashboard card** | **110 px, at the authored density** |

The card preview exists because Phase 7's O15 established that artwork which looks
good enlarged can fail at 110 px. A scholar can see small-size readability before
saving — and the card is rendered at the density they have chosen.

---

## 8. Character Customizer integration

Create in Studio → Save → appears in the Customizer → Equip → the dashboard
renders it. The two surfaces stay separate on purpose: **Studio creates, the
Customizer equips**, and neither becomes the other.

- The registry claims the `user:` namespace, so a creation resolves like any other
  form key.
- The resolver merges the scholar's creations into the catalogue for that
  resolution, so an equipped creation is drawn by the ordinary composition path.
- A creation that is missing, corrupt or unsupported **falls back to the built-in
  character and reports it** — verified end to end with an equipped id that does
  not exist: a valid companion, 438 lit cells, never a blank card.
- Deleting an equipped creation also un-equips it, so a scholar is never left
  unable to tell why their companion changed.

---

## 9. Mobile and accessibility

| Check | Result |
| --- | --- |
| Layout | Below 1000 px the controls move **under** the canvas in one column; the canvas reflows rather than shrinking |
| Tool row | Horizontally scrollable, so primary tools stay in one place and reachable with a thumb |
| Touch targets | Tools and swatches are ≥ 44 px |
| Overflow | No page-level horizontal overflow |
| Pointer | One path for mouse, touch and pen; `touch-action: none` on the canvas |
| Keyboard | Tools, palette, frames, reorder, playback, zoom and save are all buttons with visible focus rings |
| Frame reorder | Buttons, not drag |
| Reduced motion | Verified under `prefers-reduced-motion: reduce`: the preview renders and the selection stays legible; nothing depends on animation |
| Appearance | Every colour is a semantic token |

---

## 10. Verification

| Gate | Result |
| --- | --- |
| `npm run test -- --run __tests__/pixel-display __tests__/dashboard` | **440 passed / 17 files**, 0 failed (Phase 7: 382/16) |
| Shop / Locker / companion regression | **202 passed / 24 files**, 0 failed |
| `npx tsc --noEmit` | 0 errors |
| `npm run typecheck:engine` | 0 errors |
| `npx eslint` on new files | 0 errors |
| `npm run build` | succeeds; `/api/pixel-creations` present |
| Migration | applied successfully |
| `GET /dev/pixel-display` in production | **404** |

New: **56 studio tests** covering encoding round-trips, every validation bound, four
hostile inputs degrading safely, the editor model's totality, zoom independence,
the storage round trip, runtime-driven playback, and both zero-work paths.

### Boundary

The dual-vocabulary list grew to six modules, each with its reason in the test.
Pixel Studio resolves an in-progress drawing for its previews, so it must show
exactly what saving would produce.

---

## 11. Open decisions

| # | Decision | Status after Phase 8 |
| --- | --- | --- |
| **O25** | Whether a scholar may author more than a base character | **New.** Studio deliberately creates base characters only. Equipment, anchors and effects are deferred until the basic experience is proven — and the composition system already supports adding them one kind at a time. |
| **O26** | Whether creations should be shareable or listed publicly | **New.** A creation is private to its scholar. Sharing is a social feature with its own moderation surface, and nothing in this phase needed it. |
| **O27** | Whether the loop needs a reduced-motion variant | **Open, and the honest gap.** Reduced motion is respected in the *editor* — nothing depends on animation and the preview renders — but an equipped looping creation still loops on the dashboard. The smallest correct behaviour is probably to hold the first frame under `prefers-reduced-motion`, and it should be decided with a scholar's view of it rather than assumed. |
| O1, O15 | | **Better informed.** A user-facing density choice now exists end to end, and the 110 px preview gives art production a place to check readability before shipping a form. |
| O2–O14, O16–O24 | | **Unchanged.** |

### Limits, stated plainly

- **One editor, one asset kind.** A creation is a base character; nothing else is
  authorable yet.
- **QA wrote one creation to one account and removed it afterwards**, restoring
  that account's configuration. No other data was touched.
- **One editing session was verified by hand.** The tool behaviours are tested
  directly, but the full create → save → equip → reload path was walked once.
