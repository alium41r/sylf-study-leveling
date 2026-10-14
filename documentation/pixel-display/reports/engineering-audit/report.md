# Pixel Display — engineering audit (Phase 0 → Phase 8)

**Status:** audit complete; seven defects fixed with regression tests, the rest
recommended for decision.
**Scope:** `lib/pixel-display/**`, the dashboard integration, the Locker surfaces
(Customizer / Studio / Hub), the `PixelCreation` persistence seam and the
development surface — the whole system, not Phase 8 alone.
**Evidence:** [evidence/](evidence/) (`tests.log`, `typecheck.log`,
`typecheck-engine.log`, `eslint.log`, `measurements.json`).

Start here for the current contract: [pixel-display-contract.md](../../pixel-display-contract.md) ·
[authoring guide](../../authoring-guide.md).

---

## 1. Bugs found and fixed

Each fix has a regression test that was run **red before** the change and green
after. The red runs are quoted; the suites are in
[`__tests__/pixel-display/audit-composition-regressions.test.ts`](../../../../__tests__/pixel-display/audit-composition-regressions.test.ts),
[`audit-react-host-regressions.test.tsx`](../../../../__tests__/pixel-display/audit-react-host-regressions.test.tsx)
and [`__tests__/dashboard/pixel-creation-surfaces.test.tsx`](../../../../__tests__/dashboard/pixel-creation-surfaces.test.tsx).

### B1 — The state a surface declared never reached the drawing

**User-visible:** a level-up showed the sparkle wave over a **resting**
companion; `AI_THINKING` never showed the working gaze. The card's
`data-state="CELEBRATING"` was true of the adapter and false of the pixels.

**Root cause — two independent halves, either of which alone was enough:**

1. `SylfCharacterContent.configure()` accepted every declared option *except*
   `state`, and `PixelDisplay` pushes its `content` props through `configure`.
   `state` was therefore honoured at creation and never again.
2. Since Phase 6 the dashboard card always draws a **composition**, and
   `paintComposition` painted `composition.baseState` — which the dashboard
   never sets, so the base asset always painted its *own first* state (`IDLE`).

**Evidence (red):** through the component, `IDLE` → `CELEBRATING` changed **0
cells**; on the composition path, **0 cells**; the bare-character path (dev
surface) changed 60. On the real card, a level-up changed +2 cells (the sparkle
wave) with no blush, while `data-state` read `CELEBRATING`.

The Phase 3 evidence table ("applying the same state the adapter applies")
called `setState` on the dev probe — a path that works. It never drove the
`content` prop, so the real signal path was unverified.

**Fix:** `configure` accepts and applies `state` (guarded so re-declaring the
resting state cannot cut a self-triggered blink short);
`SylfCharacterContent.render()` passes `this.currentState` to `paintComposition`,
which now takes `state` and falls back to `composition.baseState`.

**Regression:** "draws a different picture for CELEBRATING than for IDLE",
"shows the celebration's blush only while celebrating", "reaches the drawing
when the declared state changes after mount", and card-level "moves the drawn
companion into its celebrating posture" (red: `expected 0 to be greater than 0`).

### B2 — Changing pixel density froze the display

**User-visible:** the Customizer's *Pixel size* picker changed nothing on screen;
the Studio preview froze when a drawing of another grid was opened; the dev
surface's resolution chips did the same.

**Root cause:** `usePixRuntime` replaces the display, renderer and runtime when
`width`/`height` change, but the canvas and container bindings are mount-scoped.
The new renderer was never fitted, so `presentationSize.cssWidth` stayed 0 and
`isReady()` was false for ever — and the container's `ResizeObserver` kept
re-fitting the detached handle instead of the live one.

**Evidence (red):** after a 48 → 64 change the new handle reported
`cssWidth 0`, `cellPitch 0`, `isReady() false` and **0 draws** (the first
renderer had been fitted: `cssWidth 110`, pitch 2.29).

**Fix:** the creation effect fits the new display through one shared
`fitToContainer`; the container callbacks resolve the handle through the ref at
call time, so an observer that outlives its display acts on the live one.

**Regression:** "fits the new renderer and draws through it", "keeps the
container observer pointing at the live display" (red: `expected +0 to be 110`).

### B3 — A composition erased its own pedestal

**User-visible:** the ground/grass was missing from the dashboard card — the
thing Phase 6 explicitly moved "without changing a pixel".

**Root cause:** `paintComposition` clears, paints the pedestal (paint order puts
ground first, with `preserve`), then paints the character with `paintAsset`
**without** `preserve` — whose first act is `display.clear()`. The ground was
wiped on the frame that drew it.

**Evidence (red):** the result reported `pedestal 9` + `character 438` = 447
painted cells while the framebuffer held 429 lit cells and **no lit row past
26**; the pedestal's cells are on row 30. The Phase 6 suite asserted
`result.parts[].paintedCells > 0` — the painter's *report*, never the picture.

**Fix:** the composition owns the single clear; the base is painted with
`preserve: true`.

**Regression:** "does not erase the pedestal when it paints the character"
(measures where the pedestal paints on its own, then requires every one of those
cells to survive in its own colour).

### B4 — A declared effect was recorded but never played

**Root cause:** the constructor stored `options.effect` in `declaredEffect`
without starting it — and because the declaration *was* recorded, a later
`configure` with the same kind and seed was treated as a repeat and never
started it either. A display rebuilt mid-reaction (a density change does that)
lost the reaction's effect outright.

**Evidence (red):** `isEffectRunning()` was `false` immediately after
construction with `effect` in the options, and the picture was identical to a
render with no effect.

**Fix:** a declared effect starts with the content.

**Regression:** "is the effect that is happening".

### B5 — Effects modulated the wrong cells over a composition

**Root cause:** the effects mapped reference space with the *character path's*
rule (`createPlaneMapping(display, characterFill)`), while a composition is
drawn with the base asset's own placement (`scaleShare` 0.63 for Sylf). Two
consequences, both measured:

- the body pulse brightened a 0.9-scale Sylf-shaped mask over a 0.63-scale
  figure — **13 of the changed cells were the pedestal's ground**;
- the sparkle wave lit up to **4 cells the composite had left empty**,
  contradicting the contract's "an effect cannot paint outside the content's own
  geometry" (§11).

**Fix:** `render()` records the composite's placement and the figure's own
reference cells, and both effects address exactly those. A new exported
`referenceCellRect` is now the single definition of where one reference cell
lands (also used by `paintAsset`), replacing a second opinion inside the effect.

**Regression:** "keeps the body pulse off the ground the composite painted",
"keeps the sparkle wave inside the composite's own geometry" (red: `13` and `4`).
The bare-character path is byte-identical — the whole existing effect and
composition suite still passes unchanged.

### B6 — An accepted creation could produce an asset that fails its own validator

**Root cause:** `creationToAsset` gave every palette entry a key. A creation may
declare up to sixteen colours while the frame alphabet is ten digits, so colours
10–15 became two-character keys — `palette-color-invalid`. `resolveAttachment`
validates both sides and treats an invalid asset's anchors as untrustworthy, so
the derived asset poisoned the attachment path.

**Evidence (red):** 10 colours → no issues; 11 → `["palette-color-invalid"]`;
16 → six of them.

**Fix:** the asset palette carries only the drawable alphabet (colours past it
were unreachable by construction).

**Regression:** "validates, even at the accepted colour bound".

### B7 — A scholar's own drawing vanished from two previews, and the dashboard could serve a pre-save catalogue

**Root cause A:** `PixelCustomizer` and `StudioHubView` resolved the equipped
configuration against the **built-in** catalogue only, so an equipped `user:`
form fell back to the base figure there while the dashboard drew the drawing —
while both files claim the preview "cannot disagree with what a scholar gets
after saving". (Measured red: **0** of the drawing's own pixels in the preview.)

**Root cause B:** the signed-in scholar's creation list is cached in module scope
and `invalidateScholarCreations()` was exported but **never called**; a traced
run also showed an in-flight read re-filling the cache *after* an invalidation,
so a creation saved and equipped in one session stayed invisible to the
dashboard for as long as the cache was fresh (30 s) — long enough for a scholar
to see their drawing replaced by the built-in companion.

**Fix:** the hook is exported as `useScholarCreationAssets` and threaded into
both previews; Pixel Studio invalidates on save and on delete; the cache write is
epoch-guarded, so a read that began before a write cannot repopulate it.

**Regression:** "shows the scholar's drawing, not the built-in companion" and
"reads the catalogue again, so a new drawing can be drawn" — red at
`expected 0 to be greater than 0` and `expected +0 to be 1`, both verified by
temporarily reverting the fix and restoring it.

### Also corrected

- A pre-existing lint **error** in `pixel-studio.test.ts` (`let now` → `const`).
- Three pre-existing documentation links that were one level too far up, so the
  authoring guide's ten references to the asset contract, the tests and the
  reference assets resolved above the repository root — the file an agent is told
  to start from could not be followed. Fixed (now validated: every link in the
  README, the contract, the authoring guide and this report resolves).
- Four comments that described behaviour the code did not have:
  `PixDisplay.setMany` (claimed one revision; each cell records its own),
  `blitPlane` (described an alpha-at-(0,0) rule it does not implement), the Sylf
  character asset ("…and the ground in front" — the ground moved to the pedestal
  in Phase 6), and the body pulse ("the eyes are deliberately excluded" —
  measured: 36 of 40 eye cells brighten; behaviour left alone, comment corrected,
  decision recorded as R9).

---

## 2. Investigated and found **not** to be bugs

| Suspect | Finding |
| --- | --- |
| Auto-blink running at ~54 fps | Intentional and measured; the production card passes `autoBlink: false` and idles at 0 frames. The dev surface is the only surface that turns it on, and it suppresses it under reduced motion itself. Optimisation opportunity → R1, not a defect. |
| `idle` vs `stopped`, `resume()` not rebasing time | Verified: a stop preserves the session, a resume continues it, and a huge post-suspension `delta` advances **one** authored beat; the looping-creation path re-paces rather than bursting. |
| `requestFrameFromContent()` refusing while suspended | Correct per Phase 8's second defect. Re-verified: a hidden tab produces 0 frames; a stopped display is not woken by content, and `requestFrame()` still is (an existing Phase 1 test pins that difference). |
| Stale `lastTime` after a long suspension | No leak into any observable: content keys off `delta`, and the frame counter is monotonic per runtime. |
| Creation payload bound counts `JSON.stringify(...).length` (UTF-16 units, not bytes) | Not material: the only free-text fields are bounded (`id` ≤ 24 chars, `name` ≤ 32), so the overshoot is ~64 units against a 128 KB bound whose largest legitimate document is ~70 KB. |
| Malformed `characterConfig` (`outfit: 42`, `pedestal: {}`, `aura: []`) | Degrades to the base figure and reports it; no throw on a dashboard render (existing tests). |
| A creation that fails to convert | Dropped, not repaired; the resolver falls back to the built-in figure — verified as a valid companion, never a blank card. |
| Framing/attachment arithmetic (`offset = host.anchor − pivot`, host origin **and** scale, `grid-larger-than-host`) | Re-derived by hand and exercised at 24/32/40/48/64; reference-space offsets are identical at every density. No drift. |
| Canvas cell snapping, `gap` insets, the resize matrix | No seam or rounding defect found at DPR 1/1.5/2/2.5/3 (existing matrix green). |
| `resolvePresentation()` unreachable from production | Not a bug: the renderer clamps `gap` and opacity defensively in `draw`, so raw values cannot produce an out-of-range fill. Dead export → R11. |
| Environments without `ResizeObserver` / `IntersectionObserver` / `matchMedia` / rAF | Each has an explicit fallback; the runtime works without rAF. |
| The creation cache surviving logout | Not reachable: `logout()` performs a full page navigation, so module scope is rebuilt. Keying the cache by user id was considered and deliberately not added. |
| Mobile app + the pixel card | `MobileApp` mounts `GlobalSystemWrapper`, which provides `LevelUpProvider`, so the card is fine on the device. A *mobile test* renders `MobileRouteOutlet` with a mocked `AuthProvider` and no wrapper, so the card throws there; reverting this pass's changes reproduces it exactly → pre-existing harness gap, not a product defect. |
| The three unrelated failing suites in this repository (`__tests__/economy/cognitive-stats`, `__tests__/surface/shop-surface`, `__tests__/mobile/settings-navigation`) | Pre-existing: Prisma transaction mocks (`tx.$queryRaw is not a function`) and the mobile harness above. Confirmed unrelated to the Pixel Display — no failing module imports it. |

---

## 3. Recommended improvements — decision needed before implementing

Nothing in this section was implemented.

### R1. Make auto-blink timer-driven (the Phase 8 loop pattern)

**Evidence:** measured 217 frames in 4 s when on, 0 when off (Phase 3); the
implementation returns `true` from `update` for the whole interval, holding the
runtime at ~54 fps to show one blink every 3.2 s.
**Benefit:** same appearance at ~1–2 frames per blink interval, and content
stops being the only place that cannot reach zero work while animating.
**Risk/cost:** small; the mechanism already exists (`scheduleAnimationWake` /
`requestFrameFromContent`). **Recommend:** yes, if any surface ever turns
auto-blink on — today only the dev surface does, so it is polish rather than a
correctness need.

### R2. Decide the character fill on the composition path (O14)

**Evidence:** the card passes `characterFill: 0.9`, but a composition is placed
by the *asset's* framing (`0.63`), so the documented production posture is not in
force: measured 429 lit cells / 29 × 22 extent versus 765 / 41 × 35 on the bare
path at the same nominal fill.
**Benefit:** the value Phase 3 measured and the contract documents would be the
value that ships, and a per-surface fill would work again.
**Risk/cost:** visually significant; three options — (a) pass the content's fill
as a `scaleShareOverride` for the base (parts inherit the host placement),
(b) change the asset's `framing.scaleShare`, (c) accept 0.63 and update the
docs. **Recommend:** (a), then re-shoot the 110 px card.

### R3. Give user creations anchors (O25)

**Evidence:** with a drawing equipped, `resolveAttachment` returns
`['asset-invalid', 'host-anchor-unknown']` for *any* accessory, because a
creation asset declares no anchors — so a scholar who equips a drawing silently
loses their pedestal, aura, scarf and held item.
**Benefit:** an equipped drawing behaves like the built-in figure.
**Risk/cost:** product decision (which anchors a drawing offers); a creation is a
full-grid square drawing with the same framing, so copying the built-in
character's four anchors is the obvious answer. **Recommend:** yes, with the
degradation surfaced either way (R4).

### R4. Surface composition degradation

**Evidence:** `paintComposition` already reports a `problems` list per part, and
no surface reads it; parts are dropped silently (that is how R3's effect is
invisible).
**Benefit:** "your companion's ground could not be placed" instead of an
unexplained change. **Risk/cost:** small, presentation-layer only.
**Recommend:** yes, in the Customizer and the Studio Hub.

### R5. Stop stringifying the whole content object every render

**Evidence:** `PixelDisplay` computes `JSON.stringify(content)` on every render,
and `content` carries the composition — for a 64 × 64 sixteen-frame creation that
is ~65 KB of frame strings, plus a deep `JSON.parse` whenever the key changes.
**Benefit:** removes a per-render allocation proportional to artwork size from a
card that is always mounted. **Risk/cost:** low; a structural key (base id, state,
slots + asset ids, effect kind/seed/fill) is enough for the comparison the effect
performs. **Recommend:** yes.

### R6. Clip parts per plane, not per part

**Evidence:** `paintComposition` passes `clipTo` for a whole part when **any** of
its planes is `clippedToPrevious`, while `resolveAsset` clips per plane. No
reference asset mixes clipped and unclipped planes today, so nothing misrenders
now. **Risk/cost:** small. **Recommend:** when an asset first needs it, not
before.

### R7. Tell the scholar what is equipped when it is their own drawing

**Evidence:** with an equipped creation no Character card reads as selected
(`renderedKeyFor` returns `null` for the `user:` namespace by design), while
"equipped means what is showing" is the rule the Customizer documents.
**Benefit:** the category is not mysteriously blank-selected. **Risk/cost:** it
needs an option that is not from a catalogue, which the file's first rule
forbids — so either a "Your drawing" entry (a deliberate exception) or a short
note. **Recommend:** a note first; a card if scholars ask.

### R8. The looping-creation reduced-motion gap (O27)

**Evidence:** an equipped looping creation still loops under
`prefers-reduced-motion`; the editor respects the preference.
**Recommend:** hold the first frame, decided with a scholar's view of it.

### R9. The body pulse washes the eye ink

**Evidence:** 36 of the 40 eye cells brighten during a pulse, though the code
claimed the eyes were excluded. **Options:** blend only body tones, or accept it
and keep the corrected comment. **Recommend:** decide with the art, and re-check
at 110 px.

### R10. RLS on `PixelCreation`

**Evidence:** the migration creates the table without `ENABLE ROW LEVEL
SECURITY`, while the project's other user-owned tables (S2/S3 work) carry RLS +
an owner policy. Exposure today is nil — S2 revoked `ALL` on all tables from
`anon`/`authenticated` and set default privileges for the `postgres` role, so
PostgREST cannot read the table. **Benefit:** the same defence in depth as its
peers if grants are ever re-added by a dashboard-created object or a future
migration. **Risk/cost:** one additive migration, no app change.
**Recommend:** yes, as a follow-up migration (not applied here; this pass did not
touch the database).

### R11. Trivial cleanups

Unused `resolvePresentation` export; three unused imports in `creation.ts`; one
unused import in the creations API route; a dead `harness` helper in the Studio
test; the landing companion's dev-only `pixel-preview.ts` plumbing (a separate
system). **Recommend:** fold into any future touch of those files.

### R12. Note on effect timing

`advanceEffect` advances at most one frame per update, so a single very long
frame stretches an effect instead of skipping. Harmless at today's frame counts
(4–24 frames); record it if effects grow.

### R13. The recorded screen backdrop is not what ships, and its token is dead

**Evidence:** the contract's candidate is `#0b1220` (deep navy, sampled from the
reference artwork) and `SYLF_PALETTE.displayBackdrop` holds exactly that value —
but the token is referenced nowhere, and the production card passes no
`presentation` prop, so it renders with `DEFAULT_PRESENTATION.backdrop`
(`#000000`). The dev surface defaults to deep navy through its own candidate
list, so the two surfaces disagree.
**Benefit:** either the recorded candidate becomes what ships, or the contract
records that the card is OLED black. Today a reader cannot tell which.
**Risk/cost:** visual only; one prop or one token. **Recommend:** decide in the
visual polish pass, and delete the token if black is the answer.

---

## 4. Remaining risks and open decisions

**Genuinely still open (unchanged by this pass):** O1 (logical resolution — now
a scholar-facing preference, and R2 sharpens it), O2 (inactive-cell
presentation), O3 (frame-data representation), O4 (runtime scheduling), O5
(renderer backend), O11 (packed framebuffer), O12/O16 (presentation range), O15
(eye glint at small sizes), O17 (whether the card animates at rest — currently
"no", with the machinery intact), O18 (effect vocabulary), O19 (scenery as its
own kind; ground resolved, ambience not), O20 (nested composition), O21 (the
thirteen unauthored forms), O22 (form variants), O23 (migrating the remaining
`CharacterRenderer` consumers), O24 (the aura and relic catalogues are still
effectively empty — a scholar can hold `aura_obsidian`, which nothing defines),
O25 (equipment for creations — now with evidence, see R3), O26 (sharing), O27
(reduced motion for a looping creation), O13 (high-DPI live verification).

**Risks this pass could not close:**

1. **Live-browser verification of the density flow is missing.** The Next dev
   client did not hydrate in the audit browser session (HMR websocket refused,
   canvases left at their 300 × 150 defaults, no dev probe published), so the
   *Pixel size* picker could not be driven through the real UI. The mechanism is
   covered deterministically at the component level with the production
   component and a recording 2D context; a five-minute manual pass over
   Customizer → Pixel size is still worth doing after this change.
2. **A creation-equipped level-up still lights cells the drawing never painted.**
   Measured: with a one-row drawing equipped, the sparkle wave invents up to
   **8** cells. The non-inventive guarantee holds only because the built-in
   character's ambience plane paints those reference cells in the states that
   show ambience; a scholar's drawing has no ambience plane. Making the wave skip
   cells that are not already lit would satisfy the guarantee everywhere — a
   visible change to the effect, so it is left as a decision.
3. **The dashboard catalogue is refreshed on mount (and after a write), not on
   focus or in real time.** A card left mounted in one tab will not see a
   creation saved in another tab until it remounts.
4. **Effects over a *creation* still assume the built-in sprite's ambience
   geometry** (the sprite sparkle table). They are now placed correctly and
   cannot stray outside the figure, but "ambience for user content" has no
   authored source yet.
5. **`paintedCells` counts writes, not surviving pixels.** It is what let B3
   hide for two phases. It is now paired with framebuffer assertions in the
   audit tests, but the field's name still invites the wrong reading.
6. **Audit coverage is not uniform.** The engine, renderers, React host, content,
   asset contract, composition, customizer, studio, persistence seam and the dev
   surface's wiring were read in full; the two large development-surface
   components were reviewed where they touch the production paths (sizing,
   density, probe publication, content management) rather than line by line, and
   `scripts/measure-pixel-display.mjs` was not audited.

---

## 5. Verification

| Gate | Result |
| --- | --- |
| `npx vitest run __tests__/pixel-display __tests__/dashboard` | **457 passed / 20 files**, 0 failed (baseline before this pass: 441 / 17) |
| New regression tests | **16** across three files, all red-then-green (the seven fix groups above, plus the blink guard and a real-state-change control) |
| `npx tsc --noEmit` | 0 errors (`evidence/typecheck.log`) |
| `npm run typecheck:engine` | 0 errors (`evidence/typecheck-engine.log`) |
| `npx eslint` on the pixel system, Locker surfaces, API route and tests | 0 errors, 10 warnings — all pre-existing (unused imports/helpers in files this pass did not change materially); `StudioHubView`'s two `no-explicit-any` errors verified present in the pre-change file (`evidence/eslint.log`) |
| `npm run build` | compiles successfully; `/api/pixel-creations` and `/dev/pixel-display` in the route table |
| `npm run mobile:build` / `npm run mobile:verify` | both pass (`evidence/mobile-build.log`, `evidence/mobile-verify.log`); the mobile client lazily imports `DashboardScreen`, so the pixel code is inside that bundle |
| Production runtime checks (`npm run start`, port 3211) | `/` 200, `/dev` 404, `/dev/pixel-display` 404, `/dashboard` 307 |
| Persistence / data checks | Read-level only: the `PixelCreation` model, its ordered migration (`20261005000000_pixel_creations`), the `userId_slug` uniqueness and the API route's ownership checks are consistent, and `SCHEMA_BUILD_VERSION` is 28 as Phase 8 recorded. **No database was read or written in this pass** (no migration, no live query); the creation cache and the resolver were exercised against mocked API responses. |
| Performance / lifecycle measurements | Framebuffer-level: 429 lit cells (composition) vs 765 (bare, fill 0.9); pedestal 13 cells at row 30 now survive; pulse touches 0 ground cells (was 13); wave invents 0 cells over the built-in figure (was 4) and 8 over a drawing (unchanged, see risk 2); a logical-size change now fits (cssWidth 110) and draws where it previously drew nothing; the runtime's idle/stopped guarantees are unchanged and still asserted. |

**Not run as gates:** the Planner PostgreSQL harness (no pixel involvement) and
any live-database check. The mobile gates above were run rather than reasoned
about, because the pixel code ships inside the mobile bundle.
