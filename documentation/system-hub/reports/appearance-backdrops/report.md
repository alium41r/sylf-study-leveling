# Appearance and Backdrops redesign — 17 October 2026

## Scope and design

The final requested scope is **Appearance and Focus Environments**, renamed **Backdrops**. Calendar is excluded. Hash comparisons against the start of this phase confirm that Stats, Rankings, Modes, and their shared Main navigation/styles are unchanged. Calendar has no source diff.

Appearance is a compact color studio. Visual light/dark choices, color swatches, hex input, reset, and recent colors sit beside a live workspace preview. The HSV picker expands on demand and supports keyboard adjustment. Mobile puts a compact preview before the controls. The preview uses schematic content rather than invented account statistics.

Backdrops has an image-led gallery with a large timer preview, scene details, and an explicit Use backdrop action. Discover retains the official catalog, category filters, and search. Your library retains personal uploads, quota, names, focal points, all four timer styles, all four placement options, and deletion. The editor uses two columns on desktop and a single column on smaller screens. Native dialogs handle focus trapping and Escape, explicitly restoring focus after React unmounts the dialog.

The new name appears in the Hub, category navigation, Collection link, timer control, and timer picker. Existing route names, hotkeys, API endpoints, and stored preferences remain compatible.

## Existing owners preserved

- Appearance continues to resolve legacy presets, use `GlobalSystemWrapper` helpers and semantic contrast tokens, store device preferences, dispatch existing synchronization events, and post both color categories to `/api/cosmetics`. Draft edits remain isolated until Apply changes. A failed account sync is distinguished from a successful local save and offers retry.
- `useFocusBackground` continues to own active selection, catalog loading, image preloading, preference write ordering, signed URLs, and tab synchronization. The hook now exposes the quota already returned by the personal library API and its load error. No second library store or preference owner was introduced.
- Personal uploads/PATCH/DELETE retain their existing API contracts and validation limits. Expired private previews offer Reload library. Deleting an active personal backdrop selects Classic through the canonical hook. Successful library mutations broadcast through the existing channel.
- Timer previews reuse `FocusTimerLayoutPreview`: inert, hidden from assistive technology, and disconnected from timer/session accounting. The timer designs themselves are unchanged.
- No database, catalog content, backend, or dependency changes.

## Verification

| Check | Result |
| --- | --- |
| Relevant component, appearance, background engine, preview, timer picker, party, and Main regression suites | **127 tests passed across 11 files** |
| Mobile Appearance, legacy theme/background routes, and Backdrops route | **4 tests passed** |
| TypeScript `npx tsc --noEmit` | Passed |
| ESLint on redesigned screens, new components/tests, Collection screen, and timer bar | Passed |
| Production `npm run build` | Passed, including TypeScript and route generation |
| `npm run mobile:build` and `npm run mobile:verify` | Passed; mocks disabled; no server-only symbols or secrets in bundle |
| Final isolated browser checks | **44 checks passed**, zero runtime exceptions |
| Diff whitespace and scope checks | Passed |

The browser checks used isolated API fixtures, including every mutation. **No browser test writes were sent to the live account or database.** Real catalog imagery was used; fixture names and quota exist only in QA scripts. Server authorization/storage behavior was not re-tested against a live database. Generated mobile bundle outputs were restored after verification.

Rendered and inspected at **1440×1000, 1024×1000, 390×844, and 320×740**. Checked dark and light modes, light mode with a dark teal canvas/yellow accent, and dark mode with a pale canvas/green accent. Checks included wrapping, horizontal overflow, scrollable dialogs, small-screen actions, focus trapping/restoration, keyboard color/focal adjustment, and reduced-motion presentation.

Interactions verified: draft isolation, apply and reload, account-sync failure/retry, backdrop preview without activation, activation and reload, metadata editing, invalid image format and resolution rejection, valid upload, deletion of the active image, private-image refresh, empty/full/error libraries, and error recovery.

The first keyboard pass exposed lost focus after dialog unmount. The fix was verified in a real browser and covered by a regression test. The first desktop editor required scrolling to its save action; the final two-column editor keeps it visible.

## Evidence

- [Browser results](evidence/browser-results.json) and [interaction results](evidence/interaction-results.json); reproducible isolated scripts: [render/keyboard QA](evidence/browser-qa.js), [interaction QA](evidence/interaction-qa.js).
- Appearance: [desktop dark](evidence/appearance-desktop-dark.png), [tablet](evidence/appearance-tablet-dark.png), [mobile](evidence/appearance-mobile-dark.png), [320px](evidence/appearance-small-mobile-dark.png), [light](evidence/appearance-light.png), [dark canvas in light mode](evidence/appearance-custom-dark-in-light.png), [light canvas in dark mode](evidence/appearance-custom-light-in-dark.png), [color editor](evidence/appearance-mobile-color-editor.png), [sync failure](evidence/appearance-mobile-sync-error.png).
- Backdrops: [desktop dark](evidence/backdrops-desktop-dark.png), [tablet](evidence/backdrops-tablet-dark.png), [mobile](evidence/backdrops-mobile-dark.png), [320px](evidence/backdrops-small-mobile-dark.png), [light](evidence/backdrops-light.png), [custom dark canvas](evidence/backdrops-custom-dark-in-light.png), [custom light canvas](evidence/backdrops-custom-light-in-dark.png).
- Dialogs and states: [desktop editor](evidence/backdrops-desktop-edit.png), [mobile editor](evidence/backdrops-mobile-edit.png), [320px editor](evidence/backdrops-small-mobile-edit.png), [upload](evidence/backdrops-mobile-upload-ready.png), [320px upload](evidence/backdrops-small-mobile-upload.png), [delete](evidence/backdrops-mobile-delete.png), [empty library](evidence/backdrops-mobile-library-empty.png), [full library](evidence/backdrops-mobile-library-full.png), [library error](evidence/backdrops-mobile-library-error.png), [private image recovery](evidence/backdrops-mobile-library-recovered.png).

## Existing verification limitations

Full lint of touched pre-existing owners still reports the same issues present in their HEAD versions: `useFocusBackground` has eight errors and three warnings; the timer picker has one error and three warnings; SettingsPanel has three warnings. These concern existing `any` types, render-time refs, callback dependencies, recursive callback analysis, and picker ARIA attributes. The redesigned UI and new tests lint clean.

A separately attempted Collection suite has three passing tests and one failure at its unchanged `Character styles` assertion. The Collection production diff in this phase only renames its existing destination to Backdrops. The focused mobile route run intentionally excludes the unrelated Account/redirect failures recorded in the Main phase report. No full-repository test or lint pass is claimed.
