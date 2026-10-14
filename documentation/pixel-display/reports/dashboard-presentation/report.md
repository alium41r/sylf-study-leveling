# Dashboard presentation refinement

8 October 2026.

The dashboard now presents the companion and progression in one compact overview.
XP and HP use slanted rails with visible segments in both filled and empty states.
Level, total focus, and today's quota sit beneath the meters, beside the artwork
on desktop. Narrow content widths keep artwork and meters together with all three
metrics on the row below. Container queries account for the space occupied by the
sidebar; the main quest/social columns also stack when that space is narrow.

The companion has a restrained outer frame, corner details, and a keyboard-accessible
Locker link. The existing Pixel presenter, configuration, saved border, artwork,
density, rendering, and progression data remain the owners. Padding surrounds the
canvas without cropping its outer cells. Physical size is responsive, independent
of logical density. Surface/text/accent tokens follow the existing appearance
system, including light surfaces in dark mode and dark surfaces in light mode.
Both meters expose their percentages and numeric XP/HP values to assistive
technology, and reduced motion collapses fill transitions.

## Verification

- `npm run test -- --run __tests__/dashboard __tests__/pixel-display`: 478 passed;
  the 8 database integration cases skipped because `PIXEL_TEST_DATABASE_URL` was
  not configured. No database or persistence behavior changed.
- `npm run test -- --run __tests__/dashboard/dashboard-overview.test.tsx`: 5 passed.
  Added coverage checks the grouped summary, accessible empty/full health meters,
  and empty/completed quota feedback.
- `npx tsc --noEmit`: passed, including the final check after moving temporary
  production-build-generated validation out of the source tree.
- ESLint on the dashboard screen and new test: no errors; three existing warnings
  (an unused disable directive and two friend-avatar `<img>` elements).
- Final mobile build: passed using
  `npm run mobile:build -- --outDir /private/tmp/sylf-dashboard-mobile-build`.
  A temporary copy of the existing mobile verifier, with only its output-directory
  constant pointed to that build, passed with mocks disabled and no server symbols
  or secrets. Existing `mobile/dist` work was preserved. The build emitted existing
  KaTeX font-resolution and Vite configuration warnings.
- The default Turbopack production build stalled during compilation and was stopped.
  A separate webpack build compiled successfully, then failed Next route validation
  on the existing `CURATED_SOUNDSCAPES` export in `app/api/acoustics/route.ts`.
  That export is also present in HEAD. Generated validation additionally reported
  existing unsupported exports, route-parameter signatures, and the Goals page prop
  signature. These are outside this presentation change. The temporary build output
  was moved outside the repository and temporary tsconfig includes were removed.

## Browser evidence

The running dashboard was visually checked with the scholar's equipped artwork,
70% XP, and empty HP. No horizontal document overflow was detected at the inspected
widths. Saved appearance preferences were restored after temporary browser QA.
The Locker link also showed its visible focus outline with keyboard navigation.

| View | Evidence |
| --- | --- |
| Desktop dark, 1440 | [Screenshot](evidence/desktop-dark.png) |
| Desktop dark, 1024 | [Screenshot](evidence/desktop-dark-1024.png) |
| Desktop dark, 1920 | [Screenshot](evidence/desktop-dark-1920.png) |
| Desktop light, 1440 | [Screenshot](evidence/desktop-light.png) |
| Tablet dark/light, 768 | [Dark](evidence/tablet-dark-768.png), [light](evidence/tablet-light-768.png) |
| Mobile dark, 320 | [Screenshot](evidence/mobile-dark-320.png) |
| Mobile dark/light, 390 | [Dark](evidence/mobile-dark-390.png), [light](evidence/mobile-light-390.png) |
| Custom peach background/lime accent in dark mode, 1440 | [Screenshot](evidence/desktop-custom-light-surface.png) |
| Custom navy background/amber accent in light mode, 390 | [Screenshot](evidence/mobile-custom-dark-surface.png) |

Full production serving remains unverified because of the existing route-validation
errors. Full-health and quota edge states were covered by the component tests;
live browser evidence uses the signed-in scholar's actual values.
