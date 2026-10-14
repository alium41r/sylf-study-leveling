# Floating-island authentication refinement

Implemented and verified October 11–12, 2026. This supersedes the Observatory design; its earlier report remains historical evidence only.

## Delivered composition

The original left-form/right-island arrangement is restored. The scene retains the crescent in its orbit, violet faceted rock, suspended crystals, folded botanical silhouettes, books, crescent tea mug, and hanging glass lanterns. Copper hardware and pools of lavender light tie the scenery to the existing companion’s ivory cloak and gold halo.

`StudyIslandScene` now mounts the canonical `Companion` in its reading pose. Its original artwork, drawn eye expressions, quiet motion, and greeting lifecycle are reused intact. All surrounding scenery is native SVG, with reused landing motifs and instance-scoped gradients. Mobile has shallower rock, relocated celestial elements, one hanging lantern, and an intact companion above the form. Short desktops omit the optional illustration caption.

The lamp and pause controls expose pressed states. Password/reveal focus selects canonical sleepy eyes, other input focus selects curious eyes, and keyboard/touch activation requests the canonical greeting before returning to reading. Reduced motion removes all animation; hidden/offscreen scenes pause. Authentication handlers, API payloads, session ownership, and navigation remain in their existing owners.

## Verification evidence

- Production build: passed, including TypeScript and 89 static routes. See [build log](evidence/build.log).
- Full `tsc --noEmit`: passed. See [typecheck log](evidence/typecheck.log).
- ESLint on changed TypeScript/TSX files: passed. See [lint log](evidence/lint.log).
- Six targeted suites, 64 tests: passed. They cover auth experience, routes, OAuth, password strength, canonical companion, and magical eyes. See [test log](evidence/tests.log).
- Twelve production viewport/appearance combinations: 320×568, 390×844, 768×1024, 900×700, 1024×768, 1280×600, 1366×768, 1440×1000, and 1920×1080. Light/dark modes and both surface-polarity inversions were exercised (cream/rust in dark mode; deep green/mint in light mode).
- No horizontal overflow or companion clipping. Inputs are 49–50px, primary actions 50px, and scene controls at least 44px. Measured secondary-text contrast was at least 5.84:1 and primary-action contrast at least 5.70:1 against their base surfaces. Screenshots were also inspected for the subtle gradient overlay, wrapping, composition, and feedback placement.
- Browser interaction checks passed for lamp, pause, focus eyes, keyboard password reveal, canonical greeting/return, login loading/error/payload, registration validation/retry, reduced motion, offscreen pause/resume, and skip-link focus. See [browser runner](evidence/browser-qa.js) and [saved results](evidence/browser-results.json).
- Intercepted successful auth flows verified dashboard/onboarding selection, a preserved relative redirect, rejection of an absolute external redirect, registration onboarding, reciprocal auth links, and Google OAuth dispatch. See [navigation results](evidence/navigation-results.json).

Representative renders: [desktop login](evidence/login-desktop-dark.png), [desktop signup](evidence/register-desktop-light.png), [mobile login](evidence/login-mobile-dark.png), [320px signup](evidence/register-small-light.png), [custom light surface](evidence/register-custom-light-in-dark-mode.png), [custom dark surface](evidence/login-custom-dark-in-light-mode.png), [password privacy](evidence/password-privacy.png), and [greeting](evidence/companion-greeting.png).

## Performance and limits

[Touch verification](evidence/touch-results.json) also passed for greeting/return, lanterns, pause, and document-visibility suspension/resume. See the [touch render](evidence/login-touch-final.png). The automation taps the companion’s visible coordinates because its gentle continuous drift intentionally prevents Playwright’s element-stability wait from completing.

A production Chromium sample at 4× CPU throttling collected 120 frame intervals: median 16.7ms, p95 17.5ms, maximum 17.7ms. A 390×844 touch-emulated sample at device scale 2 and the same throttle measured median 16.7ms, p95 17.6ms, maximum 17.7ms. This is a local emulated-load sample, not a guarantee for every device. The scene and reused companion have 26 active CSS animations in that state; reduced-motion verification observed zero auth animations. The scenery has no animated blur/filter or per-frame JavaScript loop.

Browser auth API calls and destination pages were intercepted in isolated contexts. No real accounts, existing user sessions, or provider credentials were changed. Live Google provider authentication and a real backend account creation were not exercised. Existing route/service unit suites provide complementary handler coverage. Mobile browser layouts were verified; this web-only auth change has no Vite/mobile consumer.

The earlier broad auth-folder run had two unrelated failures in `account-settings.test.ts` caused by its missing Prisma `$transaction` mock. That suite and its account-setting implementation were not modified by this task; the current targeted suites above pass.
