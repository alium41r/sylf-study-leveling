# Authentication edge vines

Verified 2026-10-12.

Login and registration now reuse `CelestialDecor` from the landing page. Its `auth` composition borrows the finale's existing vines and folded leaves, omitting lanterns, strings, and stars so those stay within the island scene. The shared landing compositions and their indexing are unchanged.

The decorations sit in clipped, noninteractive outer lanes behind the content. Their widths adapt to the viewport, including a 46px limit on narrow desktop layouts. Semantic color aliases keep the foliage legible on dark, light, and custom backgrounds. The edge foliage is static; it adds no scroll controller or animation loop.

The separate hanging vine beside the moon was removed from the scene. Its branches no longer overlap the plant rooted on the island. Island geometry, companion behavior, text placement, and authentication handlers remain unchanged.

## Checks

- Nine login/register viewport and appearance combinations from 320px to 1920px: both edge lanes are present, stay outside the input bounds, ignore pointer events, and introduce no horizontal overflow. The overlapping scene canopy is absent.
- Desktop, tablet, phone, small-phone, light, dark, and custom-color screenshots inspected. The landing page was also inspected at desktop and phone sizes; it retains its original decorations.
- Password focus selects the established sleepy eyes; reduced motion disables scene animations and leaves no edge animations. No browser page errors were observed.
- Authentication and landing-motion suites: 16 tests passed.
- Full TypeScript check passed. ESLint reported no errors and one pre-existing `no-unused-expressions` warning in the unchanged `CelestialWorld` observer callback.
- Production build passed. The final 46px narrow-desktop CSS adjustment was verified afterward in the browser and full TypeScript check. Web auth components are not imported by the mobile/Vite client.

The browser run isolated API calls as unauthenticated. Live provider login and account creation were not attempted.

## Evidence

- [Browser checks](evidence/results.json), [verification script](evidence/verify.js), and [build log](evidence/build.log).
- [Desktop login](evidence/login-desktop.png), [phone login](evidence/login-mobile.png), [small-phone registration](evidence/register-small.png).
- [Light registration](evidence/register-light.png), [custom cream/rust](evidence/login-custom-light.png), [custom green/mint](evidence/register-custom-dark.png).
- [Landing desktop](evidence/landing-desktop.png) and [landing phone](evidence/landing-mobile.png).
