# Consolidation evidence

8 October2026. Fresh implementation QA artifacts, separate from the approved audit's evidence. Test accounts are isolated synthetic users. No screenshots were fabricated; final Sylf artwork was not changed.

## Measured browser results

[browser-results.json](browser-results.json) records same-ID/mounted cross-tab refresh, equal-context framebuffer parity, all five densities with unchanged stored art, failure/retry and duplicate submissions,35 responsive/zoom measurements, built-mobile touch and optimized production flows, reduced-motion/suspension and runtime CPU measurements.

Hashes compare logical framebuffer bytes under equal frame/density/composition, not physical screenshot sizes. Customizer holds frame one. QA used actual APIs; only documented failure tests intercepted responses, and interceptions were removed.

## Final refinements

[Simple color selection](simple-color-selection.json): spectrum/hex/recent brushes,
zero changes to existing pixels, real desktop/mobile saves, no replacement actions.
[Edge/full-width results](browser-results.json) include the278px zero-gap display,
black editor grid and736px desktop canvas. The latest UI is captured in
[Studio desktop](studio-desktop.png), [built mobile Studio](mobile-bundle-studio-final.png),
[standalone Dashboard](dashboard-edge-fidelity-desktop.png) and
[edge fixture Studio](studio-edge-fidelity-desktop.png).

## Earlier consolidation screenshots

| Surface | Evidence |
| --- | --- |
| Dashboard/Sylf | [Canonical Sylf hero](dashboard-sylf-desktop.png), [light/yellow/mint drawing](dashboard-desktop.png), [dark](dashboard-dark-desktop.png), [optimized production](production-dashboard.png) |
| Studio Hub | [Light](hub-desktop.png), [dark](hub-dark-desktop.png): one companion plus independent Profile Studio |
| Customizer | [Light](customizer-desktop.png), [dark](customizer-dark-desktop.png), [built mobile](customizer-mobile.png): fluid preview, explicit frame one, equal96px comparisons |
| Pixel Studio | [Light](studio-desktop.png), [dark](studio-dark-desktop.png), [optimized production](production-studio.png), [built mobile touch](mobile-bundle-studio-final.png) |
| Failure/recovery | [Save503 and retained Unicode draft](save-failure-desktop.png) |
| Target ownership | [Authorized target profile](target-profile-desktop.png), [two-owner party room](party-room-desktop.png) |
| Equipment/history | [Shop](shop-desktop.png), [Items](items-desktop.png), [Collection](collection-desktop.png) |
| Built mobile Dashboard | [Latest release touch flow](mobile-bundle-dashboard-final.png) |

Desktop captures are1440×1000/DPR1. Mobile release captures are390×844/DPR3 from a real Chrome mobile/touch context. Full-page PNGs can show sticky controls at their capture position; measured rectangles establish viewport behavior. The expanded desktop Studio uses736px canvas/316px inspector; mobile headers start at0/56px.

The remaining screenshots predate the final width/color-selector refinements and document the earlier consolidation gates. Older interaction/flow captures in [earlier-qa/](earlier-qa/) precede final inspector/static-comparison/sticky-header corrections and are historical evidence, not the final visual design.

## Checks

- [Required regressions](regressions.log):529 passed,8 database cases skipped in the normal environment; [real PostgreSQL](database.log): all8 executed/passed separately.
- [Final picker/recent-color regressions](recent-painted-colors.log):11 passed after the final requested behavior change.
- [Route typegen](typegen.log), [strict TypeScript](typecheck.log), [engine typecheck](typecheck-engine.log).
- [Web build](web-build.log), [mobile build](mobile-build.log), [mobile audit](mobile-verify.log).
- [ESLint summary](eslint-summary.json), [current diagnostics](eslint.json), [baseline](eslint-baseline.json):74 files,46 inherited errors/43 warnings versus50 baseline errors; no added error counts by file/rule.
- [Auth race red](auth-race-red.log) → [green](auth-race-green.log); [duration typing red](duration-red.log) → [green](duration-green.log).
- [Unrelated mobile baseline](unrelated-mobile-baseline.log): broader settings-navigation failures reproduce before this work.
- [Legacy search](legacy-search.txt), [removal inventory](legacy-removal.json), [landing preservation](landing-preservation.json), [document/reference/diff checks](document-checks.json).

## Reproduction and limits

Use the required regression filter in the implementation report, then node scripts/test-pixel-postgres.mjs for disposable PostgreSQL17. It applies the additive migration unchanged, temporarily grants a role inside a rolled-back transaction to prove owner RLS, and removes its test container/volume.

For browser QA, create an isolated account; author sparse48-grid/two-frame art; use sparse mouse/CDP touch samples; save/equip; compare frame-one logical bytes after each density Apply; edit the same ID while another dashboard stays mounted. Inject503/delayed writes only on that QA page, verify retained state/retries, then remove all interceptions.

Production QA used an isolated Next output directory/local optimized server. Dev Pixel routes return404; measurement handles are absent. Mobile QA used the actual Vite production bundle with mocks disabled and a local same-origin proxy to the real authenticated API. Proxy code lives only in /private/tmp and is not shipped.

Physical Android/iOS/Capacitor and production deployment were not performed. CPU measurements exclude layout/GPU and do not claim full-dirty throughput. Remote Focus Background integration's restricted-DNS failures are separate from the passing Pixel DB tests. The implementation report records baseline/environment limits and deliberate R6/R12 deferrals.
