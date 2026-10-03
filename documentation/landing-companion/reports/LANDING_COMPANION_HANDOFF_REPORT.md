# Sylf Landing Companion Handoff

This report describes the landing-page companion implementation only. It does not describe or authorize changes to the in-app avatar/chibi renderer, character studio, shop, focus screens, or Planner. The repository contains other concurrent work; the file list below is limited to the companion implementation and its landing integration.

## 1. Files changed or created

### Landing integration

- `app/page.tsx` — routes `/` to `JourneyLanding` and supplies landing metadata.
- `app/components/landing/journey/JourneyLanding.tsx` — landing structure, anchors, static hero companion, pause/resume control, and `JourneyPath` mount.
- `app/components/landing/journey/JourneyPath.tsx` — responsive path construction, scroll-following, waypoint state selection, visibility/reduced-motion gates, and companion imperative updates.
- `app/components/landing/journey/journey-geometry.ts` — cubic path construction and arc-length lookup by document Y.
- `app/components/landing/journey/Journey.module.css` — traveler wrapper, journey layer, static hero fallback, responsive sizing, and reduced-motion layout behavior.
- `app/components/landing/journey/BotanicalTrail.module.css` — traveler dimensions and mobile treatment for the journey character.

### Shared landing companion

- `app/components/landing/companion/Companion.tsx` — canonical public renderer, semantic state mapping, size API, visibility pausing, and decorative accessibility behavior.
- `app/components/landing/companion/artwork.tsx` — SVG scene, one registered painting source, clip paths/masks, vector eyes/halo/props, and layer hierarchy.
- `app/components/landing/companion/Companion.module.css` — ambient animation, expression/action animation, independent layer transforms, pausing, and reduced motion.
- `app/components/landing/companion/model.ts` — expressions, actions, semantic states, presentation mappings, reaction durations/priorities, palette, and size constants.
- `app/components/landing/companion/useCompanionState.ts` — one active reaction, priority handling, expiry, cancellation, and duplicate-token protection.
- `app/components/landing/companion/JourneyCompanion.tsx` — imperative bridge from journey velocity to CSS variables; avoids per-frame React state commits.
- `app/components/landing/companion/JourneyCompanion.module.css` — local body bank and secondary-motion variable application.
- `app/components/landing/companion/secondary-motion.ts` — bounded damped springs for body, cape, ribbons, halo, and star response.
- `app/components/landing/companion/CompanionReview.tsx` — `/companion-prototype` review surface with state/reaction controls and galleries.
- `app/components/landing/companion/CompanionReview.module.css` — review page layout and controls.
- `app/companion-prototype/page.tsx` — public no-index review route.

### Asset, verification, and tests

- `public/landing/companion/original-rig.webp` — production painting, 1,254 × 1,254 RGBA WebP, 160,722 bytes.
- `documentation/landing-companion/design-sheet.png` — retained reference sheet.
- `documentation/landing-companion/source/original-rig-master.png` — retained eye-free source master.
- `documentation/landing-companion/art-provenance.json` — generation/provenance record.
- `documentation/landing-companion/retired-files.json` — inventory of retired video/Pixi/sprite implementation files and assets.
- `documentation/landing-companion/isolated-bundle-size.json` — isolated component size measurement.
- `documentation/landing-companion/qa/results.json` and the PNGs under `documentation/landing-companion/qa/` — browser screenshots and QA results.
- `scripts/verify-landing-companion.mjs` — Chrome/CDP landing-only verification harness.
- `__tests__/landing/landing-companion.test.tsx` — renderer identity, semantic state, reaction, visibility, and asset assertions.
- `__tests__/landing/landing-companion-motion.test.ts` — journey movement tests.
- `__tests__/landing/journey-motion.test.tsx` — JourneyPath/controller integration tests.
- `__tests__/landing/journey-companion.test.tsx` — imperative secondary-motion integration tests.
- `__tests__/landing/secondary-motion.test.ts` — spring bounds, reversal, settling, frequency, and reset tests.
- `package.json` and `package-lock.json` — removed the obsolete landing-only `pixi.js` dependency; no new animation dependency was added.

The previous landing video/sprite/Pixi files remain catalogued in `retired-files.json`; the current landing does not reference those assets. The in-app avatar files were intentionally left outside this implementation.

## 2. Current asset format and layer model

The render surface is a small inline SVG created by `CompanionArt` in `artwork.tsx`. It is not a canvas, WebGL scene, Rive file, Spine file, sprite sheet, video, or sequence of whole-character frames.

There is one `<image>` definition, `CANONICAL_ART = "/landing/companion/original-rig.webp"`, registered once per instance with a unique `useId()`-derived SVG ID. Multiple SVG `<use>` elements sample that same painting through clip paths and masks. The result is a layered 2D cutout rig around one canonical painted master.

The following parts are separate transformable SVG groups, but their pixels are still sampled from the same WebP:

- hood/head silhouette: `HOOD` clip path;
- left and right ribbons: `LEFT_RIBBON` and `RIGHT_RIBBON` clip paths;
- left and right cloak/cape panels: `LEFT_CLOAK` and `RIGHT_CLOAK` clip paths;
- lower left/right leg regions: `leftLeg` and `rightLeg` clip paths;
- chest clasp: `clasp` clip path;
- floating star: `STAR` clip path.

The painted shading, cream/lilac/navy color transitions, trim, and other illustration detail remain baked into the single WebP. The file is not split into separately authored PNGs. Masks in `artwork.tsx` subtract hood, ribbons, cloak, legs, and clasp from the torso sample; small white mask underlaps reduce antialias seams at the registered joints.

The following parts are newly drawn SVG geometry rather than painted pixels:

- glowing oval eyes and their glow gradient;
- closed-eye and thinking-eye shapes;
- thin halo ellipse and highlight stroke;
- book/tablet props;
- timer ring and celebration sparkles;
- shadow ellipse.

This means eyes and halo are genuinely vector-independent. Cloak, ribbons, and star are independently transformable cutouts from one raster master, not independent artwork assets.

## 3. Character structure

The complete hierarchy is declared in `artwork.tsx`.

- **Body:** the torso uses the `torso` luminance mask over the painted master. `data-part="body"` is animated by `Companion.module.css` breathing. Lower body and legs are nested beneath it.
- **Hood/head:** `data-part="hood"` samples the `HOOD` clip. The face opening/dark face treatment is part of the painted master underneath the vector eyes. The head can receive small semantic tilt changes.
- **Eyes/face:** `data-part="eyes"` is vector SVG. Neutral/curious eyes are white ovals with a radial glow; happy/excited/sleepy use closed arcs; thinking uses angled filled eye paths. Blink, curious glance, and neutral-to-happy idle moments are CSS-driven.
- **Lower cape/body:** the left and right cloak panels are separate `<use>` groups under `data-part="cloak"`, nested inside `data-part="cape-lag"`. The compact lower body and legs are separate nested groups for the modest timer pose.
- **Ribbons:** left and right ribbons are separate clipped uses under `data-part="ribbon-left-lag"` and `data-part="ribbon-right-lag"`; each has its own ambient phase and its own travel-driven spring variable.
- **Halo:** `data-part="halo"` is vector geometry inside `data-part="halo-lag"`; it has its own slow idle animation and scroll response.
- **Star:** `data-part="star"` is a clipped sample of the painted master inside `data-part="star-lag"`; it has its own slow drift/scale and scroll response.
- **Shadow/glow:** `data-part="shadow"` is a simple SVG ellipse with a 7.7-second opacity/scale cycle. Eye glow is a radial SVG gradient. No animated blur or filter is used.

## 4. Positioning and scroll-following

`JourneyPath.tsx` is the sole owner of webpage coordinates. During `measure()`, it reads all `[data-journey-stop]` anchors, converts them to journey-local points, builds a downward cubic path with `buildJourneyPath()`, and stores its total length.

The desired path Y is computed as:

```text
window.scrollY + window.innerHeight * 0.68 - journeyOrigin
```

It is clamped to the first and last stop. `lengthAtY()` performs a bounded binary search over the SVG path to find the corresponding path length. The current point is read with `getPointAtLength()` and the traveler wrapper is moved with:

```text
translate3d(point.x, point.y, 0)
```

`JourneyMovement` in `journey-motion.ts` applies the page-travel spring: error gain 72, velocity damping 17, acceleration cap ±5400, velocity cap ±1200, and a 48 ms maximum integration step. It clamps overshoot and settles below its position/velocity thresholds.

After the point is calculated, `JourneyPath.paint()` measures the actual point-to-point CSS-pixel velocity. That velocity is passed to `JourneyCompanion.present(state, visible, velocity, dt)`. `JourneyCompanion` writes local variables such as `--cape-lag`, `--ribbon-left-lag`, and `--journey-lean` directly to its host; it never changes webpage coordinates.

The existing travel RAF continues while either page movement or secondary spring settling is active, then stops. Resize, rebase, hidden-document state, offscreen state, pause, and reduced motion reset the local secondary pose.

## 5. Animation currently implemented

### Ambient idle motion (`Companion.module.css`)

- Whole-character float: `.float`, `@keyframes float`, 7.7 seconds, gentle 9px local vertical drift, ±2px horizontal drift, and approximately −0.3° to +0.4° rotation. The SVG viewBox scales this to the rendered size.
- Breathing: `.body`, `@keyframes breathe`, 7.3 seconds, maximum `scaleY(1.007)`.
- Cloak fabric: `.cloakLeft` and `.cloakRight`, `@keyframes fabric`, 8.3 seconds, ±0.55° rotation and ±0.15° skew, with different phase delays.
- Ribbon idle sway: `.ribbonLeft` and `.ribbonRight`, `@keyframes ribbon`, 7.1 seconds, roughly ±2° with different phase and direction.
- Halo drift: `.halo`, `@keyframes halo`, 11.7 seconds, roughly ±2° and small translation.
- Star drift: `.star`, `@keyframes star`, 8.9 seconds, small translation and 1.025 scale peak.
- Shadow support: `.shadow`, `@keyframes shadow`, 7.7 seconds, subtle width and opacity change.

### Eyes and expressions

- Blink: `.eyes`, `@keyframes blink`, 19.7 seconds with irregular blink points including a close pair.
- Curious glance: `.eyeRight`, `@keyframes curious-glance`, 31 seconds, enabled only for neutral full-motion idle and briefly scales/lifts the right eye.
- Occasional neutral/happy idle moment: `.idleNeutral` and `.idleHappy`, `@keyframes neutral-moment` and `@keyframes happy-moment`, 43-second deterministic cycle. The neutral eye arcs briefly replace the oval eyes, then return to neutral.
- Explicit state expressions are selected by `CompanionArt` and `model.ts`: neutral, happy, excited, curious, thinking, and sleepy. `Companion.module.css` adds small head tilts for curious/thinking/sleepy states.

### Semantic actions and bounded reactions

- Hello arm: `.greetingArm`, `@keyframes hello`, 1.1 seconds, two iterations.
- Happy reaction: `.reaction`, `@keyframes happy`, 1.1 seconds, two iterations.
- Celebration: `.reaction`, `@keyframes celebrate`, 1.4 seconds, two iterations; `.star` also uses `positive-star`.
- Reading/tablet props are rendered as SVG geometry in `artwork.tsx`; the tablet/prop has a restrained 9-second thinking sway for `AI_THINKING`.
- Timer mode applies small lower-body, leg, and cloak transforms. It is a quiet pose adjustment, not a full seated animation.
- Sparkles use `@keyframes sparkles` for two short iterations.

`useCompanionState.ts` permits one active reaction at a time. Reaction durations/priorities are declared in `model.ts`: greeting 2.4s, quest-complete 2.2s, timer-complete 2.8s, level-up 3.2s. Higher priority wins; a base-state change cancels the reaction; expiry returns to the current base.

### Scroll motion and transitions

`secondary-motion.ts` implements independent damped springs. It accepts actual CSS px/s velocity, soft-saturates input with `tanh`, caps each local response, and integrates at no more than 120 Hz internally. Caps before presentation are:

- body tilt 1.8°;
- cape tilt 4.7° and lift 2px;
- left/right ribbon tilt 5.7°/5.1°;
- halo tilt 1.9°, X/Y 1.6px/1.4px;
- star tilt 2.5°, X/Y 2.1px/1.9px.

`JourneyCompanion.tsx` scales cape and ribbon angles down to approximately 42%/45% for the painted cutouts, rounds CSS variable writes to two decimals, and returns whether settling requires another RAF. The nested `capeLag`, `ribbonLagLeft`, `ribbonLagRight`, `haloLag`, and `starLag` groups compose those variables with their ambient CSS animation.

Head, lower-body, and leg semantic changes use 0.65-second CSS transforms. `JourneyCompanion.module.css` applies the overall body bank from `--journey-lean`.

### Hover and user interaction

The companion itself has `pointer-events: none` in `Companion.module.css`; it has no hover behavior. The landing footer exposes a pause/resume button in `JourneyLanding.tsx`. The `/companion-prototype` route provides a state selector, reaction buttons, and a pause control for review. Those controls are review UI, not app gameplay integration.

## 6. What still makes it feel like a still image sliding

The page-position layer remains a single traveler wrapper translated along the SVG path. There is no foot-contact cycle, walk pose, stride, weight shift, or true locomotion animation. The core hood/body silhouette and most painterly shading are baked into one raster master. The cloak/ribbon groups only translate/rotate clipped regions; they do not deform as cloth or reveal a hidden back side.

Consequently, the character can feel like a painted image being carried through the page during long travel. The local float, eye, fabric, halo, and spring responses reduce that effect, but they do not turn the artwork into a full skeletal walk rig. Large rotations would expose clip seams, so motion is intentionally restrained.

## 7. Can independent parts move now?

Yes, within the current cutout limits:

- **Cape:** yes; left/right panels have separate CSS groups and a shared travel-driven `capeLag` spring.
- **Ribbons:** yes; left and right tips have separate groups, phases, pivots, and spring variables.
- **Halo:** yes; vector geometry has an independent idle group and `haloLag` travel group.
- **Eyes:** yes; eyes are fully independent vector geometry and can blink or change expression without replacing the painting.
- **Star:** yes; its clipped painting region has an independent drift/lag group.

The artwork does not yet have separately painted hidden surfaces or mesh deformation. Strong wind, side views, large turns, or cloth folding require additional overlap/redraw or a true 2D skeletal/mesh asset. Do not assume that the current clips support arbitrary rotation.

## 8. Responsive and mobile behavior

`BotanicalTrail.module.css` sizes the journey companion at 144×180 CSS px on desktop, 120×150 below 1100px, 96×120 below 900px, and 56×70 below 700px. The path uses wider growth-mark spacing on mobile and hides timer/sparkle props at mobile widths. The journey remains in the existing responsive page geometry; the landing content was not repositioned for the character.

The review route switches its gallery from six columns to three and then two columns. The traveler surface is still the same SVG and the same WebP at every size. Note that `JourneyCompanion` passes `size="LARGE"` to `Companion`; the mobile CSS shrinks the journey host, so the `data-compact` CSS branch is not activated by the semantic size prop. Mobile prop hiding is handled by media CSS instead.

## 9. Reduced motion and pausing

`Companion.module.css` disables all animations/transitions under `prefers-reduced-motion: reduce`, neutralizes local lag transforms, and leaves the canonical static character visible where appropriate. `JourneyPath.tsx` detects the media query and suppresses the moving traveler; `Journey.module.css` shows `.staticHeroCompanion` as the static fallback. The landing pause control uses the same suspension path.

`Companion.tsx` uses `IntersectionObserver` and `visibilitychange` to set `data-animation="paused"`; CSS pauses descendants when offscreen or the document is hidden. `JourneyPath.tsx` additionally cancels its RAF and resets secondary motion for hidden/offscreen/paused/reduced states. The component is `aria-hidden` and decorative.

## 10. Performance and known problems

- No new animation runtime or third-party dependency was added. The companion does not import Framer Motion, Pixi, Three.js, Rive, or Spine.
- The isolated minified Vite measurement in `documentation/landing-companion/isolated-bundle-size.json` is 23,072 raw / 6,456 gzip JavaScript and 7,924 raw / 1,943 gzip CSS, with React external. These are incremental component figures, not full Next route transfer sizes.
- The one production painting is 160,722 bytes. There is no video or frame-sequence download in the current landing renderer.
- Ambient motion is CSS-driven. Scroll secondary motion reuses the existing travel RAF only while moving or settling and writes rounded CSS variables directly; it does not commit React state per frame.
- The SVG is intentionally small and uses no animated blur/filter. `contain: layout style` is applied to the host.
- The asset is referenced through an SVG `<image>` and is shared by all cutout layers. There is no separate character runtime to lazy-load; reduced motion still needs the canonical artwork.
- The full repository has unrelated dirty changes. Do not use a broad reset or cleanup to “isolate” this work.
- The cutout has known seam risk at exaggerated transforms, especially around the hood hem, clasp, cloak joints, and raster matte edges. The caps and underlaps are deliberate.
- The current character is front-view only; it has no true side/back turnaround, volumetric turn, walk cycle, or cloth mesh.
- The shadow and float cycles are aligned at 7.7 seconds, but the shadow is only a subtle grounding cue, not physically simulated.

Focused landing tests currently pass 78 tests across 10 files; the production build and TypeScript check were run for the implementation. Browser QA uses the tracked CDP harness and covers desktop/mobile overflow, persistent SVG identity, state/reaction behavior, offscreen pause, reduced motion, no retired asset requests, and runtime exceptions. Headless RAF cadence is only a rough browser sample, not a physical low-end mobile benchmark.

## 11. Fragile contracts the next agent must preserve

1. Keep this implementation landing-only. Do not rewrite `app/components/character/CharacterRenderer.tsx` or any avatar studio/shop/in-app renderer.
2. Keep `JourneyPath.tsx` as the owner of page/world coordinates. `JourneyCompanion.present()` must remain a local-motion bridge.
3. Preserve unique per-instance SVG IDs from `useId()`. Cloning an SVG instance with duplicate IDs can make masks/gradients resolve to another instance and produce blank or incorrect layers.
4. Preserve the single canonical WebP identity. Do not add separately generated idle/walk/reaction character images or videos.
5. Preserve the `data-part` layer names and CSS-variable contract (`--journey-lean`, `--cape-lag`, `--cape-lift`, ribbon/halo/star variables); tests and review tooling use them.
6. Preserve reduced-motion, hidden-document, offscreen, and pause reset paths.
7. Keep transform amplitudes restrained unless the artwork gains intentional overlap/hidden surfaces first. Large rotations expose the raster cutout seams.
8. Do not reintroduce the retired Pixi/video/sprite runtime or a full-page canvas for this companion.

## 12. Recommended next steps without changing the visual design

1. Review the current landing and `/companion-prototype` visually at actual desktop and mobile sizes, including a fast scroll reversal. Approve the current subtle motion range before adding more states.
2. If stronger wind or turning is required, redraw the same character master with extra hidden overlap/padding around hood hem, cloak, ribbons, clasp, and lower body. Keep the same silhouette, palette, and proportions; only improve layerable artwork boundaries.
3. Replace the current clipped-raster cloak/ribbon regions with a deliberately authored texture atlas or 2D skeletal/mesh asset only if the design needs deformation beyond restrained transforms. Keep `JourneyPath` and `SecondaryMotion` as the coordinate/motion-controller boundary.
4. Add any new reactions as semantic states in `model.ts` and bounded CSS/vector layers in `artwork.tsx`/`Companion.module.css`; do not create whole-character state images.
5. Validate sustained frame time, memory, and battery on a physical low-end mobile device. The current headless browser sample cannot establish those measurements.
6. Re-run the landing-focused tests and CDP harness after any art or motion change. Inspect the actual SVG instance, not a cloned SVG, when diagnosing masks or seams.

The current architecture can support restrained cape inertia, ribbon lag, blinking, eye-expression changes, breathing, body tilt, and scroll-direction reaction immediately. It cannot provide convincing large cloth deformation or a true walk/turn cycle without adding intentionally layered artwork or a stronger 2D rig asset.
