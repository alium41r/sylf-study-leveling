# Phase 7 evidence and reproduction

Evidence separates actual Google/deployment observations, real-browser synthetic fixtures and production-module regression tests. No credentials, raw provider upload-session URLs or personal note bodies are retained here. Authorized cloud test artifacts remain in the connected Drive; account screenshots remain in private temporary files rather than the repository.

## Final live checks

- `live-deployment.json`: approved 44-file isolated release, final READY Vercel deployment and canonical origin. No environment upload/change or migration. `release-candidate.json` records exact runtime overlays, base commit, generated assets and validated upload boundaries. The official temporary CLI was authorized; its private local credential directory was removed after acceptance.
- `live-drive-api.json`: actual production Google adapter, 4,456,479 bytes/two chunks, independent checksum/readback, verified legacy moves, no deletion. `oauthRefreshSucceeded: false` means refresh was not exercised; an already valid credential was reused.
- `live-ui-acceptance.json`: bounded post-deployment observations: current text in real Drive PDF preview, matching folders, title-only nested publication, blank suppression and endpoint status counts. Fresh-device recovery and live file-picker PDF import remain unverified.
- `live-export-restore.json` / `.log`: authorized earlier synthetic download restored with production `importNotes`, all three original revision IDs and exact text. Not cloud-only recovery. Later live edits added history.
- `deployment-local-check.json`: read-only TLS database history/checksum/RLS and local config checks. Not a wrapping-key restore or proof of every deployment environment value.

## Current-source qualification

- `regression.log`: **162 passed**, one optional profile skipped. Production modules cover local crash/quota/corruption, owner/session guards, native history/outbox, large interrupted publication, durable predecessor receipts and scoped broker validation.
- `typecheck.log`, `lint.log`, `readable-release-build.log`, `mobile-build.log`, `mobile-verify.log`: final source/candidate checks. Final hosted normal Turbopack build is independently READY. Earlier `web-build.log`, `default-build.log`, `release-build.log` are earlier source snapshots, not replacements for final candidate/hosted results.
- `drive-pdf-results.json`, `readable-pdf-browser.png`: real Chromium/encrypted IndexedDB, synthetic rich text/Unicode/table/image, title-only, handwriting and annotated-PDF copies; native revision IDs unchanged. Rich-text PDF output is rasterized.
- `compiled-worker-results.json`, `compiled-worker-passed.png`: actual earlier generated Turbopack PDF worker under production CSP. Worker source/CSP remain unchanged in the final release.
- `source-snapshot.json`: final runtime, regression, fixture and documentation hashes; frozen soak bundle hashes remain separately scoped. `results.json` records explicit coverage and release gates.

## Bounded workload and diagnostics

`mixed-soak-results.json` records 601.5 seconds of compiled Chromium crypto/IndexedDB/PDF.js with synthetic native input and a simulated provider outage: 600 strokes, zero automatic uploads while writing, p95 save 16.4 ms, five-pack catch-up and exact separate-repository restoration. It predates final PDF publication/receipt refinements and is not a live Google or physical-stylus benchmark.

`local-draft-desktop-dark.png`, `local-draft-phone-dark.png`, `title-only-phone-custom-light.png` show synthetic shared-screen checks at desktop 1440×756 and phone 390×844, including custom appearance and no horizontal overflow.

`baseline.json` records initially inspected dirty source. `preview-first-hmr.txt`, `typecheck-first-heap-limit.txt`, `default-build-first-artifact-scan.log`, and `readable-candidate-turbopack-symlink.log` preserve failed/incomplete attempts. Final checks corrected fixture reload/output isolation, Node heap sizing, and isolated-build dependency boundaries; these diagnostics are not passing evidence. No type/security checks were disabled.

Use installed Node 24 and follow the [fixture README](../../../../../scripts/qa/notes-release/README.md). Build the fixture with `node node_modules/vite/bin/vite.js build --config scripts/qa/notes-release/vite.config.mjs`, copy `public/notes-pdf` into the selected fixture output, and serve via `node scripts/qa/notes-release/preview.mjs`. Default loopback port is 4393. Use the visible run buttons; no browser injection or real credential belongs in this server. `/drive-pdf.html` runs the bounded readable-copy check; output/port overrides allow it to run without modifying the frozen soak bundle.

Normal regressions: `npm run test -- --run __tests__/notes`. The scalability and live-export restore suites are opt-in. Never describe another local database or same-profile tab as a second cloud-connected device. The [report](../report.md) lists remaining external gates and PDF fidelity limits.
