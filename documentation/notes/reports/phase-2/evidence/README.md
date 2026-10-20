# Phase 2 verification evidence

Run date: **20 October 2026**, following work begun 19 October. Runtime: Node **24.19.0**, macOS arm64, Chromium **151.0.7922.34**. Tests import production `lib/notes/` modules; the browser harness lives under [`scripts/qa/notes-qualification/`](../../../../../scripts/qa/notes-qualification/README.md). No live provider credentials or real user document data were used.

| Evidence | Meaning |
| --- | --- |
| [tests.log](tests.log) | Final six-file run, 86 tests passed. Includes Notes tests plus existing calendar autosave, system overlay, authentication experience and appearance regressions. |
| [browser-results.json](browser-results.json), [browser.log](browser.log) | Twelve real-browser checks against the built production harness, including 200 individual save timings and storage counts. |
| [StrictMode result](strictmode/browser-results.json), [log](strictmode.log) | Separate Vite development server: actual React development StrictMode plus repeated editor remounts, one check passed. |
| [typecheck.log](typecheck.log), [lint.log](lint.log) | Successful checks produce empty logs; exit results are recorded in [verification.json](verification.json). |
| [web-build.log](web-build.log) | Full Next.js 16.2.9 production build, including type checking and static generation. |
| [mobile-build.log](mobile-build.log), [mobile-verify.log](mobile-verify.log) | Mobile build and production fail-closed/server-import audit passed. No native-device runtime test. |
| [harness-build.log](harness-build.log), [client-boundary.json](client-boundary.json) | Actual editor/engine client graph built without forbidden server imports. The harness is outside production routing. |
| [dependency-tree.json](dependency-tree.json), [inventory](dependency-inventory.json) | Resolved selected graph, installed version/license metadata and license-file hashes. No vulnerability scan/legal clearance is implied. |
| [baseline.json](baseline.json), [scope verification](scope-verification.json) | Original task snapshot and final intentional change scope. Unrelated repository reorganization occurred during this task, so this evidence does not claim every pre-existing file remained byte-identical. |
| [initial-test-run.log](initial-test-run.log) | Retained failed early run: deep typed-array assertion exhausted runner memory. Assertion changed to hash comparison, final tests passed. |

Final commands (Node 24 on PATH):

```sh
npm run test -- --run __tests__/notes __tests__/calendar/note-autosave.test.ts __tests__/components/system-overlay.test.tsx __tests__/auth/auth-experience.test.tsx __tests__/settings/appearance.test.tsx
npx tsc --noEmit --incremental false
npx eslint lib/notes __tests__/notes scripts/qa/notes-qualification app/components/AuthProvider.tsx lib/client-data-cache.ts
npm run build
npm run mobile:build
npm run mobile:verify
```

Browser reproduction and development StrictMode commands are in the harness README. Existing bundled Playwright/Chromium were used; no browser tooling or agent configuration was installed. The synthetic harness requires a disposable database prefix and never creates an authenticated production cloud connection.

The quota tests inject `QuotaExceededError` during real IndexedDB transactions and separately exercise the production modules with fake-indexeddb. They do not fill the physical disk or measure a browser's real quota threshold. The renderer test deliberately crashes the Chromium renderer after acknowledgement, then reconstructs through a new page. A separate test crashes the whole browser process using a temporary persistent profile, relaunches Chromium against that disk-backed profile and verifies the acknowledged revision. Neither simulates power loss. Offline testing disables network in an already loaded shell and restores online access before reload; offline cold boot is not tested.

The 300-page/20,000-object fixture contains synthetic Yjs shapes, not handwriting or stylus events. The 8 MiB asset check uses synthetic bytes labeled as a PDF original; PDF rendering is outside this phase. Performance timings include append plus explicit flush through acknowledgement; ordinary 20 ms batching, UI frames, pen input, cloud latency and physical-device performance are separate measurements. Warm reopen reuses the repository metadata cache.

The fake transport verifies missing/corrupt dependencies, lost responses, duplicate physical candidates, Retry-After, unavailable roots, expired cursors, owner cancellation, lease expiry and concurrent-device branches. It does not qualify either provider's OAuth, scopes, CORS/CSP, upload endpoints or root-discovery behavior.

No visible production UI was changed, so there is no claim of newly verified Notes responsive/theme screenshots. Existing appearance regression tests and shared builds passed. The future Notes UI still requires actual Sylf shell checks in light/dark/custom modes on desktop/tablet/phone.

The first full-process crash attempt stalled because this Chromium build did not reject the in-flight CDP crash command after closing. [Its partial log](browser-crash-command-stall.log) is retained. The driver now races that command against the bounded context-close event; the [isolated recovery rerun](disk-crash/browser-results.json) and complete final twelve-check suite passed. Temporary synthetic profiles were removed.
