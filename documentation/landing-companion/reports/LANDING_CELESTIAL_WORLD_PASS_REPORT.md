# Sylf landing — celestial botanical world pass

Implemented on 2026-10-01. Scope: landing decoration and the existing companion’s hero starting position. The other agent’s app changes were preserved, including the current dashboard hero screenshot.

Follow-up on 2026-10-01: [overlap and scroll performance fix](LANDING_COMPANION_PERFORMANCE_FIX_REPORT.md) changes the landing rig's stationary underlayers, replaces per-frame SVG arc-length queries with direct cubic evaluation, and caches decoration geometry. This document records the original world pass; its browser measurements predate that follow-up.

## Reference analysis

Reference: `/Users/aliumair/Downloads/sylf landing decorations.png`.

The defining language is hairline indigo/violet curves, pointed asymmetrical leaves with broad crystalline facets, periwinkle highlights, sparse four-point stars, slender vertical strings with diamond nodes, indigo glass lanterns, and a cropped dark book stack. Gold belongs to lantern fittings and the existing character. The middle of the composition stays calm.

The implementation uses that vocabulary throughout the page, with the hero richest, alternating sparse middle sections, and a richer closing frame. Density was judged visually against the approximately 75–85% target; it is not a pixel-by-pixel reconstruction or a measured density percentage.

## Architecture and motifs

[CelestialDecor.tsx](/Users/aliumair/Desktop/sylf/app/components/landing/journey/CelestialDecor.tsx) exports `CelestialDecor({ variant })` and the single `CelestialWorld({ root, paused })` controller. `compositions` contains nine deliberate arrangements with different curves, leaf placements, sizes, angles, opacity, strings, lanterns and star counts. `starSites`/`dotSites` are hand-spaced coordinates offset per section. There is no random scatter or tiled wallpaper.

Each section owns an absolutely positioned, viewport-width decoration layer. Left/right lanes occupy `clamp(100px, 13vw, 245px)` on desktop. The right lane mirrors its own composition. Layers sit behind the existing content, span adjoining section whitespace, and fade their vines near both ends. All reading surfaces retain their layout and stacking.

[CelestialMotifs.tsx](/Users/aliumair/Desktop/sylf/app/components/landing/journey/CelestialMotifs.tsx) contains four reusable inline SVG primitives:

- `CelestialLeaf`: asymmetrical pointed outline, indigo-to-periwinkle gradient, three explicit folded planes and a fine illuminated ridge. Sizes, rotation and brightness vary.
- `CelestialStar`: curved four-point silhouette rather than a generic five-point icon.
- `CelestialLantern`: narrow glass body, muted gold chain/cap, curved white highlight, luminous four-point core and radial-gradient bloom. No filter or blur.
- `CelestialBooks`: two skewed navy/violet volumes, lavender page blocks with fine parallel strokes, small outlined celestial glyphs.

`useId` makes SVG gradient references unique. Artwork is SVG paths/polygons/gradients and lightweight DOM. No new raster assets, video, canvas, WebGL, animation dependencies or asset requests were added.

[CelestialDecor.module.css](/Users/aliumair/Desktop/sylf/app/components/landing/journey/CelestialDecor.module.css) owns the styling. Vines have a 0.65px non-scaling stroke and 0.44 opacity; secondary curves use 0.23 relative opacity. Strings are one pixel with tapered opacity, diamond nodes and tiny hanging stars. Dots are 1.6px, low opacity. The hero’s six very faint interior points are the only new decoration outside the edge lanes.

## Section compositions

[JourneyLanding.tsx](/Users/aliumair/Desktop/sylf/app/components/landing/journey/JourneyLanding.tsx) integrates the following without changing section content:

| Location / variant | Composition |
| --- | --- |
| Hero / `hero` | Bilateral curling vines, 12 varied leaves, six strings, two distant right lanterns, cropped left books, sparse stars/dots. The companion begins in the quiet right pocket. |
| Journey introduction / `intro` | Three dim leaves, long sparse curves, two strings, small stars. Leaves room for the existing introduction waypoint. |
| Focus / `focus` | Dominant right branch with four leaves; one dim left leaf. Clear of the left-side companion corridor. |
| Progression / `progression` | Dominant left branch, four leaves; faint right counterpart. A different curve and vertical-string arrangement. |
| Your companion / `companion` | Brighter right faceted leaves, stronger celestial stars, one small far-right lantern. |
| Study AI / `planning` | Restrained left branch, three leaves, quieter opposing leaf and strings. |
| Better together / `together` | Related but different branches on both sides, six leaves approaching from the edges. |
| Final signup / `finale` | Richer bilateral frame, eight leaves, four strings, one far-right lantern. Center waypoint and form remain clear. |
| Footer / `footer` | Three dim leaves, tapering curves, two strings, sparse stars to close the world. |

The old repeated dot pattern in `.topGlow::before` was removed from [Journey.module.css](/Users/aliumair/Desktop/sylf/app/components/landing/journey/Journey.module.css). Its existing radial background glow remains.

## Depth, motion and visibility

`CelestialWorld` uses one `IntersectionObserver` (`rootMargin: 120px 0px`) for all nine sections. `data-active` enables motion only for nearby sections while the page is visible and motion is enabled.

One passive scroll listener schedules at most one input-driven animation frame. It writes `--decor-drift` only; it does not update React scroll state. Drift is `0.012 × section distance from viewport center`, clamped to ±12px. Far elements use 12% of that displacement, middle elements 40%, near elements 100%. Parallax is disabled at widths ≤900px.

CSS motion is deliberately small:

- `leafDrift`: 19s ease-in-out, −2.5px vertical drift and −0.6° to +0.8° rotation, only on selected leaves.
- `lanternDrift`: 23s ease-in-out, −1.1° to +1.1°, pivoted at the hanger.
- Negative delays prevent synchronized starts.
- No glowing particles, animated filters, star-flash loop or collision simulation.

Offscreen sections and hidden documents pause decorative CSS animations. The existing pause control also pauses the decorative world. Cleanup removes observers, listeners and pending frames. Browsers without `IntersectionObserver` retain static decoration.

## Hero start and JourneyPath

[HeroJourneyAnchor.tsx](/Users/aliumair/Desktop/sylf/app/components/landing/journey/HeroJourneyAnchor.tsx) adds one zero-height opening waypoint immediately before the product window. Its span uses `data-journey-start`, `data-journey-stop`, the existing `wave` pose and greeting message. [HeroJourneyAnchor.module.css](/Users/aliumair/Desktop/sylf/app/components/landing/journey/HeroJourneyAnchor.module.css) positions it beside the hero on desktop/tablet and in the gap above the screenshot on mobile. It does not move the content.

[JourneyPath.tsx](/Users/aliumair/Desktop/sylf/app/components/landing/journey/JourneyPath.tsx) measures that point with every other existing waypoint. The original screenshot waypoint becomes the next stop. `heroExitY` marks that boundary, and `data-hero` suppresses the opening traveler message through [BotanicalTrail.module.css](/Users/aliumair/Desktop/sylf/app/components/landing/journey/BotanicalTrail.module.css).

`journeyYForScroll` in [journey-geometry.ts](/Users/aliumair/Desktop/sylf/app/components/landing/journey/journey-geometry.ts) starts the destination exactly at the hero waypoint when scroll is zero. It interpolates into the original `scrollY + 0.68 × viewportHeight − rootOrigin` mapping over `max(160, heroExitY − readingLine)` scroll pixels, meeting it continuously. After that, the existing mapping is unchanged. Destinations remain bounded and monotonic.

The existing `JourneyMovement`, cubic path geometry, arc-length search, world transform ownership, secondary springs, character renderer and semantic states remain in place. There is exactly one traveling companion. The former separate static companion DOM and its obsolete CSS were removed; pause/reduced motion reuse this same traveler at the hero waypoint.

Measured initial traveler surfaces:

| Viewport | Surface origin | Size |
| --- | --- | --- |
| 1440 × 960 | x1195.69, y377.81 | 144 × 180 |
| 1024 × 768 | x841.61, y351.90 | 120 × 150 |
| 820 × 1180 | x715.09, y372.09 | 96 × 120 |
| 390 × 844 | x323.50, y454.90 | 56 × 70 |

These are document positions at scroll zero, from Chrome. All are visible in the first viewport. Existing hero headline, description, CTA/note and screenshot rectangles matched the pre-integration measurements.

## Responsive and accessible behavior

At ≤1200px, lanes become 62px; lanterns/books disappear, leaves shrink to 70%, and middle-section lanes fade before reaching content. At ≤900px, only explicitly retained leaves/stars/strings remain, half the dot points and ghost curves disappear, lanes narrow to 34px and parallax stops. At ≤700px, lanes narrow to 28px (43px for the hero), with stronger edge fading and smaller leaves.

Chrome counted 360 depth-marked decoration elements on wide desktop and 151 displayed on tablet/mobile: approximately 42% retained, within the requested 30–50% direction. This counts motif wrappers/vines/dots, not every internal SVG node. CSS hiding reduces rendering; it does not remove their SSR markup.

Every decoration root is `aria-hidden`, `pointer-events: none`, non-focusable and non-interactive. No controls were added. Light mode uses lower decorative opacity and theme-adjusted star/vine colors.

Under `prefers-reduced-motion`, all decorative animation/parallax stops and the static artwork remains. The same canonical companion is positioned at the hero with its runtime activity paused. `JourneyPath.paint` keeps that static traveler eligible to render even when motion is toggled farther down the page; its document position naturally places it outside the viewport until the visitor returns to the hero.

## Performance and QA

No package or lockfile changes. Five new UI source files total 26,052 bytes; combined source gzip is 7,802 bytes. These are source measurements, not an isolated production bundle delta. The built landing HTML measured 213,201 bytes / 22,377 bytes gzip, including the pre-existing landing and inline SVG markup. There is no new downloadable image/video asset.

At the top, only the hero’s six decoration animations were running on wide desktop; at tablet/mobile the retained composition has no running decorative loops. Each scroll event uses the shared scheduled update; there is no continuous decoration JavaScript loop.

Validation:

- `npx vitest run __tests__/landing`: 12 files, 110 tests passed.
- `npx tsc --noEmit`: passed.
- `npm run build`: passed with Next.js 16.2.9, including production TypeScript and all 89 prerendered pages.
- Installed Chrome through DevTools Protocol: 154 main checks passed at 1600, 1440, 1280, 1024, 820, 768 and 390px.
- Full vertical review and screenshots at 1440, 1024, 820 and 390px, including tall mobile chapter lower halves.
- Verified one canonical traveler, hero visibility, waypoint accuracy, smooth incremental scroll, section activation, offscreen suspension, no horizontal overflow, SVG-only decoration, reduced motion, pause/resume, hidden-page suspension and light mode.
- Nine additional static accessibility regression checks passed, covering enabling reduced motion down-page and pausing at the footer, then returning to the hero on desktop and mobile. Results: `accessibility-results.json` alongside the main results.
- Zero JavaScript runtime exceptions or failed landing ornament resources. Signed-out `/api/user/stats` returns 401 from the existing app auth flow; this pass did not change it.

The 1440 and 390px incremental scroll samples averaged 16.67ms between frames, with approximately 5.6–5.7px maximum traveler step. Other dev-server runs had 24–34ms averages and occasional compilation/scheduling stalls, including one 383ms tablet sample. These are rough headless desktop Chrome observations with viewport emulation, not physical-device or production paint benchmarks.

## Files and evidence

New UI files:

- [CelestialDecor.tsx](/Users/aliumair/Desktop/sylf/app/components/landing/journey/CelestialDecor.tsx)
- [CelestialDecor.module.css](/Users/aliumair/Desktop/sylf/app/components/landing/journey/CelestialDecor.module.css)
- [CelestialMotifs.tsx](/Users/aliumair/Desktop/sylf/app/components/landing/journey/CelestialMotifs.tsx)
- [HeroJourneyAnchor.tsx](/Users/aliumair/Desktop/sylf/app/components/landing/journey/HeroJourneyAnchor.tsx)
- [HeroJourneyAnchor.module.css](/Users/aliumair/Desktop/sylf/app/components/landing/journey/HeroJourneyAnchor.module.css)

Updated integration/geometry/style files:

- [JourneyLanding.tsx](/Users/aliumair/Desktop/sylf/app/components/landing/journey/JourneyLanding.tsx)
- [JourneyPath.tsx](/Users/aliumair/Desktop/sylf/app/components/landing/journey/JourneyPath.tsx)
- [journey-geometry.ts](/Users/aliumair/Desktop/sylf/app/components/landing/journey/journey-geometry.ts)
- [BotanicalTrail.module.css](/Users/aliumair/Desktop/sylf/app/components/landing/journey/BotanicalTrail.module.css)
- [Journey.module.css](/Users/aliumair/Desktop/sylf/app/components/landing/journey/Journey.module.css)

Tests/tooling/report:

- [journey-geometry.test.ts](/Users/aliumair/Desktop/sylf/__tests__/landing/journey-geometry.test.ts): hero mapping continuity, bounds and monotonicity, including tall viewports.
- [journey.test.tsx](/Users/aliumair/Desktop/sylf/__tests__/landing/journey.test.tsx): browser media-query mock for existing controls tests.
- [verify-celestial-world.mjs](/Users/aliumair/Desktop/sylf/scripts/verify-celestial-world.mjs): reusable full-page Chrome QA. Run with `SYLF_QA_BASE=http://localhost:3000 node scripts/verify-celestial-world.mjs`.
- [verify-landing-companion.mjs](/Users/aliumair/Desktop/sylf/scripts/verify-landing-companion.mjs): updates the old reduced-motion expectation to the single static hero traveler.
- [This report](LANDING_CELESTIAL_WORLD_PASS_REPORT.md)
- [QA results](/Users/aliumair/Desktop/sylf/documentation/landing-companion/celestial-world/results.json), [accessibility regression results](/Users/aliumair/Desktop/sylf/documentation/landing-companion/celestial-world/accessibility-results.json), and PNGs in that directory.

Useful screenshots: [desktop hero](/Users/aliumair/Desktop/sylf/documentation/landing-companion/celestial-world/hero-1440.png), [mobile hero](/Users/aliumair/Desktop/sylf/documentation/landing-companion/celestial-world/hero-390.png), [full desktop](/Users/aliumair/Desktop/sylf/documentation/landing-companion/celestial-world/full-1440.png), [full mobile](/Users/aliumair/Desktop/sylf/documentation/landing-companion/celestial-world/full-390.png), [final signup](/Users/aliumair/Desktop/sylf/documentation/landing-companion/celestial-world/finale-1440.png), [light mode](/Users/aliumair/Desktop/sylf/documentation/landing-companion/celestial-world/light-theme.png).

## Preserved implementation and limitations

Fresh before/after SHA-256 checks confirm unchanged character artwork, MagicalEyes TSX/CSS, companion CSS, JourneyCompanion, secondary-motion springs, state model/controller, canonical WebP, in-app `CharacterRenderer`, and package/lock files. The dashboard hero image and all existing copy, typography, CTAs, galleries and form behavior were preserved. No Planner or app-shell files were edited.

Keep world transforms and local character transforms separate. Preserve the measured waypoint attributes, original screenshot waypoint, `journeyYForScroll` join, and the original movement/spring ownership. No environment-triggered character reactions or collision system were added.

The reference is re-created with vector motifs rather than traced exactly. Small-screen decoration is intentionally much quieter; lanterns and books appear only where there is adequate desktop edge space. Physical mobile GPU/battery behavior has not been measured. The full SSR SVG markup is retained on mobile even when many motifs are hidden. Dev screenshots may include Next.js development indicators; those are not production UI.

This completes the landing-world pass. No additional companion states or unrelated redesign work were started.
