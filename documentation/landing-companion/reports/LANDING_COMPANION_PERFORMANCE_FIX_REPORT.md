# Landing companion — overlap and scroll performance fix

Implemented 2026-10-01. Scope: the landing journey only. No new animation states, artwork, packages, videos, layout changes, or in-app avatar changes.

## Why it could look doubled

Source inspection finds one `JourneyPath` in `JourneyLanding` and one `JourneyCompanion` traveler in `JourneyPath`. Live DOM inspection was unavailable, so this is not a claim about the user's current browser DOM.

`CompanionArt` in `app/components/landing/companion/artwork.tsx` previously retained almost complete stationary cape panels and legs inside its torso mask, beneath the independently moving cape and legs. Those spare silhouettes become visible when the fabric swings. Its old cape/ribbon mattes also left some painted hems behind in the torso. This is the likely source of the stacked appearance.

The landing now retains overlap only at the cape attachment band (Y599–635) and hips (Y708–732). Journey-specific mattes include the painted hems in the moving cape/ribbon layers, rather than leaving stationary outlines behind. Four bounded SVG masks provide an eight-unit edge allowance; there is no added bitmap or filter.

`Companion.tsx` enables this through `jointSeams={motionProfile === "journey"}`. Other consumers use the original default rig behavior. The canonical `original-rig.webp`, hood, eyes, halo, palette and animation/spring tuning remain intact. Every painted layer still samples the same canonical bitmap.

## Scroll work removed

| Owner | Previous work | Current work |
| --- | --- | --- |
| `JourneyPath.paint` | 18 native `getPointAtLength` calls for arc-length search, plus one for the actual position, each movement frame | `pointAtJourneyY` evaluates the original cubic directly; zero native SVG geometry queries during movement |
| `JourneyPath.measure` | Native SVG sampling to position growth marks | Same sampling; its existing points also populate a small cached arc-distance table |
| `CelestialWorld.paint` | Interleaved inherited-style writes and rectangle/height reads for active sections on scroll | Batched measurement at initialization/layout/resize; cached document centers during scroll |
| `CelestialWorld` | Decoration RAF scheduled on mobile scroll even though parallax was disabled | No decoration scroll RAF at widths ≤900px, when hidden/reduced, or with no nearby sections |
| `JourneyCompanion.present` | 23 inline CSS property reads to compare spring values every frame | Cached last-written values; only changed values are written |
| Both journey controllers | Some unchanged datasets/styles rewritten each frame | Values compared before writing |

`pointAtJourneyY` in `journey-geometry.ts` solves the exact vertical-handle cubic used by `buildJourneyPath` with five Newton iterations. The companion position is not approximated. `journeyDistanceAtY` interpolates cached arc lengths solely for decorative growth progress; those samples are spaced 66px on desktop / 110px on mobile. Native SVG measurement remains confined to path setup or responsive remeasurement.

The `journeyYForScroll` mapping, section anchors, hero join, `JourneyMovement` acceleration/deceleration, velocity-driven secondary springs, semantic states, pause/reduced-motion behavior, and wrapper positioning ownership are preserved.

## Files changed in this follow-up

Source:

- `app/components/landing/companion/artwork.tsx`: landing seam support and moving matte boundaries.
- `app/components/landing/companion/Companion.tsx`: gate that behavior to the journey profile.
- `app/components/landing/companion/JourneyCompanion.tsx`: cache CSS variable writes.
- `app/components/landing/journey/JourneyPath.tsx`: pure position evaluation, cached decorative distance, conditional dataset writes.
- `app/components/landing/journey/journey-geometry.ts`: `pointAtJourneyY`, `journeyDistanceAtY`, supporting types. Legacy `lengthAtY` remains exported.
- `app/components/landing/journey/CelestialDecor.tsx`: cached layout, grouped reads, conditional writes and scroll scheduling.

Tests:

- `__tests__/landing/journey-geometry.test.ts`: cubic equivalence, continuity, clamping and cached-distance interpolation.
- `__tests__/landing/journey-motion.test.tsx`: no native SVG queries during forward/reverse scroll movement.
- `__tests__/landing/celestial-world-performance.test.tsx` (new): no scroll layout reads, mobile scheduling, unchanged writes, reduced/hidden/offscreen suspension.
- `__tests__/landing/companion-layering.test.tsx` (new): offline SVG raster comparison of resting identity and stationary underlayers.

Evidence: `documentation/landing-companion/performance/` contains six before/after PNGs and `layering-measurements.json`. These are offline Sharp renderings of actual SVG layers, including a forced sample motion pose. They are not browser screenshots or FPS measurements. This report and the follow-up note in [LANDING_CELESTIAL_WORLD_PASS_REPORT.md](LANDING_CELESTIAL_WORLD_PASS_REPORT.md) document the changes.

## Verification and limits

Offline layer isolation shows 4,503 → 379 opaque stationary-tail pixels below artwork Y760: a 91.6% reduction. The remaining pixels include the original blue undercoat. The complete resting renders differ by more than 16 channel units at 619 of 44,573 opaque pixels (1.39%), primarily along the reassigned matte edges; the painted character design is unchanged. Before/after resting and sample motion renders were visually inspected.

Validation passed:

- `npx vitest run __tests__/landing`: 122 tests across 14 files.
- After completing the IntersectionObserver test fixture's types, its six tests were rerun and passed.
- `npx tsc --noEmit`: passed.
- `npm run build`: passed with Next.js 16.2.9, including production compilation, TypeScript and prerendering.

SHA-256 before/after checks confirm unchanged canonical WebP, in-app `CharacterRenderer.tsx`, `package.json`, and `package-lock.json`. No additional asset download or animation dependency was introduced. The added SVG masks increase a small amount of character markup and mask paint work; they do not create a full-page render surface.

Live browser verification was blocked by the browser tool's URL policy. No alternate browser/control route was used. The source-level work reduction and offline artwork checks are verified, but current live FPS, physical mobile GPU/battery behavior, and the user's exact visible overlap remain unmeasured. Animated SVG masks can still require paint work. A production browser profile is the next useful check if lag remains; the earlier world-pass browser measurements predate this fix.
