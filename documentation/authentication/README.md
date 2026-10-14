# Authentication experience

Sylf’s `/login` and `/register` share the Floating Sanctuary: the original floating-island composition, rebuilt from reusable native SVG scenery around Sylf’s established companion.

## Current owners

- `app/login/page.tsx`: credentials, OAuth/query feedback, existing onboarding/dashboard/redirect destinations.
- `app/register/page.tsx`: schema validation, debounced username availability, registration, onboarding navigation. Availability requests abort on replacement/unmount; late responses cannot update another username.
- `app/components/auth/AuthSplitLayout.tsx`, `AuthHeader.tsx`, and `AuthLayout.module.css`: composition, typography, semantic form surfaces, focus tracking, and responsive sizing.
- `app/components/auth/StudyIslandScene.tsx` and `StudyIsland.module.css`: local lamp/pause controls, greeting requests, visibility suspension, and scene placement.
- `app/components/landing/journey/CelestialDecor.tsx` and its CSS Module: the shared landing foliage. The `auth` variant borrows the finale vine/leaf composition without its lanterns, strings, or star scatter. Auth positions it in clipped, noninteractive page-edge lanes.
- `app/components/auth/IslandScenery.tsx`: native faceted rock, quartz shards, crescent, orbit, folded foliage, tea mug, and copper lantern stand. It reuses `CelestialBooks`, `CelestialLantern`, and `CelestialLeaf` from the landing journey. Gradients use instance-scoped React IDs.
- `app/components/landing/companion/Companion.tsx`: the existing canonical companion, unchanged by this implementation. Its painted rig, reading book, halo, ribbons, motion, `MagicalEyes`, and bounded reaction system remain the source of truth. See the [companion contract](../landing-companion/README.md).
- `app/components/OAuthButtons.tsx`: existing Google OAuth dispatch.
- Authentication API/session authorities remain `lib/auth-server.ts`, `lib/auth.ts`, and the existing `app/api/auth/` handlers.

The surrounding scene contains no raster artwork, SVG image embeds, foreign objects, canvas renderer, or new dependency. The companion deliberately retains its existing painted-rig asset and SVG eyes; it is not a redrawn/vectorized substitute.

## Composition and appearance

Above 900px the form sits on the left and the open island scene on the right. The supporting text appears above the island as a greeting from Sylf: italic book-like typography, soft quotation marks, and a curved thread toward the companion. The route heading remains above the authentication controls. Decorative journey/account labels are removed at every viewport, and the companion quotes are shortened. The former caption below the island is removed. Short desktop windows reduce the scene’s maximum width; long registration forms scroll naturally.

Landing-style vines frame both page edges, with semantic color aliases and narrow clipped lanes that stay outside the form. The loose hanging vine beside the moon is removed so it no longer intersects the island vegetation. Edge foliage is static and adds no animation loop; the island retains its existing motion controls.

At 900px and below, the complete form comes first, directly below the header. The scene follows it with the quote on the left and the island on the lower right. The footer tagline and scene-location caption are hidden at these sizes, and scene controls use labelled icons. The rock depth becomes shallower, the moon moves left, and a single hanging lantern remains. Above 900px the original form-left/island-right arrangement and quote above the island are retained. The plateau and rock formations share their vertices; mobile compresses the lower geometry while keeping the plateau attachment fixed. The rock follows the original `CelestialStudyArtwork` landmarks and colors: a broad central taper, staggered side points, large blue-violet facets, and a quartz terminus. The shallow chipped edge and four suspended quartz shards also follow the reference composition. The canonical companion is mounted once at every breakpoint. At 600px and below, fields use 16px text and 50px heights; scene buttons are at least 44px. The skip link moves focus directly to the form.

Form and scene chrome use the existing canvas, surface, foreground, border, and accent tokens from `GlobalSystemWrapper`/`lib/color-utils.ts`. Text accents use `--accent-text`; filled actions use `--accent-foreground`. Rock, books, leaves, moon, and companion retain the original violet/ivory illustration pigments. Fine orbit/vine/star details mix with semantic foreground colors. No separate theme or appearance persistence is introduced.

## Interaction and motion

- Sylf reads by default with its established focused eyes. Focusing a non-password input selects the existing curious eyes; the password field and reveal control select the existing sleepy lids. Only the focus category enters the scene; credential values never do.
- Activating “Say hello to Sylf” requests `GREETING` through `Companion`’s existing reaction system. It returns to reading after the canonical 2.4-second duration.
- The labelled lantern toggle dims the lamps and their pools of light. Its pressed state reports whether the lights are on.
- A separate labelled toggle pauses scene and companion animation. The controls are keyboard and touch operable.
- Slow CSS transform/opacity animations provide island drift, lantern sway, foliage, quartz, steam, and sparse star/mote movement. The companion retains its `quiet` motion profile. No continuous JavaScript animation loop or pointer tracking runs.
- Intersection and document-visibility changes pause offscreen/background motion. `prefers-reduced-motion` removes all auth animations and transitions, including the companion’s motion, and hides the redundant pause control.
- Feedback retains alert/status semantics, associated username messages, disabled/loading states, and accessible password reveal behavior.

The original monolithic celestial SVG remains as source material. The superseded Observatory implementation is removed. The web auth routes and their scene are not imported by the mobile/Vite entry points.

## Verification

See the [mobile form-first follow-up](reports/mobile-form-first/report.md), the [edge-vine follow-up](reports/edge-vines/report.md), the [greeting layout follow-up](reports/companion-greeting/report.md) and the [floating-island report](reports/floating-island/report.md) for production screenshots, checks, performance samples, and limitations. Regression coverage lives in `__tests__/auth/auth-experience.test.tsx`; the existing companion/eye tests verify the reused character.
