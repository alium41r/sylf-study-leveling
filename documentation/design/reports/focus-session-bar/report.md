# Focus session bar

Date: 2026-10-14

## Result

The solo `/focus` screen now has one compact bar containing session status, mode, subject/quest context, and the existing environment picker action. `FocusTimerLayoutRouter` owns the bar outside the layout transition so Classic, Anime, Landscape, Fantasy, and unknown-key fallback share its placement and styling. Layout-specific top badges and the independently positioned environment button were removed.

The bar uses semantic surface/text tokens, fine neutral dividers, regular small text, and a steady decorative accent dot. It has no glow, shadow, pulse, scaling animation, or visible shortcut badge. Below 640px, the mode and environment name hide, titles truncate, and the environment button provides a 44px touch target. Full environment and quest context remain in accessible names/title attributes. Paused state is explicit. Alt+B retains its existing hook-owned behavior. Inert environment previews inherit the bar; shared party timer docks are unchanged. The mirror-tab notice now reserves space above the bar.

## Validation

- Relevant regression tests: 47 passed across classic docking, layout preview/session bar, and party dock integration suites. Tests cover all four layouts plus unknown-key fallback, exactly one bar, context, picker callback, pause/break states, and preserved timer docking/actions.
- Existing landscape/fantasy/preview/eye-comfort tests initially passed: 68 tests. A broader focus/background run passed 326 of 339 tests; five obsolete header expectations were updated for the shared bar and passed in the regression run. Four timing failures in unrelated tools suites passed on a serial recheck (58 tests across those three suites). The four live database cascade tests could not resolve the configured PostgreSQL hostname; those tests remain unverified.
- Final `npx tsc --noEmit`: passed. The first attempt encountered a transient malformed `.next/dev/types/validator.ts`; an independent check using fresh generated route types also passed before the final normal check.
- Changed UI source lint: zero errors, 12 existing warnings in the timer engine screen/layouts; new session bar/router code has no warnings.
- Production build: passed with an isolated output directory. The sandboxed attempt stalled in compilation; a rerun with local compiler-worker permissions succeeded. Temporary output and configuration additions were removed.
- Final mobile production build and the existing mobile bundle verifier: passed. Output was directed to `/tmp` and the verifier used that output path so existing `mobile/dist` changes were preserved.
- Diff whitespace check: passed.

## Browser review

Reviewed the actual router and layout components in an isolated local browser fixture, using a neutral scenic gradient and the app's real global CSS. This avoids altering a personal timer/account. The exact private screenshot background and a live authenticated session were not used. Remote font requests were blocked during fixture review.

All four layouts were checked in each of these combinations:

| Viewport | Appearance | State/context |
| --- | --- | --- |
| 1440 × 900 | Dark default | Focus, short subject/environment labels |
| 1024 × 768 | Light, custom warm background and gold accent tokens | Focus |
| 390 × 844 | Dark, custom green background and gold accent tokens | Paused, long quest/subject/environment names |
| 320 × 740 | Light, custom warm background and gold accent tokens | Break, long names |

All 16 combinations had a single bar within viewport bounds, a visible keyboard focus outline, and a working environment action through Enter. Mobile environment targets were at least 44px square. Existing long-title clipping inside the Anime timer dock was visible in the stress fixture; the new bar itself truncates correctly, and this change does not redesign the dock.

Evidence: [visual measurements](evidence/visual-checks.json), adjacent PNG screenshots, [regression tests](evidence/regression-tests.log), [tools recheck](evidence/tools-recheck.log), [typecheck](evidence/typecheck.log), [lint](evidence/lint.log), [web build](evidence/web-build.log), [mobile build](evidence/mobile-build.log), and [mobile verification](evidence/mobile-verify.log).
