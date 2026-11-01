# Notes handwriting qualification

These drivers exercise the production ink model, controller, renderer, encrypted repository and shared Notes screen. They reuse the isolated entry in `scripts/qa/notes-workspace/`. No production provisioning bypass, Google grant or device credential is introduced.

Use Node 24 and installed dependencies. Set `NOTES_PLAYWRIGHT_MODULE` to an available Playwright ESM module. No tool/browser installation is performed by these scripts.

```sh
export NOTES_PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs
export NOTES_QA_EVIDENCE="$PWD/documentation/notes/reports/phase-4/evidence/"
npx vite build --config scripts/qa/notes-workspace/vite.config.mjs
npx vite preview --config scripts/qa/notes-workspace/vite.config.mjs
```

In another terminal, run sequentially:

```sh
node scripts/qa/notes-ink/browser.mjs
node scripts/qa/notes-workspace/browser.mjs
node scripts/qa/notes-workspace/accessibility.mjs
node scripts/qa/notes-workspace/offline.mjs
node scripts/qa/notes-ink/performance.mjs
```

The ink drivers write to the Phase 4 evidence folder. The reused Phase 3 browser/accessibility/offline drivers honor `NOTES_QA_EVIDENCE`; set it to keep each run's evidence together. The preview uses loopback port 4390 and `/private/tmp/sylf-notes-phase3-ui`; the worker driver owns a disposable server on 4391. Stop the preview when finished.

`browser.mjs` covers ten scenario groups, including synthetic pressure/tilt, actual browser mouse input, touch navigation, palm-first ordering, page management, a real offline browser context, independent browser profiles, quota faults and an intentional renderer crash. All accounts and provider HTTP responses are synthetic. Pointer dispatch is not physical stylus qualification.

`performance.mjs` isolates the actual production model/renderer/repository from visible UI work. It measures a 5,000-stroke / 320,000-sample fixture, dense-page pan, short/long active paths, warm native encrypted saves and 300 empty independent pages. Run it on a quiet machine, after builds/tests. It does not measure physical input-to-display latency, real Drive throughput, total process memory or hundreds of dense pages.

Production module/fault tests:

```sh
npx vitest run __tests__/notes
```

The current [contract](../../../documentation/notes/ink.md) and [report](../../../documentation/notes/reports/phase-4/report.md) describe the measured limits and outstanding hardware/deployment/long-history gates. The 310-revision queue test demonstrates bounded-pass recovery without replaying an unchanged source page; it does not establish sustained long-session cloud throughput.
