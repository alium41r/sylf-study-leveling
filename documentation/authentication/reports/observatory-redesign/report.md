# Quiet Observatory auth redesign

Verified 2026-10-11. This report describes the working-tree implementation and this particular test run; the [current authentication contract](../../README.md) identifies ownership and behavior.

## Delivered

Replaced the desktop-coordinate celestial backdrop with a modular, authored SVG observatory. A moon, orbital markings, distant mountains and lake, folded-cloak Sylf scholar, open book, book stack, steaming cup, warm lantern, and botanical foreground create a cohesive study scene. Mobile recomposes the window and desk into a compact welcome rather than shrinking the desktop illustration. There are no raster illustration assets or new dependencies.

Reworked form typography, hierarchy, controls, errors, and loading states around the scene, using existing appearance tokens. Password reveal is keyboard accessible. Username feedback is announced and linked to its field. OAuth feedback with literal percent characters remains readable; redundant URI decoding was removed. Username availability now cancels stale requests. Existing credential endpoints, provider dispatch, session updates and successful destinations remain intact.

## Visual and browser verification

Production build served locally on port 3001. Browser contexts were isolated from the user's authenticated session. The [browser runner](evidence/browser-qa.js), [results](evidence/browser-results.json), [navigation runner](evidence/navigation-qa.js), and [navigation results](evidence/navigation-results.json) record the checks. Run the JS function files through the configured Playwright `browser_run_code_unsafe` tool with a local production server at the documented address; output paths assume this workspace.

Screenshots inspected across:

| Coverage | Evidence |
| --- | --- |
| Desktop login, 1440 × 1000, dark | [Screenshot](evidence/login-desktop-dark.png) |
| Desktop registration, 1440 × 1000, light | [Screenshot](evidence/register-desktop-light.png) |
| Mobile login, 390 × 844, dark | [Screenshot](evidence/login-mobile-dark.png) |
| Mobile registration, 390 × 844, light | [Screenshot](evidence/register-mobile-light.png) |
| Small phone registration, 320 × 568, light | [Screenshot](evidence/register-small-light.png) |
| Tablet registration, 768 × 1024, light | [Screenshot](evidence/register-tablet-light.png) |
| Tablet login, 900 × 700, dark | [Screenshot](evidence/login-tablet-dark.png) |
| Small desktop registration, 1024 × 768 | [Screenshot](evidence/register-small-desktop.png) |
| Wide desktop login, 1920 × 1080 | [Screenshot](evidence/login-wide.png) |
| Short desktop registration, 1280 × 600 | [Screenshot](evidence/register-short-desktop.png) |
| Warm light custom background and rust accent while mode is dark | [Screenshot](evidence/register-custom-light-in-dark-mode.png) |
| Deep green custom background and mint accent while mode is light | [Screenshot](evidence/login-custom-dark-in-light-mode.png) |
| Login pending submission | [Screenshot](evidence/login-loading.png) |
| Login server error | [Screenshot](evidence/login-error.png) |
| Registration error with availability and password feedback | [Screenshot](evidence/register-validation.png) |

All 12 viewport/appearance combinations have no horizontal overflow and keep the form within the viewport width. Long pages deliberately use document scrolling. Inputs are 49–50px tall, submit buttons 50px, and password/scene buttons at least 44px. Phone inputs use 16px text. Measured form label, secondary text and filled-button text contrast all exceed 4.5:1 in these combinations (lowest secondary text 5.84:1, lowest button text 5.70:1).

Exercised lamp dimming, ambient pause/resume, keyboard password reveal, password-focus eye response, query verification feedback, login pending/error/retry states, username normalization/taken/available states, registration errors with retained values, and offscreen animation suspension. Reduced motion leaves zero animations on the auth surface. No page exceptions occurred. Guest stats requests return the expected 401 when no session is present.

Navigation checks intercepted successful credential responses and destination pages: completed users reach `/dashboard`, incomplete users reach `/onboarding`, a relative focus redirect retains its query, and an absolute external redirect falls back to dashboard. Registration reaches onboarding; login/signup links and the Google OAuth dispatch route work. No real account was created, modified, or signed into. Completing a live Google provider flow was not tested.

## Performance

A production Chromium sample under 4× CPU throttling measured 120 animation frames: median 16.7ms, p95 18.5ms, maximum 18.6ms. This is a local synthetic sample, not a guarantee for all devices. The scene contains 341 SVG descendant nodes across the two breakpoint compositions and only six active CSS animations. No SVG blur filters, raster network requests, continuously running JavaScript timers, or per-frame React state are used. Offscreen motion and the inactive breakpoint composition are suspended; all animation and parallax are disabled for reduced motion.

## Automated checks

- Production build: passed, 89 static pages; TypeScript phase passed. `SYLF_TEST_DIST_DIR=.next/auth-verification npm run build` keeps the existing development build separate. Temporary Next-added tsconfig include paths were removed afterward.
- `npx tsc --noEmit`: passed.
- ESLint on all changed TS/TSX files: passed.
- Targeted experience, route, OAuth, and strength suites: **27 passed** (4 files), including seven new experience regressions.
- Entire auth directory: **99 passed, 2 failed** (101 tests). Both failures are unchanged account-settings tests whose Prisma mock lacks `$transaction`, called by the unchanged execution-coordination service. The tests, account route and service have no diff against HEAD. This redesign does not modify them.
- No schema, dependency, shared application shell, mobile/Vite screen, or backend behavior changed. Mobile bundle checks were not needed: none of the changed components are imported by the mobile client.

Command logs are retained in this report's evidence directory. The full auth-suite failure is reported rather than suppressed or repaired outside this task's scope.
