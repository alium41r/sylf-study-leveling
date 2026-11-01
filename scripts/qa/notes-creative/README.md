# Notes creative interface — Phase 2

Uses the real shared screens, encrypted repository and native document engines with synthetic authentication and Drive HTTP. It does not bypass production authentication or certify a live Google account.

From the repository root, using supported Node 24:

```sh
npx vite build --config scripts/qa/notes-workspace/vite.config.mjs
npx vite preview --config scripts/qa/notes-workspace/vite.config.mjs
node scripts/qa/notes-creative/run.mjs
```

If Playwright is bundled elsewhere, set `NOTES_PLAYWRIGHT_MODULE` to its absolute `index.mjs` path. The preview serves loopback port 4390. macOS may require running Chromium outside the filesystem sandbox. Results and screenshots are written to `documentation/notes/reports/2026-10-23-creative-phase-2/evidence/`.

Coverage includes Phase 1 navigation/import regressions; multiple text boxes, drag/resize/nudges and reload; favorite pens; pressure/opacity/dashed shapes; precision erasing and undo/redo; gallery categories; page sizes/orientation/backgrounds/defaults; arranged images; source-color composite PDF; PDF pen options; sustained typing; desktop/tablet/phone and appearance variations.

Run the dense native performance profile separately, without a concurrent browser/build workload:

```sh
NOTES_QA_EVIDENCE=documentation/notes/reports/2026-10-23-creative-phase-2/evidence/ node scripts/qa/notes-ink/performance.mjs
```

The profile records 5,000 strokes / 320,000 original samples, encrypted saves, 300 empty-page navigation, 4,096-sample live rendering for all five nibs, precision cutting and a dense native preview. These are desktop headless measurements, not physical input-to-display latency or total process/GPU memory measurements.
