# Sylf landing companion: painted character and layered motion

Status: implementation and focused tests complete; final browser and production-build checks are being recorded below. This report describes the current painted rig and September 28 motion refinement. Older measurements are explicitly labeled.

## Scope and design decision

This change is limited to the public landing page and its `/companion-prototype` review route. The in-app `CharacterRenderer`, configurable chibi avatars, character studio, shop, focus experience, and Planner integrations were not changed by this task. The repository already contained unrelated and concurrent changes; those were preserved, not reverted or folded into this companion work.

The latest direction is to preserve the current painted character and make it feel alive through restrained layered animation. The previous flat-vector reinterpretation was replaced with a newly painted canonical front-view character derived from the supplied design sheet. The motion refinement reuses that painting; it does not generate new character states, replace the design, or introduce video playback.

The approved visual vocabulary remains: a broad cream hood, dark recessed face and compact body, glowing oval eyes, ivory cloak petals, blue-lilac folds and ribbons, peach-gold edging and clasp, a thin halo, and a floating four-point star. Only the Original palette is used. There is no palette selector, identity setting, character customization, or persistent preference.

## Rendering and asset pipeline

The renderer is a small SVG scene containing reusable, registered layers from **one eye-free painted master**. This is a real-time 2D cutout rig, not a full skeletal authoring system and not a sequence of whole-character pictures.

1. The supplied reference sheet is retained at `documentation/landing-companion/design-sheet.png`.
2. The character was newly redrawn and refined against that sheet. Prompt history and provenance are in `documentation/landing-companion/art-provenance.json`.
3. The final eye-free source is retained at `documentation/landing-companion/source/original-rig-master.png`.
4. The production transparent WebP is `public/landing/companion/original-rig.webp`, **160,722 bytes** (156.96 KiB).
5. `artwork.tsx` declares one SVG `<image>` source and reuses it through `<use>`, clip paths, and masks. Hood/face, torso, lower body, cloak panels, ribbons, clasp, and star share the same registered painting.
6. Eyes, their restrained gradient glow, the thin halo, and simple action props are SVG geometry. Expressions change only eye geometry; the character painting stays the same.

All instances reference the same cacheable WebP URL. There are no independently generated idle/walk/reaction characters, videos, frame atlases, full-page canvases, WebGL contexts, or heavy character runtimes. CSS supplies ambient movement; the existing journey controller supplies page travel.

## Movement architecture

```text
scroll position + existing section anchors
  → responsive JourneyPath geometry
  → JourneyMovement destination / acceleration / deceleration
  → page wrapper translate3d(x, y)
  → actual path-point velocity (CSS px/s)
  → SecondaryMotion damped springs
  → local body / fabric / ribbon / halo / star transforms
```

`JourneyPath.tsx` remains the authority for page coordinates. Existing section anchors, responsive geometry, botanical path, landing structure, and content are reused. Animation layers never own webpage coordinates.

`JourneyMovement` smoothly follows the scroll-derived destination, caps speed and acceleration, clamps long frame intervals, and settles without overshooting its target. This floating character does not have a foot-contact or walking cycle.

The journey samples consecutive actual SVG path points, including horizontal movement along curves. Their displacement divided by elapsed time drives `JourneyCompanion.present(...)`. This prevents the secondary animation from depending only on raw scroll events or assuming all movement is vertical.

`SecondaryMotion` uses separate damped springs for body bank, cape rotation/lift, two ribbon tips, halo drift/tilt, and star drift/tilt. Ribbon targets partly follow the cape response, so they lag rather than changing direction as one rigid plate. Fast input saturates softly. The applied body bank stays below 1.8 degrees; cape and ribbon spring rotations are further scaled down at presentation for the painted rig. Short-lived lag remains during a reversal and then settles.

No new perpetual JavaScript animation loop is introduced. The existing travel RAF continues only while page movement or secondary settling remains active. The controller reaches exact zero and returns `active=false` at rest. Hidden/offscreen presentations, resize/rebase, pause, and reduced-motion handling reset the secondary offsets. CSS continues the ambient idle when the character is visible and motion is allowed.

## Ambient motion and expressions

The current CSS separates movement into slow, differently timed layers:

| Layer | Behavior |
| --- | --- |
| Whole character | Gentle vertical float, small lateral drift, and a fraction of a degree of suspended rotation |
| Compact body | Subtle breathing, reaching a 1.007 vertical scale |
| Lower cloak | Independent low-angle panel sway plus travel-driven lag |
| Ribbon tips | Different phase and direction, plus delayed travel response |
| Halo and star | Separate slow drift and small rotation; each also reacts to travel |
| Eyes | Irregularly spaced blinks, occasional slight curious eye change, and a brief happy moment before neutral returns |
| Shadow | Small opacity and width changes that support the floating impression |

The ambient neutral/curious/happy moments are CSS animations, not React timers or random frame updates. They run only for neutral, full-motion idle. Explicit expressions and semantic reactions take priority. Focus uses a quieter motion profile.

The frame values in the artwork CSS are in the SVG's local coordinate system and are scaled down with the character. They are not literal full-size CSS-pixel excursions on the landing page. No animated blur or filter is used.

## State model and bounded reactions

The shared landing component accepts semantic presentation state. These names are a presentation vocabulary and review controls; they do **not** connect this character to the in-app quest, timer, AI, or Planner systems.

| Presentation | Expression | Action |
| --- | --- | --- |
| `IDLE` | Neutral | Floating |
| `GREETING` | Neutral | Hello |
| `FOCUSING` | Thinking | Timer mode |
| `READING` | Thinking | Reading |
| `PLANNING` | Curious | Using tablet |
| `AI_THINKING` | Thinking | Using tablet |
| `DISCOVERING` | Curious | Floating |
| `QUEST_COMPLETE` | Happy | Floating |
| `TIMER_COMPLETE` | Excited | Celebrating |
| `LEVEL_UP` | Excited | Celebrating |
| `REST` | Sleepy | Floating |
| `ERROR` | Curious | Floating |

The landing uses neutral floating while moving and the nearby section's semantic state when settled. The focus section uses timer mode; the study-AI section uses the tablet presentation. Existing `read`, `sit`, `wave`, and `celebrate` waypoint poses map to reading, focus, greeting, and happy reactions.

`useCompanionState.ts` permits one active reaction and one expiry timer, with no backlog. Greeting lasts 2.4 seconds, happy 2.2 seconds, timer completion 2.8 seconds, and level-up celebration 3.2 seconds. Higher-priority reactions replace lower ones; a lower-priority event cannot interrupt a higher one. Expiry returns to the current base state, and changing that base cancels the reaction. Repeated event IDs do not restart a reaction.

The review route displays all six expressions and six actions through the same renderer and includes bounded reaction and pause controls. It is a design review surface, not a product customization interface.

## Accessibility, responsive behavior, and performance

- `prefers-reduced-motion` disables continuous CSS animation and transitions. Local lag transforms are neutralized, the moving journey presentation is suppressed, and the landing's static canonical character is retained. Expressions remain readable.
- The component is decorative and `aria-hidden`; it does not create live announcements or steal focus. Review controls use native buttons/selects and labels.
- An `IntersectionObserver` and document visibility handling pause CSS animation when offscreen or hidden. Journey visibility handling also resets the secondary controller.
- The character remains a small responsive scene, including the existing narrow mobile journey lane. No full-page render surface is created.
- React state updates occur at semantic state boundaries, not on animation frames. The movement handle writes bounded transform variables directly. The secondary controller reuses its pose object.
- There are no new dependencies. The obsolete Pixi dependency was removed with the old landing prototype.
- The WebP is a shared raster source inside an SVG rig. It is fetched for the visible character, not lazily loaded behind a separate runtime. Reduced motion still needs the same small canonical artwork, but there is no animation engine payload to load or bypass.

### Size measurements

| Measurement | Result and qualification |
| --- | --- |
| Canonical production asset | 160,722 bytes / 156.96 KiB |
| New third-party runtime | None |
| Earlier isolated `JourneyCompanion` build | 17,865 bytes JS; 5,103 bytes gzip |
| Earlier isolated CSS build | 5,697 bytes CSS; 1,482 bytes gzip |
| Final motion-refinement isolated build | **Pending final measurement** |
| Final production initial-route transfer / deferred impact | **Pending final production/browser measurement** |

The isolated figures are from `documentation/landing-companion/isolated-bundle-size.json`, with React external and minification enabled. They predate the latest secondary-motion additions and are **not** the full Next.js route transfer size. A clean production baseline cannot be inferred from them or from the concurrently changing repository. There is no deferred video or heavy character-runtime download in this implementation.

## Retired landing implementation

The earlier landing video/sprite and Pixi prototype code was retired, along with its obsolete tests and public assets. The recorded inventory in `documentation/landing-companion/retired-files.json` contains **44 files**, including **29,642,698 bytes of public assets** (about 28.27 MiB). This is repository asset removal, not a claim that every removed file was previously downloaded on first page load.

The removed set includes the old walking/video renderer and motion policy, the old Pixi prototype directory, original/transcoded landing clips and their companion files, and obsolete landing sprite sheets. The original user files outside the repository and the in-app avatar assets are outside this cleanup. Historical phase reports remain historical evidence; they do not describe the current renderer.

## Source and verification inventory

| Files | Responsibility |
| --- | --- |
| `app/components/landing/companion/Companion.tsx` | Shared landing renderer, sizing, visibility pause, semantic props |
| `app/components/landing/companion/artwork.tsx` | Canonical painting registration, masks/clips, eyes, halo, props |
| `app/components/landing/companion/Companion.module.css` | Ambient float/breath/fabric/ribbon motion, expressions, actions, reduced motion |
| `app/components/landing/companion/model.ts` | Original palette, expressions, actions, state mappings, reaction durations |
| `app/components/landing/companion/useCompanionState.ts` | Bounded reaction priority and expiry |
| `app/components/landing/companion/JourneyCompanion.tsx` and `.module.css` | Imperative motion bridge and local transform variables |
| `app/components/landing/companion/journey-motion.ts` | Page-travel spring and existing waypoint mapping |
| `app/components/landing/companion/secondary-motion.ts` | Velocity-driven secondary springs; no rendering dependency |
| `app/components/landing/journey/JourneyPath.tsx` | Existing journey integration, actual path velocity, settle scheduling |
| `app/components/landing/journey/JourneyLanding.tsx`, `Journey.module.css`, `BotanicalTrail.module.css` | Canonical static fallback, responsive character sizing, old-renderer cleanup |
| `app/components/landing/companion/CompanionReview.tsx`, `.module.css`, `app/companion-prototype/page.tsx` | Public expression/action review surface |
| `public/landing/companion/original-rig.webp` | One production painting |
| `__tests__/landing/landing-companion.test.tsx`, `landing-companion-motion.test.ts`, `secondary-motion.test.ts`, `journey-motion.test.tsx` | Identity/state/visibility tests, motion and journey coverage |
| `scripts/verify-landing-companion.mjs` | Landing-only Chrome/CDP verification harness |
| `documentation/landing-companion/` | Reference, provenance, retained source, retirement inventory, size snapshot, browser screenshots/results |
| `package.json`, `package-lock.json` | Earlier obsolete Pixi dependency removal; no new dependency |

This is an implementation inventory, not a claim that every line in these paths or every dirty repository file was authored during this refinement.

## Verification record

### Current refinement

- Focused secondary-motion tests: **7 passed**. They cover bounded offsets under extreme velocity, inertia through reversal, delayed ribbon response, exact rest after stopping, 30/60/120 Hz consistency, stalled/invalid frame input, and reset behavior.
- Latest landing suite recorded in `/private/tmp/sylf-final-landing-tests.log`: **76 passed across 9 files**, September 28. Final checks after any subsequent visual adjustments: **pending final confirmation**.
- Final type check: **pending final confirmation**. The current `/private/tmp/sylf-final-types.log` is empty, but an empty log alone is not an exit-status assertion.
- Final browser run and screenshot review: **pending final confirmation**.
- Final production build: **pending final confirmation**.

### Older evidence, not a substitute for final motion QA

`documentation/landing-companion/qa/results.json` is dated September 27, before this latest refinement. It records desktop/mobile viewport checks, stable SVG identity through state changes, reaction priority/expiry, hidden/offscreen pause, reduced motion, no horizontal overflow, and a headless Chrome frame-cadence sample (median 16.7 ms, p95 16.8 ms). That cadence is not a real-device mobile GPU/paint benchmark. Some text in the old report refers to the superseded vector-only renderer; specifically, its “No image/video/canvas character playback” label must not be read as saying the current painted rig has no SVG image source.

An earlier painted-renderer landing run passed **69 tests across 8 files**. Earlier mobile build and mobile bundle verification passed. Earlier secrets and model audits were recorded separately. These predate the final motion refinement and should not be presented as newly repeated checks.

The earlier full suite log, `/private/tmp/sylf-companion-full-tests.log`, recorded **2,295 passed, 5 failed, and 191 skipped**. Four failures were external database DNS resolution errors; the fifth was a Planner test timeout. Those unrelated tests were not modified to force a green result. This was not an all-green full-suite run.

The earlier production-build attempt in `/private/tmp/sylf-companion-build.log` failed because Turbopack could not create a process/bind a port in the sandbox. It is not evidence of a successful production build, nor was its Planner CSS location treated as authorization to edit Planner.

## Intentional limitations and review decision

- The artwork is a newly drawn close reference study, **not a pixel-identical reproduction**. Hood folds, opening proportions, painterly shading, and some trim details differ from the source sheet. Visual approval remains the user's decision.
- This is a front-view 2D cutout rig. It does not provide true side/back turnarounds, volumetric turns, mesh cloth deformation, or a full skeletal walk cycle.
- The current painted silhouette and palette are preserved by motion; small layer transforms are deliberately restrained. Because layers are cut from one painting rather than separately painted with extensive hidden overlap, very large rotations would expose seams and are intentionally unsupported.
- Book/tablet/hand details are simplified vector props. Timer mode is a modest lower-body adjustment, not a faithful reconstruction of the sheet's seated pose.
- Idle expression moments are deterministic CSS cycles. They are occasional and quiet, but do not infer page meaning; section semantics supply the actual page reactions.
- Desktop/headless viewport checks cannot establish battery cost or sustained frame rate on low-end physical phones. Final measurements must retain that limitation.

The renderer replaces the landing's old identity-changing clip playback with one persistent painted character and real-time local motion. It is suitable for visual review as the landing implementation once final checks below are filled in. It does not replace, consolidate, or redesign the app's chibi avatar system, and no broader companion animation library is being built in this phase.

## Final check completion

- Browser assertions and screenshots: **pending**.
- Motion-refinement JS/CSS size: **pending**.
- Type check and latest focused suite after final adjustments: **pending**.
- Production build and initial-load evidence: **pending**.
- Final visual review observations: **pending**.
