# Companion state polish — implementation report

Final focused pass, 28 September 2026. This covers the expression/action polish and the subsequent attachment/legibility refinements. The canonical character was preserved.

## Changed files

| File | Change |
| --- | --- |
| `app/components/landing/companion/artwork.tsx` | Refined eye geometry; reusable three-pass arms; book/tablet grips; timer geometry; nested expression/action pose groups. |
| `app/components/landing/companion/Companion.module.css` | Static poses, eased transitions, restrained waves/celebration, synchronized detail entrances, timer progress animation and mobile visibility. |
| `__tests__/landing/companion-state-polish.test.tsx` | New tests for persistent artwork/hood, layer order, expected limbs, eye geometry, timer and unique SVG references. |
| `scripts/verify-companion-state-polish.mjs` | New focused Chrome/CDP review, captures and checks using the existing isolated-browser harness. |
| [COMPANION_STATE_POLISH_IMPLEMENTATION_REPORT.md](COMPANION_STATE_POLISH_IMPLEMENTATION_REPORT.md) | This report. |

Generated evidence is in `documentation/landing-companion/state-polish/`: `before-state-sheet.png`, `iteration-state-sheet.png`, `iteration-label-free.png`, `final-pass-iteration.png`, `final-state-sheet.png`, `final-label-free.png`, `final-desktop-actual-size.png`, `final-mobile-actual-size.png`, `final-mobile-reduced.png`, `final-hello-wave.png`, and `visual-checks.json`. The `final-*` captures supersede the iterations. The existing regression harness also refreshes `documentation/landing-companion/qa/` screenshots and `results.json`.

## Expressions and actions

All geometry below lives in `CompanionArt`/`CompanionArm` in `artwork.tsx`; all pose and timing rules live in `Companion.module.css`. Coordinates are SVG units, not screen pixels.

| State | Final treatment |
| --- | --- |
| Neutral | Preserved glowing oval eyes, canonical painting and existing ambient expression cycle. |
| Happy | Gentle shallow closed-eye arcs, body raised 12 units, softly opened ribbons/cape and slightly raised star. |
| Excited | Wider/deeper arcs with stronger stroke, body raised 36 units, extra 12-unit reaction lift, wider ribbons/cape, higher halo/star. Distinct from the quieter Happy pose without scaling the entire character. |
| Curious | Hood tilts −3°, body counter-tilts +0.8°, one eye is larger and raised 22 units; asymmetric ribbons and a small halo counter-shift support the expression. |
| Thinking | Replaced angular eyes with softly glowing ovals. One remains near normal size (`rx=16, ry=33`); the other is softly narrowed (`rx=18, ry=23`). Slight upward/side gaze, gentle tilt and slower fabric/halo motion. The final vertical oval replaces the earlier dot/wink-like variants. |
| Sleepy | Existing closed sleepy arcs retained; lower body/head posture, gently hanging cape, restrained ribbons and slower breathing/float. No symbols added. |
| Floating | Physical default remains shared with Neutral: 10-unit lift and slightly smaller shadow. Existing ambient/travel motion supplies drift. These are intentionally not separate character designs. |
| Hello | Larger outward-reaching cream sleeve, peach/gold cuff and outlined navy mitten. Sleeve root is occluded by the robe. Three restrained oscillations over 2.2 seconds, with a small greeting lift. |
| Reading | Book moved down to preserve the clasp; cream sleeves lead to two mittens overlapping the outer/lower book edges. Head and eyes point toward the pages. |
| Using tablet | Smaller/lower panel with retained screen gradient, two side/lower grips and visible sleeves. Head and gaze direct toward the screen. Removed prop-only AI Thinking sway so hands and tablet cannot drift apart. |
| Timer | Clear progress ring at `(754,574)`, radius 51, moved outward for space. A small sleeve/mitten gesture and attentive gaze connect Sylf to it. Existing quiet focus mode, calmer posture and an eight-second progress sweep. The timer remains visible on mobile. |
| Celebrating | One clearly raised arm using the same sleeve/cuff/mitten primitive. Excited eyes, upward pop, ribbon/cape opening and existing star/sparkle reactions carry the celebration. |

## Artwork and attachment architecture

`CompanionArt` still uses one canonical raster painting, `/landing/companion/original-rig.webp`, through registered SVG clips/masks and `<use>` references. Hood, robe, cape panels, ribbons, legs and star retain that painting. Eyes, halo, sleeves/hands and props are vector geometry. No new character images, videos, render surface or animation dependencies were added.

`CompanionArm` uses **one geometry definition** with action-specific shoulder position, rotation, uniform scale and wrist angle in `ARMS`:

1. Rear cream sleeve paints before the body, hiding its root behind the robe.
2. Distal sleeve/cuff paints after the robe but before the held prop.
3. Navy mitten paints after the prop, overlapping its edge.

All three passes share exactly the same shoulder transform and wave animation. All arm passes are keyed by action and side; the held prop is keyed by action. Their 240 ms opacity entrances start together. The canonical SVG, painting and hood remain mounted across state changes. No fingers or realistic anatomy were introduced.

## Motion and transitions

`.statePose` and `.actionPose` sit inside the existing ambient/travel wrappers. Dedicated ribbon, cape, halo and star pose groups compose with their existing secondary-motion layers. Head, gaze and pose changes use 650 ms `ease` transitions. Eye geometry changes directly; it does not interpolate between independently generated faces.

New finite motion: `sleeve-wave` (2.2 s, three restrained waves), `greeting-lift` (2.2 s), `excited-lift` and raised celebration arm (1.4 s, two iterations). `detail-appear` is an opacity-only 240 ms entrance. `timer-progress` gently changes the visible arc from 73% to 84% and back over eight seconds. The timer arc illustrates the state; it is **not a countdown linked to product time**.

Existing reaction priorities, expiry, semantic state mappings, blink/idle loops and travel springs remain owned by the original model/controllers. CSS handles this pass; no new Motion hooks or JavaScript animation loops were added.

## Responsive behavior, accessibility and performance

- Actual landing host sizes remain 144×180 desktop, 120×150, 96×120 and 56×70 mobile. Review captures use the desktop and smallest mobile sizes without changing landing layout.
- The timer visibility override is in `Companion.module.css`; frozen journey CSS was not edited.
- Existing `prefers-reduced-motion` and `motion="none"` rules disable new animations/transitions as well as existing motion. Static expressions, grips and timer arc remain. Existing visibility/document-hidden pausing in `Companion.tsx` is preserved.
- Canonical asset remains **160,722 bytes**, with the same SHA-256 (`107a32de92688783ba9ecbe336c93d31332a14e67eee879f317bc20db9cc0745`). No new image requests or runtime packages. Added cost is a small number of SVG groups/paths and CSS transforms/opacity rules; no animated blur/filter or full-page canvas.
- This pass did not produce a separate before/after production bundle-size measurement. It makes no zero-byte bundle-regression claim.

## Verification

- Landing unit/integration suite: **98 tests passed across 11 files**. After the final eye-only adjustment, the two directly affected companion suites were repeated: **43 tests passed**.
- TypeScript: `tsc --noEmit` passed.
- Focused Chrome review: **21 checks passed**. Includes persistent SVG/hood and stable host position across ten live state changes, eased head transforms, synchronized moving sleeve/cuff/hand, both prop grips, mobile overflow/timer visibility and live reduced-motion behavior.
- Production build: `npm run build` passed. The first restricted-sandbox compile stalled; its process was stopped and the normal build succeeded outside that restriction.
- Existing Chrome landing/journey regression: **41 checks passed**, including desktop/mobile journey pages and reduced motion. Together with the focused review, **62 browser checks passed**.
- The label-free sheet and actual-size captures were visually inspected. A separate visual review confirmed coherent sleeve/hand/prop attachments. Chrome logged no companion resource or runtime errors. The signed-out application shell's existing `401 /api/user/stats` responses are retained separately in `visual-checks.json`; no auth or stats code was changed.

Reproduce with the development server on port 3000:

```sh
node_modules/.bin/vitest run __tests__/landing
node_modules/.bin/tsc --noEmit
npm run build
SYLF_QA_BASE=http://localhost:3000 node scripts/verify-companion-state-polish.mjs
SYLF_QA_BASE=http://localhost:3000 node scripts/verify-landing-companion.mjs
```

## Preserved boundaries and remaining limitations

SHA-256 comparison confirmed no changes during this pass to `JourneyPath.tsx`, `Journey.module.css`, `BotanicalTrail.module.css`, `JourneyCompanion.tsx`, `secondary-motion.ts`, `model.ts`, `useCompanionState.ts`, the canonical WebP or package manifests. No in-app avatar renderer, Planner, landing layout or onboarding source was edited. The shared companion is already used by onboarding, so its visual state improvements appear there as well; this is separate from the in-app chibi/avatar system.

At 56×70, eye differences occupy only a few pixels: Happy/Excited and Neutral/Thinking cannot be claimed universally identifiable without labels. Props and overall silhouette remain clearer than facial nuances. Thinking is deliberately restrained and can still read as attentive rather than unmistakably contemplative. The painted cutout rig also limits safe hood/cape rotation before registration edges become visible; the head tilt remains modest. Arm/prop exit removes the detail rather than performing a fully articulated return-to-rest animation. No optional page turning, tablet tapping, extra states or animation library was built.

This concludes the focused polish pass. Review at `/companion-prototype`; the existing landing journey consumes the same renderer.
