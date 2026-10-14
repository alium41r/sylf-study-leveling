# Floating companion and minimal chat — 12 October 2026

Implemented the sidebar Show/Hide companion preference and replaced the floating System pill with the canonical SVG companion. Hover and keyboard focus enlarge it and switch to a happy wave. Reworked the existing quick assistant into a compact glass conversation with plain assistant replies, a clean composer and secondary actions in an options menu.

## Verification

- **49 tests passed** across the new companion integration and overlay suites, existing sidebar suite and canonical companion suite. Coverage includes persistence, separate accounts, cross-tab synchronization, blocked storage, logout/route suppression, expressions, reduced motion, session continuation, suggestions, Enter/composition handling, Stop/errors, quotas, options and keyboard focus.
- **`npx tsc --noEmit` passed.**
- **Production mobile build and bundle verification passed.** Output went to `/tmp/sylf-companion-mobile` to preserve existing `mobile/dist` work. The existing verifier ran against that temporary output with mocks disabled; no server-only symbols or secrets were found.
- **Web compilation passed using webpack.** The full Next.js build is blocked by the pre-existing unsupported `CURATED_SOUNDSCAPES` export in `app/api/acoustics/route.ts`. A sandboxed Turbopack attempt stalled and was stopped. Temporary build directories and Next-generated tsconfig additions were removed.
- **No new ESLint diagnostics.** Five remaining errors and five warnings are pre-existing findings involving synchronous effect state, event-handler purity, an `any` Planner callback, unused imports/arguments, sidebar effect dependencies and avatar images. HEAD-source baseline checks confirmed the errors; the overlay's old `any` catch was replaced with an `unknown` check that also handles DOM abort errors.

## Visual checks

Used the existing development mock mobile client, which renders the same shared shell, companion, chat and appearance owners. Inspected desktop layouts at the normal 1429×722 browser viewport and 1440×900 layout override, plus mobile at 390×844. Checked expanded/collapsed rails, mobile drawer toggle/close, saved visibility after reload, greeting and populated chat, happy keyboard-focus expression, light/dark modes and an amber accent on a warm `#F6EAE1` canvas with dark mode selected. Restored the dark black canvas and purple accent after checking.

The configured Playwright MCP browser was already in use; browser checks used the available browser UI tools. Desktop screenshots from an override taller than the physical window can clip the bottom, so the final dark captures use the normal viewport.

Evidence: [resting companion](evidence/desktop-companion.png), [happy expression](evidence/desktop-companion-focused.png), [minimal dark chat](evidence/desktop-dark-chat.png), [mobile light chat](evidence/mobile-light.png), [custom canvas](evidence/desktop-custom.png).

Live production AI/provider and database behavior, physical device keyboard/safe-area behavior, and actual pointer-hover animation were not independently exercised. Hover state is covered by the component integration suite; its shared enlarged expression state was inspected through real keyboard focus. Mobile sends used the existing mock API; Stop/error/quota behavior was verified by tests.
