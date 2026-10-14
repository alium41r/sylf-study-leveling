# Greeting placement and crystalline island refinement

Verified on 2026-10-12.

The login/register heading remains with the form. Supporting copy sits above the island as the companion’s softly quoted greeting. Both positions are consistent across desktop and stacked mobile layouts.

The floating island's rock follows landmarks and colors from the original `CelestialStudyArtwork`, matching the user-supplied reference. Fifteen connected faces form a broad central taper, staggered side points, and large blue-violet planes. The original quartz terminus and four suspended shards retain the reference composition. The plateau's chipped front edge shares the rock's vertices. Mobile compresses only the lower rock while preserving its connection to the upper surface. The established companion, scenery controls, and authentication functionality remain in place.

## Verification

- `npx tsc --noEmit` — passed.
- ESLint on `IslandScenery.tsx`, `StudyIslandScene.tsx`, `AuthSplitLayout.tsx`, and both auth routes — passed.
- `npm run test -- --run __tests__/auth/auth-experience.test.tsx` — 9 tests passed.
- Playwright checked nine route/viewport/appearance combinations from 320px to 1920px. Each has one heading inside the form, supporting copy above the island, and no horizontal overflow. Light/dark modes and custom cream/rust and green/mint palettes were included.
- Full and compact rock geometry each has 15 positive-area faces, 36 exterior edges, no multiply shared edges, and zero difference between the summed face area and the silhouette area.
- Password focus still selects the canonical `SLEEPY` eye state. Reduced motion leaves no active scene animations. No browser page errors were observed.
- Screenshots were inspected at desktop, phone, small-phone, and custom-color layouts. Scene animation ownership and authentication handlers are unchanged by this refinement.

The final viewport run used the development server with API responses isolated as unauthenticated; it did not exercise live Google OAuth or create accounts. The existing `build.log` records a successful production build before the final rock-facet refinement. Final geometry and layout were checked with the current source using the commands above. Earlier motion performance samples and broader auth verification are documented in the [floating-island report](../floating-island/report.md).

## Evidence

- [Viewport checks](evidence/results.json) and [repeatable browser script](evidence/verify.js).
- [Desktop login](evidence/login-desktop.png), [phone login](evidence/login-mobile.png), [small-phone registration](evidence/register-small.png).
- [Light registration](evidence/register-light.png), [custom cream/rust](evidence/login-custom-light.png), [custom green/mint](evidence/register-custom-dark.png).
