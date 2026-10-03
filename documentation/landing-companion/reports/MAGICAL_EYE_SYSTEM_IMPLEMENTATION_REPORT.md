# Sylf magical eye system

Eye-only implementation and visual QA, 28 September 2026.

## Result

The companion now uses a layered SVG reconstruction of the supplied Variant 3 reference. The hood, face opening, body, cloak, ribbons, clasp, halo, star, hands, props, world movement and semantic state machine are unchanged.

The nine visual variants are available in the **Magical eye study** selector on `/companion-prototype`: Neutral, Happy, Cheerful, Excited, Focused, Curious, Sleepy, Sad and Surprised. The review gallery holds the body in the same neutral pose so differences come from the eyes alone. Selecting a base state or reaction returns the preview to its normal semantic presentation.

## Reference analysis and drawing

The supplied strip was inspected at original resolution and through enlarged crops before implementation. Neutral eyes measure approximately 27×62 pixels in the reference: a narrow organic spindle, not a perfect ellipse. The four-point reflection occupies roughly half the eye width, with a vertically elongated white center. Gloss sits at the outer upper corner and mirrors between the two eyes. Lavender at the crown deepens into blue-violet internally, with icy-blue edge flow and a brighter lower rim.

`MagicalEyes.tsx` separates each open eye into:

- Proportional curved silhouette with a thin cool rim.
- Multi-stop base color and independent radial internal depth.
- Curved edge-light regions and a localized lower light pool.
- Restrained luminous core and crisp concave four-point white reflection.
- Mirrored glossy highlight and smaller pin glint.
- Bounded radial-gradient bloom and sparse decorative specks.

These are vector paths, gradients and clip references. There are **no raster eye assets, filters, blur animations, videos or added libraries**. The source reference is stored only with QA evidence; it is not loaded by the production companion.

| Variant | Reference-specific treatment |
| --- | --- |
| Neutral | Tall tapered magical eyes, embedded stars and mirrored outer highlights. |
| Happy | Soft filled upward crescents, faint cool glow and small sparkles. |
| Cheerful | Stronger raised crescents, upper stars and paired lower accent strokes. |
| Excited | Mirrored inward chevrons with restrained outer sparkle accents. |
| Focused | Tall leaves with sharp outer upper tips and the same internal reflective system. |
| Curious | Larger left eye and smaller right eye, with their lower edges aligned. |
| Sleepy | Low downward crescents and small lower sparkle accents. |
| Sad | Inner upper tips, outward drooping edges and rounded reflective lower bodies; no tears. |
| Surprised | Slightly larger open magical eyes and three outward emphasis strokes per side. |

The isolated renderer was captured directly beneath the supplied strip for comparison. Internal light was refined after the first comparison to reduce a flat white lower fill and restore the reference's blue/lavender depth.

## Integration and animation

- `MagicalEyes.eyeExpressionFor` maps the existing `THINKING` expression to the reference's `FOCUSED` artwork. Existing Neutral, Happy, Excited, Curious and Sleepy mappings retain their names.
- `model.ts`, its six semantic expressions, reaction priorities/durations, actions and product triggers are unchanged. Cheerful, Sad and Surprised are available through the presentation-only `preview.eyeExpression` override; no new automatic product behavior was invented.
- `CompanionArt` mounts the eye component inside the existing `[data-part="face"]` gaze wrapper. The canonical SVG, hood texture and registered non-eye layers persist.
- Expression changes use a 180 ms incoming / 140 ms outgoing opacity dissolve. At most one previous drawing is retained; `animationend` clears it. No JavaScript animation loop or new expiry timer is used.
- Blinks preserve the established 24-second cadence, including a double blink. Complementary opacity tracks exchange the detailed eye for an intentionally drawn luminous lid; gradients and star reflections are never vertically squashed.
- Existing quiet happy moments and curious glances remain CSS-based. The glance translates the complete eye instead of distorting its reflective interior.
- Existing visibility pausing and reduced-motion rules apply. Reduced motion shows the selected static drawing and hides the outgoing transition layer.

## Files

Created:

- `app/components/landing/companion/MagicalEyes.tsx`
- `app/components/landing/companion/MagicalEyes.module.css`
- `__tests__/landing/magical-eyes.test.tsx`
- `scripts/verify-magical-eyes.mjs`
- [MAGICAL_EYE_SYSTEM_IMPLEMENTATION_REPORT.md](MAGICAL_EYE_SYSTEM_IMPLEMENTATION_REPORT.md)

Modified:

- `artwork.tsx`: replaced only eye geometry/old eye gradient; mounts `MagicalEyes`.
- `Companion.module.css`: retired only the superseded eye rules and blink/mood keyframes. Non-eye CSS is unchanged.
- `Companion.tsx`: passes the optional review eye override.
- `CompanionReview.tsx`: nine-eye gallery and selector.
- `__tests__/landing/companion-state-polish.test.tsx`: updated the obsolete Thinking-eye expectation.
- `scripts/verify-landing-companion.mjs`: recognizes the nine-eye gallery; retries temporary-profile cleanup when Chrome is still releasing files.
- `scripts/verify-companion-state-polish.mjs`: updates the gallery-card count from 12 to 15.

## QA and boundaries

- **103 tests passed across 12 landing test files.** Added checks cover all nine variants, unchanged non-eye markup, shared reflections, per-instance SVG references and bounded timer-free transitions.
- **17 eye-specific Chrome checks passed:** live expression changes, stable body/hood, transition cleanup, intentional blink geometry, four display sizes, reduced motion and no companion errors.
- **41 existing Chrome landing/journey checks passed.** World movement, state/reaction behavior and mobile/reduced-motion integration remain intact.
- TypeScript and the final `npm run build` production build passed.
- SHA-256 comparisons confirm the canonical WebP, journey geometry/CSS, travel controllers, state model, reaction hook, package manifests and in-app `CharacterRenderer.tsx` are unchanged by this pass.
- At 280 px and normal 96 px size the internal star/gloss remain readable. Desktop landing size is 144×180; smallest mobile size is 56×70. Tiny specks are suppressed for compact/mobile journey rendering while the detailed main eye remains. At the smallest size, subtle color regions and Happy/Cheerful differences necessarily merge into a few pixels.
- The existing shared companion's onboarding consumers receive the eye change too. The separate in-app chibi/avatar renderer was not edited.
- No new asset downloads or packages. The two new eye source files total about 4.7 KB gzipped **as source**, not a measured production bundle delta. The existing canonical painting remains 160,722 bytes.

## Review evidence

All files are under `documentation/landing-companion/magical-eyes/`:

- `reference.png`: supplied reference, for QA only.
- `reference-comparison.png`: reference on top, actual SVG eyes below.
- `character-sheet.png`: all nine eyes on the canonical character.
- `normal-96.png`, `landing-desktop.png`, `landing-mobile.png`: actual-size checks.
- `live-neutral.png`, `blink-closed.png`, `reduced-motion.png`: animation/accessibility captures.
- `results.json`: browser assertions and transition samples. Signed-out shell `401 /api/user/stats` responses are recorded separately from companion errors.

Reproduce with the dev server on port 3000:

```sh
node_modules/.bin/vitest run __tests__/landing
node_modules/.bin/tsc --noEmit
npm run build
SYLF_QA_BASE=http://localhost:3000 node scripts/verify-magical-eyes.mjs
SYLF_QA_BASE=http://localhost:3000 node scripts/verify-landing-companion.mjs
```

This pass stops at the eye-system implementation and visual QA.
