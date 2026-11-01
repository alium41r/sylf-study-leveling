# Notes fluid editing qualification

This isolated Vite entry imports the production shared Notes screens, native editors, encrypted IndexedDB repository, recovery and sync owners. Browser authentication and Google Drive HTTP are synthetic. It creates disposable browser contexts and never uses a live account or a production library.

Use the supported Node 24 runtime and a Playwright installation with Chromium. Set `NOTES_PLAYWRIGHT_MODULE` to its module path when Playwright is supplied by the desktop runtime.

```sh
npx vite build --config scripts/qa/notes-workspace/vite.config.mjs
npx vite preview --config scripts/qa/notes-workspace/vite.config.mjs
```

Then, in another terminal:

```sh
node scripts/qa/notes-fluid/run.mjs
```

The preview listens only on `127.0.0.1:4390`, and writes its bundle under `/private/tmp/sylf-notes-phase3-ui`. Evidence goes to `documentation/notes/reports/2026-10-24-fluid-phase-3/evidence/`.

The suite repeats Phase 1–2 workflows against the active page of the continuous viewport, then checks cross-page selections, mixed grouping/positioning/copies, native moves, saved paper styles, Unicode PDF extraction, offline editing/reconnect, and reload. It checks 300 logical pages, bounded mounted editors/canvas pixels, steady scrolling, and a 50,000-unit page printed in bounded sheets. Screens cover desktop, tablet, narrow phones, light/dark modes and custom backgrounds/accents. PDF annotation exports retain both original selectable text and a Unicode search layer for typed annotations.

For the dense native profile, after other builds/browser runs finish:

```sh
NOTES_QA_EVIDENCE=documentation/notes/reports/2026-10-24-fluid-phase-3/evidence/ node scripts/qa/notes-ink/performance.mjs
```

That profile measures a separate 5,000-stroke page, five live nibs, encrypted saves, cuts and previews. These are synthetic desktop measurements, not physical pen latency, total process/GPU memory, 300 dense pages, academic-year history or live Google qualification.
