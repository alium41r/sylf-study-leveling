# User artwork only — 8 October 2026

## Result

Removed both default Pixel characters from production: the bare blob content path
and the space familiar reference asset. Retired form keys resolve to an empty
composition with no accessories. Geometry samples are confined to test fixtures;
no app or content module imports them. The catalogue has no character entries.

New defaults are an empty selection and no ground. The Customizer contains only
owned drawings, with Create artwork and a draft Clear display action. Display
controls require an equipped drawing. The dashboard presents a canvas invitation
and opens Pixel Studio directly; compact layouts retain a 44px Create control.
Loading/unavailable selected artwork is distinguished from a first-time display.
Foreign-user surfaces use a neutral placeholder without viewer data or actions.

Deleting equipped artwork atomically clears selection to none/Original, preserving
cosmetic preferences and owner locking/revision checks. Updated the deletion
confirmation and empty-equipped error. Existing saved artwork, rewards, ownership,
privacy, cache invalidation and authored geometry remain intact.

Old Pixel review/prototype routes open Pixel Studio. Raster preview assets,
selectors and journey-specific raster positioning are retired. The separate
landing SVG illustration is retained. Generic-medium historical tests use isolated
test samples rather than runtime assets.

## Verification

- Pixel, dashboard and landing regressions: 628 passed; 8 opt-in PostgreSQL tests
  skipped. Deletion unit coverage includes equipped clearing, unrelated deletion
  and stale revision rejection; production database artwork was never deleted.
- Project TypeScript passes after temporary build-output cleanup. Production
  route validators also expose pre-existing unrelated route errors; no API routes
  outside this task were changed.
- ESLint: no errors. Existing warnings remain in DashboardScreen, creation.ts,
  canvas-renderer tests and pixel-studio tests.
- Mobile production build and bundle verifier pass. Disposable output stays in
  /private/tmp; the existing mobile/dist working tree was not overwritten.
- Web webpack production compilation succeeds (61 seconds). Final Next route
  validation remains blocked by the existing invalid CURATED_SOUNDSCAPES export
  in app/api/acoustics/route.ts. Build output was preserved outside the workspace;
  temporary tsconfig includes were removed.
- Browser inspection: dashboard empty/populated states at 1440×1000, 390×844,
  and 320×740. Dark/cyan, light/purple and dark mode with a custom pale warm
  background/orange accent were checked. No horizontal overflow in changed UI.
- Customizer desktop/mobile: user drawing selection, native preview, Clear display,
  no Sylf choice; Hub creation prompt and profile separation. Create opens the
  actual bounded Pixel Studio. Old review routes resolve to that same editor.
- Unavailable selected artwork presents a status without a substitute character.
  Small private/foreign empty states and loading are covered in component tests.

Browser empty-state/theme qualification used a separate authenticated context with
GET response overrides. Account artwork/config, live appearance preferences and
original recovery drafts were not changed. Screenshots/logs are in [evidence](evidence/).
