# Phase 5 evidence

**21 October 2026.** Local qualification of actual production modules/shared screens. Synthetic accounts, grant responses, provider packs and owned PDF content; no live Google consent/deployment, physical stylus or hosted database operation. See the [report](../report.md), [current contract](../../../pdf.md) and [reproduction instructions](../../../../../scripts/qa/notes-pdf/README.md).

- [Final checks](final-checks.json), [regression log](regression.log), [production web build](web-build.log), [mobile build](mobile-build.log), [mobile boundary audit](mobile-verify.log), [TypeScript](typecheck.log), [targeted ESLint](lint.log).
- [PDF browser groups](pdf-browser-results.json), [log](pdf-browser.log), [existing handwriting](ink-browser-results.json), [existing rich text/library](browser-results.json). All zero page errors. Synthetic cloud transfer is not a live-provider result.
- [PDF accessibility](pdf-accessibility-results.json), [handwriting targets](ink-accessibility-results.json), [shared dialogs/keyboard/account warning](accessibility-results.json). Focused checks, not a complete assistive-technology audit.
- [Offline worker](offline-results.json): only the public locked fallback is cached; no cold offline unlock.
- [Final large-PDF measurements](pdf-performance-results.json), [log](pdf-performance.log), [earlier observation](pdf-performance-initial.log). 300 pages, vectors/varied sizes, one six-megapixel image reused 15 times. Attached canvas/main-window heap observations exclude offscreen caches, worker/GPU/process memory.
- [Export fidelity](export-fidelity-results.json), [independent verification log](export-fidelity.log), [annotated study copy](annotated-study-copy.pdf), [rotated study copy](rotated-study-copy.pdf), [300-page study copy](large-300-study-copy.pdf), [synthetic quota recovery archive](pdf-quota-recovery.sylfnote). The copies are derived; `.sylfnote` preserves editable native text/history. No real student data is present.
- [Actual compiled Next worker](next-worker-results.json), [log](next-worker.log). Generated export chunks execute with the configured production CSP on a temporary static host; deployed routing/authentication remains unqualified.
- [License/source-resource proof](license-source-verification.json): 63 notices, 202 byte-exact PDF.js files including resource licenses, unchanged BlockNote covered-source ZIP. [Configuration presence only](release-environment.json) contains no credentials.
- [Phase 4 baseline](baseline.json), [final source snapshot](source-snapshot.json), [document/reference checks](document-checks.json). Historical Phase 4 run artifacts were not reclassified as Phase 5 results. Their existing files were preserved.

## Visually inspected renders

| Render | Scope |
| --- | --- |
| [Desktop dark](pdf-desktop-dark.png) | Source text, highlight, ink, Unicode comment, page/export menu and export disclosures. |
| [Tablet light](pdf-tablet-light.png) | Mixed-size Fit width, toolbar density and document surface. |
| [390 px custom light surface](pdf-phone-custom-light.png) | Dark mode with light custom background, actual persisted accent/background. |
| [320 px custom dark surface](pdf-phone-custom-dark.png) | Light mode with dark custom background, wrapped controls and no document-page clipping after Fit width. |
| [Coarse phone](pdf-coarse-phone.png) | 44 px tool targets, pinch/pan without writing and reachable focus exit. |
| [Independent study-page render](export-study-page-1.png) | Source text/vector ink and full Unicode comment wrap. |
| [Independent rotated-page render](export-rotated-page-2.png) | Nonzero crop, UserUnit, source rotation plus additional rotation; source marker/ink alignment and text highlight. |

Independent Poppler PNGs also include the source/study versions of page 2 and large-document pages 1, 200 and 300 for exact pixel comparisons. Earlier failure screenshots/logs are diagnostics, not passing evidence. Build/config advisories and the host Pillow deprecation warning are retained in logs. The report distinguishes passing local checks from remaining release gates.
